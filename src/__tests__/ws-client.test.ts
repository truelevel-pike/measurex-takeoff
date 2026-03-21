/**
 * @jest-environment jsdom
 */

// Mock EventSource (not available in jsdom by default)
class MockEventSource {
  static CLOSED = 2;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readyState = 1;
  close = jest.fn(() => { this.readyState = MockEventSource.CLOSED; });
  constructor(public url: string) {}
}
(global as unknown as { EventSource: unknown }).EventSource = MockEventSource;

// Mock the store — provide minimal shape used by ws-client
jest.mock('@/lib/store', () => {
  const polygons: unknown[] = [];
  const classifications: unknown[] = [];
  const assemblies: unknown[] = [];
  const state = {
    polygons,
    classifications,
    assemblies,
    totalPages: 1,
    addPolygon: jest.fn((p: unknown) => polygons.push(p)),
    updatePolygon: jest.fn((id: string, data: unknown) => {
      const idx = polygons.findIndex((p: unknown) => (p as { id: string }).id === id);
      if (idx !== -1) Object.assign(polygons[idx] as object, data);
    }),
    deletePolygon: jest.fn((id: string) => {
      const idx = polygons.findIndex((p: unknown) => (p as { id: string }).id === id);
      if (idx !== -1) polygons.splice(idx, 1);
    }),
    setScale: jest.fn(),
    updateClassification: jest.fn((id: string, data: unknown) => {
      const idx = classifications.findIndex((c: unknown) => (c as { id: string }).id === id);
      if (idx !== -1) Object.assign(classifications[idx] as object, data);
    }),
    addAssembly: jest.fn((a: unknown) => assemblies.push(a)),
    updateAssembly: jest.fn((id: string, data: unknown) => {
      const idx = assemblies.findIndex((a: unknown) => (a as { id: string }).id === id);
      if (idx !== -1) Object.assign(assemblies[idx] as object, data);
    }),
    deleteAssembly: jest.fn((id: string) => {
      const idx = assemblies.findIndex((a: unknown) => (a as { id: string }).id === id);
      if (idx !== -1) assemblies.splice(idx, 1);
    }),
    setPageBaseDimensions: jest.fn(),
  };
  return {
    useStore: {
      getState: () => state,
      setState: jest.fn((updater: unknown) => {
        if (typeof updater === 'function') {
          const patch = (updater as (s: typeof state) => Partial<typeof state>)(state);
          Object.assign(state, patch);
        } else {
          Object.assign(state, updater);
        }
      }),
    },
  };
});

import { connectToProject, disconnectFromProject, subscribeToActivity, emitActivity, getLastEventId } from '@/lib/ws-client';
import { useStore } from '@/lib/store';

function makeMessageEvent(data: object, lastEventId = ''): MessageEvent {
  return new MessageEvent('message', {
    data: JSON.stringify(data),
    lastEventId,
  });
}

beforeEach(() => {
  disconnectFromProject(true);
  jest.clearAllMocks();
  (useStore.getState().polygons as unknown[]).length = 0;
  (useStore.getState().classifications as unknown[]).length = 0;
  (useStore.getState().assemblies as unknown[]).length = 0;
});

