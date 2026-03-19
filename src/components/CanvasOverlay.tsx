'use client';

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';
import { calculatePolygonArea, calculateLinearFeet } from '@/lib/polygon-utils';
import { snapToNearestVertex, type SnapPoint } from '@/lib/snap-utils';
import { useUserPrefs } from '@/lib/user-prefs';

export interface PolygonContextMenuPayload {
  polygonId: string;
  x: number;
  y: number;
}

interface CanvasOverlayProps {
  onPolygonContextMenu?: (payload: PolygonContextMenuPayload) => void;
  onCanvasPointerDown?: () => void;
  highlightedPolygonId?: string | null;
}

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (!clean || (clean.length !== 3 && clean.length !== 6)) return `rgba(147,197,253,${alpha})`;
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

function getPolygonColor(
  polygon: { color?: string },
  classificationColor?: string
): string {
  const polygonColor = polygon.color?.trim();
  if (polygonColor) return polygonColor;
  return classificationColor?.trim() || '#93c5fd';
}

function getPolygonFillOpacity(
  polygon: { fillOpacity?: number },
  isSelected: boolean,
  isHighlighted: boolean,
  baseFillOpacity: number = 0.3
): number {
  if (isSelected) return Math.min(1, baseFillOpacity + 0.2);
  if (isHighlighted) return Math.min(1, baseFillOpacity + 0.15);
  const opacity = polygon.fillOpacity;
  if (typeof opacity !== 'number' || opacity <= 0) return baseFillOpacity;
  return opacity;
}

