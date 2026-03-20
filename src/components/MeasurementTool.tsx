'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';

type Unit = 'ft' | 'in' | 'm' | 'mm' | 'cm';

function formatDistance(distanceInUnit: number, unit: Unit): string {
  if (!Number.isFinite(distanceInUnit)) return `0 ${unit}`;

  if (unit === 'ft') {
    const totalInches = distanceInUnit * 12;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches - feet * 12;
    return `${feet}' ${inches.toFixed(1)}"`;
  }

  if (unit === 'in') return `${distanceInUnit.toFixed(2)} in`;
  if (unit === 'm') return `${distanceInUnit.toFixed(3)} m`;
  return `${distanceInUnit.toFixed(2)} ${unit}`;
}

export default function MeasurementTool() {
  const scale = useStore((s) => s.scale);
  const setTool = useStore((s) => s.setTool);
  // BUG-A6-5-021 fix: get base PDF dimensions to normalise mouse coords to PDF coordinate space
  const rawBaseDims = useStore((s) => s.pageBaseDimensions[s.currentPage]);
  const baseDims = rawBaseDims ?? { width: 1, height: 1 };

  const containerRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  const getCoords = useCallback((e: React.MouseEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    // BUG-A6-5-021 fix: normalise screen pixel offsets to base PDF coordinate space.
    // Every other drawing tool (DrawingTool, CanvasOverlay, CropOverlay, CutTool) does this.
    // Without it, at zoom ≠ 100% all measurements are in screen pixels, not real-world units.
    return {
      x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
      y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
    };
  }, [baseDims]);

  const reset = useCallback(() => {
    setStart(null);
    setEnd(null);
    setCursor(null);
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    const p = getCoords(e);
    if (!start) {
      setStart(p);
      setEnd(null);
      setCursor(null);
      return;
    }
    if (!end) {
      setEnd(p);
      return;
    }
    setStart(p);
    setEnd(null);
    setCursor(null);
  }, [getCoords, start, end]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!start || end) return;
    setCursor(getCoords(e));
  }, [getCoords, start, end]);

  const onEscape = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      reset();
      setTool('select');
    }
  }, [reset, setTool]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onEscape(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const lineEnd = end ?? cursor;

  const pxDistance = useMemo(() => {
    if (!start || !lineEnd) return 0;
    const a = start;
    const b = lineEnd;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }, [start, lineEnd]);

  const realDistance = useMemo(() => {
    if (!scale || scale.pixelsPerUnit <= 0 || pxDistance <= 0) return null;
    return pxDistance / scale.pixelsPerUnit;
  }, [scale, pxDistance]);

  const unit: Unit = scale?.unit ?? 'ft';
  const midpoint = useMemo(() => {
    if (!start || !lineEnd) return null;
    return {
      x: (start.x + lineEnd.x) / 2,
      y: (start.y + lineEnd.y) / 2,
    };
  }, [start, lineEnd]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-40"
      onClick={onClick}
      onMouseMove={onMouseMove}
      onKeyDown={onEscape}
      tabIndex={0}
      style={{ cursor: 'crosshair' }}
    >
      {/* BUG-A7-5-040 fix: use viewBox matching base PDF dims so coords render
          correctly at any zoom level */}
      {start && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${baseDims.width} ${baseDims.height}`}
          preserveAspectRatio="none"
        >
          {lineEnd && (
            <line
              x1={start.x}
              y1={start.y}
              x2={lineEnd.x}
              y2={lineEnd.y}
              stroke="#0ea5e9"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <circle cx={start.x} cy={start.y} r={5} fill="#0ea5e9" stroke="#ffffff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {lineEnd && <circle cx={lineEnd.x} cy={lineEnd.y} r={5} fill="#0ea5e9" stroke="#ffffff" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        </svg>
      )}

      {/* BUG-A7-5-040+048 fix: position label using percentage of container so it
          stays correct at any zoom level */}
      {start && lineEnd && midpoint && (
        <div
          className="absolute bg-white/95 border border-sky-200 rounded px-2 py-1 text-xs font-mono text-sky-700 pointer-events-none"
          style={{
            left: `${(midpoint.x / baseDims.width) * 100}%`,
            top: `${(midpoint.y / baseDims.height) * 100}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {realDistance !== null ? formatDistance(realDistance, unit) : `${pxDistance.toFixed(1)} px`}
        </div>
      )}

      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
        {!start ? 'Click first point · Esc to cancel' : !end ? 'Click second point · Esc to cancel' : 'Click to start a new measurement · Esc to cancel'}
      </div>
    </div>
  );
}
