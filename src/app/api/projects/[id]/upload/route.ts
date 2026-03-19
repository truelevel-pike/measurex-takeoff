import { NextResponse } from 'next/server';
import { createPage, updateProject, initDataDir } from '@/server/project-store';
import { processPDF } from '@/server/pdf-processor';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Save file to data dir, then process
    const fs = await import('fs/promises');
    const path = await import('path');
    const uploadDir = path.resolve(process.cwd(), 'data', 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, `${id}.pdf`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    const result = await processPDF(filePath, id);

    // Store pages
    for (const page of result.pages) {
      await createPage(id, page);
    }

    // Persist totalPages on the project so GET /api/projects/:id returns it correctly
    await updateProject(id, { totalPages: result.pages.length }).catch(() => null);

    return NextResponse.json({
      pages: result.pages.length,
      dimensions: result.pages.map((p) => ({ page: p.pageNum, width: p.width, height: p.height })),
    });
  } catch (err: any) {
    console.error("[upload route]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
