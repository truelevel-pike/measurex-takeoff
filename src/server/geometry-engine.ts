/**
 * Server-side geometry engine for MeasureX.
 * Authoritative calculations — same math the agent and export use.
 */

import type { Classification, Polygon } from '@/lib/types';
import type { MeasurementSettings } from '@/lib/measurement-settings';
import { formatArea, formatLinear, formatCount } from '@/lib/measurement-settings';

// ── Types ──────────────────────────────────────────────────────────────

export interface ScaleConfig {
  pixelsPerFoot: number | null;
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
): number | null {
  if (!points || points.length < 3) return 0;
  if (!scale.pixelsPerFoot) return null;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  const pixelArea = Math.abs(sum) / 2;
  const rawArea = pixelArea / (scale.pixelsPerFoot * scale.pixelsPerFoot);
  // pixelsPerFoot is already in the correct unit (pixels per foot for imperial, pixels per meter for metric).
  // For metric, convert m² to ft² (1 m² = 10.7639 ft²). Imperial is already in ft².
  return scale.unit === 'metric' ? rawArea * 3.28084 * 3.28084 : rawArea;
}

/**
 * Sum of segment lengths in pixels, converted to project units via scale.
 */
export function calculateLinearLength(
  points: { x: number; y: number }[],
  scale: ScaleConfig,
  closed = true,
): number | null {
  if (!points || points.length < 2) return 0;
  if (!scale.pixelsPerFoot) return null;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    total += Math.hypot(dx, dy);
  }
  if (closed && points.length >= 3) {
    const first = points[0];
    const last = points[points.length - 1];
    total += Math.hypot(first.x - last.x, first.y - last.y);
  }
  const rawLength = total / scale.pixelsPerFoot;
  // For metric, convert meters to feet (1 m = 3.28084 ft). Imperial is already in ft.
  return scale.unit === 'metric' ? rawLength * 3.28084 : rawLength;
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

// ── Bounding Box Helpers ──────────────────────────────────────────────

interface BBox {
  minX: number; minY: number; maxX: number; maxY: number;
}

