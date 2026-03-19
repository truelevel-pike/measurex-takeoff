/**
 * SSE integration tests — registry, pub-sub, broadcast (E36)
 */

// Polyfill TextEncoder/TextDecoder for jsdom environment
import { TextEncoder, TextDecoder } from 'util';
if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as Record<string, unknown>).TextEncoder = TextEncoder;
  (globalThis as Record<string, unknown>).TextDecoder = TextDecoder;
}

// ---------------------------------------------------------------------------
// Test A: SSE Registry — client registration via globalThis.__sseClients
// ---------------------------------------------------------------------------
describe('SSE Registry', () => {
  beforeEach(() => {
    // Reset the global registries before each test
    (globalThis as Record<string, unknown>).__sseClients = new Map<
      string,
      Set<ReadableStreamDefaultController>
    >();
    (globalThis as Record<string, unknown>).__projectEventCounters = new Map<string, number>();
    (globalThis as Record<string, unknown>).__projectEventBuffer = new Map<
      string,
      Array<{ seq: number; event: string; data: unknown }>
    >();
  });

  it('registers a client for a projectId', () => {
    const registry = (globalThis as Record<string, unknown>).__sseClients as Map<
      string,
      Set<ReadableStreamDefaultController>
    >;

    const projectId = 'proj-001';
    const mockController = { enqueue: jest.fn(), close: jest.fn() } as unknown as ReadableStreamDefaultController;

    // Simulate what route.ts does in ReadableStream.start()
    if (!registry.has(projectId)) {
      registry.set(projectId, new Set());
    }
    registry.get(projectId)!.add(mockController);

    expect(registry.has(projectId)).toBe(true);
    expect(registry.get(projectId)!.size).toBe(1);
    expect(registry.get(projectId)!.has(mockController)).toBe(true);
  });

  it('deregisters a client and cleans up empty project sets', () => {
    const registry = (globalThis as Record<string, unknown>).__sseClients as Map<
      string,
      Set<ReadableStreamDefaultController>
    >;

    const projectId = 'proj-002';
    const mockController = { enqueue: jest.fn(), close: jest.fn() } as unknown as ReadableStreamDefaultController;

    registry.set(projectId, new Set([mockController]));
    expect(registry.get(projectId)!.size).toBe(1);

    // Simulate what route.ts does in ReadableStream.cancel()
    const clients = registry.get(projectId);
    if (clients) {
      clients.delete(mockController);
      if (clients.size === 0) {
        registry.delete(projectId);
      }
    }

    expect(registry.has(projectId)).toBe(false);
  });

  it('supports multiple clients per project', () => {
    const registry = (globalThis as Record<string, unknown>).__sseClients as Map<
      string,
      Set<ReadableStreamDefaultController>
    >;

    const projectId = 'proj-003';
    const ctrl1 = { enqueue: jest.fn() } as unknown as ReadableStreamDefaultController;
    const ctrl2 = { enqueue: jest.fn() } as unknown as ReadableStreamDefaultController;

    registry.set(projectId, new Set([ctrl1, ctrl2]));
    expect(registry.get(projectId)!.size).toBe(2);

    // Remove one — project entry should remain
    registry.get(projectId)!.delete(ctrl1);
    expect(registry.get(projectId)!.size).toBe(1);
    expect(registry.get(projectId)!.has(ctrl2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test B: Activity pub-sub via subscribeToActivity / emitActivity
// ---------------------------------------------------------------------------
describe('Activity pub-sub', () => {
  // We need to isolate the module state between tests
  let subscribeToActivity: typeof import('@/lib/ws-client').subscribeToActivity;
  let emitActivity: typeof import('@/lib/ws-client').emitActivity;

  beforeEach(async () => {
    jest.resetModules();
    // ws-client imports useStore which needs zustand — mock it
    jest.doMock('@/lib/store', () => ({
      useStore: {
        getState: () => ({
          polygons: [],
          classifications: [],
          assemblies: [],
          updatePolygon: jest.fn(),
          deletePolygon: jest.fn(),
          updateClassification: jest.fn(),
          setScale: jest.fn(),
          addAssembly: jest.fn(),
          updateAssembly: jest.fn(),
          deleteAssembly: jest.fn(),
          setPageBaseDimensions: jest.fn(),
          totalPages: 0,
        }),
        setState: jest.fn(),
      },
    }));

    // Re-import to get fresh module with isolated activityListeners
    const wsClient = await import('@/lib/ws-client');
    subscribeToActivity = wsClient.subscribeToActivity;
    emitActivity = wsClient.emitActivity;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscriber receives emitted events', () => {
    const received: Array<{ event: string; data: Record<string, unknown> }> = [];
    subscribeToActivity((event, data) => {
      received.push({ event, data });
    });

    emitActivity('polygon:created', { id: 'p1', label: 'Wall' });
    emitActivity('classification:deleted', { id: 'c1' });

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({
      event: 'polygon:created',
      data: { id: 'p1', label: 'Wall' },
    });
    expect(received[1]).toEqual({
      event: 'classification:deleted',
      data: { id: 'c1' },
    });
  });

  it('unsubscribe stops delivery', () => {
    const received: Array<{ event: string; data: Record<string, unknown> }> = [];
    const unsub = subscribeToActivity((event, data) => {
      received.push({ event, data });
    });

    emitActivity('test:first', { n: 1 });
    unsub();
    emitActivity('test:second', { n: 2 });

    expect(received).toHaveLength(1);
    expect(received[0].event).toBe('test:first');
  });

  it('listener errors do not break other listeners', () => {
    const results: string[] = [];

    subscribeToActivity(() => {
      throw new Error('boom');
    });
    subscribeToActivity((event) => {
      results.push(event);
    });

    emitActivity('safe:event', {});

    expect(results).toEqual(['safe:event']);
  });
});

// ---------------------------------------------------------------------------
// Test C: broadcastToProject dispatches to registered clients
// ---------------------------------------------------------------------------
describe('broadcastToProject', () => {
  let broadcastToProject: typeof import('@/lib/sse-broadcast').broadcastToProject;

  beforeEach(async () => {
    // Reset globals
    (globalThis as Record<string, unknown>).__sseClients = new Map();
    (globalThis as Record<string, unknown>).__projectEventCounters = new Map();
    (globalThis as Record<string, unknown>).__projectEventBuffer = new Map();

    jest.resetModules();

    // The route module reads NextRequest from 'next/server' at import time
    // but broadcastToProject itself doesn't use NextRequest, so a minimal mock suffices
    jest.doMock('next/server', () => ({
      NextRequest: class {},
      NextResponse: class {},
    }));

    const route = await import('@/lib/sse-broadcast');
    broadcastToProject = route.broadcastToProject;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enqueues SSE-formatted data to all registered controllers', () => {
    const projectId = 'proj-broadcast-1';
    const ctrl1 = { enqueue: jest.fn() } as unknown as ReadableStreamDefaultController;
    const ctrl2 = { enqueue: jest.fn() } as unknown as ReadableStreamDefaultController;

    // Pre-register clients in the global registry
    const registry = (globalThis as Record<string, unknown>).__sseClients as Map<
      string,
      Set<ReadableStreamDefaultController>
    >;
    registry.set(projectId, new Set([ctrl1, ctrl2]));

    broadcastToProject(projectId, 'polygon:created', { id: 'p1' });

    // Both controllers should have received exactly one enqueue call
    expect(ctrl1.enqueue).toHaveBeenCalledTimes(1);
    expect(ctrl2.enqueue).toHaveBeenCalledTimes(1);

    // Decode the enqueued message and verify SSE format
    const encoded = (ctrl1.enqueue as jest.Mock).mock.calls[0][0] as Uint8Array;
    const message = new TextDecoder().decode(encoded);
    expect(message).toContain('id: 1');
    expect(message).toContain('"event":"polygon:created"');
    expect(message).toContain('"data":{"id":"p1"}');
  });

  it('increments sequence numbers across broadcasts', () => {
    const projectId = 'proj-broadcast-2';
    const ctrl = { enqueue: jest.fn() } as unknown as ReadableStreamDefaultController;

    const registry = (globalThis as Record<string, unknown>).__sseClients as Map<
      string,
      Set<ReadableStreamDefaultController>
    >;
    registry.set(projectId, new Set([ctrl]));

    broadcastToProject(projectId, 'evt1', {});
    broadcastToProject(projectId, 'evt2', {});

    const msg1 = new TextDecoder().decode((ctrl.enqueue as jest.Mock).mock.calls[0][0] as Uint8Array);
    const msg2 = new TextDecoder().decode((ctrl.enqueue as jest.Mock).mock.calls[1][0] as Uint8Array);

    expect(msg1).toContain('id: 1');
    expect(msg2).toContain('id: 2');
  });

  it('does not throw when no clients are registered', () => {
    expect(() => {
      broadcastToProject('no-such-project', 'test', {});
    }).not.toThrow();
  });

  it('removes disconnected controllers that throw on enqueue', () => {
    const projectId = 'proj-broadcast-3';
    const goodCtrl = { enqueue: jest.fn() } as unknown as ReadableStreamDefaultController;
    const badCtrl = {
      enqueue: jest.fn(() => {
        throw new Error('Controller is closed');
      }),
    } as unknown as ReadableStreamDefaultController;

    const registry = (globalThis as Record<string, unknown>).__sseClients as Map<
      string,
      Set<ReadableStreamDefaultController>
    >;
    registry.set(projectId, new Set([goodCtrl, badCtrl]));

    broadcastToProject(projectId, 'test', { ok: true });

    // Good controller should still be registered, bad one removed
    expect(registry.get(projectId)!.has(goodCtrl)).toBe(true);
    expect(registry.get(projectId)!.has(badCtrl)).toBe(false);
    expect(goodCtrl.enqueue).toHaveBeenCalledTimes(1);
  });

  it('buffers events up to 50 and drops oldest', () => {
    const projectId = 'proj-buffer';
    const ctrl = { enqueue: jest.fn() } as unknown as ReadableStreamDefaultController;

    const registry = (globalThis as Record<string, unknown>).__sseClients as Map<
      string,
      Set<ReadableStreamDefaultController>
    >;
    registry.set(projectId, new Set([ctrl]));

    // Send 55 events
    for (let i = 0; i < 55; i++) {
      broadcastToProject(projectId, `evt-${i}`, { i });
    }

    const buffer = (
      (globalThis as Record<string, unknown>).__projectEventBuffer as Map<
        string,
        Array<{ seq: number; event: string; data: unknown }>
      >
    ).get(projectId)!;

    expect(buffer).toHaveLength(50);
    // First event in buffer should be seq 6 (events 1-5 were dropped)
    expect(buffer[0].seq).toBe(6);
    expect(buffer[49].seq).toBe(55);
  });
});
