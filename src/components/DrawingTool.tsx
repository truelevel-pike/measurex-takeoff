'use client';

/**
 * CANVAS COORDINATE SYSTEM
 * ─────────────────────────────────────────────────────────────────────────────
 * - Origin: top-left corner of the rendered PDF page (0, 0).
 * - Units: BASE DIMENSIONS space (baseDims.width × baseDims.height pixels),
 *   independent of the current zoom level or viewport size.
 *   baseDims reflects the intrinsic resolution at which the PDF page was
 *   rasterised; polygons are stored in this space so coordinates remain
 *   stable across zoom changes.
 *
 * Converting from viewport (screen) coordinates to base-space:
 *   canvas_x = (viewport_x / rect.width)  * baseDims.width
 *   canvas_y = (viewport_y / rect.height) * baseDims.height
 *   where rect = containerElement.getBoundingClientRect()
 *
 * Agent state is exposed in the #mx-agent-state <span> element:
 *   data-canvas-width  → baseDims.width  (base-space width of current page)
 *   data-canvas-height → baseDims.height (base-space height of current page)
 *
 * Example (agent usage):
 *   const state = document.getElementById('mx-agent-state');
 *   const bw = Number(state.dataset.canvasWidth);
 *   const bh = Number(state.dataset.canvasHeight);
 *   const canvas = document.querySelector('[data-testid="canvas-area"]');
 *   const rect = canvas.getBoundingClientRect();
 *   // Click at 30 % from left, 50 % from top of the page:
 *   const baseX = 0.30 * bw;
 *   const baseY = 0.50 * bh;
 *   // Corresponding viewport click:
 *   const vx = rect.left + (baseX / bw) * rect.width;
 *   const vy = rect.top  + (baseY / bh) * rect.height;
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { calculatePolygonArea, calculateLinearFeet } from '@/lib/polygon-utils';
import { findNearestSnapPoint, type SnapPoint } from '@/lib/snap-utils';
import type { Point } from '@/lib/types';

const SNAP_SCREEN_PX = 15;

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
  // BUG-A5-H01: read snap/grid settings from store instead of hardcoded constants
  const snappingEnabled = useStore((s) => s.snappingEnabled);
  const gridEnabled = useStore((s) => s.gridEnabled);
  const gridSize = useStore((s) => s.gridSize);
  const snapOptions = { vertices: snappingEnabled, midpoints: snappingEnabled, edges: false, grid: gridEnabled, gridSize };
  // BUG-A7-4-050: memoize snapPolygons to prevent useCallback invalidation
  const snapPolygons = useMemo(() => polygons.filter((polygon) => polygon.pageNumber === drawingPage), [polygons, drawingPage]);
  // BUG-A7-4-051: disable snapping when baseDims are placeholder values
  const snappingActive = snappingEnabled && baseDims.width > 1;
  const containerRef = useRef<HTMLDivElement>(null);
  // Cache the container's bounding rect so rapid clicks never read a stale/zero rect
  // (can happen mid-layout when getBoundingClientRect() is called during a React re-render).
  // Updated on mount and on every resize via ResizeObserver.
  const cachedRectRef = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    cachedRectRef.current = el.getBoundingClientRect();
    // ResizeObserver may be absent in test environments (jsdom) — guard before use
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      cachedRectRef.current = el.getBoundingClientRect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pointsRef = useRef<Point[]>([]);
  // BUG-A7-5-011 fix: track last touch end time for double-tap detection
  const lastTouchEndRef = useRef(0);
  const { addToast } = useToast();

  // Focus on mount so keyboard events (Esc, Enter) work immediately
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const setPointsAndRef = useCallback((next: Point[]) => {
    pointsRef.current = next;
    setPoints(next);
  }, []);

  // Re-focus when clicking anywhere in the draw area (so Esc/Enter always work)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    containerRef.current?.focus();
  }, []);

  const CLOSE_THRESHOLD_PX = 25;

  // Convert click coordinates to base (scale=1) PDF page coordinate space
  // so polygon points are zoom-independent, then snap to nearest vertex/midpoint.
  // DrawingTool sits inside the PDF pan/zoom transform, so rect already reflects the translated position — no need to subtract pan or divide by zoom.
  // Uses cachedRectRef (updated on resize) to avoid stale/zero rect reads during
  // rapid clicks while React is mid-render (fixes BUG-DRAW-002 coordinate drift).
  const getCoords = useCallback((e: React.MouseEvent): Point => {
    // Prefer fresh rect; fall back to cached rect if container temporarily has zero dims.
    const freshRect = containerRef.current?.getBoundingClientRect();
    const rect = (freshRect && freshRect.width > 0 && freshRect.height > 0)
      ? freshRect
      : cachedRectRef.current;
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const x = (clickX / rect.width) * baseDims.width;
    const y = (clickY / rect.height) * baseDims.height;
    // Convert 15 screen-px snap radius to base-space so snapping feels consistent at any zoom
    const screenToBase = baseDims.width / rect.width;
    const snapRadiusBase = SNAP_SCREEN_PX * screenToBase;
    // BUG-A7-4-051: skip snapping when baseDims are placeholder
    if (snappingActive) {
      const snap = findNearestSnapPoint(x, y, snapPolygons, snapRadiusBase, snapOptions);
      if (snap) return { x: snap.x, y: snap.y };
    }
    return { x, y };
  }, [baseDims, snapPolygons, snappingActive, gridEnabled, gridSize]);

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
      label: cls.name,
    });
  }, [getSelectedClassification, addPolygon, drawingPage, addToast]);

  const commitPolygon = useCallback(() => {
    const currentPoints = pointsRef.current;
    const cls = getSelectedClassification();
    const linear = cls?.type === 'linear';
    const minPts = linear ? 2 : 3;
    if (currentPoints.length < minPts) return;
    if (!cls) {
      addToast('Please create or select a classification first', 'warning');
      return;
    }
    const canMeasurePerf =
      typeof performance !== 'undefined' &&
      typeof performance.mark === 'function' &&
      typeof performance.measure === 'function';
    // BUG-A7-4-052: append per-call UUID to performance mark names
    const perfId = canMeasurePerf ? crypto.randomUUID() : '';
    const startMark = `polygon-draw-start-${perfId}`;
    const endMark = `polygon-draw-end-${perfId}`;
    if (canMeasurePerf) performance.mark(startMark);
    const ppu = scale?.pixelsPerUnit || 1;
    // BUG-A5-H02: compute both area and linearFeet for all polygon types.
    // Area polygons get perimeter (closed=true), linear polygons get path length (closed=false).
    const areaPx = linear ? 0 : calculatePolygonArea(currentPoints);
    const linearFeet = linear
      ? calculateLinearFeet(currentPoints, ppu, false)
      : calculateLinearFeet(currentPoints, ppu, true);
    addPolygon({
      points: currentPoints,
      classificationId: cls.id,
      pageNumber: drawingPage,
      area: areaPx,
      linearFeet,
      isComplete: true,
      label: cls.name,
    });
    if (canMeasurePerf) {
      performance.mark(endMark);
      const polyMeasure = performance.measure(`polygon-draw-${perfId}`, startMark, endMark);
      if (typeof window !== 'undefined') {
        if (!window.__perfMarks) window.__perfMarks = { pdfRender: null, aiTakeoff: null, polygonDraw: null };
        window.__perfMarks.polygonDraw = polyMeasure.duration;
      }
    } else if (typeof window !== 'undefined') {
      if (!window.__perfMarks) window.__perfMarks = { pdfRender: null, aiTakeoff: null, polygonDraw: null };
      window.__perfMarks.polygonDraw = null;
    }
    setPointsAndRef([]);
    setTool('select');
  }, [getSelectedClassification, addPolygon, drawingPage, setTool, addToast, scale, setPointsAndRef]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
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
      const currentPoints = pointsRef.current;
      if (clickCls?.type !== 'linear' && currentPoints.length >= 3) {
        const freshR = containerRef.current?.getBoundingClientRect();
        const rect = (freshR && freshR.width > 0) ? freshR : cachedRectRef.current;
        const screenX = rect ? (currentPoints[0].x / baseDims.width) * rect.width + rect.left : 0;
        const screenY = rect ? (currentPoints[0].y / baseDims.height) * rect.height + rect.top : 0;
        const dx = e.clientX - screenX;
        const dy = e.clientY - screenY;
        if (Math.hypot(dx, dy) < CLOSE_THRESHOLD_PX) {
          commitPolygon();
          return;
        }
      }

      // Ignore the second click event in a double-click sequence.
      if (e.detail > 1) return;
      const nextPoints = [...currentPoints, pt];
      setPointsAndRef(nextPoints);
    },
    [getCoords, getSelectedClassification, commitPolygon, placeCountItem, addToast, baseDims, setPointsAndRef]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // BUG-A7-2-013: If the proximity check in handleClick already called
      // commitPolygon (clearing pointsRef), this second event in the
      // double-click sequence would call commitPolygon on empty state.
      if (pointsRef.current.length === 0) return;
      commitPolygon();
    },
    [commitPolygon]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const freshRect = containerRef.current?.getBoundingClientRect();
    const rect = (freshRect && freshRect.width > 0 && freshRect.height > 0)
      ? freshRect
      : cachedRectRef.current;
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const x = (clickX / rect.width) * baseDims.width;
    const y = (clickY / rect.height) * baseDims.height;
    const screenToBase = baseDims.width / rect.width;
    const snapRadiusBase = SNAP_SCREEN_PX * screenToBase;
    if (snappingActive) {
      const snap = findNearestSnapPoint(x, y, snapPolygons, snapRadiusBase, snapOptions);
      if (snap) {
        setCursor({ x: snap.x, y: snap.y });
        setSnapIndicator(snap);
        return;
      }
    }
    setCursor({ x, y });
    setSnapIndicator(null);
  }, [baseDims, snapPolygons, snappingActive, gridEnabled, gridSize]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setPointsAndRef([]); setTool('select'); } // E36: Escape cancel drawing verified
    if (e.key === 'Enter') { commitPolygon(); }
    if (e.key === 'Backspace' && pointsRef.current.length > 0) {
      e.preventDefault();
      setPointsAndRef(pointsRef.current.slice(0, -1));
    }
  }, [setTool, commitPolygon, setPointsAndRef]);

  const hasScale = scale !== null && scale.pixelsPerUnit > 0;
  const ppu = scale?.pixelsPerUnit || 1;
  const unit = scale?.unit || 'ft';
  const cls = getSelectedClassification();
  const isLinear = cls?.type === 'linear';
  const previewArea = points.length >= 3 ? (calculatePolygonArea(points) / (ppu * ppu)) : 0;
  const previewLength = points.length >= 1 && cursor
    ? openPathDistance([...points, cursor], ppu)
    : points.length >= 2
      ? openPathDistance(points, ppu)
      : 0;

  const vb = `0 0 ${baseDims.width} ${baseDims.height}`;

  return (
    <div
      ref={containerRef}
      data-testid="drawing-tool-container"
      className="absolute inset-0 z-20 cursor-crosshair outline-none"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onTouchStart={(e) => {
        e.stopPropagation();
        containerRef.current?.focus();
      }}
      onTouchMove={(e) => {
        if (e.touches.length > 0) {
          const t = e.touches[0];
          handleMouseMove({ clientX: t.clientX, clientY: t.clientY } as unknown as React.MouseEvent);
        }
      }}
      onTouchEnd={(e) => {
        if (e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          const now = Date.now();
          // BUG-A7-5-011 fix: detect double-tap within 300ms → detail:2 → handleDoubleClick
          const isDoubleTap = now - lastTouchEndRef.current < 300;
          lastTouchEndRef.current = now;
          if (isDoubleTap) {
            handleDoubleClick({ preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent);
          } else {
            handleClick({ clientX: t.clientX, clientY: t.clientY, stopPropagation: () => {}, detail: 1 } as unknown as React.MouseEvent);
          }
        }
      }}
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
          <circle data-testid="snap-indicator" cx={cursor.x} cy={cursor.y} r={10} fill="none" stroke="#06b6d4" strokeWidth={2} vectorEffect="non-scaling-stroke" />
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
      {(isLinear ? (points.length >= 1 && cursor) : points.length >= 3) && (
        <div className="absolute bg-white/90 border border-blue-200 rounded px-2 py-1 text-xs font-mono text-blue-700 pointer-events-none"
          style={{
            left: isLinear && cursor
              ? `${(cursor.x / baseDims.width) * 100}%`
              : `${(points.reduce((s,p)=>s+p.x,0)/points.length / baseDims.width) * 100}%`,
            top: isLinear && cursor
              ? `${(cursor.y / baseDims.height) * 100}%`
              : `${(points.reduce((s,p)=>s+p.y,0)/points.length / baseDims.height) * 100}%`,
            transform:'translate(-50%, -28px)',
          }}>
          {hasScale
            ? isLinear
              ? `${previewLength.toFixed(1)} LF`
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
