'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { calculatePolygonArea, calculateLinearFeet } from '@/lib/polygon-utils';
import { findNearestSnapPoint, type SnapPoint } from '@/lib/snap-utils';
import type { Point } from '@/lib/types';

const SNAP_SCREEN_PX = 15;
const SNAP_OPTIONS = { vertices: true, midpoints: true, edges: false, grid: false, gridSize: 0 } as const;

function openPathDistance(pts: Point[], ppu: number): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.sqrt((pts[i].x - pts[i - 1].x) ** 2 + (pts[i].y - pts[i - 1].y) ** 2);
  }
  return total / ppu;
}

export default function DrawingTool() {
  const [points, setPoints] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<SnapPoint | null>(null);
  const addPolygon = useStore((s) => s.addPolygon);
  const polygons = useStore((s) => s.polygons);
  const classifications = useStore((s) => s.classifications);
  const selectedClassification = useStore((s) => s.selectedClassification);
  const setTool = useStore((s) => s.setTool);
  const scale = useStore((s) => s.scale);
  const currentPage = useStore((s) => s.currentPage);
  const drawingPage = currentPage || 1;
  const baseDims = useStore((s) => s.pageBaseDimensions[s.currentPage] ?? { width: 1, height: 1 });
  const snapPolygons = polygons.filter((polygon) => polygon.pageNumber === drawingPage);
  const containerRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();
  // Pending single-click timeout — cancelled if a double-click arrives within 250ms
  const pendingClickTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus on mount so keyboard events (Esc, Enter) work immediately
  useEffect(() => {
    containerRef.current?.focus();
    return () => {
      if (pendingClickTimeout.current) clearTimeout(pendingClickTimeout.current);
    };
  }, []);

  // Re-focus when clicking anywhere in the draw area (so Esc/Enter always work)
  const handleMouseDown = useCallback(() => {
    containerRef.current?.focus();
  }, []);

  const CLOSE_THRESHOLD_PX = 25;

  // Convert click coordinates to base (scale=1) PDF page coordinate space
  // so polygon points are zoom-independent, then snap to nearest vertex/midpoint
  const getCoords = useCallback((e: React.MouseEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const x = (clickX / rect.width) * baseDims.width;
    const y = (clickY / rect.height) * baseDims.height;
    // Convert 15 screen-px snap radius to base-space so snapping feels consistent at any zoom
    const screenToBase = baseDims.width / rect.width;
    const snapRadiusBase = SNAP_SCREEN_PX * screenToBase;
    const snap = findNearestSnapPoint(x, y, snapPolygons, snapRadiusBase, SNAP_OPTIONS);
    if (snap) return { x: snap.x, y: snap.y };
    return { x, y };
  }, [baseDims, snapPolygons]);

  const getSelectedClassification = useCallback(() => {
    return classifications.find((c) => c.id === selectedClassification) ?? null;
  }, [classifications, selectedClassification]);

  const placeCountItem = useCallback((pt: Point) => {
    const cls = getSelectedClassification();
    if (!cls) {
      addToast('Please create or select a classification first', 'warning');
      return;
    }
    addPolygon({
      points: [pt],
      classificationId: cls.id,
      pageNumber: drawingPage,
      area: 0,
      linearFeet: 0,
      isComplete: true,
      label: undefined,
    });
  }, [getSelectedClassification, addPolygon, drawingPage, addToast]);

  const commitPolygon = useCallback(() => {
    const cls = getSelectedClassification();
    const linear = cls?.type === 'linear';
    const minPts = linear ? 2 : 3;
    if (points.length < minPts) return;
    if (!cls) {
      addToast('Please create or select a classification first', 'warning');
      return;
    }
    performance.mark('polygon-draw-start');
    const areaPx = linear ? 0 : calculatePolygonArea(points);
    const ppu = scale?.pixelsPerUnit || 1;
    const linearFeet = linear ? calculateLinearFeet(points, ppu, false) : 0;
    addPolygon({
      points,
      classificationId: cls.id,
      pageNumber: drawingPage,
      area: areaPx,
      linearFeet,
      isComplete: true,
      label: undefined,
    });
    performance.mark('polygon-draw-end');
    const polyMeasure = performance.measure('polygon-draw', 'polygon-draw-start', 'polygon-draw-end');
    if (typeof window !== 'undefined') {
      if (!window.__perfMarks) window.__perfMarks = { pdfRender: null, aiTakeoff: null, polygonDraw: null };
      window.__perfMarks.polygonDraw = polyMeasure.duration;
    }
    setPoints([]);
    setTool('select');
  }, [points, getSelectedClassification, addPolygon, drawingPage, setTool, addToast, scale]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const pt = getCoords(e);

      // Guard: require a selected classification before first point
      const cls = getSelectedClassification();
      if (!cls) {
        addToast('Please create or select a classification first', 'warning');
        return;
      }

      // Count mode: single click = place one count marker, stay in draw mode
      if (cls.type === 'count') {
        placeCountItem(pt);
        return;
      }

      // Close polygon if clicking near the first point (area mode only)
      const clickCls = cls;
      if (clickCls?.type !== 'linear' && points.length >= 3) {
        const rect = containerRef.current?.getBoundingClientRect();
        const screenX = rect ? (points[0].x / baseDims.width) * rect.width + rect.left : 0;
        const screenY = rect ? (points[0].y / baseDims.height) * rect.height + rect.top : 0;
        const dx = e.clientX - screenX;
        const dy = e.clientY - screenY;
        if (Math.hypot(dx, dy) < CLOSE_THRESHOLD_PX) {
          if (pendingClickTimeout.current) {
            clearTimeout(pendingClickTimeout.current);
            pendingClickTimeout.current = null;
          }
          commitPolygon();
          return;
        }
      }

      // Defer point addition so onDoubleClick can cancel the phantom point
      if (pendingClickTimeout.current) {
        clearTimeout(pendingClickTimeout.current);
      }
      pendingClickTimeout.current = setTimeout(() => {
        pendingClickTimeout.current = null;
        setPoints((prev) => [...prev, pt]);
      }, 250);
    },
    [points, getCoords, getSelectedClassification, commitPolygon, placeCountItem, addToast, baseDims]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Cancel the pending single-click point so it never gets added
      if (pendingClickTimeout.current) {
        clearTimeout(pendingClickTimeout.current);
        pendingClickTimeout.current = null;
      }
      commitPolygon();
    },
    [commitPolygon]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const x = (clickX / rect.width) * baseDims.width;
    const y = (clickY / rect.height) * baseDims.height;
    const screenToBase = baseDims.width / rect.width;
    const snapRadiusBase = SNAP_SCREEN_PX * screenToBase;
    const snap = findNearestSnapPoint(x, y, snapPolygons, snapRadiusBase, SNAP_OPTIONS);
    if (snap) {
      setCursor({ x: snap.x, y: snap.y });
      setSnapIndicator(snap);
    } else {
      setCursor({ x, y });
      setSnapIndicator(null);
    }
  }, [baseDims, snapPolygons]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setPoints([]); setTool('select'); }
    if (e.key === 'Enter') { commitPolygon(); }
    if (e.key === 'Backspace' && points.length > 0) {
      e.preventDefault();
      setPoints((prev) => prev.slice(0, -1));
    }
  }, [setTool, commitPolygon, points.length]);

  const hasScale = scale !== null && scale.pixelsPerUnit > 0;
  const ppu = scale?.pixelsPerUnit || 1;
  const unit = scale?.unit || 'ft';
  const cls = getSelectedClassification();
  const isLinear = cls?.type === 'linear';
  const previewArea = points.length >= 3 ? (calculatePolygonArea(points) / (ppu * ppu)) : 0;
  const previewLength = points.length >= 2 ? openPathDistance(points, ppu) : 0;

  const vb = `0 0 ${baseDims.width} ${baseDims.height}`;

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
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={vb} preserveAspectRatio="none">
        {/* Drawn edges */}
        {points.map((pt, i) => i > 0 ? (
          <line key={`e-${i}`} x1={points[i-1].x} y1={points[i-1].y} x2={pt.x} y2={pt.y} stroke="#3b82f6" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ) : null)}
        {/* Rubber-band line to cursor */}
        {points.length > 0 && cursor && (
          <line x1={points[points.length-1].x} y1={points[points.length-1].y} x2={cursor.x} y2={cursor.y} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
        )}
        {/* In-progress fill preview (area only) */}
        {!isLinear && points.length >= 3 && (
          <polygon points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(59,130,246,0.1)" stroke="none" />
        )}
        {/* Vertex dots — no green close-indicator for linear */}
        {points.map((pt, i) => (
          <circle key={`p-${i}`} cx={pt.x} cy={pt.y} r={!isLinear && i === 0 && points.length >= 3 ? 8 : 5} fill={!isLinear && i === 0 ? '#10b981' : '#3b82f6'} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
        {/* Snap indicator — yellow ring when cursor is snapped */}
        {snapIndicator && cursor && (
          <circle cx={cursor.x} cy={cursor.y} r={10} fill="none" stroke="#fbbf24" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
        {/* Crosshair cursor indicator */}
        {cursor && (
          <g>
            <line x1={cursor.x - 10} y1={cursor.y} x2={cursor.x + 10} y2={cursor.y} stroke="#fff" strokeWidth={1.5} opacity={0.8} vectorEffect="non-scaling-stroke" />
            <line x1={cursor.x} y1={cursor.y - 10} x2={cursor.x} y2={cursor.y + 10} stroke="#fff" strokeWidth={1.5} opacity={0.8} vectorEffect="non-scaling-stroke" />
            <circle cx={cursor.x} cy={cursor.y} r={3} fill="none" stroke="#3b82f6" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {(isLinear ? points.length >= 2 : points.length >= 3) && (
        <div className="absolute bg-white/90 border border-blue-200 rounded px-2 py-1 text-xs font-mono text-blue-700 pointer-events-none"
          style={{
            left: `${(points.reduce((s,p)=>s+p.x,0)/points.length / baseDims.width) * 100}%`,
            top: `${(points.reduce((s,p)=>s+p.y,0)/points.length / baseDims.height) * 100}%`,
            transform:'translate(-50%, -20px)',
          }}>
          {hasScale
            ? isLinear
              ? `${previewLength.toFixed(1)} ${unit}`
              : `${previewArea.toFixed(1)} sq ${unit}`
            : '(Scale not set)'}
        </div>
      )}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none">
        {cls?.type === 'count'
          ? 'Click to place count marker · Esc to finish'
          : isLinear
            ? points.length === 0
              ? 'Click to draw line — double-click or Enter to finish'
              : points.length < 2
                ? `${points.length} point — need 1 more`
                : 'Click to add points · double-click or Enter to finish · Esc to cancel'
            : points.length === 0
              ? 'Click to start drawing polygon'
              : points.length < 3
                ? `${points.length} points — need ${3 - points.length} more to close`
                : 'Click first point (green), double-click, or Enter to close · Esc to cancel'}
      </div>
    </div>
  );
}
