import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPages, updatePage, initDataDir } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';

const PagePatchSchema = z.object({
  pageNum: z.number().int().positive(),
  text: z.string().optional(),
  sheet_name: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const pages = await getPages(id);
    return NextResponse.json({ pages });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const body = await req.json();
    const bodyResult = PagePatchSchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);

    const { pageNum, text, sheet_name } = bodyResult.data;
    const patch: Record<string, unknown> = {};
    if (text !== undefined) patch.text = text;
    if (sheet_name !== undefined) patch.name = sheet_name;

    const updated = await updatePage(id, pageNum, patch);
    if (!updated) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }
    return NextResponse.json({ page: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
