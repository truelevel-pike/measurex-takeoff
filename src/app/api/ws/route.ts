import { NextRequest } from 'next/server';

// Singleton registry — survives Next.js module re-evaluation
declare const globalThis: typeof global & {
  __sseClients?: Map<string, Set<ReadableStreamDefaultController>>;
  __projectEventCounters?: Map<string, number>;
  __projectEventBuffer?: Map<string, Array<{ seq: number; event: string; data: unknown }>>;
};
if (!globalThis.__sseClients) {
  globalThis.__sseClients = new Map();
}
if (!globalThis.__projectEventCounters) {
  globalThis.__projectEventCounters = new Map();
}
if (!globalThis.__projectEventBuffer) {
  globalThis.__projectEventBuffer = new Map();
}
const projectClients = globalThis.__sseClients;
const projectEventCounters = globalThis.__projectEventCounters;
const projectEventBuffer = globalThis.__projectEventBuffer;

/** Broadcast an SSE event to all clients subscribed to a project */
export function broadcastToProject(projectId: string, event: string, data: unknown) {
  const seq = (projectEventCounters.get(projectId) ?? 0) + 1;
  projectEventCounters.set(projectId, seq);

  const buffer = projectEventBuffer.get(projectId) ?? [];
  buffer.push({ seq, event, data });
  if (buffer.length > 50) buffer.shift();
  projectEventBuffer.set(projectId, buffer);

  const clients = projectClients.get(projectId);
  if (!clients || clients.size === 0) return;

  const message = `id: ${seq}\ndata: ${JSON.stringify({ event, data })}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(message);

  for (const controller of clients) {
    try {
      controller.enqueue(encoded);
    } catch {
      // Client disconnected — remove on next cleanup
      clients.delete(controller);
    }
  }
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return new Response('Missing projectId query param', { status: 400 });
  }
  const headerLastEventId = request.headers.get('last-event-id');
  const queryLastEventId = request.nextUrl.searchParams.get('lastEventId');
  const candidateLastEventId = Number(headerLastEventId ?? queryLastEventId ?? '0');
  const lastEventId =
    Number.isFinite(candidateLastEventId) && candidateLastEventId > 0 ? candidateLastEventId : 0;

  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  let thisController: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(controller) {
      thisController = controller;

      // Register this client
      if (!projectClients.has(projectId)) {
        projectClients.set(projectId, new Set());
      }
      projectClients.get(projectId)!.add(controller);

      const encoder = new TextEncoder();

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

      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ event: 'connected', data: { projectId } })}\n\n`)
      );

      // 15-second keepalive to prevent proxy/load-balancer timeouts
      keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
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
