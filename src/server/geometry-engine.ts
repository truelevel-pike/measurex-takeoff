/**
 * Server-side geometry engine for MeasureX.
 * Authoritative calculations — same math the agent and export use.
 */

import type { Classification, Polygon } from '@/lib/types';

// ── Types ──────────────────────────────────────────────────────────────

export interface ScaleConfig {
  pixelsPerFoot: number;
  pixelsPerMeter?: number;
  unit: 'imperial' | 'metric';
}

export interface QuantityRow {
  classificationId: string;
  classificationName: string;
  type: Classification['type'];
  color: string;
  polygonCount: number;
  totalArea: number;       // sq ft (area type)
  totalLinear: number;     // linear ft (linear type)
  totalCount: number;      // count (count type)
}

// ── Core Geometry ──────────────────────────────────────────────────────

/**
 * Shoelace formula for polygon area in pixel², then convert to project units via scale.
 */
export function calculatePolygonArea(
  points: { x: number; y: number }[],
  scale: ScaleConfig,
): number {
  if (!points || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  const pixelArea = Math.abs(sum) / 2;
  const pixelsPerUnit =
    scale.unit === 'metric'
      ? (scale.pixelsPerMeter || (scale.pixelsPerFoot ? scale.pixelsPerFoot * 3.28084 : 1))
      : (scale.pixelsPerFoot || 1);
  return pixelArea / (pixelsPerUnit * pixelsPerUnit);
}

/**
 * Sum of segment lengths in pixels, converted to project units via scale.
 */
export function calculateLinearLength(
  points: { x: number; y: number }[],
  scale: ScaleConfig,
  closed = false,
): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    total += Math.hypot(dx, dy);
  }
  if (closed) {
    const first = points[0];
    const last = points[points.length - 1];
    const dx = first.x - last.x;
    const dy = first.y - last.y;
    total += Math.hypot(dx, dy);
  }
  const pixelsPerUnit =
    scale.unit === 'metric'
      ? (scale.pixelsPerMeter || (scale.pixelsPerFoot ? scale.pixelsPerFoot * 3.28084 : 1))
      : (scale.pixelsPerFoot || 1);
  return total / pixelsPerUnit;
}

/**
 * Ray-casting point-in-polygon test.
 */
export function pointInPolygon(
  point: { x: number; y: number },
  polygon: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-10) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Centroid of a polygon (average of vertices, weighted by signed area segments).
 */
export function getPolygonCentroid(
  points: { x: number; y: number }[],
): { x: number; y: number } {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length < 3) {
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sy = points.reduce((s, p) => s + p.y, 0);
    return { x: sx / points.length, y: sy / points.length };
  }

  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) {
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sy = points.reduce((s, p) => s + p.y, 0);
    return { x: sx / points.length, y: sy / points.length };
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return { x: cx, y: cy };
}

// ── Quantity Aggregation ───────────────────────────────────────────────

/**
 * Compute grouped quantities by classification.
 */
export function computeQuantities(
  polygons: Polygon[],
  classifications: Classification[],
  scale: ScaleConfig,
): QuantityRow[] {
  const classMap = new Map<string, Classification>();
  for (const c of classifications) classMap.set(c.id, c);

  const rows = new Map<string, QuantityRow>();

  for (const poly of polygons) {
    const cls = classMap.get(poly.classificationId);
    if (!cls) continue;

    let row = rows.get(cls.id);
    if (!row) {
      row = {
        classificationId: cls.id,
        classificationName: cls.name,
        type: cls.type,
        color: cls.color,
        polygonCount: 0,
        totalArea: 0,
        totalLinear: 0,
        totalCount: 0,
      };
      rows.set(cls.id, row);
    }

    row.polygonCount += 1;

    switch (cls.type) {
      case 'area':
        row.totalArea += calculatePolygonArea(poly.points, scale);
        break;
      case 'linear':
        row.totalLinear += calculateLinearLength(poly.points, scale, true);
        break;
      case 'count':
        row.totalCount += 1;
        break;
    }
  }

  return Array.from(rows.values());
}
