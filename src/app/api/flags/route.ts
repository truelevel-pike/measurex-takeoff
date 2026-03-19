import { NextResponse } from 'next/server';
import { getAllFlags, setServerFlag, FLAG_NAMES, type FlagName } from '@/lib/feature-flags';

export async function GET() {
  return NextResponse.json(getAllFlags());
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const { flag, value } = body as { flag: string; value: boolean };

    if (!flag || typeof value !== 'boolean') {
      return NextResponse.json({ error: 'Body must have { flag: string, value: boolean }' }, { status: 400 });
    }

    if (!FLAG_NAMES.includes(flag as FlagName)) {
      return NextResponse.json({ error: `Unknown flag: ${flag}` }, { status: 400 });
    }

    setServerFlag(flag as FlagName, value);
    return NextResponse.json({ flag, value });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
