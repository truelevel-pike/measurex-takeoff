import type { WallSegment } from "@/components/WallMesh";
import type { FloorAreaItem } from "@/components/FloorAreaMesh";

interface Polygon { id: string; points: { x: number; y: number }[]; classificationId?: string; }
interface Classification { id: string; name: string; type: "area" | "linear" | "count"; color?: string; }

export interface MeasurementLabel3DData { id: string; position: [number, number, number]; areaSq?: number; length?: number; label?: string; unit?: "ft" | "in" | "m" | "mm"; }

/**
 * Generate sample L-shaped room geometry when no takeoff data exists.
 * L-shape: main block (30×20) minus top-right corner (15×10).
 * 6 walls, 2 floor areas, 3 measurement labels.
 */
export function generateSampleGeometry(): { walls: WallSegment[]; areas: FloorAreaItem[]; labels: MeasurementLabel3DData[] } {
  const h = 8;    // 8 ft ceiling
  const t = 0.5;  // wall thickness
  const wallColor = "#00d4ff";

  // L-shape outline (clockwise):
  // (0,0) → (30,0) → (30,10) → (15,10) → (15,20) → (0,20) → back to (0,0)
  const walls: WallSegment[] = [
    { start: { x: 0,  y: 0  }, end: { x: 30, y: 0  }, height: h, thickness: t, color: wallColor },  // bottom
    { start: { x: 30, y: 0  }, end: { x: 30, y: 10 }, height: h, thickness: t, color: wallColor },  // right-lower
    { start: { x: 30, y: 10 }, end: { x: 15, y: 10 }, height: h, thickness: t, color: wallColor },  // step horizontal
    { start: { x: 15, y: 10 }, end: { x: 15, y: 20 }, height: h, thickness: t, color: wallColor },  // step vertical
    { start: { x: 15, y: 20 }, end: { x: 0,  y: 20 }, height: h, thickness: t, color: wallColor },  // top
    { start: { x: 0,  y: 20 }, end: { x: 0,  y: 0  }, height: h, thickness: t, color: wallColor },  // left
  ];

  const areas: FloorAreaItem[] = [
    {
      id: "sample-area-main",
      classificationId: "sample-cls-main",
      points: [
        { x: 0,  y: 0  },
        { x: 30, y: 0  },
        { x: 30, y: 10 },
        { x: 15, y: 10 },
        { x: 15, y: 20 },
        { x: 0,  y: 20 },
      ],
      color: "#00ff88",
      label: "Main Space — 450 SF",
    },
    {
      id: "sample-area-nook",
      classificationId: "sample-cls-nook",
      // upper-left quadrant highlight
      points: [
        { x: 0,  y: 10 },
        { x: 15, y: 10 },
        { x: 15, y: 20 },
        { x: 0,  y: 20 },
      ],
      color: "#a855f7",
      label: "Nook — 150 SF",
    },
  ];

  const labels: MeasurementLabel3DData[] = [
    { id: "label-main",  position: [15,  1, 5  ], areaSq: 450, label: "Main Space", unit: "ft" },
    { id: "label-nook",  position: [7.5, 1, 15 ], areaSq: 150, label: "Nook",       unit: "ft" },
    { id: "label-hint",  position: [15,  h + 1, 10], label: "Sample — Run AI Takeoff for real data", unit: "ft" },
  ];

  return { walls, areas, labels };
}

/**
 * Legacy alias kept so existing imports of generateSampleRoom() keep working.
 * New code should prefer generateSampleGeometry().
 */
export const generateSampleRoom = generateSampleGeometry;

/** Determine wall extrusion height based on classification name. */
export function getExtrusionHeight(classificationName: string): number {
  const name = classificationName.toLowerCase();
  if (name.includes('slab') || name.includes('floor')) return 0.15;
  if (name.includes('column') || name.includes('post')) return 12;
  // wall, roof, ceiling, and default all get 9
  return 9;
}

export function convertTakeoffTo3D(polygons: Polygon[], classifications: Classification[]) {
  const walls: WallSegment[] = [];
  const areas: FloorAreaItem[] = [];
  const labels: MeasurementLabel3DData[] = [];

  for (const poly of polygons) {
    // Edge case: skip empty or single-point polygons
    if (!poly.points || poly.points.length < 2) continue;

    const cls = classifications.find((c) => c.id === poly.classificationId);
    if (!cls) continue;

    const color = cls.color || "#4CAF50";

    if (cls.type === "linear") {
      // Iterate over every consecutive pair of points
      for (let i = 0; i < poly.points.length - 1; i++) {
        const a = poly.points[i];
        const b = poly.points[i + 1];
        // Skip degenerate zero-length segments
        if (a.x === b.x && a.y === b.y) continue;
        walls.push({
          start: { x: a.x / 100, y: a.y / 100 },
          end:   { x: b.x / 100, y: b.y / 100 },
          height: getExtrusionHeight(cls.name),
          thickness: 0.5,
          color,
        });
      }
    } else if (cls.type === "area") {
      // Need at least 3 distinct points for a valid polygon
      if (poly.points.length < 3) continue;

      const pts = poly.points.map((p) => ({ x: p.x / 100, y: p.y / 100 }));

      // Ensure the polygon path is closed (last point == first point) for Three.js Shape
      const first = pts[0];
      const last  = pts[pts.length - 1];
      const isClosed = first.x === last.x && first.y === last.y;
      const shapePts = isClosed ? pts.slice(0, -1) : pts; // THREE.Shape.setFromPoints closes automatically

      areas.push({
        id:               poly.id,
        classificationId: cls.id,
        points:           shapePts,
        color,
        label:            cls.name,
      });

      // Place centroid label
      const cx = shapePts.reduce((s, p) => s + p.x, 0) / shapePts.length;
      const cy = shapePts.reduce((s, p) => s + p.y, 0) / shapePts.length;
      labels.push({
        id:       "label-" + poly.id,
        position: [cx, 0.5, cy],
        label:    cls.name,
        unit:     "ft",
      });
    }
  }

  // Fallback: if no geometry produced, show sample room
  if (walls.length === 0 && areas.length === 0) {
    return generateSampleGeometry();
  }

  return { walls, areas, labels };
}
