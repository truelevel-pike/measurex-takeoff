'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';
import { pointInPolygon } from '@/lib/polygon-utils';

/**
 * P2-07: Interactive Cut Tool
 *
 * Phase 1 — select: click on a polygon to pick the cut target.
 * Phase 2 — draw:   click to define cut shape points (like DrawingTool).
 *                   Double-click or Enter to execute cut.
 *                   Escape cancels back to select tool.
 *
 * SVG overlay shows a red/orange dashed preview of the cut shape.
 */
export default function CutTool() {
  const polygons = useStore((s) => s.polygons);
  const currentPage = useStore((s) => s.currentPage);
  const cutPolygon = useStore((s) => s.cutPolygon);
  const setTool = useStore((s) => s.setTool);
  const rawBaseDims = useStore((s) => s.pageBaseDimensions[s.currentPage]);
  const baseDims = useMemo(() => rawBaseDims ?? { width: 1, height: 1 }, [rawBaseDims]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Phase: 'select' | 'draw'
  const [phase, setPhase] = useState<'select' | 'draw'>('select');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [cutPoints, setCutPoints] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);

  const pagePolygons = useMemo(
    () => polygons.filter((p) => p.pageNumber === currentPage),
    [polygons, currentPage]
  );

  // Auto-focus so keyboard works immediately
  useEffect(() => { containerRef.current?.focus(); }, []);

  const getCoords = useCallback(
    (e: React.MouseEvent): Point => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
      return {
        x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
        y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
      };
    },
    [baseDims]
  );

  const findPolygonAt = useCallback(
    (pt: Point) => {
      for (let i = pagePolygons.length - 1; i >= 0; i--) {
        if (pointInPolygon(pt, pagePolygons[i].points)) return pagePolygons[i].id;
      }
      return null;
    },
    [pagePolygons]
  );

  const executeCut = useCallback(() => {
    if (!targetId || cutPoints.length < 3) return;
    cutPolygon(targetId, cutPoints);
    setTool('select');
  }, [targetId, cutPoints, cutPolygon, setTool]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const pt = getCoords(e);

      if (phase === 'select') {
        const hit = findPolygonAt(pt);
        if (hit) {
          setTargetId(hit);
          setPhase('draw');
          setCutPoints([pt]);
        }
        return;
      }

      // draw phase: add point
      setCutPoints((prev) => [...prev, pt]);
    },
    [phase, getCoords, findPolygonAt]
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (phase !== 'draw') return;
      // Remove the last point added by the preceding onClick (dblclick fires click first)
      setCutPoints((prev) => {
        const trimmed = prev.slice(0, -1);
        if (trimmed.length >= 3 && targetId) {
          cutPolygon(targetId, trimmed);
          setTool('select');
        }
        return trimmed;
      });
    },
    [phase, targetId, cutPolygon, setTool]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setCursor(getCoords(e));
    },
    [getCoords]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'draw') {
          // Cancel drawing, return to select phase
          setCutPoints([]);
          setTargetId(null);
          setPhase('select');
        } else {
          setTool('select');
        }
        return;
      }
      if (e.key === 'Enter' && phase === 'draw') {
        executeCut();
      }
      if (e.key === 'Backspace' && phase === 'draw') {
        setCutPoints((prev) => prev.slice(0, -1));
      }
    },
    [phase, executeCut, setTool]
  );

  // SVG viewBox for the cut-shape preview
  const vb = `0 0 ${baseDims.width} ${baseDims.height}`;

  // Build SVG path for the cut shape preview
  const previewPoints = cursor && phase === 'draw' ? [...cutPoints, cursor] : cutPoints;
  const polylineStr = previewPoints.map((p) => `${p.x},${p.y}`).join(' ');

  // Highlight the target polygon border
  const targetPoly = targetId ? pagePolygons.find((p) => p.id === targetId) : null;
  const targetOutlineStr = targetPoly?.points.map((p) => `${p.x},${p.y}`).join(' ') ?? '';

  const instructionText =
    phase === 'select'
      ? 'Click a polygon to cut · Esc to cancel'
      : `Click to define cut shape (${cutPoints.length} pts) · Double-click or Enter to cut · Esc to cancel`;

  return (
    <div
      ref={containerRef}
      data-testid="cut-tool-container"
      className="absolute inset-0 z-30 outline-none"
      style={{ cursor: phase === 'select' ? 'crosshair' : 'crosshair' }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseMove={onMouseMove}
      onKeyDown={onKeyDown}
      onTouchEnd={(e) => {
        if (e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          onClick({ clientX: t.clientX, clientY: t.clientY, stopPropagation: () => {} } as unknown as React.MouseEvent);
        }
      }}
      tabIndex={0}
    >
      {/* SVG overlay for cut shape preview */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox={vb}
        preserveAspectRatio="none"
      >
        {/* Target polygon highlight */}
        {targetOutlineStr && (
          <polygon
            points={targetOutlineStr}
            fill="rgba(255,100,0,0.08)"
            stroke="#ff6400"
            strokeWidth={2}
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Cut shape preview lines */}
        {previewPoints.length >= 2 && (
          <polyline
            data-testid="cut-preview-line"
            points={polylineStr}
            fill="rgba(239,68,68,0.08)"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="8 4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Closing line from last point back to first (when >= 3 pts) */}
        {cutPoints.length >= 2 && cursor && (
          <line
            x1={cutPoints[0].x}
            y1={cutPoints[0].y}
            x2={cursor.x}
            y2={cursor.y}
            stroke="#ef4444"
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.4}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Vertex dots */}
        {cutPoints.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={i === 0 ? 6 : 4}
            fill={i === 0 ? '#fb923c' : '#ef4444'}
            stroke="#fff"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Cursor dot */}
        {cursor && phase === 'draw' && (
          <circle
            cx={cursor.x}
            cy={cursor.y}
            r={3}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Instruction HUD */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[rgba(10,10,15,0.88)] border border-red-500/40 text-[#fca5a5] text-xs px-3 py-1.5 rounded-full pointer-events-none shadow-[0_0_12px_rgba(239,68,68,0.3)] whitespace-nowrap">
        {instructionText}
      </div>

      {/* Execute button when enough points */}
      {phase === 'draw' && cutPoints.length >= 3 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <button
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-lg"
            onClick={(e) => { e.stopPropagation(); executeCut(); }}
          >
            Cut ({cutPoints.length} pts)
          </button>
        </div>
      )}
    </div>
  );
}
