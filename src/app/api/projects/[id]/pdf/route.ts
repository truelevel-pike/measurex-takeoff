import { NextResponse } from 'next/server';
import { loadPDF } from '@/server/pdf-storage';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';

/**
 * GET /api/projects/:id/pdf
 * Serve the uploaded PDF binary for a project so the client can load it
 * into pdfjs without re-uploading after a page refresh.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const buf = await loadPDF(id);
    if (!buf) {
      return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
    }

    return new Response(buf.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${id}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
