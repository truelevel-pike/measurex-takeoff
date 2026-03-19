/**
 * Server-side PDF processing for MeasureX.
 * Uses pdfjs-dist (legacy/Node build) to extract page info and text.
 */

import fs from 'fs/promises';
import path from 'path';

// ── Types ──────────────────────────────────────────────────────────────

export interface PDFPageInfo {
  pageNum: number;
  width: number;
  height: number;
  text: string;
}

export interface PDFProcessResult {
  pageCount: number;
  pages: PDFPageInfo[];
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Lazily import pdfjs-dist legacy build for Node (no canvas dependency).
 * Returns the library module.
 *
 * The fake-worker path in pdfjs-dist does `await import(workerSrc)` which fails
 * inside Turbopack/Next.js bundles where module resolution context is a compiled
 * chunk rather than the project root.  The workaround is to pre-load the worker
 * module ourselves and expose it via globalThis.pdfjsWorker — pdfjs checks that
 * first and skips the dynamic import entirely.
 */
async function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  // Pre-register the worker handler on globalThis so pdfjs never has to
  // dynamic-import workerSrc (which breaks in bundled/Turbopack contexts).
  if (!(globalThis as Record<string, unknown>).pdfjsWorker) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs' as string) as { WorkerMessageHandler: unknown };
    (globalThis as Record<string, unknown>).pdfjsWorker = worker;
  }
  // Use the legacy build which has broader Node.js compat
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as typeof import('pdfjs-dist');
  // workerSrc must be a non-empty string to pass the guard, even though we
  // will override with disableWorker:true in every getDocument() call.
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
  }
  return pdfjsLib;
}

// pdfjs getDocument options type (the types are loose, this avoids `any`)
type PdfjsDocumentOptions = Record<string, unknown>;

// ── Core Functions ─────────────────────────────────────────────────────

/**
 * Process a PDF file: extract page count, dimensions, and text for each page.
 */
export async function processPDF(
  filePath: string,
  projectId: string,
): Promise<PDFProcessResult> {
  void projectId; // reserved for future per-project processing logic
  const pdfjsLib = await getPdfjs();
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, disableWorker: true } as unknown as Parameters<typeof pdfjsLib.getDocument>[0]).promise;

  const pages: PDFPageInfo[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });

    let text = '';
    try {
      const textContent = await page.getTextContent();
      text = (textContent.items as Array<{ str?: string }>)
        .map((item) => (item.str || '').trim())
        .filter(Boolean)
        .join('\n');
    } catch {
      // If text extraction fails, return empty string
    }

    pages.push({
      pageNum: i,
      width: viewport.width,
      height: viewport.height,
      text,
    });
  }

  return { pageCount: doc.numPages, pages };
}

/**
 * Extract all text from a single PDF page.
 */
export async function extractPageText(
  filePath: string,
  pageNum: number,
): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, disableWorker: true } as unknown as Parameters<typeof pdfjsLib.getDocument>[0]).promise;

  if (pageNum < 1 || pageNum > doc.numPages) return '';

  const page = await doc.getPage(pageNum);
  try {
    const textContent = await page.getTextContent();
    return (textContent.items as Array<{ str?: string }>)
      .map((item) => (item.str || '').trim())
      .filter(Boolean)
      .join('\n');
  } catch {
    return '';
  }
}

/**
 * Store an uploaded PDF buffer into the project's data directory.
 * Returns the stored file path.
 */
// ── Page Image Rendering ──────────────────────────────────────────────

const pageImageCache = new Map<string, Buffer>();

/**
 * Render a single PDF page to a PNG base64 data URL.
 * First attempts pdfjs+canvas rendering; falls back to pdftoppm (poppler) if pdfjs fails
 * (e.g. PDFs with embedded JPEG images that pdfjs-dist 5.x can't decode in Node).
 * Returns null if neither method is available.
 */
