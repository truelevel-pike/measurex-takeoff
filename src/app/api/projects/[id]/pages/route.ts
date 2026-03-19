import { NextResponse } from 'next/server';
import { getPages, initDataDir } from '@/server/project-store';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const pages = await getPages(id);
    return NextResponse.json({ pages });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
