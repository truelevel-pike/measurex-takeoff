'use client';

import React from 'react';
import { Settings, X } from 'lucide-react';

import { useUserPrefs } from '@/lib/user-prefs';

export { useUserPrefs } from '@/lib/user-prefs';

interface UserPreferencesPanelProps {
  open: boolean;
  onClose?: () => void;
}

const COLOR_PRESETS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7'] as const;

export default function UserPreferencesPanel({ open, onClose }: UserPreferencesPanelProps) {
  const { prefs, setPrefs } = useUserPrefs();

  return (
    <>
      {open && <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} />}

      <aside
        className={`fixed top-0 right-0 bottom-0 z-[70] w-[360px] max-w-[92vw] bg-[rgba(15,18,32,0.98)] backdrop-blur-md border-l border-[#00d4ff]/20 flex flex-col transition-transform duration-200 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="User preferences"
      >
        <div className="flex items-center justify-between border-b border-[#00d4ff]/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-[#00d4ff]" />
            <span className="font-mono tracking-wider text-sm text-[#00d4ff]">USER PREFERENCES</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preferences"
            className="rounded-md border border-[rgba(0,212,255,0.25)] bg-[#12121a] p-1.5 text-[#b0dff0] hover:border-[rgba(0,212,255,0.5)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-[#8892a0] font-mono">Display</h3>
            <div className="space-y-2">
              <label className="flex items-center justify-between text-sm text-white">
                <span>Theme</span>
                <select
                  value={prefs.themeMode}
                  onChange={(e) =>
                    setPrefs((prev) => ({
                      ...prev,
                      themeMode: e.target.value as 'dark' | 'light',
                    }))
                  }
                  className="rounded border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-2 py-1 text-sm"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>

              <label className="flex items-center justify-between text-sm text-white">
                <span>Polygon Labels</span>
                <button
                  type="button"
                  onClick={() =>
                    setPrefs((prev) => ({
                      ...prev,
                      showPolygonLabels: !prev.showPolygonLabels,
                    }))
                  }
                  className={`px-3 py-1 rounded text-xs border ${
                    prefs.showPolygonLabels
                      ? 'bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#9eeeff]'
                      : 'bg-[#12121a] border-white/20 text-gray-300'
                  }`}
                >
                  {prefs.showPolygonLabels ? 'Shown' : 'Hidden'}
                </button>
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-[#8892a0] font-mono">Measurements</h3>
            <div className="space-y-2">
              <label className="flex items-center justify-between text-sm text-white">
                <span>Default Unit</span>
                <select
                  value={prefs.defaultUnit}
                  onChange={(e) =>
                    setPrefs((prev) => ({ ...prev, defaultUnit: e.target.value as 'ft' | 'm' }))
                  }
                  className="rounded border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-2 py-1 text-sm"
                >
                  <option value="ft">Feet (ft)</option>
                  <option value="m">Meters (m)</option>
                </select>
              </label>

              <label className="flex items-center justify-between text-sm text-white">
                <span>Decimal Places</span>
                <select
                  value={prefs.decimalPlaces}
                  onChange={(e) =>
                    setPrefs((prev) => ({
                      ...prev,
                      decimalPlaces: Number(e.target.value) as 0 | 1 | 2,
                    }))
                  }
                  className="rounded border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-2 py-1 text-sm"
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-[#8892a0] font-mono">Drawing</h3>
            <div className="space-y-2">
              <label className="flex items-center justify-between text-sm text-white">
                <span>Snap Sensitivity</span>
                <select
                  value={prefs.snapSensitivity}
                  onChange={(e) =>
                    setPrefs((prev) => ({
                      ...prev,
                      snapSensitivity: e.target.value as 'low' | 'med' | 'high',
                    }))
                  }
                  className="rounded border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-2 py-1 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="med">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>

              <label className="flex items-center justify-between text-sm text-white">
                <span>Close Threshold</span>
                <select
                  value={prefs.closeThresholdPx}
                  onChange={(e) =>
                    setPrefs((prev) => ({
                      ...prev,
                      closeThresholdPx: Number(e.target.value) as 15 | 25 | 40,
                    }))
                  }
                  className="rounded border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-2 py-1 text-sm"
                >
                  <option value={15}>15px</option>
                  <option value={25}>25px</option>
                  <option value={40}>40px</option>
                </select>
              </label>

              <div className="text-sm text-white">
                <p className="mb-1">Default Classification Color</p>
                <div className="grid grid-cols-6 gap-1.5 mb-2">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setPrefs((prev) => ({ ...prev, defaultClassificationColor: color }))}
                      className={`h-6 rounded border ${
                        prefs.defaultClassificationColor.toLowerCase() === color.toLowerCase()
                          ? 'border-white ring-1 ring-[#00d4ff]/80'
                          : 'border-[#00d4ff]/30'
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Use color ${color}`}
                    />
                  ))}
                </div>
                <input
                  type="text"
                  value={prefs.defaultClassificationColor}
                  onChange={(e) =>
                    setPrefs((prev) => ({
                      ...prev,
                      defaultClassificationColor: e.target.value,
                    }))
                  }
                  className="w-full rounded border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-2 py-1 text-sm"
                  placeholder="#3b82f6"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-[#8892a0] font-mono">Saving</h3>
            <label className="flex items-center justify-between text-sm text-white">
              <span>Auto-save Interval</span>
              <select
                value={prefs.autoSaveInterval}
                onChange={(e) =>
                  setPrefs((prev) => ({
                    ...prev,
                    autoSaveInterval: Number(e.target.value) as 0 | 30 | 60 | 300,
                  }))
                }
                className="rounded border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-2 py-1 text-sm"
              >
                <option value={0}>Off</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={300}>5 minutes</option>
              </select>
            </label>
          </section>

          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-[#8892a0] font-mono">Notifications</h3>
            <label className="flex items-center justify-between text-sm text-white">
              <span>Toast Duration</span>
              <select
                value={prefs.toastDurationMs}
                onChange={(e) =>
                  setPrefs((prev) => ({
                    ...prev,
                    toastDurationMs: Number(e.target.value) as 2000 | 4000 | 8000,
                  }))
                }
                className="rounded border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-2 py-1 text-sm"
              >
                <option value={2000}>2 seconds</option>
                <option value={4000}>4 seconds</option>
                <option value={8000}>8 seconds</option>
              </select>
            </label>
          </section>
        </div>
      </aside>
    </>
  );
}
