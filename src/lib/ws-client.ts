import { useStore } from './store';
import type { Polygon, Classification, ScaleCalibration, Assembly } from './types';

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentProjectId: string | null = null;
let reconnectAttempt = 0;
let lastEventId = 0;

// Fallback polling — used when SSE is unavailable or drops
let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------------
// Activity event bus — lets components subscribe to SSE-derived events
// ---------------------------------------------------------------------------
type ActivityListener = (event: string, data: Record<string, unknown>) => void;
const activityListeners = new Set<ActivityListener>();

export function subscribeToActivity(fn: ActivityListener): () => void {
  activityListeners.add(fn);
  return () => activityListeners.delete(fn);
}

export function emitActivity(event: string, data: Record<string, unknown>) {
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
  | { event: 'assembly:created'; data: Assembly }
  | { event: 'assembly:updated'; data: Assembly }
  | { event: 'assembly:deleted'; data: { id: string } }
  | { event: 'ai-takeoff:started'; data: { page: number } }
  | { event: 'ai-takeoff:complete'; data: unknown };

function handleSSEMessage(raw: MessageEvent) {
  let parsed: SSEEvent;
  try {
    parsed = JSON.parse(raw.data) as SSEEvent;
  } catch {
    return;
  }

  if (raw.lastEventId) {
    const parsed = Number(raw.lastEventId);
    if (Number.isFinite(parsed) && parsed > 0) {
      lastEventId = parsed;
    }
  }

  const store = useStore.getState();

  switch (parsed.event) {
    case 'connected':
      reconnectAttempt = 0;
      break;
    case 'polygon:created': {
      const poly = parsed.data;
      if (store.polygons.some((p) => p.id === poly.id)) break;
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
    case 'assembly:created': {
      const assembly = parsed.data;
      const { assemblies, addAssembly } = useStore.getState();
      if (!assemblies.some((a) => a.id === assembly.id)) {
        addAssembly(assembly);
      }
      emitActivity('assembly:created', parsed.data as unknown as Record<string, unknown>);
      break;
    }
    case 'assembly:updated': {
      const assembly = parsed.data;
      useStore.getState().updateAssembly(assembly.id, assembly);
      emitActivity('assembly:updated', parsed.data as unknown as Record<string, unknown>);
      break;
    }
    case 'assembly:deleted': {
      const { id } = parsed.data;
      useStore.getState().deleteAssembly(id);
      emitActivity('assembly:deleted', parsed.data as unknown as Record<string, unknown>);
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
  if (currentProjectId === projectId && eventSource?.readyState !== EventSource.CLOSED) {
    return;
  }

  const isProjectSwitch = currentProjectId !== null && currentProjectId !== projectId;
  disconnectFromProject(isProjectSwitch);
  currentProjectId = projectId;

  const url = lastEventId > 0
    ? `/api/ws?projectId=${encodeURIComponent(projectId)}&lastEventId=${lastEventId}`
    : `/api/ws?projectId=${encodeURIComponent(projectId)}`;

  eventSource = new EventSource(url);

  eventSource.onmessage = handleSSEMessage;

  eventSource.onerror = () => {
    // Auto-reconnect with exponential backoff + jitter
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (currentProjectId) {
      const base = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
      // Add up to ±25% jitter to spread out reconnection storms
      const jitter = base * 0.25 * (Math.random() * 2 - 1);
      const delay = Math.max(500, base + jitter);
      reconnectAttempt++;

      // Start fallback polling while waiting to reconnect
      startFallbackPolling(currentProjectId);

      reconnectTimer = setTimeout(() => {
        stopFallbackPolling();
        if (currentProjectId) {
          connectToProject(currentProjectId);
        }
      }, delay);
    }
  };
}

// ---------------------------------------------------------------------------
// Fallback polling — fires GET /api/projects/{id} every 3 s when SSE drops
// and merges remote state into the store for assemblies, polygons, classifications
// ---------------------------------------------------------------------------
function startFallbackPolling(projectId: string): void {
  if (pollTimer !== null) return; // already running
  pollTimer = setInterval(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const state = data?.project?.state;
      if (!state) return;

      const store = useStore.getState();

      // Merge assemblies
      if (Array.isArray(state.assemblies)) {
        const remoteAssemblies: Assembly[] = state.assemblies;
        const localIds = new Set(store.assemblies.map((a) => a.id));
        for (const a of remoteAssemblies) {
          if (!localIds.has(a.id)) {
            store.addAssembly(a);
          } else {
            store.updateAssembly(a.id, a);
          }
        }
      }

      // Merge polygons
      if (Array.isArray(state.polygons)) {
        for (const p of state.polygons as Polygon[]) {
          if (!store.polygons.some((lp) => lp.id === p.id)) {
            useStore.setState((s) => ({ polygons: [...s.polygons, p] }));
          }
        }
      }

      // Merge classifications
      if (Array.isArray(state.classifications)) {
        for (const c of state.classifications as Classification[]) {
          if (!store.classifications.some((lc) => lc.id === c.id)) {
            useStore.setState((s) => ({ classifications: [...s.classifications, c] }));
          }
        }
      }
    } catch {
      // Non-fatal — polling will retry on next tick
    }
  }, POLL_INTERVAL_MS);
}

function stopFallbackPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Disconnect from SSE stream */
export function disconnectFromProject(resetLastEventId = true): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  stopFallbackPolling();
  currentProjectId = null;
  if (resetLastEventId) {
    lastEventId = 0;
  }
}

/** Get the current EventSource (for components that want to listen directly) */
export function getEventSource(): EventSource | null {
  return eventSource;
}

/** Get the current connected project ID */
export function getConnectedProjectId(): string | null {
  return currentProjectId;
}

/** Get the last received SSE event ID */
export function getLastEventId(): number {
  return lastEventId;
}
