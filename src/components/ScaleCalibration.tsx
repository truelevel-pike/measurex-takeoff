'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';

// Manual scale calibration overlay (modal-style). Click two points, enter real distance, choose unit.
export default function ScaleCalibration() {
  const [pts, setPts] = useState<Point[]>([]);
  const [distance, setDistance] = useState<string>('');
  const [unit, setUnit] = useState<'ft'|'in'|'m'|'mm'>('ft');

  const setScale = useStore((s) => s.setScale);
  const setScaleForPage = useStore((s) => s.setScaleForPage);
  const currentPage = useStore((s) => s.currentPage);
  const setTool = useStore((s) => s.setTool);

  const containerRef = useRef<HTMLDivElement>(null);

  const getCoords = useCallback((e: React.MouseEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    const p = getCoords(e);
    setPts((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
  }, [getCoords]);

  const pxDistance = useMemo(() => {
    if (pts.length < 2) return 0;
    const a = pts[0], b = pts[1];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }, [pts]);

  const onSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const real = parseFloat(distance);
    if (!real || real <= 0 || pxDistance <= 0) return;

    // pixelsPerUnit = pixels / realUnits
    const pixelsPerUnit = pxDistance / real;
    const label = unit === 'ft' ? `${real} ft` : unit === 'in' ? `${real} in` : unit === 'm' ? `${real} m` : `${real} mm`;

    const cal = { pixelsPerUnit, unit, label, source: 'manual' as const };
    setScale(cal);
    const pageNo = (typeof currentPage === 'number') ? currentPage : (currentPage && (currentPage as any).pageNumber) ? (currentPage as any).pageNumber : 1;
    setScaleForPage?.(pageNo, cal);
    setTool('select');
  }, [distance, unit, pxDistance, setScale, setScaleForPage, setTool, currentPage]);

  const onCancel = useCallback(() => {
    setTool('select');
  }, [setTool]);

  return (
    <div ref={containerRef} className="absolute inset-0 z-40" onClick={onClick}>
      {/* Line preview */}
      {pts.length >= 1 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {pts[1] ? (
            <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke="#22c55e" strokeWidth={2} />
          ) : (
            <circle cx={pts[0].x} cy={pts[0].y} r={6} fill="#22c55e" />
          )}
        </svg>
      )}

      {/* Modal card */}
      <div className="absolute top-8 right-8 bg-white rounded-lg shadow-xl border border-zinc-200 p-4 w-80">
        <div className="text-sm font-semibold text-zinc-800 mb-2">Manual Scale Calibration</div>
        <div className="text-xs text-zinc-500 mb-3">
          Click two known-distance points on the drawing, then enter the real distance and unit.
        </div>
        <div className="text-xs mb-3">
          Pixel distance: <span className="font-mono">{pxDistance.toFixed(1)} px</span>
        </div>
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <input
            type="number"
            className="flex-1 border rounded px-2 py-1 text-sm"
            placeholder="Distance"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            min={0}
            step="0.01"
            required
          />
          <select
            className="border rounded px-2 py-1 text-sm"
            value={unit}
            onChange={(e) => setUnit(e.target.value as any)}
          >
            <option value="ft">ft</option>
            <option value="in">in</option>
            <option value="m">m</option>
            <option value="mm">mm</option>
          </select>
          <button type="submit" className="bg-green-600 text-white rounded px-3 py-1 text-sm">Save</button>
          <button type="button" onClick={onCancel} className="border rounded px-3 py-1 text-sm">Cancel</button>
        </form>
      </div>

      {/* Instructions */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
        {pts.length < 1 ? 'Click first point' : pts.length < 2 ? 'Click second point' : 'Adjust or enter distance and Save'}
      </div>
    </div>
  );
}
