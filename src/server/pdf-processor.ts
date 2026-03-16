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
