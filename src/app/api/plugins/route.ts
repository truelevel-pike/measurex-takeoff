import { NextResponse } from 'next/server';
import { pluginRegistry } from '@/lib/plugin-system';

export async function GET() {
  try {
    const plugins = pluginRegistry.list().map((p) => ({
      name: p.name,
      version: p.version,
    }));
    return NextResponse.json({ plugins });
  } catch (err) {
    console.error('Plugins error:', err);
    return NextResponse.json({ error: 'Failed to retrieve plugins' }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    {
      message:
        'Plugin registration is done programmatically via src/lib/plugin-system.ts. ' +
        'Import registerPlugin and call it with a MeasureXPlugin object.',
    },
    { status: 405 },
  );
}
