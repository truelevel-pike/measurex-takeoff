import { NextRequest } from 'next/server';
import { projectClients, projectEventBuffer, projectViewers, broadcastToProject } from '@/lib/sse-broadcast';
import { rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  // BUG-A5-6-065: add rate limiting to SSE endpoint
  const limited = rateLimitResponse(request);
  if (limited) return limited;

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return new Response('Missing projectId query param', { status: 400 });
  }

  // BUG-A5-6-065: validate projectId as UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return new Response('Invalid projectId format', { status: 400 });
  }
  const headerLastEventId = request.headers.get('last-event-id');
  const queryLastEventId = request.nextUrl.searchParams.get('lastEventId');
  const candidateLastEventId = Number(headerLastEventId ?? queryLastEventId ?? '0');
  const lastEventId =
    Number.isFinite(candidateLastEventId) && candidateLastEventId > 0 ? candidateLastEventId : 0;

  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  let thisController: ReadableStreamDefaultController | null = null;
  const viewerId = `v-${crypto.randomUUID().slice(0, 8)}`;

  const stream = new ReadableStream({
    start(controller) {
      thisController = controller;

      // Register this client
      if (!projectClients.has(projectId)) {
        projectClients.set(projectId, new Set());
      }
      projectClients.get(projectId)!.add(controller);

      // Track viewer presence
      if (!projectViewers.has(projectId)) {
        projectViewers.set(projectId, new Set());
      }
      projectViewers.get(projectId)!.add(viewerId);
      const viewerCount = projectViewers.get(projectId)!.size;

      const encoder = new TextEncoder();

      // BUG-A5-5-043: send connected event first, then replay buffered events, then viewer:count
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ event: 'connected', data: { projectId } })}\n\n`)
      );

      if (lastEventId > 0) {
        const buffered = projectEventBuffer.get(projectId) ?? [];
        for (const bufferedEvent of buffered) {
          if (bufferedEvent.seq > lastEventId) {
            controller.enqueue(
              encoder.encode(
                `id: ${bufferedEvent.seq}\ndata: ${JSON.stringify({
                  event: bufferedEvent.event,
                  data: bufferedEvent.data,
                })}\n\n`
              )
            );
          }
        }
      }

      // Send current viewer count to this client
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ event: 'viewer:count', data: { viewerId, viewerCount } })}\n\n`)
      );

      // Broadcast viewer joined to all clients
      broadcastToProject(projectId, 'viewer:joined', { viewerId, viewerCount });

      // 15-second keepalive to prevent proxy/load-balancer timeouts
      // BUG-A5-5-044: reuse existing encoder instead of new TextEncoder() per tick
      keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          // Client disconnected mid-keepalive — clear interval
          if (keepaliveInterval !== null) {
            clearInterval(keepaliveInterval);
            keepaliveInterval = null;
          }
        }
      }, 15_000);
    },
    cancel() {
      // Clear keepalive interval to avoid memory leaks
      if (keepaliveInterval !== null) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
      }

      // Remove viewer presence
      const viewers = projectViewers.get(projectId);
      if (viewers) {
        viewers.delete(viewerId);
        const viewerCount = viewers.size;
        if (viewers.size === 0) {
          projectViewers.delete(projectId);
        }
        broadcastToProject(projectId, 'viewer:left', { viewerId, viewerCount });
      }

      // Client disconnected — remove this controller from the registry
      if (thisController !== null) {
        const clients = projectClients.get(projectId);
        if (clients) {
          clients.delete(thisController);
          if (clients.size === 0) {
            projectClients.delete(projectId);
          }
        }
        thisController = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