export async function renderPageAsImage(
  filePath: string,
  pageNum: number,
  scale: number = 2.0,
): Promise<string | null> {
  const cacheKey = `${filePath}:${pageNum}:${scale}`;
  const cached = pageImageCache.get(cacheKey);
  if (cached) return `data:image/png;base64,${cached.toString('base64')}`;

  // --- Attempt 1: pdfjs + node-canvas ---
  let createCanvas: (w: number, h: number) => ReturnType<typeof import('canvas')['createCanvas']>;
  let pdfJsResult: Buffer | null = null;

  try {
    const canvasModule = await import('canvas');
    createCanvas = canvasModule.createCanvas;

    const canvasFactory = {
      create(width: number, height: number) {
        const canvas = createCanvas(width, height);
        return { canvas, context: canvas.getContext('2d') };
      },
      reset(canvasData: { canvas: { width: number; height: number }; context: unknown }, width: number, height: number) {
        canvasData.canvas.width = width;
        canvasData.canvas.height = height;
      },
      destroy() { /* no-op */ },
    };

    const pdfjsLib = await getPdfjs();
    const fileData = new Uint8Array(await fs.readFile(filePath));
    const doc = await pdfjsLib.getDocument({ data: fileData, useSystemFonts: true, disableWorker: true } as unknown as Parameters<typeof pdfjsLib.getDocument>[0]).promise;

    if (pageNum >= 1 && pageNum <= doc.numPages) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

      await page.render({
        canvasContext: canvasAndContext.context,
        viewport,
        canvasFactory,
      } as unknown as Parameters<ReturnType<typeof page.render>['promise'] extends Promise<unknown> ? typeof page.render : never>[0]).promise;

      pdfJsResult = (canvasAndContext.canvas as unknown as { toBuffer(format: string): Buffer }).toBuffer('image/png');
    }
  } catch {
    // pdfjs failed (e.g. embedded images) — will fall through to pdftoppm
    pdfJsResult = null;
  }

  // Guard: if pdfjs rendered a suspiciously small PNG (< 50KB), the page is likely blank
  // (pdfjs silently produces blank canvases for PDFs with unsupported image formats).
  // Fall through to pdftoppm which handles these correctly.
  const MIN_MEANINGFUL_PNG_BYTES = 50 * 1024; // 50KB
  if (pdfJsResult && pdfJsResult.length >= MIN_MEANINGFUL_PNG_BYTES) {
    pageImageCache.set(cacheKey, pdfJsResult);
    return `data:image/png;base64,${pdfJsResult.toString('base64')}`;
  }

  // --- Attempt 2: pdftoppm fallback (poppler) ---
  try {
    const { execFile } = await import('child_process');
    const os = await import('os');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mx-pdf-'));
    const outputPrefix = path.join(tmpDir, 'page');
    // dpi 150 ≈ scale 2x (72dpi * 2)
    const dpi = Math.round(72 * scale);
    await execFileAsync('pdftoppm', [
      '-png',
      '-r', String(dpi),
      '-f', String(pageNum),
      '-l', String(pageNum),
      '-singlefile',
      filePath,
      outputPrefix,
    ]);
    // pdftoppm writes <prefix>.png when -singlefile
    const outFile = `${outputPrefix}.png`;
    const pngBuffer = await fs.readFile(outFile);
    await fs.rm(tmpDir, { recursive: true }).catch(() => {});
    pageImageCache.set(cacheKey, pngBuffer);
    return `data:image/png;base64,${pngBuffer.toString('base64')}`;
  } catch {
    // pdftoppm not available or failed
  }

  return null;
}

/**
 * Store an uploaded PDF buffer into the project's data directory.
 * Returns the stored file path.
 */
export async function storePDFUpload(
  fileBuffer: Buffer,
  projectId: string,
): Promise<string> {
  const dir = path.resolve(process.cwd(), 'data', 'projects', projectId);
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, 'drawing.pdf');
  await fs.writeFile(dest, fileBuffer);
  return dest;
}

// Suppress unused import warning for PdfjsDocumentOptions (used as named type above)
void (0 as unknown as PdfjsDocumentOptions);
