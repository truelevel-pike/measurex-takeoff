import { NextRequest } from 'next/server';

// Singleton registry — survives Next.js module re-evaluation
declare const globalThis: typeof global & {
  __sseClients?: Map<string, Set<ReadableStreamDefaultController>>;
};
if (!globalThis.__sseClients) {
  globalThis.__sseClients = new Map();
}
const projectClients = globalThis.__sseClients;

/** Broadcast an SSE event to all clients subscribed to a project */
export function broadcastToProject(projectId: string, event: string, data: unknown) {
  const clients = projectClients.get(projectId);
  if (!clients || clients.size === 0) return;

  const message = `data: ${JSON.stringify({ event, data })}\n\n`;
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

      // Send initial connection event
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ event: 'connected', data: { projectId } })}\n\n`)
      );

      // 30-second keepalive to prevent proxy/load-balancer timeouts
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
      }, 30_000);
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
