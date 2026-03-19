'use client';

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';
import { calculatePolygonArea, calculateLinearFeet } from '@/lib/polygon-utils';
import { snapToNearestVertex, type SnapPoint } from '@/lib/snap-utils';

export interface PolygonContextMenuPayload {
  polygonId: string;
  x: number;
  y: number;
}

interface CanvasOverlayProps {
  onPolygonContextMenu?: (payload: PolygonContextMenuPayload) => void;
  onCanvasPointerDown?: () => void;
}

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    return `rgba(147,197,253,${alpha})`;
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

function CanvasOverlay({ onPolygonContextMenu, onCanvasPointerDown }: CanvasOverlayProps = {}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const allPolygons = useStore((s) => s.polygons);
  const allAnnotations = useStore((s) => s.annotations);
  const currentPage = useStore((s) => s.currentPage);
  const classifications = useStore((s) => s.classifications);
  const selectedPolygon = useStore((s) => s.selectedPolygon);
  const selectedPolygonId = useStore((s) => s.selectedPolygonId);
  const setSelectedPolygon = useStore((s) => s.setSelectedPolygon);
  const deletePolygon = useStore((s) => s.deletePolygon);
  const projectId = useStore((s) => s.projectId);
  const currentTool = useStore((s) => s.currentTool);
  const updatePolygon = useStore((s) => s.updatePolygon);
  const scale = useStore((s) => s.scale);
  const rawBaseDims = useStore((s) => s.pageBaseDimensions[s.currentPage]);
  const baseDims = rawBaseDims ?? { width: 1, height: 1 };

  // Vertex drag state
  const [dragging, setDragging] = useState<{
    polygonId: string;
    vertexIndex: number;
  } | null>(null);
  const [dragPoints, setDragPoints] = useState<Point[] | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<SnapPoint | null>(null);

  const toSvgCoords = useCallback(
    (e: React.MouseEvent | MouseEvent): Point => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
        y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
      };
    },
    [baseDims]
  );

  const handleVertexPointerDown = useCallback(
    (e: React.MouseEvent, polygonId: string, vertexIndex: number) => {
      e.stopPropagation();
      e.preventDefault();
      const poly = allPolygons.find((p) => p.id === polygonId);
      if (!poly) return;
      setDragging({ polygonId, vertexIndex });
      setDragPoints([...poly.points]);
    },
    [allPolygons]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      e.preventDefault();
      const pt = toSvgCoords(e);
      // Snap dragged vertex to nearby vertices on other polygons
      const rect = wrapperRef.current?.getBoundingClientRect();
      const screenToBase = rect ? baseDims.width / rect.width : 1;
      const snapThreshold = 10 * screenToBase;
      const otherPolygons = allPolygons.filter((p) => p.pageNumber === currentPage && p.id !== dragging.polygonId);
      const snap = snapToNearestVertex(pt, otherPolygons, snapThreshold);
      const snappedPt = snap ? { x: snap.x, y: snap.y } : pt;
      setSnapIndicator(snap);
      setDragPoints((prev) => {
        if (!prev) return prev;
        const updated = [...prev];
        updated[dragging.vertexIndex] = snappedPt;
        return updated;
      });
    };

    const handleUp = (e: MouseEvent) => {
      e.preventDefault();
      setSnapIndicator(null);
      setDragPoints((prev) => {
        if (prev) {
          const polygon = allPolygons.find((p) => p.id === dragging.polygonId);
          const cls = polygon ? classifications.find((c) => c.id === polygon.classificationId) : null;
          const isLinear = cls?.type === 'linear';
          const ppu = scale?.pixelsPerUnit || 1;
          const area = calculatePolygonArea(prev);
          const linearFeet = isLinear ? calculateLinearFeet(prev, ppu, false) : 0;
          updatePolygon(dragging.polygonId, { points: prev, area, linearFeet });
        }
        return null;
      });
      setDragging(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, toSvgCoords, updatePolygon, allPolygons, classifications, scale, currentPage, baseDims]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!selectedPolygonId) return;

      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(active?.isContentEditable);
      if (isEditable) return;

      e.preventDefault();
      e.stopPropagation();
      deletePolygon(selectedPolygonId);
      if (projectId) {
        fetch(`/api/projects/${projectId}/polygons/${selectedPolygonId}`, { method: 'DELETE' }).catch((err) =>
          console.error('API deletePolygon failed:', err)
        );
      }
    };

    wrapper.addEventListener('keydown', handleKeyDown);
    return () => {
      wrapper.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPolygonId, deletePolygon, projectId]);

  // Calibration state
  const calibrationMode = useStore((s) => s.calibrationMode);
  const calibrationPoints = useStore((s) => s.calibrationPoints);
  const addCalibrationPoint = useStore((s) => s.addCalibrationPoint);

  const polygons = useMemo(
    () => allPolygons.filter((p) => p.pageNumber === currentPage),
    [allPolygons, currentPage]
  );
  const annotations = useMemo(
    () => (allAnnotations ?? []).filter((a) => a.page === currentPage),
    [allAnnotations, currentPage]
  );

  // Handle right-click on a polygon via SVG element data attributes
  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      onCanvasPointerDown?.();

      // Draw mode: let DrawingTool (z-20) handle clicks, don't intercept here
      if (currentTool === 'draw') return;

      // Calibration mode: capture left clicks as calibration points (in base coordinate space)
      if (calibrationMode && calibrationPoints.length < 2) {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        addCalibrationPoint({
          x: (clickX / rect.width) * baseDims.width,
          y: (clickY / rect.height) * baseDims.height,
        });
        return;
      }
    },
    [onCanvasPointerDown, calibrationMode, calibrationPoints, addCalibrationPoint, baseDims]
  );

  const handlePolygonClick = useCallback(
    (e: React.MouseEvent<SVGPolygonElement>, polygonId: string) => {
      e.stopPropagation();
      onCanvasPointerDown?.();
      if (currentTool === 'select') {
        setSelectedPolygon(polygonId);
      }
    },
    [currentTool, setSelectedPolygon, onCanvasPointerDown]
  );

  const handlePolygonContextMenu = useCallback(
    (e: React.MouseEvent<SVGPolygonElement>, polygonId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedPolygon(polygonId);
      onPolygonContextMenu?.({ polygonId, x: e.clientX, y: e.clientY });
    },
    [setSelectedPolygon, onPolygonContextMenu]
  );

  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Deselect if clicking on empty SVG area in select mode
      if (currentTool === 'select' && e.target === e.currentTarget) {
        setSelectedPolygon(null);
      }
    },
    [currentTool, setSelectedPolygon]
  );

  // Disable pointer events when measure/cut/merge/split tools are active.
  // Draw mode keeps pointer events enabled so the DrawingTool overlay (z-20)
  // can reliably receive clicks through the stacking context.
  const disablePointerEvents =
    currentTool === 'pan' ||
    currentTool === 'measure' ||
    currentTool === 'cut' ||
    currentTool === 'merge' ||
    currentTool === 'split';

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onMouseDownCapture={() => wrapperRef.current?.focus()}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: disablePointerEvents ? 'none' : 'auto',
        cursor: currentTool === 'draw' || currentTool === 'measure' ? 'crosshair' : undefined,
        zIndex: 10,
      }}
    >
      <svg
        viewBox={`0 0 ${baseDims.width} ${baseDims.height}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
        onClick={handleSvgClick}
        onMouseDown={handleSvgMouseDown}
      >
        {/* Polygons */}
        {polygons.map((poly) => {
          const cls = classifications.find((c) => c.id === poly.classificationId);
          if (cls && !cls.visible) return null;
          const color = cls?.color || '#93c5fd';
          const isSelected = selectedPolygon === poly.id;
          const isDraggingThis = dragging?.polygonId === poly.id;
          const displayPoints = isDraggingThis && dragPoints ? dragPoints : poly.points;
          const pointsStr = displayPoints.map((p: Point) => `${p.x},${p.y}`).join(' ');

          return (
            <g key={poly.id}>
              <polygon
                points={pointsStr}
                fill={hexToRgba(color, 0.3)}
                stroke={isSelected ? '#00ff88' : color}
                strokeWidth={isSelected ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
                style={{
                  cursor: currentTool === 'select' ? 'pointer' : 'default',
                  filter: isSelected
                    ? 'drop-shadow(0 0 6px rgba(0,255,136,0.6))'
                    : 'drop-shadow(0 0 4px rgba(0,212,255,0.25))',
                }}
                onClick={(e) => handlePolygonClick(e, poly.id)}
                onContextMenu={(e) => handlePolygonContextMenu(e, poly.id)}
                aria-label={cls?.name ?? 'Unknown classification'}
              >
                <title>{cls?.name ?? 'Polygon'}</title>
              </polygon>
              {/* Corner handles when selected */}
              {isSelected &&
                displayPoints.map((pt: Point, i: number) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r={5}
                    fill={isDraggingThis && dragging.vertexIndex === i ? '#ff6600' : '#00d4ff'}
                    stroke="#fff"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'grab' }}
                    onMouseDown={(e) => handleVertexPointerDown(e, poly.id, i)}
                  />
                ))}
              {/* Polygon label: measurement annotation (area/length/count) */}
              {(() => {
                const pts = displayPoints;
                if (pts.length < 3) return null;
                const centX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
                const centY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
                if (centX < 0 || centY < 0 || centX > baseDims.width || centY > baseDims.height) return null;
                const clsType = cls?.type ?? 'area';
                const ppu = scale?.pixelsPerUnit || 1;
                // For count: show number of polygons in this classification on this page
                const countForClass = clsType === 'count'
                  ? polygons.filter((p) => p.classificationId === poly.classificationId).length
                  : 0;
                const areaReal = poly.area / (ppu * ppu);
                const measureStr =
                  clsType === 'linear'
                    ? `${poly.linearFeet.toFixed(1)} LF`
                    : clsType === 'count'
                    ? `${countForClass} EA`
                    : `${areaReal.toFixed(1)} SF`;
                const labelColor = cls?.color ?? '#00d4ff';
                const longestLen = measureStr.length;
                const labelW = Math.max(60, longestLen * 7 + 14);
                const labelH = 20;
                const rectX = centX - labelW / 2;
                const rectY = centY - labelH / 2;
                return (
                  <g pointerEvents="none">
                    <rect
                      x={rectX}
                      y={rectY}
                      width={labelW}
                      height={labelH}
                      fill="rgba(0,0,0,0.72)"
                      rx={3}
                    />
                    <text
                      x={centX}
                      y={centY + 5}
                      fontSize="11"
                      fill={labelColor}
                      textAnchor="middle"
                      fontFamily="sans-serif"
                      fontWeight="600"
                      style={{ userSelect: 'none' }}
                    >
                      {measureStr}
                    </text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Text annotations */}
        {annotations.map((annotation) => (
          <text
            key={annotation.id}
            x={annotation.x}
            y={annotation.y}
            fill={annotation.color}
            fontSize={annotation.fontSize}
            fontFamily="sans-serif"
            style={{ userSelect: 'none' }}
          >
            {annotation.text}
          </text>
        ))}

        {/* Snap indicator — shows when a vertex snaps during drag */}
        {snapIndicator && (
          <circle
            cx={snapIndicator.x}
            cy={snapIndicator.y}
            r={10}
            fill="none"
            stroke="#fbbf24"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}

        {/* Calibration overlays */}
        {calibrationPoints.map((pt: Point, i: number) => (
          <circle
            key={`cal-${i}`}
            cx={pt.x}
            cy={pt.y}
            r={6}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        ))}
        {calibrationPoints.length === 2 && (
          <line
            x1={calibrationPoints[0].x}
            y1={calibrationPoints[0].y}
            x2={calibrationPoints[1].x}
            y2={calibrationPoints[1].y}
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
      </svg>
    </div>
  );
}

export default React.memo(CanvasOverlay);
