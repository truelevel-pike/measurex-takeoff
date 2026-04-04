import type { DetectedElement } from './ai-takeoff';
import type { Classification, Point, ScaleCalibration } from './types';
import { calculatePolygonArea } from './polygon-utils';
import { emitActivity } from './ws-client';

/**
 * Load AI takeoff results into the zustand store synchronously.
 */
export function loadAIResults(
  results: DetectedElement[],
  store: {
    addClassification: (c: { name: string; type: 'area' | 'linear' | 'count'; color: string; visible: boolean }) => string;
    addPolygon: (p: { points: Point[]; classificationId: string; pageNumber: number; area: number; linearFeet: number; label?: string }) => string;
    classifications: Classification[];
    scale: ScaleCalibration | null;
    scales?: Record<number, ScaleCalibration>;
    currentPage: number;
    getState?: () => { classifications: Classification[]; scale: ScaleCalibration | null; scales?: Record<number, ScaleCalibration>; currentPage: number };
  },
  opts?: { zoom?: number; pageNumber?: number }
): { areas: number; lines: number; counts: number } {
  const stats = { areas: 0, lines: 0, counts: 0 };
  if (!results?.length) return stats;

  // BUG-A5-5-047: readState uses store.getState() (zustand's getState) to avoid stale closure.
  // Falls back to direct store properties only if getState is not available.
  const readState = () => store.getState?.() ?? {
    classifications: store.classifications,
    scale: store.scale,
    scales: store.scales,
    currentPage: store.currentPage,
  };

  // Create any missing classifications and collect name->id map.
  const nameToId = new Map<string, string>();
  const seed = new Map(readState().classifications.map((c) => [c.name, c.id] as [string, string]));

  for (const el of results) {
    const name = el.classification || (el.type === 'area' ? 'Areas' : el.type === 'linear' ? 'Linear' : 'Counts');
    if (seed.has(name) && !nameToId.has(name)) {
      nameToId.set(name, seed.get(name)!);
    }
  }

  for (const el of results) {
    const name = el.classification || (el.type === 'area' ? 'Areas' : el.type === 'linear' ? 'Linear' : 'Counts');
    if (nameToId.has(name)) continue;

    const id = store.addClassification({
      name,
      type: el.type,
      color: el.color || '#3b82f6',
      visible: true,
    });

    // Synchronous zustand read after mutation to avoid stale classification lists.
    const fresh = readState().classifications;
    const resolvedId = fresh.find((c) => c.id === id || c.name === name)?.id ?? id;
    nameToId.set(name, resolvedId);

    emitActivity('classification:created', { id: resolvedId, name, type: el.type, color: el.color || '#3b82f6' });
  }

  const state = readState();
  const page = opts?.pageNumber ?? (state.currentPage || 1);
  const r = Math.max(5, Math.round((opts?.zoom ? 6 / opts.zoom : 6))); // count marker radius

  // Areas -> linear -> counts
  const order = { area: 0, linear: 1, count: 2 } as const;
  const sorted = [...results].sort((a, b) => order[a.type] - order[b.type]);

  for (const el of sorted) {
    const clsName = el.classification || (el.type === 'area' ? 'Areas' : el.type === 'linear' ? 'Linear' : 'Counts');
    const clsId = nameToId.get(clsName);
    if (!clsId) continue;

    if (el.type === 'area' && el.points.length >= 3) {
      const pxArea = calculatePolygonArea(el.points);
      const polyId = store.addPolygon({ points: el.points, classificationId: clsId, pageNumber: page, area: pxArea, linearFeet: 0, label: el.name });
      emitActivity('polygon:created', { id: polyId, label: el.name, classificationId: clsId, type: 'area' });
      stats.areas++;
    } else if (el.type === 'linear' && el.points.length >= 2) {
      // BUG-PIKE-017 fix: store linearFeet as raw pixel length (ppu=1), consistent with
      // server API and all other addPolygon call sites. Callers (quantities, assemblies, etc.)
      // apply per-page ppu at read time to convert to real-world units.
      let pixelLen = 0;
      for (let i = 0; i < el.points.length - 1; i++) {
        const a = el.points[i], b = el.points[i + 1];
        pixelLen += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      }
      const polyId = store.addPolygon({ points: el.points, classificationId: clsId, pageNumber: page, area: 0, linearFeet: pixelLen, label: el.name });
      emitActivity('polygon:created', { id: polyId, label: el.name, classificationId: clsId, type: 'linear' });
      stats.lines++;
    } else if (el.type === 'count' && el.points.length >= 1) {
      const p = el.points[0];
      const marker: Point[] = [
        { x: p.x, y: p.y - r },
        { x: p.x + r, y: p.y },
        { x: p.x, y: p.y + r },
        { x: p.x - r, y: p.y },
      ];
      const polyId = store.addPolygon({ points: marker, classificationId: clsId, pageNumber: page, area: 0, linearFeet: 0, label: el.name });
      emitActivity('polygon:created', { id: polyId, label: el.name, classificationId: clsId, type: 'count' });
      stats.counts++;
    }
  }

  return stats;
}
