import type { WallSegment } from "@/components/WallMesh";
import type { FloorAreaItem } from "@/components/FloorAreaMesh";

interface Polygon { id: string; points: { x: number; y: number }[]; classificationId?: string; }
interface Classification { id: string; name: string; type: "area" | "linear" | "count"; color?: string; }

export interface MeasurementLabel3DData { id: string; position: [number, number, number]; areaSq?: number; length?: number; label?: string; unit?: "ft" | "in" | "m" | "mm"; }

/** Generate sample room geometry when no takeoff data exists */
export function generateSampleRoom(): { walls: WallSegment[]; areas: FloorAreaItem[]; labels: MeasurementLabel3DData[] } {
  const w = 30; // 30 ft wide
  const d = 20; // 20 ft deep
  const h = 8;  // 8 ft tall
  const t = 0.5;
  const wallColor = "#00d4ff";
  const floorColor = "#00ff88";

  const walls: WallSegment[] = [
    { start: { x: 0, y: 0 }, end: { x: w, y: 0 }, height: h, thickness: t, color: wallColor },
    { start: { x: w, y: 0 }, end: { x: w, y: d }, height: h, thickness: t, color: wallColor },
    { start: { x: w, y: d }, end: { x: 0, y: d }, height: h, thickness: t, color: wallColor },
    { start: { x: 0, y: d }, end: { x: 0, y: 0 }, height: h, thickness: t, color: wallColor },
    // Interior wall
    { start: { x: w / 2, y: 0 }, end: { x: w / 2, y: d * 0.6 }, height: h, thickness: t, color: "#a855f7" },
    // Door opening hint wall
    { start: { x: w * 0.3, y: d }, end: { x: w * 0.3, y: d * 0.7 }, height: h, thickness: t, color: "#ff6b6b" },
  ];

  const areas: FloorAreaItem[] = [
    {
      id: "sample-room-1",
      classificationId: "sample-cls-1",
      points: [{ x: 0, y: 0 }, { x: w / 2, y: 0 }, { x: w / 2, y: d }, { x: 0, y: d }],
      color: floorColor,
      label: "Room A — 300 SF",
    },
    {
      id: "sample-room-2",
      classificationId: "sample-cls-2",
      points: [{ x: w / 2, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: w / 2, y: d }],
      color: "#a855f7",
      label: "Room B — 300 SF",
    },
  ];

  const labels: MeasurementLabel3DData[] = [
    { id: "label-sample-1", position: [w / 4, 1, d / 2], areaSq: 300, label: "Room A", unit: "ft" },
    { id: "label-sample-2", position: [(w * 3) / 4, 1, d / 2], areaSq: 300, label: "Room B", unit: "ft" },
    { id: "label-sample-hint", position: [w / 2, h + 1, d / 2], label: "Sample — Run AI Takeoff for real data", unit: "ft" },
  ];

  return { walls, areas, labels };
}

export function convertTakeoffTo3D(polygons: Polygon[], classifications: Classification[]) {
  const walls: WallSegment[] = [];
  const areas: FloorAreaItem[] = [];
  const labels: MeasurementLabel3DData[] = [];
  for (const poly of polygons) {
    const cls = classifications.find((c) => c.id === poly.classificationId);
    if (!cls) continue;
    const color = cls.color || "#4CAF50";
    if (cls.type === "linear") {
      for (let i = 0; i < poly.points.length - 1; i++) {
        const a = poly.points[i];
        const b = poly.points[i + 1];
        walls.push({ start: { x: a.x / 100, y: a.y / 100 }, end: { x: b.x / 100, y: b.y / 100 }, height: 8, thickness: 0.5, color });
      }
    } else if (cls.type === "area") {
      const pts = poly.points.map((p) => ({ x: p.x / 100, y: p.y / 100 }));
      areas.push({ id: poly.id, classificationId: cls.id, points: pts, color, label: cls.name });
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      labels.push({ id: "label-" + poly.id, position: [cx, 0.5, cy], label: cls.name, unit: "ft" });
    }
  }

  // Fallback: if no geometry produced, show sample room
  if (walls.length === 0 && areas.length === 0) {
    return generateSampleRoom();
  }

  return { walls, areas, labels };
}