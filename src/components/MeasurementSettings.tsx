'use client';

import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  type MeasurementSettings as Settings,
  type AreaUnit,
  type LinearUnit,
  type DecimalPlaces,
  AREA_UNIT_LABELS,
  LINEAR_UNIT_LABELS,
} from '@/lib/measurement-settings';

interface MeasurementSettingsProps {
  settings: Settings;
  onChange: (next: Settings) => void;
  onClose: () => void;
}

function ToggleGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1 font-mono uppercase tracking-wider">{label}</label>
      <div className="flex gap-0 border border-[#00d4ff]/20 rounded overflow-hidden">
        {options.map(opt => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-2 py-1.5 text-[11px] font-mono transition-colors ${
              value === opt.value
                ? 'bg-[#00d4ff]/20 text-[#00d4ff] border-[#00d4ff]/40'
                : 'bg-[#0e1016] text-gray-400 hover:text-gray-200 hover:bg-[#0e1016]/80'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MeasurementSettings({ settings, onChange, onClose }: MeasurementSettingsProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 w-60 bg-[#12121a] border border-[#00d4ff]/20 rounded-lg shadow-xl shadow-black/50 p-3 space-y-3"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-mono text-[#00d4ff] uppercase tracking-wider">Measurement Settings</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Close settings"
        >
          <X size={12} />
        </button>
      </div>

      <ToggleGroup
        label="Unit System"
        options={[
          { value: 'imperial' as const, label: 'Imperial' },
          { value: 'metric' as const, label: 'Metric' },
        ]}
        value={settings.unit}
        onChange={(v) => {
          if (v === 'metric') {
            update({ unit: v, areaUnit: 'sm', linearUnit: 'm' });
          } else {
            update({ unit: v, areaUnit: 'sf', linearUnit: 'ft' });
          }
        }}
      />

      <ToggleGroup
        label="Decimal Places"
        options={([0, 1, 2, 3] as DecimalPlaces[]).map(d => ({ value: d, label: String(d) }))}
        value={settings.decimals}
        onChange={(v) => update({ decimals: v })}
      />

      <ToggleGroup
        label="Area Unit"
        options={(['sf', 'sy', 'sm', 'sm2'] as AreaUnit[]).map(u => ({
          value: u,
          label: AREA_UNIT_LABELS[u].toUpperCase(),
        }))}
        value={settings.areaUnit}
        onChange={(v) => update({ areaUnit: v })}
      />

      <ToggleGroup
        label="Linear Unit"
        options={(['ft', 'in', 'm', 'cm'] as LinearUnit[]).map(u => ({
          value: u,
          label: LINEAR_UNIT_LABELS[u].toUpperCase(),
        }))}
        value={settings.linearUnit}
        onChange={(v) => update({ linearUnit: v })}
      />
    </div>
  );
}
