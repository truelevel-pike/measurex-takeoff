import { NextResponse } from 'next/server';
import { createPage, updateProject, initDataDir } from '@/server/project-store';
import { processPDF } from '@/server/pdf-processor';
import { extractSheetName } from '@/lib/sheet-namer';
import { detectScaleFromText } from '@/lib/auto-scale';

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

    // GAP-001: Extract sheet names and store pages
    for (const page of result.pages) {
      const sheetName = extractSheetName(page.text ?? '');
      await createPage(id, { ...page, name: sheetName ?? undefined });
    }

    // Persist totalPages on the project so GET /api/projects/:id returns it correctly
    await updateProject(id, { totalPages: result.pages.length }).catch(() => null);

    // GAP-006: Auto-scale detection on page 1 text
    const page1 = result.pages.find((p) => p.pageNum === 1);
    const scaleResult = page1?.text ? detectScaleFromText(page1.text) : null;

    // Collect sheet names so the client has them immediately
    const sheetNames: Record<number, string> = {};
    for (const page of result.pages) {
      const name = extractSheetName(page.text ?? '');
      if (name) sheetNames[page.pageNum] = name;
    }

    const response: Record<string, unknown> = {
      pages: result.pages.length,
      dimensions: result.pages.map((p) => ({ page: p.pageNum, width: p.width, height: p.height })),
      sheetNames,
    };

    if (scaleResult) {
      response.detectedScale = {
        pixelsPerUnit: scaleResult.scale.pixelsPerUnit,
        unit: scaleResult.scale.unit,
        description: scaleResult.scale.label,
      };
    }

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("[upload route]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
