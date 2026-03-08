import type { DetectedElement } from './ai-takeoff';
import type { Classification, Point, ScaleCalibration } from './types';
import { calculatePolygonArea, calculateLinearFeet } from './polygon-utils';

/**
 * Load AI takeoff results into the zustand store synchronously (no timeouts).
 */
export function loadAIResults(
  results: DetectedElement[],
  store: {
    addClassification: (c: { name: string; type: 'area' | 'linear' | 'count'; color: string; visible: boolean }) => string;
    addPolygon: (p: { points: Point[]; classificationId: string; pageNumber: number; area: number; linearFeet: number; label?: string }) => string;
    classifications: Classification[];
    scale: ScaleCalibration | null;
    currentPage: number;
  },
  opts?: { zoom?: number }
): { areas: number; lines: number; counts: number } {
  const stats = { areas: 0, lines: 0, counts: 0 };
  if (!results?.length) return stats;

  // Create any missing classifications and collect name→id map
  const nameToId = new Map<string, string>();
  const existing = new Map(store.classifications.map(c => [c.name, c.id] as [string, string]));
  for (const el of results) {
    const name = el.classification || (el.type === 'area' ? 'Areas' : el.type === 'linear' ? 'Linear' : 'Counts');
    if (existing.has(name) && !nameToId.has(name)) nameToId.set(name, existing.get(name)!);
  }
  for (const el of results) {
    const name = el.classification || (el.type === 'area' ? 'Areas' : el.type === 'linear' ? 'Linear' : 'Counts');
    if (!nameToId.has(name)) {
      const id = store.addClassification({ name, type: el.type, color: el.color || '#3b82f6', visible: true });
      nameToId.set(name, id);
    }
  }

  const ppu = store.scale?.pixelsPerUnit ?? 1;
  const page = store.currentPage || 1;
  const r = Math.max(5, Math.round((opts?.zoom ? 6 / opts.zoom : 6))); // count marker radius

  // Areas → then linear → then counts
  const order = { area: 0, linear: 1, count: 2 } as const;
  const sorted = [...results].sort((a, b) => order[a.type] - order[b.type]);

  for (const el of sorted) {
    const clsName = el.classification || (el.type === 'area' ? 'Areas' : el.type === 'linear' ? 'Linear' : 'Counts');
    const clsId = nameToId.get(clsName);
    if (!clsId) continue;

    if (el.type === 'area' && el.points.length >= 3) {
      const pxArea = calculatePolygonArea(el.points);
      store.addPolygon({ points: el.points, classificationId: clsId, pageNumber: page, area: pxArea, linearFeet: 0, label: el.name });
      stats.areas++;
    } else if (el.type === 'linear' && el.points.length >= 2) {
      const lf = calculateLinearFeet(el.points, ppu, false);
      store.addPolygon({ points: el.points, classificationId: clsId, pageNumber: page, area: 0, linearFeet: lf, label: el.name });
      stats.lines++;
    } else if (el.type === 'count' && el.points.length >= 1) {
      const p = el.points[0];
      const marker: Point[] = [
        { x: p.x, y: p.y - r },
        { x: p.x + r, y: p.y },
        { x: p.x, y: p.y + r },
        { x: p.x - r, y: p.y },
      ];
      store.addPolygon({ points: marker, classificationId: clsId, pageNumber: page, area: 0, linearFeet: 0, label: el.name });
      stats.counts++;
    }
  }

  return stats;
}
