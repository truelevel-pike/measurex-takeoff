import { NextResponse } from 'next/server';
import path from 'path';
import { getProject, getPages } from '@/server/project-store';
import { renderPageAsImage } from '@/server/pdf-processor';
import { analyzePageImage } from '@/server/ai-engine';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const pageNum: number = body?.page;

    if (!pageNum || typeof pageNum !== 'number') {
      return NextResponse.json({ error: 'page (number) is required' }, { status: 400 });
    }

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const pdfPath = path.resolve(process.cwd(), 'data', 'projects', id, 'drawing.pdf');

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

    const elements = await analyzePageImage(imageDataUrl, pageWidth, pageHeight);

    return NextResponse.json({ elements });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI takeoff failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
