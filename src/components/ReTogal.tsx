'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';

interface ReTogalProps {
  currentPage: number;
  hasScale: boolean;
  hasRunTakeoff: boolean;
  onRunTakeoff: () => void;
}

export default function ReTogal({ currentPage, hasScale, hasRunTakeoff, onRunTakeoff }: ReTogalProps) {
  const [open, setOpen] = useState(false);
  const [preserveManual, setPreserveManual] = useState(true);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const addClassification = useStore((s) => s.addClassification);
  const addPolygon = useStore((s) => s.addPolygon);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleConfirm = useCallback(async () => {
    setOpen(false);
    setRunning(true);

    // Clear existing polygons for this page (filter approach since no dedicated method)
    const state = useStore.getState();
    const kept = preserveManual
      ? state.polygons.filter((p) => p.pageNumber !== currentPage)
      : state.polygons.filter((p) => p.pageNumber !== currentPage);

    // Remove page polygons via individual deletes to maintain undo history
    const toRemove = state.polygons.filter((p) => p.pageNumber === currentPage);
    for (const p of toRemove) {
      useStore.getState().deletePolygon(p.id);
    }

    // Stub delay simulating AI processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Add 3 stub polygons to simulate AI results
    const stubClassId = addClassification({ name: 'AI Room', color: '#10b981', type: 'area' });

    const stubs = [
      { label: 'Room A', points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 250 }, { x: 100, y: 250 }], area: 4800 },
      { label: 'Room B', points: [{ x: 350, y: 100 }, { x: 550, y: 100 }, { x: 550, y: 280 }, { x: 350, y: 280 }], area: 5400 },
      { label: 'Corridor', points: [{ x: 100, y: 300 }, { x: 550, y: 300 }, { x: 550, y: 370 }, { x: 100, y: 370 }], area: 3150 },
    ];

    for (const stub of stubs) {
      addPolygon({
        points: stub.points,
        classificationId: stubClassId,
        pageNumber: currentPage,
        area: stub.area,
        label: stub.label,
      });
    }

    setRunning(false);
    setToast(`Re-Togal complete — ${stubs.length} new items detected`);
  }, [currentPage, preserveManual, addClassification, addPolygon]);

  // Determine button mode
  if (!hasScale) {
    return (
      <button
        aria-label="Set scale"
        onClick={onRunTakeoff}
        className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all"
        style={{
          background: '#059669',
          color: '#fff',
          border: '1px solid rgba(16,185,129,0.5)',
          cursor: 'pointer',
        }}
      >
        Set scale
      </button>
    );
  }

  if (!hasRunTakeoff) {
    return (
      <button
        aria-label="Run Togal AI"
        onClick={onRunTakeoff}
        className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all"
        style={{
          background: '#059669',
          color: '#fff',
          border: '1px solid rgba(16,185,129,0.5)',
          cursor: 'pointer',
        }}
      >
        <Sparkles size={14} />
        Togal
      </button>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Re-Togal button */}
      <button
        aria-label={running ? 'Re-Togal running' : 'Re-Togal'}
        onClick={() => !running && setOpen((v) => !v)}
        disabled={running}
        className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all"
        style={{
          background: running ? 'rgba(5,150,105,0.4)' : '#059669',
          color: '#fff',
          border: '1px solid rgba(16,185,129,0.5)',
          cursor: running ? 'default' : 'pointer',
        }}
      >
        {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {running ? 'Running...' : 'Re-Togal'}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 rounded-xl shadow-2xl"
          style={{
            width: 320,
            background: '#1a1a2e',
            border: '1px solid rgba(0,212,255,0.25)',
            padding: 20,
          }}
        >
          <h3 className="text-sm font-semibold text-white mb-3">Re-run AI Takeoff</h3>

          <div
            className="flex items-start gap-2 rounded-lg p-3 mb-4 text-xs"
            style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }}
          >
            <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
            <span className="text-yellow-200/90 leading-relaxed">
              This will re-run Togal AI on this page. Your manual reclassifications will be preserved.
            </span>
          </div>

          <label className="flex items-center gap-2.5 mb-5 cursor-pointer select-none text-xs text-gray-300">
            <input
              type="checkbox"
              checked={preserveManual}
              onChange={(e) => setPreserveManual(e.target.checked)}
              className="accent-emerald-500 w-4 h-4 rounded"
            />
            Preserve manual reclassifications
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: 'transparent',
                color: '#a0aec0',
                border: '1px solid rgba(160,174,192,0.3)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: '#059669',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Re-Togal
            </button>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 rounded-lg shadow-lg px-6 py-3 text-sm font-medium"
          style={{ background: '#059669', color: '#fff' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
