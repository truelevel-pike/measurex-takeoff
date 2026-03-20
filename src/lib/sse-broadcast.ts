// Singleton registry — survives Next.js module re-evaluation
declare const globalThis: typeof global & {
  __sseClients?: Map<string, Set<ReadableStreamDefaultController>>;
  __projectEventCounters?: Map<string, number>;
  __projectEventBuffer?: Map<string, Array<{ seq: number; event: string; data: unknown }>>;
  __projectViewers?: Map<string, Set<string>>;
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
if (!globalThis.__projectViewers) {
  globalThis.__projectViewers = new Map();
}
export const projectClients = globalThis.__sseClients;
export const projectEventCounters = globalThis.__projectEventCounters;
export const projectEventBuffer = globalThis.__projectEventBuffer;
export const projectViewers = globalThis.__projectViewers;

// BUG-A5-6-191: cap number of tracked projects to prevent unbounded memory growth
const MAX_PROJECTS = 500;

/** Broadcast an SSE event to all clients subscribed to a project */
export function broadcastToProject(projectId: string, event: string, data: unknown) {
  const seq = (projectEventCounters.get(projectId) ?? 0) + 1;
  projectEventCounters.set(projectId, seq);

  const buffer = projectEventBuffer.get(projectId) ?? [];
  buffer.push({ seq, event, data });
  if (buffer.length > 50) buffer.shift();
  projectEventBuffer.set(projectId, buffer);

  // Evict oldest project entries if we exceed the cap
  if (projectEventBuffer.size > MAX_PROJECTS) {
    const oldest = projectEventBuffer.keys().next().value;
    if (oldest !== undefined) {
      projectEventBuffer.delete(oldest);
      projectEventCounters.delete(oldest);
    }
  }

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
