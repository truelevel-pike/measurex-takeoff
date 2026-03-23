/**
 * POST /api/projects/[id]/ai-takeoff/all-pages
 *
 * Runs AI takeoff sequentially across every page in the project.
 * Sequential (not parallel) to avoid Gemini rate limits.
 *
 * For each page:
 *   1. Calls analyzePagePDF (Gemini native PDF path) or analyzePageImage (local)
 *   2. Auto-applies any detected '_scale' element (same as single-page route)
 *   3. POSTs results to the apply route logic directly (shared helper)
 *
 * Returns:
 *   { pagesProcessed: N, totalElements: M, byPage: [{ page, elements }] }
 */

// Wave 23: extend Vercel serverless timeout — a 10-page PDF takes 20+ seconds.
// Default is 60s which would cut off mid-takeoff. 300s = 5 minutes.
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import {
  getProject,
  getPages,
  setScale,
  getClassifications,
  getPolygons,
  createClassification,
  createPolygon,
  deletePolygonsByPage,
} from '@/server/project-store';
import { renderPageAsImage } from '@/server/pdf-processor';
import { getPDFPath, getPDFBuffer } from '@/server/pdf-storage';
import { analyzePageImage, analyzePagePDF } from '@/server/ai-engine';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { fireWebhook } from '@/lib/webhooks';
import type { ScaleCalibration } from '@/lib/types';
import type { AIDetectedElement } from '@/server/ai-engine';

// ── Inline apply helpers (mirrors apply/route.ts logic without HTTP round-trip) ──

function shoelaceArea(points: Array<{ x: number; y: number }>): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function euclidean(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function hasSignificantOverlap(
  a: Array<{ x: number; y: number }>,
  b: Array<{ x: number; y: number }>,
  threshold = 0.8,
): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const tolerance = 5;
  let matches = 0;
  for (const pa of a) {
    for (const pb of b) {
      if (Math.abs(pa.x - pb.x) < tolerance && Math.abs(pa.y - pb.y) < tolerance) {
        matches++;
        break;
      }
    }
  }
  return matches / a.length >= threshold;
}

