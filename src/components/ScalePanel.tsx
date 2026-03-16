'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { X, Check, Sparkles, ChevronRight } from 'lucide-react';

// ── Preset data (verbatim from Togal spec) ──────────────────────────────────

const architecturalPresets = [
  '3/64" = 1\' 0"',
  '1/32" = 1\' 0"',
  '1/16" = 1\' 0"',
  '3/32" = 1\' 0"',
  '1/8" = 1\' 0"',
  '3/16" = 1\' 0"',
  '1/4" = 1\' 0"',
  '3/8" = 1\' 0"',
  '1/2" = 1\' 0"',
  '3/4" = 1\' 0"',
  '1" = 1\' 0"',
  '1 1/2" = 1\' 0"',
  '3" = 1\' 0"',
];

const civilPresets = [
  '1" = 1\' 0"',
  '1" = 10\' 0"',
  '1" = 20\' 0"',
  '1" = 30\' 0"',
  '1" = 40\' 0"',
  '1" = 50\' 0"',
  '1" = 60\' 0"',
  '1" = 70\' 0"',
  '1" = 80\' 0"',
  '1" = 90\' 0"',
  '1" = 100\' 0"',
];

const ratioMetricPresets = [
  '1 : 1250',
  '1 : 1000',
  '1 : 750',
  '1 : 500',
  '1 : 300',
  '1 : 250',
  '1 : 200',
  '1 : 150',
  '1 : 125',
  '1 : 100',
  '1 : 60',
  '1 : 50',
  '1 : 20',
  '1 : 10',
  '1 : 5',
];

// ── Props ───────────────────────────────────────────────────────────────────

interface ScalePanelProps {
  currentPage: number;
  selectedScale: string | null;
  autoDetected: boolean;
  onSelectScale: (scale: string) => void;
  onOpenManual: () => void;
  onClose: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ScalePanel({
  selectedScale,
  autoDetected,
  onSelectScale,
  onOpenManual,
  onClose,
}: ScalePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const columns: { title: string; presets: string[] }[] = [
    { title: 'Architectural', presets: architecturalPresets },
    { title: 'Civil', presets: civilPresets },
    { title: 'Ratio / Metric', presets: ratioMetricPresets },
  ];

  // Focus close button when panel opens
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape to close
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="scale-panel-heading"
      onKeyDown={handleKeyDown}
      className="bg-white rounded-xl shadow-2xl w-[620px] max-h-[80vh] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200">
        <h2 id="scale-panel-heading" className="text-base font-bold text-zinc-800">Scale</h2>
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close scale panel"
          className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition"
        >
          <X size={18} aria-hidden="true" />
          <span className="sr-only">Close</span>
        </button>
      </div>

      {/* Auto-detected badge */}
      {autoDetected && (
        <div className="flex items-center gap-2 px-5 py-2 bg-emerald-50 border-b border-emerald-100">
          <Sparkles size={16} className="text-emerald-500" aria-hidden="true" />
          <span className="text-sm text-emerald-700 font-medium">Auto-detected scale</span>
          <button className="text-sm text-emerald-600 underline hover:text-emerald-800 ml-1" aria-label="More info about auto-detected scale">
            More info
          </button>
        </div>
      )}

      {/* 3-column preset layout */}
      <div className="flex flex-1 min-h-0 overflow-y-auto" role="listbox" aria-label="Scale presets">
        {columns.map((col) => (
          <div key={col.title} className="flex-1 border-r last:border-r-0 border-zinc-100">
            <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide bg-zinc-50 border-b border-zinc-100 sticky top-0">
              {col.title}
            </div>
            <div className="px-2 py-1">
              {col.presets.map((scale) => {
                const isSelected = selectedScale === scale;
                return (
                  <button
                    key={scale}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => onSelectScale(scale)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md mb-0.5 text-sm transition ${
                      isSelected
                        ? 'bg-green-100 text-green-800 font-semibold'
                        : 'hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <span>{scale}</span>
                    {isSelected && <Check size={14} className="text-green-600 flex-shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Manual section */}
      <div className="px-5 py-3 border-t border-zinc-200 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-500">Manual</span>
        <button
          onClick={onOpenManual}
          aria-label="Set scale manually"
          className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 transition"
        >
          Set Scale Manually
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
