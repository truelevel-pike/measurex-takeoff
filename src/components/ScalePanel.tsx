'use client';

import React, { useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { ScaleCalibration } from '@/lib/types';
import { X, Check, Ruler } from 'lucide-react';

type Tab = 'architectural' | 'civil' | 'ratio';

interface Preset {
  label: string;
  pixelsPerUnit: number; // pixels per foot at 72 DPI
  unit: 'ft' | 'in';
}

// 72 DPI PDF points. Scale "1/4" = 1'-0"" means 0.25 in on paper = 1 ft real.
// At 72 DPI: 0.25 in = 18 px → 18 px per foot.
const DPI = 72;
const archPresets: Preset[] = [
  { label: '1" = 1\'-0"', pixelsPerUnit: DPI, unit: 'ft' },
  { label: '3/4" = 1\'-0"', pixelsPerUnit: DPI * 0.75, unit: 'ft' },
  { label: '1/2" = 1\'-0"', pixelsPerUnit: DPI * 0.5, unit: 'ft' },
  { label: '3/8" = 1\'-0"', pixelsPerUnit: DPI * 0.375, unit: 'ft' },
  { label: '1/4" = 1\'-0"', pixelsPerUnit: DPI * 0.25, unit: 'ft' },
  { label: '3/16" = 1\'-0"', pixelsPerUnit: DPI * 0.1875, unit: 'ft' },
  { label: '1/8" = 1\'-0"', pixelsPerUnit: DPI * 0.125, unit: 'ft' },
  { label: '3/32" = 1\'-0"', pixelsPerUnit: DPI * 0.09375, unit: 'ft' },
  { label: '1/16" = 1\'-0"', pixelsPerUnit: DPI * 0.0625, unit: 'ft' },
  { label: '1/32" = 1\'-0"', pixelsPerUnit: DPI / 32, unit: 'ft' },
  { label: '1/64" = 1\'-0"', pixelsPerUnit: DPI / 64, unit: 'ft' },
  { label: '1-1/2" = 1\'-0"', pixelsPerUnit: DPI * 1.5, unit: 'ft' },
  { label: '3" = 1\'-0"', pixelsPerUnit: DPI * 3, unit: 'ft' },
];

const civilPresets: Preset[] = [
  { label: '1" = 10\'', pixelsPerUnit: DPI / 10, unit: 'ft' },
  { label: '1" = 20\'', pixelsPerUnit: DPI / 20, unit: 'ft' },
  { label: '1" = 30\'', pixelsPerUnit: DPI / 30, unit: 'ft' },
  { label: '1" = 40\'', pixelsPerUnit: DPI / 40, unit: 'ft' },
  { label: '1" = 50\'', pixelsPerUnit: DPI / 50, unit: 'ft' },
  { label: '1" = 60\'', pixelsPerUnit: DPI / 60, unit: 'ft' },
  { label: '1" = 100\'', pixelsPerUnit: DPI / 100, unit: 'ft' },
  { label: '1" = 200\'', pixelsPerUnit: DPI / 200, unit: 'ft' },
  { label: '1" = 400\'', pixelsPerUnit: DPI / 400, unit: 'ft' },
  { label: '1" = 500\'', pixelsPerUnit: DPI / 500, unit: 'ft' },
  { label: '1" = 1000\'', pixelsPerUnit: DPI / 1000, unit: 'ft' },
];

const ratioPresets: Preset[] = [
  { label: '1:1', pixelsPerUnit: DPI / 12, unit: 'ft' },
  { label: '1:2', pixelsPerUnit: DPI / 24, unit: 'ft' },
  { label: '1:5', pixelsPerUnit: DPI / 60, unit: 'ft' },
  { label: '1:10', pixelsPerUnit: DPI / 120, unit: 'ft' },
  { label: '1:20', pixelsPerUnit: DPI / 240, unit: 'ft' },
  { label: '1:25', pixelsPerUnit: DPI / 300, unit: 'ft' },
  { label: '1:50', pixelsPerUnit: DPI / 600, unit: 'ft' },
  { label: '1:75', pixelsPerUnit: DPI / 900, unit: 'ft' },
  { label: '1:100', pixelsPerUnit: DPI / 1200, unit: 'ft' },
  { label: '1:125', pixelsPerUnit: DPI / 1500, unit: 'ft' },
  { label: '1:150', pixelsPerUnit: DPI / 1800, unit: 'ft' },
  { label: '1:200', pixelsPerUnit: DPI / 2400, unit: 'ft' },
  { label: '1:250', pixelsPerUnit: DPI / 3000, unit: 'ft' },
  { label: '1:500', pixelsPerUnit: DPI / 6000, unit: 'ft' },
  { label: '1:1000', pixelsPerUnit: DPI / 12000, unit: 'ft' },
];

const TABS: { key: Tab; label: string; presets: Preset[] }[] = [
  { key: 'architectural', label: 'Architectural', presets: archPresets },
  { key: 'civil', label: 'Civil', presets: civilPresets },
  { key: 'ratio', label: 'Ratio', presets: ratioPresets },
];

interface ScalePanelProps {
  currentPage: number;
  onClose: () => void;
  onManualCalibrate?: () => void;
}

export default function ScalePanel({ currentPage, onClose, onManualCalibrate }: ScalePanelProps) {
  const [tab, setTab] = useState<Tab>('architectural');
  const scale = useStore((s) => s.scale);
  const setScaleForPage = useStore((s) => s.setScaleForPage);
  const setScale = useStore((s) => s.setScale);

  const activePresets = TABS.find((t) => t.key === tab)?.presets ?? [];

  const handleSelect = useCallback(
    (preset: Preset) => {
      const cal = {
        pixelsPerUnit: preset.pixelsPerUnit,
        unit: preset.unit as 'ft' | 'in' | 'm' | 'mm',
        label: preset.label,
        source: 'manual' as const,
      };
      setScale(cal);
      if (currentPage >= 1) {
        setScaleForPage(currentPage, cal);
      }
      onClose();
    },
    [currentPage, setScale, setScaleForPage, onClose]
  );

  const isSelected = (preset: Preset) =>
    scale && Math.abs(scale.pixelsPerUnit - preset.pixelsPerUnit) < 0.001;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[420px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <Ruler size={18} className="text-blue-500" />
            <h2 className="text-base font-semibold text-zinc-800">Set Scale</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-sm font-medium transition ${
                tab === t.key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Presets */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {activePresets.map((preset) => {
            const selected = isSelected(preset);
            return (
              <button
                key={preset.label}
                onClick={() => handleSelect(preset)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg mb-1 text-sm transition ${
                  selected
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'hover:bg-zinc-50 text-zinc-700'
                }`}
              >
                <span className="font-medium">{preset.label}</span>
                {selected && <Check size={16} className="text-green-600" />}
              </button>
            );
          })}
        </div>

        {/* Manual calibration button */}
        {onManualCalibrate && (
          <div className="px-4 py-3 border-t border-zinc-200">
            <button
              onClick={() => {
                onManualCalibrate();
                onClose();
              }}
              className="w-full py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
            >
              Manual Calibration (Draw Line)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
