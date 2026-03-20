import { NextResponse } from 'next/server';
import { getProject, getPages } from '@/server/project-store';
import { renderPageAsImage } from '@/server/pdf-processor';
import { getPDFPath } from '@/server/pdf-storage';
import { analyzePageImage } from '@/server/ai-engine';
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
    const body = await req.json();
    const pageNum: number = body?.page;
    const model: string | undefined = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : undefined;

    if (!pageNum || typeof pageNum !== 'number') {
      return NextResponse.json({ error: 'page (number) is required' }, { status: 400 });
    }

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const pdfPath = await getPDFPath(id);

    if (!pdfPath) {
      return NextResponse.json(
        { error: `PDF not found for project ${id} — please upload a drawing first` },
        { status: 404 },
      );
    }

    const imageDataUrl = await renderPageAsImage(pdfPath, pageNum);
    if (!imageDataUrl) {
      return NextResponse.json(
        { error: 'PDF rendering not available — canvas package required' },
        { status: 400 },
      );
    }

    // Get page dimensions
    const pages = await getPages(id);
    const pageInfo = pages.find((p) => p.pageNum === pageNum);
    const pageWidth = pageInfo?.width ?? 1000;
    const pageHeight = pageInfo?.height ?? 800;

    broadcastToProject(id, 'ai-takeoff:started', { page: pageNum });

    const elements = await analyzePageImage(imageDataUrl, pageWidth, pageHeight, model);

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
