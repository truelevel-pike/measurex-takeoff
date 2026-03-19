import type { Polygon } from '@/lib/types';

export interface SnapPoint {
  x: number;
  y: number;
  type: 'vertex' | 'midpoint' | 'edge' | 'grid';
  polygonId?: string;
}

interface SnapOptions {
  vertices: boolean;
  midpoints: boolean;
  edges: boolean;
  grid: boolean;
  gridSize: number;
}

/**
 * Find nearest snap point to (x, y) within snapRadius pixels.
 * Returns null if nothing within radius.
 */
export function findNearestSnapPoint(
  x: number,
  y: number,
  polygons: Polygon[],
  snapRadius: number,
  options: SnapOptions,
): SnapPoint | null {
  let best: SnapPoint | null = null;
  let bestDist = snapRadius;
  const gridSize = options.gridSize > 0 ? options.gridSize : 20;

  // Check polygon-based snap points (vertices + midpoints)
  if (options.vertices || options.midpoints) {
    const candidates = getPolygonSnapPoints(polygons, {
      vertices: options.vertices,
      midpoints: options.midpoints,
    });
    for (const sp of candidates) {
      const d = Math.hypot(sp.x - x, sp.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = sp;
      }
    }
  }

  // Check edge snapping (nearest point on each edge segment)
  if (options.edges) {
    for (const poly of polygons) {
      const pts = poly.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const proj = projectPointOnSegment(x, y, a.x, a.y, b.x, b.y);
        const d = Math.hypot(proj.x - x, proj.y - y);
        if (d < bestDist) {
          bestDist = d;
          best = { x: proj.x, y: proj.y, type: 'edge', polygonId: poly.id };
        }
      }
    }
  }

  // Check grid snap
  if (options.grid) {
    const gridCandidates = getGridSnapPoints(x, y, gridSize, snapRadius);
    for (const snapped of gridCandidates) {
      const d = Math.hypot(snapped.x - x, snapped.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = { x: snapped.x, y: snapped.y, type: 'grid' };
      }
    }
  }

  return best;
}

/**
 * Snap a point to the nearest grid intersection.
 */
export function snapToGrid(
  x: number,
  y: number,
  gridSize: number,
): { x: number; y: number } {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}

/**
 * Generate nearby grid intersections around the cursor.
 */
function getGridSnapPoints(
  x: number,
  y: number,
  gridSize: number,
  snapRadius: number,
): Array<{ x: number; y: number }> {
  const base = snapToGrid(x, y, gridSize);
  const range = Math.max(1, Math.ceil(snapRadius / gridSize));
  const points: Array<{ x: number; y: number }> = [];

  for (let gx = -range; gx <= range; gx++) {
    for (let gy = -range; gy <= range; gy++) {
      points.push({
        x: base.x + gx * gridSize,
        y: base.y + gy * gridSize,
      });
    }
  }

  return points;
}

/**
 * Get all snap candidates from polygons (vertices + midpoints).
 */
export function getPolygonSnapPoints(
  polygons: Polygon[],
  options: { vertices: boolean; midpoints: boolean },
): SnapPoint[] {
  const result: SnapPoint[] = [];

  for (const poly of polygons) {
    const pts = poly.points;

    if (options.vertices) {
      for (const pt of pts) {
        result.push({ x: pt.x, y: pt.y, type: 'vertex', polygonId: poly.id });
      }
    }

    if (options.midpoints) {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        result.push({
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          type: 'midpoint',
          polygonId: poly.id,
        });
      }
    }
  }

  return result;
}

/**
 * Snap cursor to the nearest polygon vertex within a threshold distance.
 * Returns the snapped position if within threshold, otherwise null.
 */
export function snapToNearestVertex(
  cursor: { x: number; y: number },
  polygons: Polygon[],
  threshold: number = 10,
): SnapPoint | null {
  let best: SnapPoint | null = null;
  let bestDist = threshold;

  for (const poly of polygons) {
    for (const pt of poly.points) {
      const d = Math.hypot(pt.x - cursor.x, pt.y - cursor.y);
      if (d < bestDist) {
        bestDist = d;
        best = { x: pt.x, y: pt.y, type: 'vertex', polygonId: poly.id };
      }
    }
  }

  return best;
}

/**
 * Project point (px, py) onto line segment (ax, ay)-(bx, by).
 * Returns the closest point on the segment.
 */
function projectPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return { x: ax, y: ay };

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return { x: ax + t * dx, y: ay + t * dy };
}
