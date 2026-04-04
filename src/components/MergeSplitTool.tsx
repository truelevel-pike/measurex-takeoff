'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Point, Polygon } from '@/lib/types';
import { pointInPolygon, calculatePolygonArea } from '@/lib/polygon-utils';
import { useToast } from '@/components/Toast';

export default function MergeSplitTool() {
  const polygons = useStore((s) => s.polygons);
  const currentPage = useStore((s) => s.currentPage);
  const currentTool = useStore((s) => s.currentTool);
  const setTool = useStore((s) => s.setTool);
  const merge = useStore((s) => s.mergePolygons);
  const split = useStore((s) => s.splitPolygon);
  const setSelectedPolygon = useStore((s) => s.setSelectedPolygon);
  // BUG-A7-5-041 fix: get base PDF dims for coordinate conversion
  const rawBaseDims = useStore((s) => s.pageBaseDimensions[s.currentPage]);
  const baseDims = useMemo(() => rawBaseDims ?? { width: 1, height: 1 }, [rawBaseDims]);
  const { addToast } = useToast();

  const containerRef = useRef<HTMLDivElement>(null);

  const [firstPolyId, setFirstPolyId] = useState<string | null>(null);
  const [splitPolyId, setSplitPolyId] = useState<string | null>(null);
  const [splitPts, setSplitPts] = useState<Point[]>([]);
  // R-006: track cursor for split preview line
  const [cursor, setCursor] = useState<Point | null>(null);

  const isMerge = currentTool === 'merge';
  const isSplit = currentTool === 'split';

  const instruction = useMemo(() => {
    if (isMerge) {
      return firstPolyId ? 'Click second polygon to merge · Esc to cancel' : 'Click first polygon to merge · Esc to cancel';
    }
    if (isSplit) {
      if (!splitPolyId) return 'Click a polygon to split · Esc to cancel';
      if (splitPts.length === 0) return 'Click first point of split line';
      if (splitPts.length === 1) return 'Click second point to split · Esc to cancel';
    }
    return '';
  }, [isMerge, isSplit, firstPolyId, splitPolyId, splitPts.length]);

  // BUG-A7-5-041 fix: convert screen pixels to base PDF coords
  const getCoords = useCallback((e: React.MouseEvent | MouseEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
      y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
    };
  }, [baseDims]);

  // BUG-A7-5-042 fix: filter by currentPage so merge/split only hits visible polygons
  const pagePolygons = useMemo(
    () => polygons.filter((p) => p.pageNumber === currentPage),
    [polygons, currentPage],
  );

  const findPolygonAt = useCallback((pt: Point) => {
    for (let i = pagePolygons.length - 1; i >= 0; i--) {
      if (pointInPolygon(pt, pagePolygons[i].points)) return pagePolygons[i].id;
    }
    return null;
  }, [pagePolygons]);

  // P2-06: target polygon for highlight
  const targetPoly: Polygon | undefined = useMemo(() => {
    const targetId = splitPolyId ?? firstPolyId;
    return targetId ? pagePolygons.find((p) => p.id === targetId) : undefined;
  }, [splitPolyId, firstPolyId, pagePolygons]);

  const resetState = useCallback(() => {
    setFirstPolyId(null);
    setSplitPolyId(null);
    setSplitPts([]);
    setCursor(null);
    setTool('select');
  }, [setTool]);

  const onClick = useCallback((e: React.MouseEvent) => {
    const pt = getCoords(e);
    if (isMerge) {
      const hit = findPolygonAt(pt);
      if (!hit) return;
      if (!firstPolyId) {
        setFirstPolyId(hit);
        return;
      }
      // BUG-A7-4-058: verify first polygon still exists before merge
      if (!polygons.some((p) => p.id === firstPolyId)) {
        addToast('First polygon was deleted — please start over', 'warning');
        setFirstPolyId(null);
        return;
      }
      if (hit !== firstPolyId) {
        merge(firstPolyId, hit);
        setFirstPolyId(null);
        setTool('select');
      }
      return;
    }
    if (isSplit) {
      if (!splitPolyId) {
        const hit = findPolygonAt(pt);
        if (!hit) return;
        setSplitPolyId(hit);
        return;
      }
      if (splitPts.length === 0) {
        setSplitPts([pt]);
      } else if (splitPts.length === 1) {
        const line = [splitPts[0], pt];
        split(splitPolyId, line[0], line[1]);

        // P2-06: after split, auto-select the larger resulting polygon
        // The split store action will have produced two new polygons on this page;
        // pick the one with the largest area from the updated store.
        setTimeout(() => {
          const updated = useStore.getState().polygons.filter(
            (p) => p.pageNumber === currentPage && p.id !== splitPolyId,
          );
          // Find the two newest polygons (highest area heuristic)
          const sorted = [...updated].sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
          if (sorted.length > 0) {
            setSelectedPolygon(sorted[0].id);
          }
        }, 50);

        setSplitPolyId(null);
        setSplitPts([]);
        setCursor(null);
        setTool('select');
      }
    }
  }, [getCoords, isMerge, isSplit, firstPolyId, splitPolyId, splitPts, merge, split, setTool, findPolygonAt, polygons, addToast, currentPage, setSelectedPolygon]);

  // R-006: track mouse for split preview
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (isSplit && (splitPolyId || splitPts.length > 0)) {
      setCursor(getCoords(e));
    }
  }, [isSplit, splitPolyId, splitPts.length, getCoords]);

  // R-007: window-level Escape listener so it works without div focus
  useEffect(() => {
    if (!isMerge && !isSplit) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetState();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMerge, isSplit, resetState]);

  const vb = `0 0 ${baseDims.width} ${baseDims.height}`;
  const targetOutlineStr = targetPoly?.points.map((p) => `${p.x},${p.y}`).join(' ') ?? '';

  return (
    <div
      ref={containerRef}
      data-testid="merge-tool-container"
      className="absolute inset-0 z-30"
      onClick={onClick}
      onMouseMove={onMouseMove}
      tabIndex={0}
      style={{ cursor: isMerge ? 'copy' : isSplit ? 'crosshair' : 'default' }}
    >
      {/* P2-06: SVG overlay for target highlight + split preview */}
      {(isMerge || isSplit) && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={vb}
          preserveAspectRatio="none"
        >
          {/* P2-06: highlight selected target polygon */}
          {targetOutlineStr && (
            <polygon
              data-testid="split-target-highlight"
              points={targetOutlineStr}
              fill={isMerge ? 'rgba(0,212,255,0.08)' : 'rgba(251,191,36,0.08)'}
              stroke={isMerge ? '#00d4ff' : '#fbbf24'}
              strokeWidth={2.5}
              strokeDasharray="6 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* P2-06: split line preview */}
          {isSplit && splitPts.length === 1 && cursor && (
            <line
              data-testid="split-preview-line"
              x1={splitPts[0].x}
              y1={splitPts[0].y}
              x2={cursor.x}
              y2={cursor.y}
              stroke="#00d4ff"
              strokeWidth={2}
              strokeDasharray="8 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* First split point dot */}
          {isSplit && splitPts.length === 1 && (
            <circle
              cx={splitPts[0].x}
              cy={splitPts[0].y}
              r={5}
              fill="#00d4ff"
              stroke="#fff"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* Merge: first selected polygon glow */}
          {isMerge && firstPolyId && (() => {
            const p = pagePolygons.find((x) => x.id === firstPolyId);
            if (!p) return null;
            const pts = p.points.map((pt) => `${pt.x},${pt.y}`).join(' ');
            return (
              <polygon
                points={pts}
                fill="rgba(0,212,255,0.12)"
                stroke="#00d4ff"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            );
          })()}
        </svg>
      )}

      {/* Instruction bar */}
      {(isMerge || isSplit) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[rgba(10,10,15,0.85)] border border-[#00d4ff]/30 text-[#e5e7eb] text-xs px-3 py-1.5 rounded-full pointer-events-none shadow-[0_0_12px_#00d4ff55]">
          {instruction}
        </div>
      )}
    </div>
  );
}
