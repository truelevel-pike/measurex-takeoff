'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';
import { pointInPolygon } from '@/lib/polygon-utils';

export default function CutTool() {
  const polygons = useStore((s) => s.polygons);
  const currentPage = useStore((s) => s.currentPage);
  const cutPolygon = useStore((s) => s.cutPolygon);
  const setTool = useStore((s) => s.setTool);
  const rawBaseDims = useStore((s) => s.pageBaseDimensions[s.currentPage]);
  const baseDims = useMemo(() => rawBaseDims ?? { width: 1, height: 1 }, [rawBaseDims]);
  const containerRef = useRef<HTMLDivElement>(null);

  // BUG-A7-5-030 fix: memoize pagePolygons to avoid recompute on every render
  const pagePolygons = useMemo(() => polygons.filter((p) => p.pageNumber === currentPage), [polygons, currentPage]);

  // BUG-A7-5-029 fix: auto-focus on mount so keyboard (Escape) works immediately
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Normalize screen-space mouse position to PDF base-coordinate space so that
  // hit-testing via pointInPolygon (which operates in base coords) works correctly
  // at any zoom level. Matches the pattern used in DrawingTool and CanvasOverlay.
  const getCoords = useCallback((e: React.MouseEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
      y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
    };
  }, [baseDims]);

  const findPolygonAt = useCallback(
    (pt: Point) => {
      for (let i = pagePolygons.length - 1; i >= 0; i--) {
        if (pointInPolygon(pt, pagePolygons[i].points)) return pagePolygons[i].id;
      }
      return null;
    },
    [pagePolygons]
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const pt = getCoords(e);
      const hit = findPolygonAt(pt);
      if (hit) {
        cutPolygon(hit, []);
        setTool('select');
      }
    },
    [getCoords, findPolygonAt, cutPolygon, setTool]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') setTool('select');
    },
    [setTool]
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-30"
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
      style={{ cursor: 'crosshair' }}
    >
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[rgba(10,10,15,0.85)] border border-[#00d4ff]/30 text-[#e5e7eb] text-xs px-3 py-1.5 rounded-full pointer-events-none shadow-[0_0_12px_#00d4ff55]">
        Click a polygon to remove it · Esc to cancel
      </div>
    </div>
  );
}
