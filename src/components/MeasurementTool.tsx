'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';

type Unit = 'ft' | 'in' | 'm' | 'mm';

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

  const containerRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  const getCoords = useCallback((e: React.MouseEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

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
      {start && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {lineEnd && (
            <line
              x1={start.x}
              y1={start.y}
              x2={lineEnd.x}
              y2={lineEnd.y}
              stroke="#0ea5e9"
              strokeWidth={2}
            />
          )}
          <circle cx={start.x} cy={start.y} r={5} fill="#0ea5e9" stroke="#ffffff" strokeWidth={2} />
          {lineEnd && <circle cx={lineEnd.x} cy={lineEnd.y} r={5} fill="#0ea5e9" stroke="#ffffff" strokeWidth={2} />}
        </svg>
      )}

      {start && lineEnd && midpoint && (
        <div
          className="absolute bg-white/95 border border-sky-200 rounded px-2 py-1 text-xs font-mono text-sky-700 pointer-events-none"
          style={{
            left: midpoint.x,
            top: midpoint.y - 18,
            transform: 'translateX(-50%)',
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
