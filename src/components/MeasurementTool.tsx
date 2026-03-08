'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';

// Two-point distance measurement overlay — shows real-world units using current scale calibration
export default function MeasurementTool() {
  const scale = useStore((s) => s.scale); // { pixelsPerUnit, unit }
  const setTool = useStore((s) => s.setTool);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pts, setPts] = useState<Point[]>([]);

  const getCoords = useCallback((e: React.MouseEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    const p = getCoords(e);
    setPts((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
  }, [getCoords]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setPts([]);
      setTool('select');
    }
  }, [setTool]);

  const pxDistance = useMemo(() => {
    if (pts.length < 2) return 0;
    const a = pts[0], b = pts[1];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }, [pts]);

  const realDistance = useMemo(() => {
    if (!scale || scale.pixelsPerUnit <= 0 || pxDistance <= 0) return null;
    return pxDistance / scale.pixelsPerUnit;
  }, [scale, pxDistance]);

  const unit = scale?.unit ?? 'ft';

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-40"
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
      style={{ cursor: 'crosshair' }}
    >
      {/* Line preview and markers */}
      {pts.length >= 1 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {pts[1] ? (
            <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke="#0ea5e9" strokeWidth={2} />
          ) : (
            <circle cx={pts[0].x} cy={pts[0].y} r={6} fill="#0ea5e9" />
          )}
        </svg>
      )}

      {/* Distance label at midpoint */}
      {pts.length === 2 && (
        <div
          className="absolute bg-white/95 border border-sky-200 rounded px-2 py-1 text-xs font-mono text-sky-700 pointer-events-none"
          style={{
            left: (pts[0].x + pts[1].x) / 2,
            top: (pts[0].y + pts[1].y) / 2 - 18,
            transform: 'translateX(-50%)',
          }}
        >
          {realDistance !== null ? `${realDistance.toFixed(2)} ${unit}` : `${pxDistance.toFixed(1)} px`}
        </div>
      )}

      {/* Instructions */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
        {pts.length < 1 ? 'Click first point · Esc to exit' : pts.length < 2 ? 'Click second point · Esc to exit' : 'Click anywhere to start a new measurement · Esc to exit'}
      </div>
    </div>
  );
}
