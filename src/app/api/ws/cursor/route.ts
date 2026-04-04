/**
 * POST /api/ws/cursor — broadcast a cursor:update event to all SSE subscribers
 * for a project. Used by the useCollaboration hook to propagate cursor positions.
 */

import { NextResponse } from 'next/server';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: Request) {
  // Rate-limit heavily — cursor updates can be very frequent
  const limited = rateLimitResponse(req as Parameters<typeof rateLimitResponse>[0], 300, 60_000);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.projectId !== 'string') {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }
    const { projectId, x, y, page, viewerId } = body as {
      projectId: string;
      x?: number;
      y?: number;
      page?: number;
      viewerId?: string;
    };

    // Validate UUID format (same guard as /api/ws GET)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 });
    }

    broadcastToProject(projectId, 'cursor:update', {
      viewerId: viewerId ?? 'anon',
      x: typeof x === 'number' ? x : 0,
      y: typeof y === 'number' ? y : 0,
      page: typeof page === 'number' ? page : 1,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
