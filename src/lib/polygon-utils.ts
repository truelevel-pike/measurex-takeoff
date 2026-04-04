/**
 * @turf/turf usage in this file:
 *
 * Functions actually used from the @turf/turf bundle:
 *   - turf.polygon()          — Create GeoJSON Polygon features from coordinate rings
 *   - turf.featureCollection() — Wrap features into a GeoJSON FeatureCollection
 *   - turf.union()            — Merge/union two polygons (used in mergePolygons)
 *   - turf.lineString()       — Create GeoJSON LineString feature (used in splitPolygonByLine)
 *   - turf.buffer()           — Buffer a geometry by distance (used in splitPolygonByLine)
 *   - turf.difference()       — Compute polygon difference (used in splitPolygonByLine)
 *
 * If bundle size becomes a concern, replace `@turf/turf` with individual packages:
 *   @turf/helpers (polygon, featureCollection, lineString)
 *   @turf/union
 *   @turf/buffer
 *   @turf/difference
 */
import * as turf from '@turf/turf';
import type { Point } from './types';

// Shoelace formula: returns area (square pixels) of polygon
export function calculatePolygonArea(points: Point[]): number {
  if (!points || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// Perimeter (linear units) — set closed=false for line segments
// BUG-A7-4-006: guard negative ppu with Math.abs
export function calculateLinearFeet(points: Point[], pixelsPerUnit = 1, closed = true): number {
  if (!points || points.length < 2) return 0;
  const ppu = Math.abs(pixelsPerUnit) || 1;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += distance(points[i], points[i + 1]) / ppu;
  }
  if (closed && points.length > 2) {
    total += distance(points[points.length - 1], points[0]) / ppu;
  }
  return total;
}

// BUG-A7-4-061: removed dead denominator guard; added horizontal edge skip
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (yi === yj) continue; // skip horizontal edges
    const intersect = (yi > p.y) !== (yj > p.y) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Detect whether a polygon self-intersects (any two non-adjacent edges cross).
 * Uses the 2D line-segment intersection test.
 * Returns true if any edge pair intersects (invalid polygon).
 *
 * BUG-W12-003: self-intersecting polygons produce incorrect shoelace areas.
 * Callers should treat such polygons as invalid and show a warning.
 */
export function detectSelfIntersection(points: Point[]): boolean {
  if (!points || points.length < 4) return false;
  const n = points.length;

  function ccw(a: Point, b: Point, c: Point): boolean {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  }

  function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
    return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  }

  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges (share a vertex)
      if (i === 0 && j === n - 1) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

// Merge polygons using turf v7 union(FeatureCollection)
export function mergePolygons(poly1: Point[], poly2: Point[]): Point[] {
  // BUG-A5-5-040: validate polygon lengths before calling turf
  if (!poly1 || poly1.length < 3 || !poly2 || poly2.length < 3) {
    return [...(poly1 || []), ...(poly2 || [])];
  }
  try {
    const ring1: [number, number][] = poly1.map(p => [p.x, p.y]);
    const ring2: [number, number][] = poly2.map(p => [p.x, p.y]);
    // close rings
    ring1.push([poly1[0].x, poly1[0].y]);
    ring2.push([poly2[0].x, poly2[0].y]);
    const f1 = turf.polygon([ring1]);
    const f2 = turf.polygon([ring2]);
    const fc = turf.featureCollection([f1, f2]);
    const united = turf.union(fc);
    if (!united) return [...poly1, ...poly2];
    if (united.geometry.type === 'Polygon') {
      const coords = united.geometry.coordinates[0];
      return coords.slice(0, -1).map((c) => ({ x: c[0], y: c[1] }));
    }
    // MultiPolygon: choose largest area
    let best: Point[] = [];
    let bestArea = -1;
    for (const rings of (united.geometry as GeoJSON.MultiPolygon).coordinates) {
      const ring = rings[0];
      const pts = ring.slice(0, -1).map((c) => ({ x: c[0], y: c[1] }));
      const a = calculatePolygonArea(pts);
      if (a > bestArea) { bestArea = a; best = pts; }
    }
    return best.length ? best : [...poly1, ...poly2];
  } catch {
    return [...poly1, ...poly2];
  }
}

// Split polygon by a line: buffer the line slightly then difference.
//
// IMPORTANT: Turf operates in WGS-84 geographic space. Polygon points live in
// base PDF coordinate space (pixel units). Passing raw pixel values (e.g. x=1400)
// as if they were lon/lat coordinates produces nonsensical buffering and always
// returns null/degenerate results (BUG-A7-010).
//
// Fix: normalise all coordinates to a [0, 1] unit square before calling Turf
// (dividing by the polygon's own bounding-box extent), use a dimensionless buffer
// distance relative to that unit square, then map the result back to pixel space.
export function splitPolygonByLine(polygon: Point[], lineStart: Point, lineEnd: Point): [Point[], Point[]] {
  try {
    // BUG-A7-4-005: compute bounding box with explicit loop to avoid RangeError on large polygons
    let minX = polygon[0].x, maxX = polygon[0].x;
    let minY = polygon[0].y, maxY = polygon[0].y;
    for (const pt of polygon) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const norm = (p: Point): [number, number] => [(p.x - minX) / rangeX, (p.y - minY) / rangeY];
    const denorm = (c: number[]): Point => ({ x: c[0] * rangeX + minX, y: c[1] * rangeY + minY });

    const ring: [number, number][] = polygon.map(norm);
    ring.push(ring[0]); // close
    const poly = turf.polygon([ring]);
    const line = turf.lineString([norm(lineStart), norm(lineEnd)]);
    // Buffer is now in the [0,1] normalised space — 0.001 units is ~0.1% of the
    // polygon extent, appropriate for splitting without eating significant area.
    const buffered = turf.buffer(line, 0.001, { units: 'degrees' });
    if (!buffered) return [polygon, []];
    const fc = turf.featureCollection([poly, buffered]);
    const diff = turf.difference(fc as GeoJSON.FeatureCollection<GeoJSON.Polygon>);
    if (!diff) return [polygon, []];
    if (diff.geometry.type === 'Polygon') {
      const coords = diff.geometry.coordinates[0];
      const a = coords.slice(0, -1).map(denorm);
      return [a, []];
    }
    // MultiPolygon → return two largest pieces
    const multiCoords = (diff.geometry as GeoJSON.MultiPolygon).coordinates;
    const parts: Point[][] = multiCoords.map((rings) => {
      const r = rings[0];
      return r.slice(0, -1).map(denorm);
    });
    parts.sort((a, b) => calculatePolygonArea(b) - calculatePolygonArea(a));
    return [parts[0] || [], parts[1] || []];
  } catch {
    return [polygon, []];
  }
}

// ── P2-09: Polygon transformations ──────────────────────────────────────────

/** Flip polygon horizontally around its centroid. */
export function flipPolygonH(points: Point[]): Point[] {
  if (points.length === 0) return [];
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  return points.map(p => ({ x: 2 * cx - p.x, y: p.y }));
}

/** Flip polygon vertically around its centroid. */
export function flipPolygonV(points: Point[]): Point[] {
  if (points.length === 0) return [];
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.map(p => ({ x: p.x, y: 2 * cy - p.y }));
}

/** Rotate polygon around its centroid by angleDeg degrees (positive = clockwise). */
export function rotatePolygon(points: Point[], angleDeg: number): Point[] {
  if (points.length === 0) return [];
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map(p => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  }));
}

