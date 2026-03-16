import { NextRequest } from 'next/server';

// Global map: projectId → Set of stream controllers
const projectClients = new Map<string, Set<ReadableStreamDefaultController>>();

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

  const stream = new ReadableStream({
    start(controller) {
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
    },
    cancel() {
      // Client disconnected — clean up
      const clients = projectClients.get(projectId);
      // Controller reference is captured in closure; iterate to find & remove
      if (clients) {
        // The controller that initiated cancel is already closed,
        // but we can't reference it here directly. Stale controllers
        // are pruned on next broadcast. Force a prune now:
        for (const c of clients) {
          try {
            // Test if controller is still open by enqueueing empty comment
            c.enqueue(new TextEncoder().encode(': ping\n\n'));
          } catch {
            clients.delete(c);
          }
        }
        if (clients.size === 0) {
          projectClients.delete(projectId);
        }
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
