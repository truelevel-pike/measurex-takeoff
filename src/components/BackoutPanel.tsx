'use client';

/**
 * P2-14: BackoutPanel — Door/window opening deductions for linear wall measurements.
 *
 * Renders a compact list of named backout entries (door/window openings) attached to
 * a linear classification. Each entry has a name, width (in project units), and count.
 * Net linear = gross linear - sum(backout.width × backout.count).
 */

import React from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/store';

interface BackoutPanelProps {
  classificationId: string;
  /** Gross linear measurement in real units (ft/m/in). */
  grossLinear: number;
  /** Current project unit label (e.g. 'ft', 'm'). */
  unit?: string;
}

export default function BackoutPanel({ classificationId, grossLinear, unit = 'ft' }: BackoutPanelProps) {
  const classifications = useStore((s) => s.classifications);
  const addBackout = useStore((s) => s.addBackout);
  const updateBackout = useStore((s) => s.updateBackout);
  const removeBackout = useStore((s) => s.removeBackout);

  const cls = classifications.find((c) => c.id === classificationId);
  const backouts = cls?.backouts ?? [];

  const backoutTotal = backouts.reduce((sum, b) => sum + (b.width || 0) * (b.count || 1), 0);
  const netLinear = Math.max(0, grossLinear - backoutTotal);

  const handleAdd = () => {
    addBackout(classificationId, { name: 'Opening', width: 3, count: 1 });
  };

  const handleWidthChange = (id: string, raw: string) => {
    const v = parseFloat(raw);
    if (!isNaN(v) && v >= 0) updateBackout(classificationId, id, { width: v });
  };

  const handleCountChange = (id: string, raw: string) => {
    const v = parseInt(raw, 10);
    if (!isNaN(v) && v >= 1) updateBackout(classificationId, id, { count: v });
  };

  const handleNameChange = (id: string, name: string) => {
    updateBackout(classificationId, id, { name });
  };

  return (
    <div
      data-testid="backout-panel"
      className="mt-2 rounded-lg overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,212,255,0.15)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[rgba(0,212,255,0.1)]">
        <span className="text-[11px] font-semibold text-[#00d4ff] uppercase tracking-wider">
          Door/Window Backouts
        </span>
        <button
          data-testid="add-backout-btn"
          onClick={handleAdd}
          className="flex items-center gap-1 text-[10px] text-[#00d4ff] hover:text-white transition-colors"
          title="Add backout opening"
        >
          <Plus size={11} />
          Add
        </button>
      </div>

      {/* Backout list */}
      {backouts.length === 0 ? (
        <div className="px-3 py-2 text-[10px] text-gray-500 italic">
          No backouts. Click &quot;Add&quot; to subtract door or window widths.
        </div>
      ) : (
        <div className="divide-y divide-[rgba(0,212,255,0.06)]">
          {backouts.map((b, idx) => (
            <div key={b.id} className="flex items-center gap-1.5 px-2 py-1.5">
              {/* Name */}
              <input
                data-testid={`backout-name-${idx}`}
                type="text"
                value={b.name}
                onChange={(e) => handleNameChange(b.id, e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-[11px] text-gray-200 outline-none border-b border-transparent focus:border-[rgba(0,212,255,0.3)] transition-colors truncate"
                placeholder="Name"
                aria-label={`Backout ${idx + 1} name`}
              />
              {/* Width */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <input
                  data-testid={`backout-width-${idx}`}
                  type="number"
                  min="0"
                  step="0.5"
                  value={b.width}
                  onChange={(e) => handleWidthChange(b.id, e.target.value)}
                  className="w-14 bg-[rgba(0,0,0,0.4)] text-[11px] text-[#e0e0e0] text-right px-1 py-0.5 rounded outline-none border border-transparent focus:border-[rgba(0,212,255,0.3)] transition-colors"
                  aria-label={`Backout ${idx + 1} width`}
                />
                <span className="text-[9px] text-gray-500">{unit}</span>
              </div>
              {/* × */}
              <Minus size={9} className="text-gray-600 flex-shrink-0" />
              {/* Count */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <input
                  data-testid={`backout-count-${idx}`}
                  type="number"
                  min="1"
                  step="1"
                  value={b.count}
                  onChange={(e) => handleCountChange(b.id, e.target.value)}
                  className="w-10 bg-[rgba(0,0,0,0.4)] text-[11px] text-[#e0e0e0] text-right px-1 py-0.5 rounded outline-none border border-transparent focus:border-[rgba(0,212,255,0.3)] transition-colors"
                  aria-label={`Backout ${idx + 1} count`}
                />
                <span className="text-[9px] text-gray-500">×</span>
              </div>
              {/* Computed subtotal */}
              <span className="text-[10px] text-[#f87171] font-mono flex-shrink-0 w-14 text-right">
                -{((b.width || 0) * (b.count || 1)).toFixed(1)}{unit}
              </span>
              {/* Delete */}
              <button
                onClick={() => removeBackout(classificationId, b.id)}
                className="flex-shrink-0 text-gray-600 hover:text-[#f87171] transition-colors"
                aria-label={`Remove backout ${b.name}`}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Summary row */}
      {backouts.length > 0 && (
        <div className="px-3 py-2 border-t border-[rgba(0,212,255,0.1)] space-y-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Gross</span>
            <span className="font-mono text-gray-300">{grossLinear.toFixed(2)} {unit}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[#f87171]">Backouts</span>
            <span className="font-mono text-[#f87171]">-{backoutTotal.toFixed(2)} {unit}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-semibold border-t border-[rgba(0,212,255,0.1)] pt-1 mt-1">
            <span className="text-[#00d4ff]">Net</span>
            <span className="font-mono text-[#00d4ff]">{netLinear.toFixed(2)} {unit}</span>
          </div>
        </div>
      )}
    </div>
  );
}
