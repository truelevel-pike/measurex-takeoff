import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProject, getPages, updatePage, createPage, initDataDir } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';

const PagePatchSchema = z.object({
  pageNum: z.number().int().positive(),
  text: z.string().optional(),
  sheet_name: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-089: add rate limiting
  const limited = rateLimitResponse(_req);
  if (limited) return limited;

  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const pages = await getPages(id);
    return NextResponse.json({ pages });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-089: add rate limiting
  const limitedPatch = rateLimitResponse(req);
  if (limitedPatch) return limitedPatch;

  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = PagePatchSchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);

    const { pageNum, text, sheet_name } = bodyResult.data;
    const patch: Record<string, unknown> = {};
    if (text !== undefined) patch.text = text;
    if (sheet_name !== undefined) patch.name = sheet_name;

    let updated = await updatePage(id, pageNum, patch);
    if (!updated) {
      // Page doesn't exist yet — create it (upsert). This handles the race where
      // the client extracts text before the upload route has finished creating pages.
      // BUG-A5-5-022: try to get existing page dimensions from nearby pages
      // BUG-A5-6-090: wrap createPage in try/catch to handle race condition where
      // concurrent requests both try to create the same page. If creation fails
      // (e.g. unique constraint), retry the update.
      try {
        const existingPages = await getPages(id);
        const nearestPage = existingPages.find((p) => p.pageNum === pageNum) ?? existingPages[0];
        const page = await createPage(id, {
          pageNum,
          width: nearestPage?.width ?? 0,
          height: nearestPage?.height ?? 0,
          text: (text as string | undefined) ?? '',
          name: (sheet_name as string | undefined) ?? undefined,
        });
        updated = page;
      } catch {
        // Race: another request created the page between our update and create.
        // Retry the update which should now succeed.
        updated = await updatePage(id, pageNum, patch);
      }
    }
    return NextResponse.json({ page: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
