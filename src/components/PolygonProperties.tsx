import React from 'react';
import { useStore } from '@/lib/store';
import { X } from 'lucide-react';

interface PolygonPropertiesProps {
  onClose?: () => void;
}

export default function PolygonProperties({ onClose }: PolygonPropertiesProps) {
  const selectedPolygonId = useStore((s) => s.selectedPolygon);
  const polygons = useStore((s) => s.polygons);
  const classifications = useStore((s) => s.classifications);
  const scale = useStore((s) => s.scale);
  const updatePolygon = useStore((s) => s.updatePolygon);

  const polygon = polygons.find((p) => p.id === selectedPolygonId);

  const [label, setLabel] = React.useState<string>('');

  React.useEffect(() => {
    setLabel(polygon?.label || '');
  }, [polygon?.id, polygon?.label]);

  if (!polygon) return <aside className="p-4 text-gray-400">No polygon selected</aside>;
  const classification = classifications.find((c) => c.id === polygon.classificationId);

  const scales = useStore((s) => s.scales);
  const ppu = (scales[polygon.pageNumber] ?? scale)?.pixelsPerUnit || 1;
  const unit = scale?.unit || 'ft';
  const areaReal = polygon.area / (ppu * ppu);
  // BUG-PIKE-020 fix: linearFeet stored as raw pixels — divide by ppu for display
  const lengthReal = ppu > 0 ? (polygon.linearFeet || 0) / ppu : (polygon.linearFeet || 0);

  const persistLabel = () => {
    const next = label.trim();
    if ((polygon.label || '') === next) return;
    updatePolygon(polygon.id, { label: next || undefined });
  };

  return (
    <aside className="bg-white border border-gray-200 p-4 rounded-md w-64 shadow-sm mt-2" aria-label="Polygon properties">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Polygon Properties</h3>
        {onClose && (
          <button
            type="button"
            aria-label="Close properties"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="text-sm mb-1">
        Classification: <span className="font-mono">{classification?.name ?? 'Unknown'}</span>
      </div>
      <div className="text-sm mb-1">
        Page: <span className="font-mono">{polygon.pageNumber}</span>
      </div>
      <div className="text-sm mb-1">
        Area: <span className="font-mono">{areaReal.toFixed(2)} sq {unit}</span>
      </div>
      <div className="text-sm mb-1">
        Length: <span className="font-mono">{lengthReal.toFixed(2)} {unit}</span>
      </div>
      <div className="text-sm mb-1">
        Points: <span className="font-mono">{polygon.points.length}</span>
      </div>

      <label className="text-xs font-semibold block mt-2">
        Label
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={persistLabel}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              persistLabel();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          className="ml-2 border rounded px-1 w-40 text-xs"
        />
      </label>

      <div className="text-xs text-gray-500 mt-3">Color</div>
      <div className="inline-flex items-center gap-2 mt-1">
        <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: classification?.color || '#9ca3af' }} />
        <span className="text-xs text-gray-500">Change color in Quantities → classification</span>
      </div>
    </aside>
  );
}
