import { NextResponse } from 'next/server';
import { getProject, createPage, updateProject, initDataDir } from '@/server/project-store';
import { processPDF, renderPageAsImage } from '@/server/pdf-processor';
import { savePDF } from '@/server/pdf-storage';
import { extractSheetName } from '@/lib/sheet-namer';
import { aiSheetNamer } from '@/lib/ai-sheet-namer';
import { detectScaleFromText } from '@/lib/auto-scale';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    // Filename sanitization is not needed — the uploaded file's original name is
    // never used in the file path. We save as `${id}.pdf` where `id` is validated
    // as a UUID by ProjectIdSchema above, preventing path traversal.
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Save file to storage (local + Supabase Storage in prod), then process
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = await savePDF(id, buffer);
    const result = await processPDF(filePath, id);

    // GAP-001: Extract sheet names and store pages
    // For image-only PDFs (no text layer), fall back to AI vision to read the title block.
    const resolvedNames: Record<number, string> = {};
    const aiNamingPromises: Promise<void>[] = [];

    for (const page of result.pages) {
      const sheetName = extractSheetName(page.text ?? '');
      if (sheetName) {
        resolvedNames[page.pageNum] = sheetName;
      } else {
        // Queue AI fallback — non-blocking per page, we'll await all at end
        aiNamingPromises.push(
          renderPageAsImage(filePath, page.pageNum, 1.0)
            .then((imageBase64) => imageBase64 ? aiSheetNamer(imageBase64) : null)
            .then((aiName) => {
              if (aiName) resolvedNames[page.pageNum] = aiName;
            })
            .catch(() => { /* graceful — falls back to "Sheet N" on client */ }),
        );
      }
    }

    // Wait for all AI naming attempts (non-blocking: failures are swallowed above)
    await Promise.all(aiNamingPromises);

    for (const page of result.pages) {
      await createPage(id, { ...page, name: resolvedNames[page.pageNum] ?? undefined });
    }

    // Persist totalPages on the project so GET /api/projects/:id returns it correctly
    await updateProject(id, { totalPages: result.pages.length }).catch(() => null);

    // GAP-006: Auto-scale detection on page 1 text
    const page1 = result.pages.find((p) => p.pageNum === 1);
    const scaleResult = page1?.text ? detectScaleFromText(page1.text) : null;

    // Collect sheet names so the client has them immediately
    const sheetNames: Record<number, string> = {};
    for (const [pageNum, name] of Object.entries(resolvedNames)) {
      sheetNames[Number(pageNum)] = name;
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
  } catch (err: unknown) {
    console.error("[upload route]", err);
    return NextResponse.json({ error: `Unable to load PDF — the file may be corrupted or too large (max 50MB)` }, { status: 500 });
  }
}
