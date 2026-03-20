import { NextResponse } from 'next/server';
import { loadPDF } from '@/server/pdf-storage';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';

/**
 * GET /api/projects/:id/pdf
 * Serve the uploaded PDF binary for a project so the client can load it
 * into pdfjs without re-uploading after a page refresh.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-063: add rate limiting to PDF endpoint
  const limited = rateLimitResponse(_req);
  if (limited) return limited;

  try {
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const buf = await loadPDF(id);
    if (!buf) {
      return NextResponse.json({ error: 'Unable to load PDF — the file may be corrupted or too large (max 50MB)' }, { status: 404 });
    }

    // BUG-A5-6-064: slice to avoid leaking the entire Node.js Buffer pool
    return new Response(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${id}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: unknown) {
    // BUG-A5-5-021: log original error before returning generic message
    console.error('[pdf route]', err);
    return NextResponse.json({ error: `Unable to load PDF — the file may be corrupted or too large (max 50MB)` }, { status: 500 });
  }
}
