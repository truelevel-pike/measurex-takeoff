'use client';

import { useState } from 'react';

import { calculateLinearFeet, calculatePolygonArea } from '@/lib/polygon-utils';
import { useStore } from '@/lib/store';

interface CoordInputPanelProps {
  agentMode?: boolean;
}

type ClassificationType = 'area' | 'linear' | 'count';

export default function CoordInputPanel({ agentMode }: CoordInputPanelProps) {
  const selectedClassification = useStore((s) => s.selectedClassification);
  const currentTool = useStore((s) => s.currentTool);
  const currentPage = useStore((s) => s.currentPage);
  const scale = useStore((s) => s.scale);
  const classifications = useStore((s) => s.classifications);
  const updateClassification = useStore((s) => s.updateClassification);
  const addPolygon = useStore((s) => s.addPolygon);
  const setTool = useStore((s) => s.setTool);

  const [coords, setCoords] = useState('');
  const [result, setResult] = useState<string | null>(null);

  if (!agentMode || currentTool !== 'draw' || selectedClassification === null) {
    return null;
  }

  const classification = classifications.find((c) => c.id === selectedClassification);

  const handleTypeChange = (type: ClassificationType) => {
    if (!classification) return;
    updateClassification(classification.id, { type });
  };

  const handleSubmit = () => {
    const points = coords
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        return {
          x: parseFloat(parts[0]),
          y: parseFloat(parts[1]),
        };
      })
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

    const minPoints = classification?.type === 'linear' ? 2 : 3;
    if (points.length < minPoints) {
      setResult(`❌ Error: need at least ${minPoints} points`);
      return;
    }

    const area = calculatePolygonArea(points);
    const linearFeet = calculateLinearFeet(
      points,
      scale?.pixelsPerUnit || 1,
      classification?.type !== 'linear'
    );

    addPolygon({
      points,
      classificationId: selectedClassification,
      pageNumber: currentPage,
      area,
      linearFeet,
      isComplete: true,
      label: classification?.name,
    });

    const sf = scale ? (area / (scale.pixelsPerUnit * scale.pixelsPerUnit)).toFixed(1) : area.toFixed(1);
    const lf = scale ? (linearFeet / scale.pixelsPerUnit).toFixed(1) : linearFeet.toFixed(1);
    const measureStr = classification?.type === 'linear' ? `LF: ${lf}` : `SF: ${sf}`;
    setResult(`✅ Polygon created — ${measureStr}`);
    setCoords('');
    setTool('select');
  };

  const TYPE_BUTTONS: { type: ClassificationType; label: string; testId: string }[] = [
    { type: 'area', label: 'Area', testId: 'tool-area' },
    { type: 'linear', label: 'Linear', testId: 'tool-linear' },
    { type: 'count', label: 'Count', testId: 'tool-count' },
  ];

  return (
    <div
      data-testid="coord-input-panel"
      className="fixed bottom-4 right-4 z-[100] w-80 rounded-lg bg-[#1e1e2e] p-4 shadow-lg border border-white/10"
    >
      <h3 className="mb-2 text-sm font-semibold text-white">
        Coordinate Input{' '}
        {classification && (
          <span className="text-[#00d4ff] font-normal">— {classification.name}</span>
        )}
      </h3>

      {/* Classification type quick-select — agent uses data-testid="tool-area|linear|count" */}
      {classification && (
        <div className="flex gap-1 mb-3" role="group" aria-label="Classification type">
          {TYPE_BUTTONS.map(({ type, label, testId }) => (
            <button
              key={type}
              data-testid={testId}
              data-active={classification.type === type ? 'true' : 'false'}
              onClick={() => handleTypeChange(type)}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                classification.type === type
                  ? 'bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/60'
                  : 'bg-[#151522] text-gray-400 border border-white/10 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <textarea
        data-testid="coord-input-field"
        value={coords}
        onChange={(e) => setCoords(e.target.value)}
        placeholder={'100,100\n300,100\n300,300\n100,300\n(one x,y per line)'}
        rows={5}
        style={{ width: '100%' }}
        className="mb-3 rounded border border-white/20 bg-[#151522] p-2 text-sm text-white"
      />
      <button
        data-testid="coord-input-submit"
        onClick={handleSubmit}
        className="w-full rounded bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500"
      >
        Create Polygon
      </button>
      {result && (
        <p data-testid="coord-input-result" className="mt-2 text-xs text-white/80">
          {result}
        </p>
      )}
    </div>
  );
}
