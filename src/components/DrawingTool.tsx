'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { calculatePolygonArea } from '@/lib/polygon-utils';
import type { Point } from '@/lib/types';

export default function DrawingTool() {
  const [points, setPoints] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const addPolygon = useStore((s) => s.addPolygon);
  const classifications = useStore((s) => s.classifications);
  const selectedClassification = useStore((s) => s.selectedClassification);
  const setTool = useStore((s) => s.setTool);
  const scale = useStore((s) => s.scale);
  const currentPage = useStore((s) => s.currentPage);
  const containerRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();
  // Track last click time to detect double-clicks in onClick (before onDoubleClick fires)
  const lastClickTime = useRef<number>(0);

  // Focus on mount so keyboard events (Esc, Enter) work immediately
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Re-focus when clicking anywhere in the draw area (so Esc/Enter always work)
  const handleMouseDown = useCallback(() => {
    containerRef.current?.focus();
  }, []);

  const CLOSE_THRESHOLD = 12;

  const getCoords = useCallback((e: React.MouseEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const getSelectedClassification = useCallback(() => {
    return classifications.find((c) => c.id === selectedClassification) ?? null;
  }, [classifications, selectedClassification]);

  const commitPolygon = useCallback(() => {
    if (points.length < 3) return;
    const cls = getSelectedClassification();
    if (!cls) {
      addToast('Please create or select a classification first', 'warning');
      return;
    }
    const areaPx = calculatePolygonArea(points);
    addPolygon({
      points,
      classificationId: cls.id,
      pageNumber: currentPage || 1,
      area: areaPx,
      linearFeet: 0,
      isComplete: true,
      label: undefined,
    });
    setPoints([]);
    setTool('select');
  }, [points, getSelectedClassification, addPolygon, currentPage, setTool, addToast]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Detect double-click: if two clicks arrive within 300ms, treat as dblclick
      // (the browser also fires onDoubleClick, but this prevents adding an extra point)
      const now = Date.now();
      const isDblClick = now - lastClickTime.current < 300;
      lastClickTime.current = now;
      if (isDblClick) return; // onDoubleClick will handle commit

      const pt = getCoords(e);

      // Guard: require a selected classification before first point
      if (points.length === 0) {
        const cls = getSelectedClassification();
        if (!cls) {
          addToast('Please create or select a classification first', 'warning');
          return;
        }
      }

      // Close polygon if clicking near the first point
      if (points.length >= 3) {
        const dx = pt.x - points[0].x;
        const dy = pt.y - points[0].y;
        if (Math.hypot(dx, dy) < CLOSE_THRESHOLD) {
          commitPolygon();
          return;
        }
      }
      setPoints((prev) => [...prev, pt]);
    },
    [points, getCoords, getSelectedClassification, commitPolygon, addToast]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      commitPolygon();
    },
    [commitPolygon]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => setCursor(getCoords(e)), [getCoords]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setPoints([]); setTool('select'); }
    if (e.key === 'Enter') { commitPolygon(); }
  }, [setTool, commitPolygon]);

  const ppu = scale?.pixelsPerUnit || 1;
  const unit = scale?.unit || 'ft';
  const previewArea = points.length >= 3 ? (calculatePolygonArea(points) / (ppu * ppu)) : 0;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20 cursor-crosshair outline-none"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {/* Drawn edges */}
        {points.map((pt, i) => i > 0 ? (
          <line key={`e-${i}`} x1={points[i-1].x} y1={points[i-1].y} x2={pt.x} y2={pt.y} stroke="#3b82f6" strokeWidth={2} />
        ) : null)}
        {/* Rubber-band line to cursor */}
        {points.length > 0 && cursor && (
          <line x1={points[points.length-1].x} y1={points[points.length-1].y} x2={cursor.x} y2={cursor.y} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 3" />
        )}
        {/* In-progress fill preview */}
        {points.length >= 3 && (
          <polygon points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(59,130,246,0.1)" stroke="none" />
        )}
        {/* Vertex dots */}
        {points.map((pt, i) => (
          <circle key={`p-${i}`} cx={pt.x} cy={pt.y} r={i === 0 && points.length >= 3 ? 8 : 5} fill={i===0?'#10b981':'#3b82f6'} stroke="#fff" strokeWidth={2} />
        ))}
        {/* Crosshair cursor indicator */}
        {cursor && (
          <g>
            <line x1={cursor.x - 10} y1={cursor.y} x2={cursor.x + 10} y2={cursor.y} stroke="#fff" strokeWidth={1.5} opacity={0.8} />
            <line x1={cursor.x} y1={cursor.y - 10} x2={cursor.x} y2={cursor.y + 10} stroke="#fff" strokeWidth={1.5} opacity={0.8} />
            <circle cx={cursor.x} cy={cursor.y} r={3} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {points.length >= 3 && (
        <div className="absolute bg-white/90 border border-blue-200 rounded px-2 py-1 text-xs font-mono text-blue-700 pointer-events-none"
          style={{ left: points.reduce((s,p)=>s+p.x,0)/points.length, top: points.reduce((s,p)=>s+p.y,0)/points.length - 20, transform:'translateX(-50%)' }}>
          {previewArea.toFixed(1)} sq {unit}
        </div>
      )}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
        {points.length === 0 ? 'Click to start drawing polygon' : points.length < 3 ? `${points.length} points — need ${3 - points.length} more to close` : 'Click first point (green), double-click, or Enter to close · Esc to cancel'}
      </div>
    </div>
  );
}
