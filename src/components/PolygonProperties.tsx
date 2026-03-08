import React from 'react';
import { useStore } from '@/lib/store';

export default function PolygonProperties() {
  const selectedPolygonId = useStore((s) => s.selectedPolygon);
  const polygons = useStore((s) => s.polygons);
  const classifications = useStore((s) => s.classifications);
  const scale = useStore((s) => s.scale);
  const polygon = polygons.find((p) => p.id === selectedPolygonId);
  if (!polygon) return <aside className="p-4 text-gray-400">No polygon selected</aside>;
  const classification = classifications.find((c) => c.id === polygon.classificationId);

  const ppu = scale?.pixelsPerUnit || 1;
  const unit = scale?.unit || 'ft';
  const areaReal = polygon.area / (ppu * ppu);
  const lengthReal = (polygon.linearFeet || 0);

  const [label, setLabel] = React.useState<string>(polygon.label || '');

  return (
    <aside className="bg-white border border-gray-200 p-4 rounded-md w-64 shadow-sm mt-2" aria-label="Polygon properties">
      <h3 className="font-semibold mb-2">Polygon Properties</h3>

      <div className="text-sm mb-1">Classification: <span className="font-mono">{classification?.name ?? 'Unknown'}</span></div>
      <div className="text-sm mb-1">Page: <span className="font-mono">{polygon.pageNumber}</span></div>
      <div className="text-sm mb-1">Area: <span className="font-mono">{areaReal.toFixed(2)} sq {unit}</span></div>
      <div className="text-sm mb-1">Length: <span className="font-mono">{lengthReal.toFixed(2)} {unit}</span></div>
      <div className="text-sm mb-1">Points: <span className="font-mono">{polygon.points.length}</span></div>

      <label className="text-xs font-semibold block mt-2">Label
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="ml-2 border rounded px-1 w-40 text-xs"
        />
      </label>

      <div className="text-xs text-gray-500 mt-3">Color</div>
      <div className="inline-flex items-center gap-2 mt-1">
        <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: (polygon as any).color }} />
        <span className="text-xs text-gray-500">Change color in Quantities → classification</span>
      </div>
    </aside>
  );
}
