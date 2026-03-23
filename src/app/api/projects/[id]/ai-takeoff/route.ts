import { NextResponse } from 'next/server';
import { getProject, getPages } from '@/server/project-store';
import { renderPageAsImage } from '@/server/pdf-processor';
import { getPDFPath } from '@/server/pdf-storage';
import { analyzePageImage, analyzePagePDF } from '@/server/ai-engine';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';
import { broadcastToProject } from '@/lib/sse-broadcast';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Rate limit: 10 req/min per IP
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    // BUG-A5-6-095: catch JSON parse errors
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const pageNum: number = body?.page;
    // BUG-A5-5-037: validate model against whitelist
    const ALLOWED_MODELS = [
      // OpenAI vision models
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini',
      // Gemini models (support native PDF input — no canvas required)
      'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview',
    ];
    const rawModel = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : undefined;
    if (rawModel && !ALLOWED_MODELS.includes(rawModel)) {
      return NextResponse.json({ error: `Invalid model. Allowed: ${ALLOWED_MODELS.join(', ')}` }, { status: 400 });
    }
    const model = rawModel;

    if (!Number.isInteger(pageNum) || pageNum < 1) {
      return NextResponse.json({ error: 'page must be a positive integer' }, { status: 400 });
    }

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    let pdfPath = await getPDFPath(id);

    // On Vercel, local PDF file doesn't exist — download from Supabase Storage to /tmp
    if (!pdfPath) {
      const { getPDFBuffer } = await import('@/server/pdf-storage');
      const pdfBuffer = await getPDFBuffer(id).catch(() => null);
      if (!pdfBuffer) {
        return NextResponse.json(
          { error: `PDF not found for project ${id} — please upload a drawing first` },
          { status: 404 },
        );
      }
      // Write to /tmp (writable on Vercel serverless)
      const { writeFile } = await import('fs/promises');
      const tmpPath = `/tmp/mx-${id}.pdf`;
      await writeFile(tmpPath, pdfBuffer);
      pdfPath = tmpPath;
    }

    // Get page dimensions up-front (needed by both paths)
    const pages = await getPages(id);
    const pageInfo = pages.find((p) => p.pageNum === pageNum);
    const pageWidth = pageInfo?.width ?? 792;
    const pageHeight = pageInfo?.height ?? 1224;

    broadcastToProject(id, 'ai-takeoff:started', { page: pageNum });

    // Try image-based rendering first (works locally where node-canvas is available).
    // On Vercel, renderPageAsImage returns null because node-canvas is absent —
    // fall back to Gemini native PDF input which needs no canvas at all.
    const imageDataUrl = await renderPageAsImage(pdfPath, pageNum).catch(() => null);

    let elements: Awaited<ReturnType<typeof analyzePageImage>>;

    if (imageDataUrl) {
      elements = await analyzePageImage(imageDataUrl, pageWidth, pageHeight, model);
    } else {
      // Gemini PDF path: read raw bytes and send directly — no image conversion needed
      const { getPDFBuffer } = await import('@/server/pdf-storage');
      const pdfBuffer = await getPDFBuffer(id).catch(() => null);
      if (!pdfBuffer) {
        return NextResponse.json(
          { error: 'PDF rendering not available and PDF buffer could not be loaded' },
          { status: 500 },
        );
      }
      // Use a Gemini model: prefer the request model if it's a Gemini model,
      // otherwise default to gemini-2.5-flash (best for blueprints, no canvas needed)
      const geminiModel = (model && model.startsWith('gemini-')) ? model : 'gemini-2.5-flash';
      elements = await analyzePagePDF(pdfBuffer, pageNum, pageWidth, pageHeight, geminiModel);
    }

    broadcastToProject(id, 'ai-takeoff:complete', {
      page: pageNum,
      detections: elements.length,
    });

    return NextResponse.json({ elements });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : 'AI takeoff failed';
    const message = `Takeoff failed — try a different model or check your internet connection (${raw})`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