/**
 * Union N polygons into one using turf.union iteratively.
 * Falls back to the first polygon if union fails.
 */
export function combinePolygons(polys: Point[][]): Point[] {
  if (polys.length === 0) return [];
  if (polys.length === 1) return polys[0];

  const toRing = (pts: Point[]): [number, number][] => {
    const ring: [number, number][] = pts.map(p => [p.x, p.y]);
    // Close the ring
    if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
      ring.push([ring[0][0], ring[0][1]]);
    }
    return ring;
  };

  try {
    let result = turf.polygon([toRing(polys[0])]);
    for (let i = 1; i < polys.length; i++) {
      if (polys[i].length < 3) continue;
      const next = turf.polygon([toRing(polys[i])]);
      const fc = turf.featureCollection([result, next]);
      const united = turf.union(fc as GeoJSON.FeatureCollection<GeoJSON.Polygon>);
      if (united && united.geometry.type === 'Polygon') {
        result = united as GeoJSON.Feature<GeoJSON.Polygon>;
      }
      // If MultiPolygon or null, keep current result (best effort)
    }
    const coords = result.geometry.coordinates[0];
    return coords.slice(0, -1).map((c) => ({ x: c[0], y: c[1] }));
  } catch {
    return polys[0]; // fallback
  }
}
