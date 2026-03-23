import { NextResponse } from 'next/server';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { getAgentEvents } from '@/lib/webhooks';
import { rateLimitResponse } from '@/lib/rate-limit';

/**
 * GET /api/projects/:id/webhooks/events
 *
 * Returns the last 20 agent events fired for this project.
 * Agents poll this endpoint to confirm what has happened
 * (e.g. takeoff started, scale set, polygon created, etc.).
 *
 * Response shape:
 *   { events: [ { event, page, source, timestamp, projectId, meta? } ] }
 *
 * Query params:
 *   ?limit=N  — number of events to return (default 20, max 100)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  const paramsResult = ProjectIdSchema.safeParse(await params);
  if (!paramsResult.success) return validationError(paramsResult.error);
  const { id } = paramsResult.data;

  const { searchParams } = new URL(req.url);
  const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 100) : 20;

  const events = getAgentEvents(id, limit);
  return NextResponse.json({ events, count: events.length, projectId: id });
}
