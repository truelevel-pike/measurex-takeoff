import { useStore } from './store';
import type { Polygon, Classification, ScaleCalibration } from './types';

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentProjectId: string | null = null;

// ---------------------------------------------------------------------------
// Activity event bus — lets components subscribe to SSE-derived events
// without polling or attaching listeners directly to the EventSource.
// ---------------------------------------------------------------------------
type ActivityListener = (event: string, data: Record<string, unknown>) => void;
const activityListeners = new Set<ActivityListener>();

export function subscribeToActivity(fn: ActivityListener): () => void {
  activityListeners.add(fn);
  return () => activityListeners.delete(fn);
}

function emitActivity(event: string, data: Record<string, unknown>) {
  for (const fn of activityListeners) {
    try { fn(event, data); } catch { /* ignore listener errors */ }
  }
}

type SSEEvent =
  | { event: 'connected'; data: { projectId: string } }
  | { event: 'polygon:created'; data: Polygon }
  | { event: 'polygon:updated'; data: Polygon }
  | { event: 'polygon:deleted'; data: { id: string } }
  | { event: 'classification:created'; data: Classification }
  | { event: 'classification:updated'; data: Classification }
  | { event: 'classification:deleted'; data: { id: string } }
  | { event: 'scale:updated'; data: ScaleCalibration }
  | { event: 'ai-takeoff:started'; data: { page: number } }
  | { event: 'ai-takeoff:complete'; data: unknown };

function handleSSEMessage(raw: MessageEvent) {
  let parsed: SSEEvent;
  try {
    parsed = JSON.parse(raw.data) as SSEEvent;
  } catch {
    return;
  }

  const store = useStore.getState();

  switch (parsed.event) {
    case 'connected':
      break;

    case 'polygon:created': {
      const poly = parsed.data;
      // Avoid duplicates — if polygon with this ID already exists, skip
      if (store.polygons.some((p) => p.id === poly.id)) break;
      // Directly set state to preserve the server-assigned ID
      useStore.setState((s) => ({ polygons: [...s.polygons, poly] }));
      emitActivity('polygon:created', parsed.data as unknown as Record<string, unknown>);
      break;
    }

    case 'polygon:updated': {
      const poly = parsed.data;
      store.updatePolygon(poly.id, poly);
      emitActivity('polygon:updated', parsed.data as unknown as Record<string, unknown>);
      break;
    }

    case 'polygon:deleted': {
      const { id } = parsed.data;
      store.deletePolygon(id);
      emitActivity('polygon:deleted', parsed.data as unknown as Record<string, unknown>);
      break;
    }

    case 'classification:created': {
      const cls = parsed.data;
      if (store.classifications.some((c) => c.id === cls.id)) break;
      useStore.setState((s) => ({ classifications: [...s.classifications, cls] }));
      emitActivity('classification:created', parsed.data as unknown as Record<string, unknown>);
      break;
    }

    case 'classification:updated': {
      const cls = parsed.data;
      store.updateClassification(cls.id, cls);
      emitActivity('classification:updated', parsed.data as unknown as Record<string, unknown>);
      break;
    }

    case 'classification:deleted': {
      const { id } = parsed.data;
      useStore.setState((s) => ({
        classifications: s.classifications.filter((c) => c.id !== id),
        // Also remove any polygons that belonged to this classification
        polygons: s.polygons.filter((p) => p.classificationId !== id),
      }));
      emitActivity('classification:deleted', parsed.data as unknown as Record<string, unknown>);
      break;
    }

    case 'scale:updated': {
      store.setScale(parsed.data);
      emitActivity('scale:updated', parsed.data as unknown as Record<string, unknown>);
      break;
    }

    case 'ai-takeoff:started': {
      emitActivity('ai-takeoff:started', parsed.data as unknown as Record<string, unknown>);
      break;
    }

    case 'ai-takeoff:complete': {
      emitActivity('ai-takeoff:complete', parsed.data as unknown as Record<string, unknown>);
      break;
    }
  }
}

/** Connect to SSE stream for a project. Singleton — only one connection at a time. */
export function connectToProject(projectId: string): void {
  // Already connected to this project
  if (currentProjectId === projectId && eventSource?.readyState !== EventSource.CLOSED) {
    return;
  }

  disconnectFromProject();
  currentProjectId = projectId;

  eventSource = new EventSource(`/api/ws?projectId=${encodeURIComponent(projectId)}`);

  eventSource.onmessage = handleSSEMessage;

  eventSource.onerror = () => {
    // Auto-reconnect after 3s
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (currentProjectId) {
      reconnectTimer = setTimeout(() => {
        if (currentProjectId) {
          connectToProject(currentProjectId);
        }
      }, 3000);
    }
  };
}

/** Disconnect from SSE stream */
export function disconnectFromProject(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  currentProjectId = null;
}

/** Get the current EventSource (for components that want to listen directly) */
export function getEventSource(): EventSource | null {
  return eventSource;
}

/** Get the current connected project ID */
export function getConnectedProjectId(): string | null {
  return currentProjectId;
}