async function applyElementsToPage(
  projectId: string,
  page: number,
  elements: AIDetectedElement[],
): Promise<{ created: number; skipped: number }> {
  if (elements.length === 0) return { created: 0, skipped: 0 };

  await deletePolygonsByPage(projectId, page);
  let classifications = await getClassifications(projectId);
  const existingPolygons = await getPolygons(projectId);

  let created = 0;
  let skipped = 0;

  for (const element of elements) {
    const nameNorm = element.name.trim().toLowerCase();
    let classification = classifications.find((c) => c.name.trim().toLowerCase() === nameNorm);

    if (!classification) {
      classification = await createClassification(projectId, {
        name: element.name,
        type: element.type,
        color: element.color,
        visible: true,
      });
      broadcastToProject(projectId, 'classification:created', classification);
      classifications = await getClassifications(projectId);
    }

    const sameClassPage = existingPolygons.filter(
      (p) => p.classificationId === classification!.id && p.pageNumber === page,
    );
    const isDuplicate = sameClassPage.some((p) => hasSignificantOverlap(element.points, p.points));
    if (isDuplicate) { skipped++; continue; }

    let areaPixels = 0;
    let linearPixels = 0;
    if (element.type === 'area' && element.points.length >= 3) {
      areaPixels = shoelaceArea(element.points);
    } else if (element.type === 'linear' && element.points.length >= 2) {
      for (let i = 1; i < element.points.length; i++) {
        linearPixels += euclidean(element.points[i - 1], element.points[i]);
      }
    }

    try {
      const newPolygon = await createPolygon(projectId, {
        points: element.points,
        classificationId: classification.id,
        pageNumber: page,
        area: areaPixels,
        linearFeet: linearPixels,
        isComplete: true,
        label: element.name,
      });
      broadcastToProject(projectId, 'polygon:created', newPolygon);
      existingPolygons.push(newPolygon);
      created++;
    } catch (err) {
      console.error(`[all-pages] polygon creation failed on page ${page}:`, err);
    }
  }

  return { created, skipped };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Rate limit: same ceiling as single-page route
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const body = await req.json().catch(() => ({}));
    const rawModel = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : undefined;

    const ALLOWED_MODELS = [
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini',
      'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview',
    ];
    if (rawModel && !ALLOWED_MODELS.includes(rawModel)) {
      return NextResponse.json({ error: `Invalid model. Allowed: ${ALLOWED_MODELS.join(', ')}` }, { status: 400 });
    }
    const model = rawModel;

    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const totalPages = project.totalPages ?? 0;
    if (totalPages < 1) {
      return NextResponse.json({ error: 'No pages found — please upload a PDF first' }, { status: 400 });
    }

    // Resolve PDF path once; fall back to /tmp download if needed
    let pdfPath = await getPDFPath(id);
    let pdfBuffer: Buffer | null = null;

    if (!pdfPath) {
      pdfBuffer = await getPDFBuffer(id).catch(() => null);
      if (!pdfBuffer) {
        return NextResponse.json(
          { error: `PDF not found for project ${id} — please upload a drawing first` },
          { status: 404 },
        );
      }
      const { writeFile } = await import('fs/promises');
      const tmpPath = `/tmp/mx-${id}.pdf`;
      await writeFile(tmpPath, pdfBuffer);
      pdfPath = tmpPath;
    }

    // Get all page dimensions up-front
    const pages = await getPages(id);
    const pageMap = new Map(pages.map((p) => [p.pageNum, p]));

    const byPage: Array<{ page: number; elements: number; created: number; skipped: number; scale?: ScaleCalibration }> = [];
    let totalElements = 0;

    broadcastToProject(id, 'takeoff:started', { totalPages });
    broadcastToProject(id, 'ai-takeoff:all-pages:started', { totalPages });

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // Sequential loop — avoids Gemini rate limits
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageInfo = pageMap.get(pageNum);
      const pageWidth = pageInfo?.width ?? 792;
      const pageHeight = pageInfo?.height ?? 1224;

      broadcastToProject(id, 'takeoff:progress', { page: pageNum, total: totalPages });
      broadcastToProject(id, 'ai-takeoff:started', { page: pageNum });

      let elements: AIDetectedElement[];
      try {
        const imageDataUrl = await renderPageAsImage(pdfPath, pageNum).catch(() => null);

        // Wave 11B: per-page 25s timeout — prevents a single slow page from
        // consuming the entire Vercel 30s budget and causing an opaque 504.
        const PAGE_TIMEOUT_MS = 25_000;
        const pageTimeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('PAGE_TIMEOUT')), PAGE_TIMEOUT_MS)
        );

        const pageWorkPromise = (async (): Promise<AIDetectedElement[]> => {
          if (imageDataUrl) {
            return analyzePageImage(imageDataUrl, pageWidth, pageHeight, model);
          }
          // Gemini native PDF path
          if (!pdfBuffer) {
            pdfBuffer = await getPDFBuffer(id).catch(() => null);
          }
          if (!pdfBuffer) {
            console.error(`[all-pages] page ${pageNum}: no PDF buffer available — skipping`);
            return [];
          }
          const geminiModel = model?.startsWith('gemini-') ? model : 'gemini-2.5-flash';
          return analyzePagePDF(pdfBuffer, pageNum, pageWidth, pageHeight, geminiModel);
        })();

        const result = await Promise.race([pageWorkPromise, pageTimeoutPromise]);
        // Handle the "no buffer" skip case — empty array means skip this page
        if (result.length === 0 && !imageDataUrl && !pdfBuffer) {
          byPage.push({ page: pageNum, elements: 0, created: 0, skipped: 0 });
          continue;
        }
        elements = result;
      } catch (analyzeErr) {
        const isTimeout = analyzeErr instanceof Error && analyzeErr.message === 'PAGE_TIMEOUT';
        const errMsg = isTimeout
          ? `Page ${pageNum} timed out after 25s — skipping`
          : (analyzeErr instanceof Error ? analyzeErr.message : 'Analysis failed');
        console.error(`[all-pages] page ${pageNum} analyze failed:`, analyzeErr);
        broadcastToProject(id, isTimeout ? 'takeoff:timeout' : 'takeoff:error', { message: errMsg, page: pageNum });
        byPage.push({ page: pageNum, elements: 0, created: 0, skipped: 1 });
        continue;
      }

      // Auto-apply scale if Gemini returned a '_scale' element
      let appliedScale: ScaleCalibration | undefined;
      const scaleEl = elements.find((el) => el.name === '_scale');
      if (scaleEl) {
        const raw = scaleEl as unknown as Record<string, unknown>;
        const pixelsPerUnit = typeof raw.pixelsPerUnit === 'number' ? raw.pixelsPerUnit : null;
        const unit = typeof raw.unit === 'string' ? raw.unit as ScaleCalibration['unit'] : null;
        if (pixelsPerUnit && pixelsPerUnit > 0 && unit) {
          const detectedScale: ScaleCalibration = {
            pixelsPerUnit,
            unit,
            label: typeof raw.label === 'string' ? raw.label : 'Auto-detected',
            source: 'ai',
            confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.9,
            pageNumber: pageNum,
          };
          try {
            await setScale(id, detectedScale);
            broadcastToProject(id, 'scale:updated', detectedScale);
            appliedScale = detectedScale;
          } catch (scaleErr) {
            console.error(`[all-pages] page ${pageNum}: failed to apply scale:`, scaleErr);
          }
        }
        elements = elements.filter((el) => el.name !== '_scale');
      }

      // Apply elements to store
      const { created, skipped } = await applyElementsToPage(id, pageNum, elements);
      totalElements += elements.length;

      broadcastToProject(id, 'ai-takeoff:complete', { page: pageNum, detections: elements.length });

      byPage.push({
        page: pageNum,
        elements: elements.length,
        created,
        skipped,
        ...(appliedScale ? { scale: appliedScale } : {}),
      });

      // Rate-limit guard: 2-second delay between pages to avoid Gemini 429s
      if (pageNum < totalPages) {
        await sleep(2000);
      }
    }

    fireWebhook(id, 'takeoff.all-pages.completed', { pagesProcessed: totalPages, totalElements });
    // Wave 28B: also fire canonical snake_case event name agents expect
    void fireWebhook(id, 'takeoff:all_pages_complete', { totalPages, totalElements });
    broadcastToProject(id, 'takeoff:complete', { totalElements });
    broadcastToProject(id, 'ai-takeoff:all-pages:complete', { pagesProcessed: totalPages, totalElements });

    return NextResponse.json({
      pagesProcessed: totalPages,
      totalElements,
      byPage,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'All-pages takeoff failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
