'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';

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

export default function CanvasOverlay({ onPolygonContextMenu, onCanvasPointerDown }: CanvasOverlayProps = {}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const allPolygons = useStore((s) => s.polygons);
  const currentPage = useStore((s) => s.currentPage);
  const classifications = useStore((s) => s.classifications);
  const selectedPolygon = useStore((s) => s.selectedPolygon);
  const setSelectedPolygon = useStore((s) => s.setSelectedPolygon);
  const currentTool = useStore((s) => s.currentTool);
  const updatePolygon = useStore((s) => s.updatePolygon);
  const scale = useStore((s) => s.scale);
  const baseDims = useStore((s) => s.pageBaseDimensions);

  // Vertex drag state
  const [dragging, setDragging] = useState<{
    polygonId: string;
    vertexIndex: number;
  } | null>(null);
  const [dragPoints, setDragPoints] = useState<Point[] | null>(null);

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
      setDragPoints((prev) => {
        if (!prev) return prev;
        const updated = [...prev];
        updated[dragging.vertexIndex] = pt;
        return updated;
      });
    };

    const handleUp = (e: MouseEvent) => {
      e.preventDefault();
      setDragPoints((prev) => {
        if (prev) {
          updatePolygon(dragging.polygonId, { points: prev });
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
  }, [dragging, toSvgCoords, updatePolygon]);

  // Calibration state
  const calibrationMode = useStore((s) => s.calibrationMode);
  const calibrationPoints = useStore((s) => s.calibrationPoints);
  const addCalibrationPoint = useStore((s) => s.addCalibrationPoint);

  const polygons = allPolygons.filter((p) => p.pageNumber === currentPage);

  // Handle right-click on a polygon via SVG element data attributes
  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      onCanvasPointerDown?.();

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

  // Disable pointer events when draw/measure/cut/merge/split tools are active
  const disablePointerEvents =
    currentTool === 'pan' ||
    currentTool === 'draw' ||
    currentTool === 'measure' ||
    currentTool === 'cut' ||
    currentTool === 'merge' ||
    currentTool === 'split';

  return (
    <div
      ref={wrapperRef}
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
              />
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
              {/* Polygon label: classification name + measurement */}
              {(() => {
                const pts = displayPoints;
                if (pts.length < 3) return null;
                const lxs = pts.map((p) => p.x);
                const lys = pts.map((p) => p.y);
                const bboxW = Math.max(...lxs) - Math.min(...lxs);
                const bboxH = Math.max(...lys) - Math.min(...lys);
                if (bboxW <= 30 || bboxH <= 30) return null;
                const centX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
                const centY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
                const clsType = cls?.type || 'area';
                const unit = clsType === 'linear' ? 'FT' : clsType === 'count' ? 'EA' : 'SF';
                const ppu = scale?.pixelsPerUnit || 0;
                const valueStr = ppu
                  ? `${(poly.area / (ppu * ppu)).toFixed(1)} ${unit}`
                  : `? ${unit}`;
                const clsName = cls?.name || '';
                const longestLen = Math.max(clsName.length, valueStr.length);
                const labelW = Math.max(longestLen * 6.6 + 12, 50);
                const labelH = 30;
                return (
                  <g pointerEvents="none">
                    <rect
                      x={centX - labelW / 2}
                      y={centY - labelH / 2}
                      width={labelW}
                      height={labelH}
                      fill="rgba(0,0,0,0.65)"
                      rx={3}
                    />
                    <text
                      x={centX}
                      y={centY}
                      fontSize="11"
                      fill="#fff"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontFamily="sans-serif"
                      style={{ userSelect: 'none' }}
                    >
                      <tspan x={centX} dy="-0.5em">{clsName}</tspan>
                      <tspan x={centX} dy="1.1em">{valueStr}</tspan>
                    </text>
                  </g>
                );
              })()}
            </g>
          );
        })}

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
