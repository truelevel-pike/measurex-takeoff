/**
 * @jest-environment node
 */
import { broadcastToProject } from '@/lib/sse-broadcast';

describe('broadcastToProject', () => {
  it('does not throw when no clients are registered', () => {
    expect(() => broadcastToProject('no-clients-project', 'test:event', { foo: 'bar' })).not.toThrow();
  });

  it('sends encoded SSE frame to registered controllers', () => {
    const received: Uint8Array[] = [];
    const mockController = {
      enqueue: (chunk: Uint8Array) => received.push(chunk),
      close: jest.fn(),
      error: jest.fn(),
    } as unknown as ReadableStreamDefaultController;

    // Directly inject into globalThis registry
    const g = globalThis as typeof globalThis & {
      __sseClients?: Map<string, Set<ReadableStreamDefaultController>>;
    };
    if (!g.__sseClients) g.__sseClients = new Map();
    g.__sseClients.set('test-project', new Set([mockController]));

    broadcastToProject('test-project', 'polygon:created', { id: 'p1', points: [] });

    expect(received.length).toBeGreaterThan(0);
    const decoded = new TextDecoder().decode(received[0]);
    expect(decoded).toContain('polygon:created');
    expect(decoded).toContain('p1');
    expect(decoded).toMatch(/^id: \d+\n/);

    // Cleanup
    g.__sseClients.delete('test-project');
  });

  it('increments sequence number per project', () => {
    const received: string[] = [];
    const mockController = {
      enqueue: (chunk: Uint8Array) => received.push(new TextDecoder().decode(chunk)),
      close: jest.fn(),
      error: jest.fn(),
    } as unknown as ReadableStreamDefaultController;

    const g = globalThis as typeof globalThis & {
      __sseClients?: Map<string, Set<ReadableStreamDefaultController>>;
      __projectEventCounters?: Map<string, number>;
    };
    if (!g.__sseClients) g.__sseClients = new Map();
    if (!g.__projectEventCounters) g.__projectEventCounters = new Map();
    g.__sseClients.set('seq-project', new Set([mockController]));
    g.__projectEventCounters.set('seq-project', 0);

    broadcastToProject('seq-project', 'ev1', {});
    broadcastToProject('seq-project', 'ev2', {});

    expect(received.length).toBe(2);
    const seq1 = parseInt(received[0].match(/^id: (\d+)/)![1]);
    const seq2 = parseInt(received[1].match(/^id: (\d+)/)![1]);
    expect(seq2).toBeGreaterThan(seq1);

    // Cleanup
    g.__sseClients.delete('seq-project');
    g.__projectEventCounters.delete('seq-project');
  });

  it('removes disconnected controller (enqueue throws) without crashing', () => {
    let enqueueCount = 0;
    const badController = {
      enqueue: () => { enqueueCount++; throw new Error('Client disconnected'); },
      close: jest.fn(),
      error: jest.fn(),
    } as unknown as ReadableStreamDefaultController;

    const g = globalThis as typeof globalThis & {
      __sseClients?: Map<string, Set<ReadableStreamDefaultController>>;
    };
    if (!g.__sseClients) g.__sseClients = new Map();
    g.__sseClients.set('bad-client-project', new Set([badController]));

    expect(() => broadcastToProject('bad-client-project', 'test', {})).not.toThrow();
    expect(enqueueCount).toBe(1); // tried once then removed
    const remaining = g.__sseClients.get('bad-client-project');
    expect(remaining?.size ?? 0).toBe(0);

    // Cleanup
    g.__sseClients.delete('bad-client-project');
  });

  it('buffers last 50 events and discards oldest on overflow', () => {
    const g = globalThis as typeof globalThis & {
      __sseClients?: Map<string, Set<ReadableStreamDefaultController>>;
      __projectEventBuffer?: Map<string, Array<{ seq: number; event: string; data: unknown }>>;
    };
    if (!g.__sseClients) g.__sseClients = new Map();
    if (!g.__projectEventBuffer) g.__projectEventBuffer = new Map();
    // No clients for this test — just test buffer behavior
    g.__sseClients.set('buffer-project', new Set());

    for (let i = 0; i < 55; i++) {
      broadcastToProject('buffer-project', `event-${i}`, { i });
    }

    const buf = g.__projectEventBuffer.get('buffer-project') ?? [];
    expect(buf.length).toBeLessThanOrEqual(50);

    // Cleanup
    g.__sseClients.delete('buffer-project');
    g.__projectEventBuffer.delete('buffer-project');
  });
});
