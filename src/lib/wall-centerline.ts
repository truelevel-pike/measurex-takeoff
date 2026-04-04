/**
 * P2-13: Wall Centerline Auto-Detection
 *
 * Given a user-drawn polyline, attempts to detect whether it was drawn along
 * a wall and snaps it to the inferred wall centerline.
 *
 * Heuristic:
 *  1. Build line segments from the drawn polyline.
 *  2. For each segment, look for a roughly parallel sibling segment within
 *     `tolerance` pixels (from other segments in the same polyline, treating
 *     the polyline as a set of potential parallel pairs — e.g. when tracing
 *     both edges of a wall).
 *  3. The centerline of a pair of parallel segments is the path that runs
 *     equidistant between them.
 *
 * Returns the snapped centerline as a new Point array, or null if no parallel
 * pair was detected (meaning the drawn line is probably fine as-is).
 */

import type { Point } from '@/lib/types';

interface Segment {
  a: Point;
  b: Point;
}

/**
 * Distance from point P to an infinite line through A and B.
 */
function pointToLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/**
 * Unit direction vector of a segment.
 */
function segmentDirection(seg: Segment): { dx: number; dy: number } {
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len };
}

/**
 * Dot product of two direction vectors — 1 = parallel, 0 = perpendicular.
 * We compare abs value so antiparallel lines also count.
 */
function parallelScore(d1: { dx: number; dy: number }, d2: { dx: number; dy: number }): number {
  return Math.abs(d1.dx * d2.dx + d1.dy * d2.dy);
}

/**
 * Midpoint between two points.
 */
function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Project point P onto segment A→B, returning the clamped foot-of-perpendicular.
 */
function projectOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * Detect wall centerline from a drawn polyline.
 *
 * @param points   - Raw drawn polyline points (≥2).
 * @param tolerance - Max pixel distance between parallel walls (default 30px).
 * @param parallelThreshold - Minimum dot-product similarity to consider parallel (default 0.92 ≈ ±23°).
 * @returns Snapped centerline Point[] or null if no wall pair detected.
 */
export function detectWallCenterline(
  points: Point[],
  tolerance = 30,
  parallelThreshold = 0.92,
): Point[] | null {
  if (points.length < 2) return null;

  // Build segments from the drawn polyline
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({ a: points[i], b: points[i + 1] });
  }

  // For each segment, look for a close parallel partner
  // We try every pair of non-adjacent segments
  let bestPairScore = -1;
  let bestPair: [Segment, Segment] | null = null;

  for (let i = 0; i < segments.length; i++) {
    const di = segmentDirection(segments[i]);
    for (let j = i + 2; j < segments.length; j++) {
      const dj = segmentDirection(segments[j]);
      const pScore = parallelScore(di, dj);
      if (pScore < parallelThreshold) continue;

      // Check that the segments are within `tolerance` of each other
      const distAtoJ = pointToLineDistance(segments[i].a, segments[j].a, segments[j].b);
      const distBtoJ = pointToLineDistance(segments[i].b, segments[j].a, segments[j].b);
      const avgDist = (distAtoJ + distBtoJ) / 2;

      if (avgDist > tolerance) continue;
      if (pScore > bestPairScore) {
        bestPairScore = pScore;
        bestPair = [segments[i], segments[j]];
      }
    }
  }

  // No parallel pair found — the drawn line is not along a wall
  if (!bestPair) return null;

  const [segA, segB] = bestPair;

  // Build centerline: for each endpoint of segA, find the closest point on segB,
  // then take the midpoint. This gives us two centerline endpoints.
  const aOnB = projectOnSegment(segA.a, segB.a, segB.b);
  const bOnB = projectOnSegment(segA.b, segB.a, segB.b);

  const centerStart = midpoint(segA.a, aOnB);
  const centerEnd = midpoint(segA.b, bOnB);

  // Reconstruct the full polyline: replace the detected pair with the centerline
  // For a simple 2-point drawn line this is just [centerStart, centerEnd].
  // For longer polylines, we snap all points toward the centerline axis.
  if (points.length === 2) {
    return [centerStart, centerEnd];
  }

  // Multi-point polyline: project each original point onto the centreplane axis
  // defined by centerStart→centerEnd, then average with the original to get a
  // gentle correction rather than a hard snap.
  const centerline: Point[] = points.map((p) => {
    const proj = projectOnSegment(p, centerStart, centerEnd);
    // 50/50 blend: preserves user intent while nudging toward center
    return { x: (p.x + proj.x) / 2, y: (p.y + proj.y) / 2 };
  });

  return centerline;
}