function getBBox(points: { x: number; y: number }[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function bboxOverlaps(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Compute the width of a bounding box projected onto the dominant axis
 * of a linear polygon's longest segment. This gives the "opening width"
 * that a door/window subtracts from a wall run.
 */
function computeOpeningWidth(
  openingBBox: BBox,
  linearPoints: { x: number; y: number }[],
  scale: ScaleConfig,
): number {
  if (!scale.pixelsPerFoot) return 0;

  // Find the linear segment closest to the opening centroid
  const cx = (openingBBox.minX + openingBBox.maxX) / 2;
  const cy = (openingBBox.minY + openingBBox.maxY) / 2;

  let bestDist = Infinity;
  let bestDx = 1;
  let bestDy = 0;
  const segCount = linearPoints.length >= 3 ? linearPoints.length : linearPoints.length - 1;

  for (let i = 0; i < segCount; i++) {
    const a = linearPoints[i];
    const b = linearPoints[(i + 1) % linearPoints.length];
    // Distance from centroid to segment midpoint
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dist = Math.hypot(cx - mx, cy - my);
    if (dist < bestDist) {
      bestDist = dist;
      bestDx = b.x - a.x;
      bestDy = b.y - a.y;
    }
  }

  // Project the opening bbox onto the wall direction
  const len = Math.hypot(bestDx, bestDy) || 1;
  const ux = bestDx / len;
  const uy = bestDy / len;

  // Project all 4 corners of the bbox onto this axis
  const corners = [
    { x: openingBBox.minX, y: openingBBox.minY },
    { x: openingBBox.maxX, y: openingBBox.minY },
    { x: openingBBox.maxX, y: openingBBox.maxY },
    { x: openingBBox.minX, y: openingBBox.maxY },
  ];
  let projMin = Infinity;
  let projMax = -Infinity;
  for (const c of corners) {
    const proj = c.x * ux + c.y * uy;
    if (proj < projMin) projMin = proj;
    if (proj > projMax) projMax = proj;
  }

  const pixelWidth = projMax - projMin;
  const rawWidth = pixelWidth / scale.pixelsPerFoot;
  return scale.unit === 'imperial' ? rawWidth * 3.28084 : rawWidth;
}

// ── Auto-Deductions (door/window backout) ─────────────────────────────

export interface AutoDeduction {
  linearClassificationId: string;
  openingPolygonId: string;
  openingClassificationName: string;
  deductionValue: number; // in real units (LF)
}

const OPENING_PATTERN = /\b(door|window|opening|d\/w)\b/i;

/**
 * Compute automatic deductions: for each "count" polygon classified as a
 * door/window, find overlapping "linear" polygons and subtract the opening width.
 */
export function computeDeductions(
  polygons: Polygon[],
  classifications: Classification[],
  scale: ScaleConfig,
): AutoDeduction[] {
  if (!scale.pixelsPerFoot) return [];

  const classMap = new Map<string, Classification>();
  for (const c of classifications) classMap.set(c.id, c);

  // Collect opening polygons (count type, door/window name)
  const openings: { polygon: Polygon; cls: Classification; bbox: BBox }[] = [];
  // Collect linear polygons
  const linears: { polygon: Polygon; cls: Classification; bbox: BBox }[] = [];

  for (const poly of polygons) {
    const cls = classMap.get(poly.classificationId);
    if (!cls) continue;
    if (cls.type === 'count' && OPENING_PATTERN.test(cls.name)) {
      openings.push({ polygon: poly, cls, bbox: getBBox(poly.points) });
    } else if (cls.type === 'linear') {
      linears.push({ polygon: poly, cls, bbox: getBBox(poly.points) });
    }
  }

  const deductions: AutoDeduction[] = [];

  for (const opening of openings) {
    for (const linear of linears) {
      // Only check polygons on the same page
      if (opening.polygon.pageNumber !== linear.polygon.pageNumber) continue;
      if (!bboxOverlaps(opening.bbox, linear.bbox)) continue;

      const width = computeOpeningWidth(opening.bbox, linear.polygon.points, scale);
      if (width > 0.01) {
        deductions.push({
          linearClassificationId: linear.cls.id,
          openingPolygonId: opening.polygon.id,
          openingClassificationName: opening.cls.name,
          deductionValue: width,
        });
      }
    }
  }

  return deductions;
}

/**
 * Aggregate auto-deductions by linear classification ID.
 * Returns Map<classificationId, { total: number, items: AutoDeduction[] }>
 */
export function aggregateDeductions(
  deductions: AutoDeduction[],
): Map<string, { total: number; items: AutoDeduction[] }> {
  const result = new Map<string, { total: number; items: AutoDeduction[] }>();
  for (const d of deductions) {
    let entry = result.get(d.linearClassificationId);
    if (!entry) {
      entry = { total: 0, items: [] };
      result.set(d.linearClassificationId, entry);
    }
    entry.total += d.deductionValue;
    entry.items.push(d);
  }
  return result;
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
        row.totalArea += calculatePolygonArea(poly.points, scale) ?? 0;
        break;
      case 'linear':
        row.totalLinear += calculateLinearLength(poly.points, scale, true) ?? 0;
        break;
      case 'count':
        row.totalCount += 1;
        break;
    }
  }

  return Array.from(rows.values());
}

// ── Formatting with Measurement Settings ─────────────────────────────

/**
 * Format a quantity row's primary value using measurement settings.
 */
export function formatQuantityValue(
  row: QuantityRow,
  settings: MeasurementSettings,
): string {
  switch (row.type) {
    case 'area':
      return formatArea(row.totalArea, settings);
    case 'linear':
      return formatLinear(row.totalLinear, settings);
    case 'count':
      return formatCount(row.totalCount);
  }
}