function CanvasOverlay({ onPolygonContextMenu, onCanvasPointerDown, highlightedPolygonId }: CanvasOverlayProps = {}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const allPolygons = useStore((s) => s.polygons);
  const allAnnotations = useStore((s) => s.annotations);
  const currentPage = useStore((s) => s.currentPage);
  const classifications = useStore((s) => s.classifications);
  const selectedPolygon = useStore((s) => s.selectedPolygon);
  const selectedPolygonId = useStore((s) => s.selectedPolygonId);
  const selectedPolygons = useStore((s) => s.selectedPolygons);
  const setSelectedPolygon = useStore((s) => s.setSelectedPolygon);
  const togglePolygonSelection = useStore((s) => s.togglePolygonSelection);
  const clearPolygonSelection = useStore((s) => s.clearPolygonSelection);
  const deleteSelectedPolygons = useStore((s) => s.deleteSelectedPolygons);
  const deletePolygon = useStore((s) => s.deletePolygon);
  const projectId = useStore((s) => s.projectId);
  const currentTool = useStore((s) => s.currentTool);
  const updatePolygon = useStore((s) => s.updatePolygon);
  const addPolygon = useStore((s) => s.addPolygon);
  const setSelectedClassification = useStore((s) => s.setSelectedClassification);
  const scale = useStore((s) => s.scale);
  const scales = useStore((s) => s.scales);
  const rawBaseDims = useStore((s) => s.pageBaseDimensions[s.currentPage]);
  const hoveredClassificationId = useStore((s) => s.hoveredClassificationId);
  const baseDims = useMemo(() => rawBaseDims ?? { width: 1, height: 1 }, [rawBaseDims]);
  const { prefs } = useUserPrefs();

  // Vertex drag state
  const [dragging, setDragging] = useState<{
    polygonId: string;
    vertexIndex: number;
  } | null>(null);
  const [dragPoints, setDragPoints] = useState<Point[] | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<SnapPoint | null>(null);
  const [showBatchClassificationPicker, setShowBatchClassificationPicker] = useState(false);
  const [showFloatingReclassify, setShowFloatingReclassify] = useState(false);
  const [hoveredPoly, setHoveredPoly] = useState<{ id: string; clientX: number; clientY: number } | null>(null);

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
      if (e.key === 'Escape' && selectedPolygons.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        clearPolygonSelection();
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;

      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(active?.isContentEditable);
      if (isEditable) return;

      if (selectedPolygons.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        deleteSelectedPolygons();
        return;
      }
      if (!selectedPolygonId) return;

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
  }, [selectedPolygonId, selectedPolygons, clearPolygonSelection, deleteSelectedPolygons, deletePolygon, projectId]);

  // Calibration state
  const calibrationMode = useStore((s) => s.calibrationMode);
  const calibrationPoints = useStore((s) => s.calibrationPoints);
  const addCalibrationPoint = useStore((s) => s.addCalibrationPoint);

  const polygons = useMemo(
    () => allPolygons.filter((p) => p.pageNumber === currentPage),
    [allPolygons, currentPage]
  );
  const classificationById = useMemo(() => {
    const byId = new Map<string, (typeof classifications)[number]>();
    for (const classification of classifications) {
      byId.set(classification.id, classification);
    }
    return byId;
  }, [classifications]);
  const polygonCountByClassification = useMemo(() => {
    const counts = new Map<string, number>();
    for (const polygon of polygons) {
      counts.set(polygon.classificationId, (counts.get(polygon.classificationId) ?? 0) + 1);
    }
    return counts;
  }, [polygons]);
  const polygonIds = useMemo(() => new Set(allPolygons.map((polygon) => polygon.id)), [allPolygons]);
  const annotations = useMemo(
    () => (allAnnotations ?? []).filter((a) => a.page === currentPage),
    [allAnnotations, currentPage]
  );
  const selectedPolygonsOnPage = useMemo(
    () => polygons.filter((p) => selectedPolygons.includes(p.id)),
    [polygons, selectedPolygons]
  );
  const lastSelectedOnPage = useMemo(() => {
    for (let i = selectedPolygons.length - 1; i >= 0; i -= 1) {
      const polygon = polygons.find((p) => p.id === selectedPolygons[i]);
      if (polygon) return polygon;
    }
    return null;
  }, [polygons, selectedPolygons]);
  const batchMenuPosition = useMemo(() => {
    if (!lastSelectedOnPage || lastSelectedOnPage.points.length === 0) return null;
    const centroid = lastSelectedOnPage.points.reduce(
      (acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }),
      { x: 0, y: 0 }
    );
    centroid.x /= lastSelectedOnPage.points.length;
    centroid.y /= lastSelectedOnPage.points.length;
    return {
      xPct: (centroid.x / baseDims.width) * 100,
      yPct: (centroid.y / baseDims.height) * 100,
    };
  }, [lastSelectedOnPage, baseDims]);
  const showBatchMenu = selectedPolygonsOnPage.length > 1 && batchMenuPosition !== null;

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
    [onCanvasPointerDown, currentTool, calibrationMode, calibrationPoints, addCalibrationPoint, baseDims]
  );

  const handlePolygonClick = useCallback(
    (e: React.MouseEvent<SVGPolygonElement>) => {
      e.stopPropagation();
      onCanvasPointerDown?.();
      const polygonId = e.currentTarget.dataset.polygonId;
      if (!polygonId) return;
      if (currentTool === 'select') {
        if (e.shiftKey) {
          togglePolygonSelection(polygonId);
        } else {
          setSelectedPolygon(polygonId);
        }
      }
    },
    [currentTool, togglePolygonSelection, setSelectedPolygon, onCanvasPointerDown]
  );

  const handlePolygonContextMenu = useCallback(
    (e: React.MouseEvent<SVGPolygonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const polygonId = e.currentTarget.dataset.polygonId;
      if (!polygonId) return;
      if (selectedPolygons.length > 1 && selectedPolygons.includes(polygonId)) return;
      setSelectedPolygon(polygonId);
      onPolygonContextMenu?.({ polygonId, x: e.clientX, y: e.clientY });
    },
    [selectedPolygons, setSelectedPolygon, onPolygonContextMenu]
  );

  const handleVertexMouseDown = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const polygonId = e.currentTarget.dataset.polygonId;
      const vertexIndexRaw = e.currentTarget.dataset.vertexIndex;
      if (!polygonId || !vertexIndexRaw) return;
      const vertexIndex = Number(vertexIndexRaw);
      if (!Number.isFinite(vertexIndex)) return;
      handleVertexPointerDown(e, polygonId, vertexIndex);
    },
    [handleVertexPointerDown]
  );

  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Deselect if clicking on empty SVG area in select mode
      if (currentTool === 'select' && e.target === e.currentTarget) {
        clearPolygonSelection();
        setShowBatchClassificationPicker(false);
      }
    },
    [currentTool, clearPolygonSelection]
  );

  const handleBatchDelete = useCallback(() => {
    deleteSelectedPolygons();
    setShowBatchClassificationPicker(false);
  }, [deleteSelectedPolygons]);

  const handleBatchReclassify = useCallback(
    (classificationId: string) => {
      selectedPolygons.forEach((polygonId) => {
        if (polygonIds.has(polygonId)) {
          updatePolygon(polygonId, { classificationId });
        }
      });
      setShowBatchClassificationPicker(false);
    },
    [selectedPolygons, polygonIds, updatePolygon]
  );

  const handleBatchReclassifyClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const classificationId = e.currentTarget.dataset.classificationId;
      if (!classificationId) return;
      handleBatchReclassify(classificationId);
    },
    [handleBatchReclassify]
  );

  // Close floating reclassify when selection changes
  useEffect(() => {
    setShowFloatingReclassify(false);
  }, [selectedPolygonId]);

  // Floating toolbar: single-selected polygon on current page
  const singleSelectedPoly = useMemo(() => {
    if (selectedPolygons.length > 1) return null;
    if (!selectedPolygonId) return null;
    return polygons.find((p) => p.id === selectedPolygonId) ?? null;
  }, [selectedPolygonId, selectedPolygons, polygons]);

  const floatingToolbarPos = useMemo(() => {
    if (!singleSelectedPoly || singleSelectedPoly.points.length === 0) return null;
    const pts = singleSelectedPoly.points;
    const centX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const centY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { centX, centY };
  }, [singleSelectedPoly]);

  const handleFloatingDelete = useCallback(() => {
    if (!singleSelectedPoly) return;
    deletePolygon(singleSelectedPoly.id);
    if (projectId) {
      fetch(`/api/projects/${projectId}/polygons/${singleSelectedPoly.id}`, { method: 'DELETE' }).catch((err) =>
        console.error('API deletePolygon failed:', err)
      );
    }
  }, [singleSelectedPoly, deletePolygon, projectId]);

  const handleFloatingDuplicate = useCallback(() => {
    if (!singleSelectedPoly) return;
    addPolygon({
      points: singleSelectedPoly.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })),
      classificationId: singleSelectedPoly.classificationId,
      pageNumber: singleSelectedPoly.pageNumber,
      area: singleSelectedPoly.area,
      linearFeet: singleSelectedPoly.linearFeet,
      isComplete: singleSelectedPoly.isComplete,
      label: singleSelectedPoly.label,
    });
  }, [singleSelectedPoly, addPolygon]);

  const handleFloatingReclassify = useCallback((classId: string) => {
    if (!singleSelectedPoly) return;
    updatePolygon(singleSelectedPoly.id, { classificationId: classId });
    setShowFloatingReclassify(false);
  }, [singleSelectedPoly, updatePolygon]);

  const handleWrapperMouseDownCapture = useCallback(() => {
    wrapperRef.current?.focus();
  }, []);

  const handleBatchMenuClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const handleToggleBatchClassificationPicker = useCallback(() => {
    setShowBatchClassificationPicker((prev) => !prev);
  }, []);

  // Disable pointer events so tool-specific overlays (z-20) receive clicks
  // directly without the CanvasOverlay wrapper (z-10) intercepting them.
  const disablePointerEvents =
    currentTool === 'draw' ||
    currentTool === 'pan' ||
    currentTool === 'measure' ||
    currentTool === 'cut' ||
    currentTool === 'merge' ||
    currentTool === 'split' ||
    currentTool === 'crop';

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onMouseDownCapture={handleWrapperMouseDownCapture}
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
        <style>
          {`@keyframes mx-polygon-flash { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }`}
        </style>
        {/* Polygons */}
        {polygons.map((poly) => {
          const cls = classificationById.get(poly.classificationId);
          if (cls && !cls.visible) return null;
          if (!poly.points || poly.points.length === 0) return null;
          const isSelected = selectedPolygons.includes(poly.id) || selectedPolygon === poly.id;
          const isHighlighted = highlightedPolygonId === poly.id;
          const isDraggingThis = dragging?.polygonId === poly.id;
          const displayPoints = isDraggingThis && dragPoints ? dragPoints : poly.points;
          const pointsStr = displayPoints.map((p: Point) => `${p.x},${p.y}`).join(' ');
          const polyWithDisplay = poly as typeof poly & { color?: string; fillOpacity?: number };
          const color = getPolygonColor(polyWithDisplay, cls?.color);
          const fillOpacity = getPolygonFillOpacity(polyWithDisplay, isSelected, isHighlighted, prefs.polygonFillOpacity);
          const isLinearPoly = cls?.type === 'linear';
          const isClassHovered = hoveredClassificationId !== null && poly.classificationId === hoveredClassificationId;
          const sharedStyle: React.CSSProperties = {
            cursor: currentTool === 'select' ? 'pointer' : 'default',
            animation: isHighlighted ? 'mx-polygon-flash 0.33s ease-in-out 6' : undefined,
            filter: isHighlighted
              ? 'drop-shadow(0 0 10px rgba(253,224,71,0.95))'
              : isClassHovered
              ? 'drop-shadow(0 0 8px rgba(0,212,255,0.8))'
              : isSelected
              ? 'drop-shadow(0 0 6px rgba(0,255,136,0.6))'
              : 'drop-shadow(0 0 4px rgba(0,212,255,0.25))',
          };

          return (
            <g
              key={poly.id}
              onPointerEnter={(currentTool === 'select' || currentTool === 'pan') ? (e) => {
                setHoveredPoly({ id: poly.id, clientX: e.clientX, clientY: e.clientY });
              } : undefined}
              onPointerMove={(currentTool === 'select' || currentTool === 'pan') ? (e) => {
                setHoveredPoly((prev) => prev?.id === poly.id ? { id: poly.id, clientX: e.clientX, clientY: e.clientY } : prev);
              } : undefined}
              onPointerLeave={(currentTool === 'select' || currentTool === 'pan') ? () => {
                setHoveredPoly((prev) => prev?.id === poly.id ? null : prev);
              } : undefined}
            >
              {isLinearPoly ? (
                <>
                  <polyline
                    points={pointsStr}
                    fill="none"
                    stroke={color}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    style={sharedStyle}
                    data-polygon-id={poly.id}
                    onClick={handlePolygonClick as unknown as React.MouseEventHandler<SVGPolylineElement>}
                    onContextMenu={handlePolygonContextMenu as unknown as React.MouseEventHandler<SVGPolylineElement>}
                    aria-label={cls?.name ?? 'Unknown classification'}
                  >
                    <title>{`${cls?.name ?? 'Polyline'}${poly.confidence !== undefined ? ` | ${Math.round(poly.confidence * 100)}% confidence` : ''}${poly.detectedByModel ? ` | Model: ${poly.detectedByModel}` : ''}`}</title>
                  </polyline>
                  {/* Endpoint dots for linear */}
                  {displayPoints.length >= 2 && [0, displayPoints.length - 1].map((idx) => (
                    <circle
                      key={`ep-${idx}`}
                      cx={displayPoints[idx].x}
                      cy={displayPoints[idx].y}
                      r={4}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  ))}
                </>
              ) : (
                <polygon
                  points={pointsStr}
                  fill={hexToRgba(color, fillOpacity)}
                  stroke={color}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  style={sharedStyle}
                  data-polygon-id={poly.id}
                  onClick={handlePolygonClick}
                  onContextMenu={handlePolygonContextMenu}
                  aria-label={cls?.name ?? 'Unknown classification'}
                >
                  <title>{`${cls?.name ?? 'Polygon'}${poly.confidence !== undefined ? ` | ${Math.round(poly.confidence * 100)}% confidence` : ''}${poly.detectedByModel ? ` | Model: ${poly.detectedByModel}` : ''}`}</title>
                </polygon>
              )}
              {isSelected && (
                isLinearPoly ? (
                  <polyline
                    points={pointsStr}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={2}
                    strokeDasharray="8 6"
                    opacity={0.75}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                    data-polygon-id={poly.id}
                  />
                ) : (
                  <polygon
                    points={pointsStr}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={3}
                    strokeDasharray="8 6"
                    opacity={0.75}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                    data-polygon-id={poly.id}
                  />
                )
              )}
              {/* Classification hover highlight overlay */}
              {isClassHovered && !isSelected && (
                isLinearPoly ? (
                  <polyline
                    points={pointsStr}
                    fill="none"
                    stroke="#00d4ff"
                    strokeWidth={4}
                    opacity={0.6}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                ) : (
                  <polygon
                    points={pointsStr}
                    fill="rgba(255,255,255,0.15)"
                    stroke="#00d4ff"
                    strokeWidth={2}
                    opacity={0.8}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )
              )}
              {/* Corner handles when selected */}
              {isSelected &&
                displayPoints.map((pt: Point, i: number) => (
                  <rect
                    key={i}
                    x={pt.x - 4}
                    y={pt.y - 4}
                    width={8}
                    height={8}
                    fill={isDraggingThis && dragging.vertexIndex === i ? '#ff6600' : '#00d4ff'}
                    stroke="#fff"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'grab' }}
                    data-polygon-id={poly.id}
                    data-vertex-index={i}
                    onMouseDown={handleVertexMouseDown as unknown as React.MouseEventHandler<SVGRectElement>}
                  />
                ))}
              {/* Confidence indicator dot */}
              {poly.confidence !== undefined && (() => {
                const pts = displayPoints;
                if (pts.length === 0) return null;
                const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
                const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
                const confColor = poly.confidence > 0.8 ? '#22c55e' : poly.confidence >= 0.5 ? '#eab308' : '#ef4444';
                return (
                  <circle
                    cx={cx}
                    cy={cy - 14}
                    r={5}
                    fill={confColor}
                    stroke="#fff"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                    opacity={0.85}
                  />
                );
              })()}
              {/* Polygon label: measurement annotation (area/length/count) */}
              {prefs.showPolygonLabels && (() => {
                const pts = displayPoints;
                const clsType = cls?.type ?? 'area';
                // Count markers have 1 point, linear can have 2 — allow labels for those
                const minPts = clsType === 'count' ? 1 : clsType === 'linear' ? 2 : 3;
                if (pts.length < minPts) return null;
                const centX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
                const centY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
                if (centX < 0 || centY < 0 || centX > baseDims.width || centY > baseDims.height) return null;
                const pageScale = scales[poly.pageNumber] ?? scale;
                const ppu = pageScale?.pixelsPerUnit || 1;
                // For count: show number of polygons in this classification on this page
                const countForClass = clsType === 'count'
                  ? (polygonCountByClassification.get(poly.classificationId) ?? 0)
                  : 0;
                const areaReal = poly.area / (ppu * ppu);
                const linearReal = calculateLinearFeet(poly.points, ppu, false);
                const rawLabel = (poly.label ?? cls?.name ?? '').trim();
                const measureStr =
                  clsType === 'linear'
                    ? `${linearReal.toFixed(1)} LF`
                    : clsType === 'count'
                    ? `${countForClass} EA`
                    : `${areaReal.toFixed(1)} SF`;
                const displayStr = rawLabel ? `${rawLabel}: ${measureStr}` : measureStr;
                const labelColor = cls?.color ?? '#00d4ff';
                const longestLen = displayStr.length;
                const labelW = Math.max(60, longestLen * 7 + 14);
                const labelH = 20;
                const rectX = centX - labelW / 2;
                const rectY = centY - labelH / 2;
                return (
                  <g
                    pointerEvents={isSelected ? 'all' : 'none'}
                    style={{ cursor: isSelected ? 'pointer' : undefined }}
                    onDoubleClick={isSelected ? (e) => {
                      e.stopPropagation();
                      setShowFloatingReclassify(true);
                    } : undefined}
                  >
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
                      {displayStr}
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
            stroke="#06b6d4"
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
      {/* Hover tooltip for polygon measurements */}
      {hoveredPoly && (() => {
        const poly = polygons.find((p) => p.id === hoveredPoly.id);
        if (!poly) return null;
        const cls = classificationById.get(poly.classificationId);
        const clsType = cls?.type ?? 'area';
        const pageScale = scales[poly.pageNumber] ?? scale;
        const ppu = pageScale?.pixelsPerUnit || 1;
        const wrapperRect = wrapperRef.current?.getBoundingClientRect();
        if (!wrapperRect) return null;
        const tipX = hoveredPoly.clientX - wrapperRect.left + 14;
        const tipY = hoveredPoly.clientY - wrapperRect.top - 10;
        const labelColor = cls?.color ?? '#00d4ff';

        const lines: string[] = [];
        if (cls?.name) lines.push(cls.name);
        if (clsType === 'area') {
          const areaReal = poly.area / (ppu * ppu);
          lines.push(`${areaReal.toFixed(1)} SF`);
        } else if (clsType === 'linear') {
          const linearReal = calculateLinearFeet(poly.points, ppu, false);
          lines.push(`${linearReal.toFixed(1)} LF`);
        } else if (clsType === 'count') {
          const countPolys = polygons.filter((p) => p.classificationId === poly.classificationId);
          const idx = countPolys.findIndex((p) => p.id === poly.id) + 1;
          lines.push(`${cls?.name ?? 'Item'} ${idx} of ${countPolys.length}`);
        }
        lines.push(`Page ${poly.pageNumber}`);
        if (poly.confidence !== undefined) {
          lines.push(`${Math.round(poly.confidence * 100)}% confidence`);
        }

        return (
          <div
            style={{
              position: 'absolute',
              left: tipX,
              top: tipY,
              transform: 'translateY(-100%)',
              pointerEvents: 'none',
              zIndex: 50,
              background: 'rgba(15,18,32,0.95)',
              border: `1px solid ${labelColor}`,
              borderRadius: 6,
              padding: '6px 10px',
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.5,
              color: '#e2e8f0',
              whiteSpace: 'nowrap',
              boxShadow: `0 4px 16px rgba(0,0,0,0.5), 0 0 8px ${labelColor}33`,
            }}
          >
            {lines.map((line, i) => (
              <div key={i} style={i === 0 ? { color: labelColor, fontWeight: 600 } : undefined}>
                {line}
              </div>
            ))}
          </div>
        );
      })()}
      {showBatchMenu && batchMenuPosition && (
        <div
          style={{
            position: 'absolute',
            left: `${batchMenuPosition.xPct}%`,
            top: `${batchMenuPosition.yPct}%`,
            transform: 'translate(12px, -8px)',
            zIndex: 60,
            minWidth: 220,
            padding: 8,
            borderRadius: 8,
            background: 'rgba(17,24,39,0.95)',
            border: '1px solid rgba(148,163,184,0.35)',
            boxShadow: '0 12px 24px rgba(0,0,0,0.35)',
            color: '#f8fafc',
          }}
          onClick={handleBatchMenuClick}
        >
          <button
            type="button"
            style={{
              width: '100%',
              textAlign: 'left',
              fontSize: 13,
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(239,68,68,0.14)',
              color: '#fecaca',
            }}
            onClick={handleBatchDelete}
          >
            Delete selected ({selectedPolygonsOnPage.length})
          </button>
          <button
            type="button"
            style={{
              width: '100%',
              textAlign: 'left',
              fontSize: 13,
              marginTop: 6,
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(56,189,248,0.14)',
              color: '#bae6fd',
            }}
            onClick={handleToggleBatchClassificationPicker}
          >
            Change classification
          </button>
          {showBatchClassificationPicker && (
            <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
              {classifications.map((cls) => (
                <button
                  key={cls.id}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    fontSize: 12,
                    padding: '6px 8px',
                    borderRadius: 6,
                    color: '#e2e8f0',
                  }}
                  data-classification-id={cls.id}
                  onClick={handleBatchReclassifyClick}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: cls.color,
                    }}
                  />
                  {cls.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Floating edit toolbar for single-selected polygon */}
      {currentTool === 'select' && singleSelectedPoly && floatingToolbarPos && (() => {
        const svgEl = wrapperRef.current?.querySelector('svg');
        const svgRect = svgEl?.getBoundingClientRect();
        if (!svgRect || baseDims.width === 0) return null;
        const scaleX = svgRect.width / baseDims.width;
        const scaleY = svgRect.height / baseDims.height;
        const screenX = svgRect.left + floatingToolbarPos.centX * scaleX;
        const screenY = svgRect.top + floatingToolbarPos.centY * scaleY;
        return (
          <div
            style={{
              position: 'fixed',
              left: screenX,
              top: screenY - 44,
              transform: 'translateX(-50%)',
              zIndex: 70,
              display: 'flex',
              gap: 2,
              padding: '4px 6px',
              borderRadius: 8,
              background: 'rgba(17,24,39,0.95)',
              border: '1px solid rgba(148,163,184,0.35)',
              boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              title="Delete"
              onClick={handleFloatingDelete}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: 'transparent',
                color: '#f87171',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
            <button
              type="button"
              title="Reclassify"
              onClick={() => setShowFloatingReclassify((v) => !v)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: showFloatingReclassify ? 'rgba(56,189,248,0.2)' : 'transparent',
                color: '#93c5fd',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            </button>
            <button
              type="button"
              title="Duplicate"
              onClick={handleFloatingDuplicate}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: 'transparent',
                color: '#94a3b8',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>
        );
      })()}
      {/* Floating reclassify dropdown */}
      {showFloatingReclassify && singleSelectedPoly && floatingToolbarPos && (() => {
        const svgEl = wrapperRef.current?.querySelector('svg');
        const svgRect = svgEl?.getBoundingClientRect();
        if (!svgRect || baseDims.width === 0) return null;
        const scaleX = svgRect.width / baseDims.width;
        const scaleY = svgRect.height / baseDims.height;
        const screenX = svgRect.left + floatingToolbarPos.centX * scaleX;
        const screenY = svgRect.top + floatingToolbarPos.centY * scaleY;
        return (
          <div
            style={{
              position: 'fixed',
              left: screenX,
              top: screenY - 48 - 8,
              transform: 'translate(-50%, -100%)',
              zIndex: 80,
              minWidth: 180,
              maxHeight: 220,
              overflowY: 'auto',
              padding: 6,
              borderRadius: 8,
              background: 'rgba(17,24,39,0.97)',
              border: '1px solid rgba(148,163,184,0.35)',
              boxShadow: '0 12px 24px rgba(0,0,0,0.45)',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {classifications.map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => handleFloatingReclassify(cls.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  fontSize: 12,
                  padding: '6px 8px',
                  borderRadius: 6,
                  color: singleSelectedPoly.classificationId === cls.id ? '#fff' : '#e2e8f0',
                  background: singleSelectedPoly.classificationId === cls.id ? 'rgba(56,189,248,0.18)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: cls.color,
                    flexShrink: 0,
                  }}
                />
                {cls.name}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

export default React.memo(CanvasOverlay);
export { hexToRgba, getPolygonColor };
