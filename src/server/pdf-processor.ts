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
 */
async function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  // Use the legacy build which has broader Node.js compat
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as typeof import('pdfjs-dist');
  return pdfjsLib;
}

// ── Core Functions ─────────────────────────────────────────────────────

/**
 * Process a PDF file: extract page count, dimensions, and text for each page.
 */
export async function processPDF(
  filePath: string,
  _projectId: string,
): Promise<PDFProcessResult> {
  const pdfjsLib = await getPdfjs();
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

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
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

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
 * Returns null if the canvas package is not available.
 */
export async function renderPageAsImage(
  filePath: string,
  pageNum: number,
  scale: number = 2.0,
): Promise<string | null> {
  const cacheKey = `${filePath}:${pageNum}:${scale}`;
  const cached = pageImageCache.get(cacheKey);
  if (cached) return `data:image/png;base64,${cached.toString('base64')}`;

  let createCanvas: (w: number, h: number) => ReturnType<typeof import('canvas')['createCanvas']>;
  try {
    const canvasModule = await import('canvas');
    createCanvas = canvasModule.createCanvas;
  } catch {
    // canvas package not available — graceful degradation
    return null;
  }

  const canvasFactory = {
    create(width: number, height: number) {
      const canvas = createCanvas(width, height);
      return { canvas, context: canvas.getContext('2d') };
    },
    reset(data: { canvas: { width: number; height: number }; context: unknown }, width: number, height: number) {
      data.canvas.width = width;
      data.canvas.height = height;
    },
    destroy() { /* no-op */ },
  };

  const pdfjsLib = await getPdfjs();
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

  if (pageNum < 1 || pageNum > doc.numPages) return null;

  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({
    canvasContext: canvasAndContext.context,
    viewport,
    canvasFactory,
  } as any).promise;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pngBuffer = (canvasAndContext.canvas as any).toBuffer('image/png') as Buffer;
  pageImageCache.set(cacheKey, pngBuffer);

  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
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