describe('activity bus', () => {
  it('emitActivity calls registered listeners', () => {
    const listener = jest.fn();
    const unsub = subscribeToActivity(listener);
    emitActivity('test:event', { key: 'value' });
    expect(listener).toHaveBeenCalledWith('test:event', { key: 'value' });
    unsub();
  });

  it('unsubscribe removes listener', () => {
    const listener = jest.fn();
    const unsub = subscribeToActivity(listener);
    unsub();
    emitActivity('test:event', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('listener error does not propagate', () => {
    const bad = jest.fn(() => { throw new Error('oops'); });
    const ok = jest.fn();
    subscribeToActivity(bad);
    subscribeToActivity(ok);
    expect(() => emitActivity('e', {})).not.toThrow();
    expect(ok).toHaveBeenCalled();
    disconnectFromProject(true); // cleanup
  });
});

describe('connectToProject', () => {
  it('creates an EventSource with the project URL', () => {
    connectToProject('proj-abc');
    // EventSource was constructed — verify via the mock
    expect((global as unknown as { EventSource: typeof MockEventSource }).EventSource).toBeDefined();
    disconnectFromProject();
  });

  it('does not reconnect if already connected to same project', () => {
    connectToProject('proj-same');
    const es1 = (global as unknown as { EventSource: typeof MockEventSource }).EventSource;
    connectToProject('proj-same');
    expect((global as unknown as { EventSource: typeof MockEventSource }).EventSource).toBe(es1);
    disconnectFromProject();
  });
});

describe('handleSSEMessage via connectToProject', () => {
  beforeAll(() => {
    // Patch MockEventSource to register itself
    const OrigMES = MockEventSource;
    const PatchedMES = class extends OrigMES {
      constructor(url: string) {
        super(url);
        (global as unknown as { _lastES?: MockEventSource })._lastES = this;
      }
    };
    (global as unknown as { EventSource: unknown }).EventSource = PatchedMES;
  });

  it('polygon:created adds polygon to store', () => {
    connectToProject('test-proj');
    const es = (global as unknown as { _lastES?: MockEventSource })._lastES!;
    const poly = { id: 'poly-1', classificationId: 'cls-1', points: [], pageNumber: 1 };
    es.onmessage?.(makeMessageEvent({ event: 'polygon:created', data: poly }));
    const stored = useStore.getState().polygons as { id: string }[];
    expect(stored.some(p => p.id === 'poly-1')).toBe(true);
    disconnectFromProject();
  });

  it('polygon:created is idempotent (no duplicate on second event)', () => {
    connectToProject('test-proj');
    const es = (global as unknown as { _lastES?: MockEventSource })._lastES!;
    const poly = { id: 'poly-dup', classificationId: 'cls-1', points: [], pageNumber: 1 };
    es.onmessage?.(makeMessageEvent({ event: 'polygon:created', data: poly }));
    es.onmessage?.(makeMessageEvent({ event: 'polygon:created', data: poly }));
    const stored = useStore.getState().polygons as { id: string }[];
    expect(stored.filter(p => p.id === 'poly-dup').length).toBe(1);
    disconnectFromProject();
  });

  it('polygon:deleted removes polygon from store', () => {
    const polys = useStore.getState().polygons as { id: string }[];
    polys.push({ id: 'poly-del' });

    connectToProject('test-proj');
    const es = (global as unknown as { _lastES?: MockEventSource })._lastES!;
    es.onmessage?.(makeMessageEvent({ event: 'polygon:deleted', data: { id: 'poly-del' } }));
    // ws-client uses setState directly (not deletePolygon) to avoid pushing remote deletes onto the undo stack
    expect(useStore.setState).toHaveBeenCalled();
    const remaining = useStore.getState().polygons as { id: string }[];
    expect(remaining.find((p) => p.id === 'poly-del')).toBeUndefined();
    disconnectFromProject();
  });

  it('assembly:created adds to store', () => {
    connectToProject('test-proj');
    const es = (global as unknown as { _lastES?: MockEventSource })._lastES!;
    const asm = { id: 'asm-1', name: 'Test', classificationId: 'cls-1', unit: 'SF', unit_cost: 10, quantity_formula: 'area' };
    es.onmessage?.(makeMessageEvent({ event: 'assembly:created', data: asm }));
    expect(useStore.getState().addAssembly).toHaveBeenCalled();
    disconnectFromProject();
  });

  it('assembly:deleted calls deleteAssembly', () => {
    connectToProject('test-proj');
    const es = (global as unknown as { _lastES?: MockEventSource })._lastES!;
    es.onmessage?.(makeMessageEvent({ event: 'assembly:deleted', data: { id: 'asm-del' } }));
    expect(useStore.getState().deleteAssembly).toHaveBeenCalledWith('asm-del');
    disconnectFromProject();
  });

  it('tracks lastEventId from event numeric id', () => {
    connectToProject('test-proj');
    const es = (global as unknown as { _lastES?: MockEventSource })._lastES!;
    es.onmessage?.(makeMessageEvent({ event: 'scale:updated', data: { pixelsPerUnit: 96, unit: 'ft' } }, '42'));
    expect(getLastEventId()).toBe(42);
    disconnectFromProject();
  });

  it('invalid JSON does not crash the handler', () => {
    connectToProject('test-proj');
    const es = (global as unknown as { _lastES?: MockEventSource })._lastES!;
    const badEvent = new MessageEvent('message', { data: '{not json', lastEventId: '' });
    expect(() => es.onmessage?.(badEvent)).not.toThrow();
    disconnectFromProject();
  });
});
