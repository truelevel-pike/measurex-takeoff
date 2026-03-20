import { NextResponse } from 'next/server';
import { pluginRegistry } from '@/lib/plugin-system';

export async function GET() {
  try {
    const plugins = pluginRegistry.list().map((p) => ({
      name: p.name,
      version: p.version,
    }));
    return NextResponse.json({ plugins });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Failed to list plugins') }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json(
      {
        message:
          'Plugin registration is done programmatically via src/lib/plugin-system.ts. ' +
          'Import registerPlugin and call it with a MeasureXPlugin object.',
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Failed to process plugin request') }, { status: 500 });
  }
}
