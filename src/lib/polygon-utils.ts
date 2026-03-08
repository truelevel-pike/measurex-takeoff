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
export function calculateLinearFeet(points: Point[], pixelsPerUnit = 1, closed = true): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += distance(points[i], points[i + 1]) / (pixelsPerUnit || 1);
  }
  if (closed && points.length > 2) {
    total += distance(points[points.length - 1], points[0]) / (pixelsPerUnit || 1);
  }
  return total;
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > p.y) !== (yj > p.y) && (p.x < (xj - xi) * (p.y - yi) / ((yj - yi) || 1e-10) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Merge polygons using turf v7 union(FeatureCollection)
export function mergePolygons(poly1: Point[], poly2: Point[]): Point[] {
  try {
    const ring1: [number, number][] = poly1.map(p => [p.x, p.y]);
    const ring2: [number, number][] = poly2.map(p => [p.x, p.y]);
    // close rings
    ring1.push([poly1[0].x, poly1[0].y]);
    ring2.push([poly2[0].x, poly2[0].y]);
    const f1 = turf.polygon([ring1]);
    const f2 = turf.polygon([ring2]);
    const fc = turf.featureCollection([f1, f2]);
    const united = turf.union(fc) as any;
    if (!united) return [...poly1, ...poly2];
    if (united.geometry.type === 'Polygon') {
      const coords = united.geometry.coordinates[0];
      return coords.slice(0, -1).map(([x, y]: [number, number]) => ({ x, y }));
    }
    // MultiPolygon: choose largest area
    let best: Point[] = [];
    let bestArea = -1;
    for (const rings of united.geometry.coordinates) {
      const ring = rings[0];
      const pts = ring.slice(0, -1).map(([x, y]: [number, number]) => ({ x, y }));
      const a = calculatePolygonArea(pts);
      if (a > bestArea) { bestArea = a; best = pts; }
    }
    return best.length ? best : [...poly1, ...poly2];
  } catch {
    return [...poly1, ...poly2];
  }
}

// Split polygon by a line: buffer the line slightly then difference
export function splitPolygonByLine(polygon: Point[], lineStart: Point, lineEnd: Point): [Point[], Point[]] {
  try {
    const ring: [number, number][] = polygon.map(p => [p.x, p.y]);
    ring.push([polygon[0].x, polygon[0].y]);
    const poly = turf.polygon([ring]);
    const line = turf.lineString([[lineStart.x, lineStart.y], [lineEnd.x, lineEnd.y]]);
    const buffered = turf.buffer(line, 0.001, { units: 'meters' }) as any;
    if (!buffered) return [polygon, []];
    const fc = turf.featureCollection([poly, buffered]) as any;
    const diff = turf.difference(fc) as any;
    if (!diff) return [polygon, []];
    if (diff.geometry.type === 'Polygon') {
      const a = diff.geometry.coordinates[0].slice(0, -1).map(([x, y]: [number, number]) => ({ x, y }));
      return [a, []];
    }
    // MultiPolygon → return two largest pieces
    const coords = diff.geometry.coordinates as any[];
    const parts: Point[][] = coords.map((rings: any) => {
      const ring = rings[0] as any[];
      return ring.slice(0, -1).map((c: any) => ({ x: c[0] as number, y: c[1] as number }));
    });
    parts.sort((a, b) => calculatePolygonArea(b) - calculatePolygonArea(a));
    return [parts[0] || [], parts[1] || []];
  } catch {
    return [polygon, []];
  }
}
