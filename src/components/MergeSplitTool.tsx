'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';
import { pointInPolygon } from '@/lib/polygon-utils';
import { useToast } from '@/components/Toast';

export default function MergeSplitTool() {
  const polygons = useStore((s) => s.polygons);
  const currentTool = useStore((s) => s.currentTool);
  const setTool = useStore((s) => s.setTool);
  const merge = useStore((s) => s.mergePolygons);
  const split = useStore((s) => s.splitPolygon);
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
      if (splitPts.length === 1) return 'Click second point of split line';
    }
    return '';
  }, [isMerge, isSplit, firstPolyId, splitPolyId, splitPts.length]);

  const getCoords = useCallback((e: React.MouseEvent | MouseEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const findPolygonAt = useCallback((pt: Point) => {
    // search topmost first — iterate reversed
    for (let i = polygons.length - 1; i >= 0; i--) {
      const poly = polygons[i];
      if (pointInPolygon(pt, poly.points)) return poly.id;
    }
    return null;
  }, [polygons]);

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
      if (firstPolyId && hit && hit !== firstPolyId) {
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
        setSplitPolyId(null);
        setSplitPts([]);
        setCursor(null);
        setTool('select');
      }
    }
  }, [getCoords, isMerge, isSplit, firstPolyId, splitPolyId, splitPts, merge, split, setTool, findPolygonAt, polygons, addToast]);

  // R-006: track mouse for split preview
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (isSplit && splitPts.length === 1) {
      setCursor(getCoords(e));
    }
  }, [isSplit, splitPts.length, getCoords]);

  // R-007: window-level Escape listener so it works without div focus
  useEffect(() => {
    if (!isMerge && !isSplit) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        resetState();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMerge, isSplit, resetState]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-30"
      onClick={onClick}
      onMouseMove={onMouseMove}
      tabIndex={0}
      style={{ cursor: isMerge ? 'copy' : isSplit ? 'crosshair' : 'default' }}
    >
      {/* Instruction bar */}
      {(isMerge || isSplit) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[rgba(10,10,15,0.85)] border border-[#00d4ff]/30 text-[#e5e7eb] text-xs px-3 py-1.5 rounded-full pointer-events-none shadow-[0_0_12px_#00d4ff55]">
          {instruction}
        </div>
      )}
      {/* Split line preview — R-006: x2/y2 now reference cursor */}
      {isSplit && splitPts.length === 1 && cursor && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <line x1={splitPts[0].x} y1={splitPts[0].y} x2={cursor.x} y2={cursor.y} stroke="#00d4ff" strokeWidth={2} />
        </svg>
      )}
    </div>
  );
}
