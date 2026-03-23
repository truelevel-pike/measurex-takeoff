import { NextResponse } from 'next/server';
import { getProject, createPage, updateProject, initDataDir } from '@/server/project-store';
import { processPDF, renderPageAsImage } from '@/server/pdf-processor';
import { savePDF, getPDFPublicUrl } from '@/server/pdf-storage';
import { extractSheetName } from '@/lib/sheet-namer';
import { aiSheetNamer } from '@/lib/ai-sheet-namer';
import { detectScaleFromText } from '@/lib/auto-scale';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // BUG-A5-6-091: rate-limit upload endpoint to prevent abuse
    const limited = rateLimitResponse(req, 5, 60_000);
    if (limited) return limited;

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

    // BUG-A5-5-020: require BOTH MIME type AND extension (AND not OR)
    const isPdfMime = file.type === 'application/pdf';
    const isPdfExt = file.name?.toLowerCase().endsWith('.pdf');
    if (!isPdfMime || !isPdfExt) {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
    }

    // Validate file size — max 100 MB (Vercel serverless body limit is 4.5MB by default,
    // but we use Supabase Storage for the binary; the multipart parse itself stays small)
    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'PDF too large. Maximum size is 100MB.', code: 'FILE_TOO_LARGE' },
        { status: 413 },
      );
    }

    // Save file to storage (local + Supabase Storage in prod), then process
    const buffer = Buffer.from(await file.arrayBuffer());

    // BUG-A5-6-092: verify PDF magic bytes (%PDF = 0x25 0x50 0x44 0x46)
    if (buffer.length < 4 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
      return NextResponse.json({ error: 'Invalid PDF file — magic bytes check failed' }, { status: 400 });
    }

    const filePath = await savePDF(id, buffer);

    // Store public Supabase Storage URL on the project record (for client-side PDF loading on Vercel)
    const pdfUrl = getPDFPublicUrl(id);
    if (pdfUrl) {
      await updateProject(id, { pdfUrl }).catch(() => null);
    }

    // On Vercel, node-canvas is unavailable so renderPageAsImage will always fail.
    // Skip AI sheet naming (image fallback) and use text-only extraction instead.
    const isVercel = process.env.VERCEL === '1';

    const result = await processPDF(filePath, id);

    // GAP-001: Extract sheet names and store pages
    // For image-only PDFs (no text layer), fall back to AI vision to read the title block.
    // Skipped on Vercel (no canvas available).
    const resolvedNames: Record<number, string> = {};
    const aiNamingPromises: Promise<void>[] = [];

    for (const page of result.pages) {
      const sheetName = extractSheetName(page.text ?? '');
      if (sheetName) {
        resolvedNames[page.pageNum] = sheetName;
      } else if (!isVercel) {
        // Queue AI fallback — non-blocking per page, we'll await all at end
        // Skipped on Vercel because renderPageAsImage requires node-canvas
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
      ...(pdfUrl ? { pdfUrl } : {}),
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
    return NextResponse.json({
      error: `Unable to process PDF — the file may be corrupted, too large (max 100MB), or the upload exceeded Vercel's request size limit. For very large PDFs, please reduce the file size or contact support.`,
      code: 'UPLOAD_FAILED',
    }, { status: 500 });
  }
}
