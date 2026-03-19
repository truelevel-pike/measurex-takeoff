'use client';

import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Undo2, Redo2, Pen } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useQuickTakeoff } from '@/lib/quick-takeoff';

export default function QuickTakeoffMode() {
  const { isActive, toggle, nextClassification, prevClassification, currentClassification } = useQuickTakeoff();
  const polygons = useStore((s) => s.polygons);
  const currentPage = useStore((s) => s.currentPage);
  const currentTool = useStore((s) => s.currentTool);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const undoStack = useStore((s) => s.undoStack);
  const redoStack = useStore((s) => s.redoStack);

  const polygonCount = useMemo(() => {
    if (!currentClassification) return 0;
    return polygons.filter(
      (polygon) =>
        polygon.pageNumber === currentPage &&
        polygon.classificationId === currentClassification.id
    ).length;
  }, [currentClassification, currentPage, polygons]);

  if (!isActive) return null;

  const toolLabel = currentTool === 'draw' ? 'Draw' : currentTool === 'select' ? 'Select' : currentTool;

  return (
    <aside
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-4"
      aria-label="Quick Takeoff Mode HUD"
      role="region"
    >
      <div
        className="flex min-h-[72px] w-[min(96vw,900px)] items-center gap-3 rounded-2xl px-4 py-3"
        style={{
          background: 'rgba(12, 15, 22, 0.82)',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: '0 10px 32px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {/* Undo / Redo */}
        <button
          type="button"
          onClick={undo}
          disabled={undoStack.length === 0}
          aria-label="Undo"
          title="Undo"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border text-white transition hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderColor: 'rgba(255,255,255,0.2)' }}
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={redoStack.length === 0}
          aria-label="Redo"
          title="Redo"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border text-white transition hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderColor: 'rgba(255,255,255,0.2)' }}
        >
          <Redo2 size={18} />
        </button>

        {/* Current tool indicator */}
        <div className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-zinc-300" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
          <Pen size={14} className="text-[#00d4ff]" />
          <span className="capitalize">{toolLabel}</span>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/15" />

        <button
          type="button"
          onClick={prevClassification}
          aria-label="Previous classification"
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl border text-white transition hover:bg-white/10"
          style={{ borderColor: 'rgba(255,255,255,0.2)' }}
          disabled={!currentClassification}
        >
          <ChevronLeft size={28} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-6 w-6 shrink-0 rounded-md border"
              style={{
                backgroundColor: currentClassification?.color ?? '#6b7280',
                borderColor: 'rgba(255,255,255,0.45)',
              }}
            />
            <p className="truncate text-xl font-semibold tracking-wide text-white">
              {currentClassification?.name ?? 'No classification selected'}
            </p>
          </div>
          <p className="mt-1 text-base font-medium text-zinc-300">
            {polygonCount} polygon{polygonCount === 1 ? '' : 's'} on page {currentPage}
          </p>
        </div>

        <button
          type="button"
          onClick={nextClassification}
          aria-label="Next classification"
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl border text-white transition hover:bg-white/10"
          style={{ borderColor: 'rgba(255,255,255,0.2)' }}
          disabled={!currentClassification}
        >
          <ChevronRight size={28} />
        </button>

        <button
          type="button"
          onClick={toggle}
          className="rounded-xl border px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          style={{ borderColor: 'rgba(255,255,255,0.24)' }}
          aria-label="Exit quick takeoff mode"
        >
          Exit Quick Mode (F)
        </button>
      </div>
    </aside>
  );
}
