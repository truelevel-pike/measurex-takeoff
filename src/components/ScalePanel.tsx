'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { X, Check, Sparkles, ChevronRight, Crosshair, CheckCircle2 } from 'lucide-react';
import { useFocusTrap } from '@/lib/use-focus-trap';

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

// Most commonly used scales as quick-select pills
const commonScales = [
  '1/8" = 1\' 0"',
  '1/4" = 1\' 0"',
  '3/16" = 1\' 0"',
  '1/16" = 1\' 0"',
  '1" = 20\' 0"',
  '1" = 40\' 0"',
  '1 : 100',
];

// Short labels for quick-select pills
const commonScaleShortLabels: Record<string, string> = {
  '1/8" = 1\' 0"': '1/8"=1\'',
  '1/4" = 1\' 0"': '1/4"=1\'',
  '3/16" = 1\' 0"': '3/16"=1\'',
  '1/16" = 1\' 0"': '1/16"=1\'',
  '1" = 20\' 0"': '1"=20\'',
  '1" = 40\' 0"': '1"=40\'',
  '1 : 100': '1:100',
};

// ── Props ───────────────────────────────────────────────────────────────────

// BUG-A7-4-064: removed dead currentPage prop
interface ScalePanelProps {
  selectedScale: string | null;
  autoDetected: boolean;
  scalePreview: string | null;
  onSelectScale: (scale: string) => void;
  onOpenManual: () => void;
  onStartCalibrate: () => void;
  onClose: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ScalePanel(props: ScalePanelProps) {
  const {
    selectedScale,
    autoDetected,
    scalePreview,
    onSelectScale,
    onOpenManual,
    onStartCalibrate,
    onClose,
  } = props;
  const focusTrapRef = useFocusTrap(true);
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
      ref={focusTrapRef}
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

      {/* Scale preview — shows current calibration result */}
      {selectedScale && scalePreview && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-green-50 border-b border-green-100">
          <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm text-green-800 font-medium">{scalePreview}</span>
        </div>
      )}

      {/* Auto-detected badge */}
      {autoDetected && (
        <div className="flex items-center gap-2 px-5 py-2 bg-emerald-50 border-b border-emerald-100">
          <Sparkles size={16} className="text-emerald-500" aria-hidden="true" />
          <span className="text-sm text-emerald-700 font-medium">Auto-detected scale</span>
        </div>
      )}

      {/* Click-to-calibrate CTA */}
      <div className="px-5 py-3 border-b border-zinc-200">
        <button
          onClick={onStartCalibrate}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition shadow-sm"
        >
          <Crosshair size={16} aria-hidden="true" />
          Calibrate on Drawing
        </button>
        <p className="text-xs text-zinc-400 text-center mt-1.5">
          Click two points on the plan, enter the real distance
        </p>
      </div>

      {/* Common scales quick-select */}
      <div className="px-5 py-2.5 border-b border-zinc-200">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Common Scales</div>
        <div className="flex flex-wrap gap-1.5">
          {commonScales.map((scale) => {
            const isSelected = selectedScale === scale;
            return (
              <button
                key={scale}
                onClick={() => onSelectScale(scale)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                  isSelected
                    ? 'bg-green-100 border-green-300 text-green-800'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:border-zinc-300'
                }`}
              >
                {commonScaleShortLabels[scale] || scale}
                {isSelected && <Check size={12} className="inline ml-1 text-green-600" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

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
