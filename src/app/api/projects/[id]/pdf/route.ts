import { NextResponse } from 'next/server';
import { initDataDir } from '@/server/project-store';

/**
 * GET /api/projects/:id/pdf
 * Serve the uploaded PDF binary for a project so the client can load it
 * into pdfjs without re-uploading after a page refresh.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    // Validate id is a safe UUID/alphanumeric string
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
    }

    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.resolve(process.cwd(), 'data', 'uploads', `${id}.pdf`);

    let buf: Buffer;
    try {
      buf = await fs.readFile(filePath);
    } catch {
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
