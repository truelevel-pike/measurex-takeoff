'use client';

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';
import { hexToRgba as _hexToRgba, getPolygonColor as _getPolygonColor } from '@/lib/canvas-color-utils';
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

function getModelDisplayName(model: string): string {
  const map: Record<string, string> = {
    "gpt-5.4": "GPT-5.4",
    "gpt-5.2-codex": "GPT-5.2 Codex",
    "claude-sonnet-4-6": "Claude Sonnet 4.6",
    "anthropic/claude-sonnet-4-6": "Claude Sonnet 4.6",
    "claude-opus-4-6": "Claude Opus 4.6",
    "anthropic/claude-opus-4-6": "Claude Opus 4.6",
    "gemini-3.1": "Gemini 3.1",
    "google/gemini-3.1-pro-preview": "Gemini 3.1 Pro",
    "google/gemini-3.1-flash-lite-preview": "Gemini Flash",
  };
  if (map[model]) return map[model];
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}

/** Convert hex color to rgba string */
// Use shared lightweight implementations (also exported for testing without ESM deps)
const hexToRgba = _hexToRgba;
const getPolygonColor = _getPolygonColor;

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

// BUG-A6-005 audit note: all hooks in this component are called unconditionally at
// the top level, before any early returns. The IIFE patterns used in JSX (e.g.
// `(() => { if (!poly) return null; ... })()`) are plain functions, not hooks, so
// they do not violate React's Rules of Hooks. No hook reordering is required.
function CanvasOverlay({ onPolygonContextMenu, onCanvasPointerDown, highlightedPolygonId }: CanvasOverlayProps = {}) {
  // AG-005: in agent mode always show polygon labels regardless of size thresholds
  const agentMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('agent') === '1';

  const wrapperRef = useRef<HTMLDivElement>(null);
  // BUG-A7-5-043 fix: use ref instead of querySelector for SVG element
  const svgRef = useRef<SVGSVGElement>(null);

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
  const batchUpdatePolygons = useStore((s) => s.batchUpdatePolygons);
  const addPolygon = useStore((s) => s.addPolygon);
  const setSelectedClassification = useStore((s) => s.setSelectedClassification);
  const scale = useStore((s) => s.scale);
  const scales = useStore((s) => s.scales);
  const rawBaseDims = useStore((s) => s.pageBaseDimensions[s.currentPage]);
  const hoveredClassificationId = useStore((s) => s.hoveredClassificationId);
  const baseDims = useMemo(() => rawBaseDims ?? { width: 1, height: 1 }, [rawBaseDims]);
  // BUG-A7-4-055: pre-build Set for O(1) selectedPolygons lookup
  const selectedSet = useMemo(() => new Set(selectedPolygons), [selectedPolygons]);
  const { prefs } = useUserPrefs();

  // Vertex drag state
  const [dragging, setDragging] = useState<{
    polygonId: string;
    vertexIndex: number;
  } | null>(null);
  const [dragPoints, setDragPoints] = useState<Point[] | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<SnapPoint | null>(null);

  // Refs to keep drag handlers current without re-registering on every polygon/scale
  // change (prevents dropped mousemove events during fast drags — BUG-A7-008).
  const allPolygonsRef = useRef(allPolygons);
  useEffect(() => { allPolygonsRef.current = allPolygons; }, [allPolygons]);
  const classificationsRef = useRef(classifications);
  useEffect(() => { classificationsRef.current = classifications; }, [classifications]);
  const scaleRef = useRef(scale);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  const currentPageRef = useRef(currentPage);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  const [showBatchClassificationPicker, setShowBatchClassificationPicker] = useState(false);
  const [showFloatingReclassify, setShowFloatingReclassify] = useState(false);
  const [hoveredPoly, setHoveredPoly] = useState<{ id: string; clientX: number; clientY: number } | null>(null);

  // Convert a mouse event's screen position to SVG/base-coordinate space.
  //
  // WHY pan and zoom are NOT manually subtracted here:
  //   - The overlay wrapper (wrapperRef) sits inside the PDFViewer pan/zoom div which
  //     applies only a CSS `translate(pan.x, pan.y)` — there is NO CSS `scale()` transform.
  //   - The PDF canvas is rendered at (zoom * 1.5) resolution, but its CSS display size
  //     equals that pixel size exactly (no further scaling), so the element's physical
  //     screen width IS (rawPDFWidth * zoom * 1.5).
  //   - `getBoundingClientRect()` always returns the element's actual screen rect,
  //     already accounting for any ancestor transforms (pan translation in this case).
  //   - Dividing (clientX - rect.left) by rect.width normalises to [0,1] in screen space.
  //     Multiplying by baseDims.width converts to base PDF coordinates (scale=1 space).
  //   - The zoom * 1.5 factor cancels cleanly: it is present in both rect.width
  //     (denominator) and the physical pixel position (numerator), so it has zero net
  //     effect on the result.
  //   - Conclusion: this formula is correct and zoom/pan-invariant without any manual
  //     offset arithmetic. See DrawingTool.tsx getCoords() for the same pattern.
  const toSvgCoords = useCallback(
    (e: React.MouseEvent | MouseEvent): Point => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      // BUG-A7-4-008: guard zero-dimension rect to avoid Infinity/NaN
      if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
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

  // BUG-A7-4-009: RAF ref for coalescing mousemove during vertex drag
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      e.preventDefault();
      // BUG-A7-4-009: coalesce with requestAnimationFrame
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const pt = toSvgCoords(e);
        const rect = wrapperRef.current?.getBoundingClientRect();
        const screenToBase = rect ? baseDims.width / rect.width : 1;
        const snapThreshold = 10 * screenToBase;
        const otherPolygons = allPolygonsRef.current.filter(
          (p) => p.pageNumber === currentPageRef.current && p.id !== dragging.polygonId
        );
        const snap = snapToNearestVertex(pt, otherPolygons, snapThreshold);
        const snappedPt = snap ? { x: snap.x, y: snap.y } : pt;
        setSnapIndicator(snap);
        setDragPoints((prev) => {
          if (!prev) return prev;
          const updated = [...prev];
          updated[dragging.vertexIndex] = snappedPt;
          return updated;
        });
      });
    };

    const handleUp = (e: MouseEvent) => {
      e.preventDefault();
      setSnapIndicator(null);
      setDragPoints((prev) => {
        if (prev) {
          // Read from refs to get the freshest polygon/scale data without re-registering
          const polygon = allPolygonsRef.current.find((p) => p.id === dragging.polygonId);
          const cls = polygon ? classificationsRef.current.find((c) => c.id === polygon.classificationId) : null;
          const isLinear = cls?.type === 'linear';
          const ppu = scaleRef.current?.pixelsPerUnit || 1;
          const area = calculatePolygonArea(prev);
          // BUG-A5-H03: recompute linearFeet for both linear (open path) and area (closed perimeter)
          const linearFeet = isLinear
            ? calculateLinearFeet(prev, ppu, false)
            : calculateLinearFeet(prev, ppu, true);
          updatePolygon(dragging.polygonId, { points: prev, area, linearFeet });
        }
        return null;
      });
      setDragging(null);
    };

    // BUG-A7-4-054: add touch handlers for mobile vertex drag
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, preventDefault: () => {} } as unknown as MouseEvent);
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length > 0) {
        handleUp({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY, preventDefault: () => {} } as unknown as MouseEvent);
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
    // Only re-register handlers when dragging starts/stops or coordinate-space changes.
    // allPolygons/classifications/scale/currentPage are accessed via stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, toSvgCoords, updatePolygon, baseDims]);

  // BUG-A6-5-007 fix: track in-flight DELETE polygon IDs to prevent duplicate concurrent DELETEs
  const inFlightDeleteIds = useRef<Set<string>>(new Set());

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

      // BUG-A6-5-007: skip if a DELETE is already in-flight for this polygon
      if (inFlightDeleteIds.current.has(selectedPolygonId)) return;

      e.preventDefault();
      e.stopPropagation();
      // BUG-A7-5-039 fix: store.deletePolygon already handles API sync via apiSync()
      // — removed duplicate raw fetch() DELETE that caused double-delete
      deletePolygon(selectedPolygonId);
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

  // BUG-A7-5-071 fix: pre-build per-polygon index map so hover tooltip avoids
  // two O(n) filter+findIndex passes on every pointer-move event.
  const polygonIndexInClassMap = useMemo(() => {
    const map = new Map<string, number>();
    const clsCount = new Map<string, number>();
    for (const p of polygons) {
      const next = (clsCount.get(p.classificationId) ?? 0) + 1;
      map.set(p.id, next);
      clsCount.set(p.classificationId, next);
    }
    return map;
  }, [polygons]);
  const polygonIds = useMemo(() => new Set(allPolygons.map((polygon) => polygon.id)), [allPolygons]);

  // fix(canvas): smart label deduplication for dense polygon clusters
  //
  // labelDecisions pre-computes per-polygon label visibility before the render loop:
  //   1. COUNT polygons: if >3 of the same classification are within 100px of each
  //      other, suppress individual labels and nominate ONE summary badge at the group
  //      centroid. The nominated polygon's entry carries { summaryLabel, summaryCentroid }.
  //   2. AREA polygons: skip the label when the rendered polygon area < 3000px².
  //   3. Generic deduplication: if two labels would render within 60px of each other,
  //      suppress the smaller/lower-confidence one.
  //
  // All distances are in SVG-viewBox units (baseDims space). We convert the pixel
  // thresholds using the ratio baseDims.width / wrapperWidth so the behaviour is
  // zoom-invariant. Because the wrapper DOM size may not be known during SSR or before
  // first paint, we fall back to baseDims.width / 1000 as a reasonable estimate.
  const labelDecisions = useMemo(() => {
    const wrapperEl = wrapperRef.current;
    const wrapperW = wrapperEl ? wrapperEl.getBoundingClientRect().width : 0;
    const wrapperH = wrapperEl ? wrapperEl.getBoundingClientRect().height : 0;
    // pixels-per-baseDim unit in each axis
    const pxPerUnitX = wrapperW > 0 ? wrapperW / baseDims.width : 1000 / baseDims.width;
    const pxPerUnitY = wrapperH > 0 ? wrapperH / baseDims.height : 1000 / baseDims.height;

    // threshold in baseDim units
    const cluster100px = 100 / Math.min(pxPerUnitX, pxPerUnitY);
    const dedup60px   = 60  / Math.min(pxPerUnitX, pxPerUnitY);
    const minArea3000px2 = 3000 / (pxPerUnitX * pxPerUnitY);

    type LabelDecision = {
      show: boolean;
      // For the nominated COUNT summary:
      summaryLabel?: string;
      summaryCentroid?: { x: number; y: number };
    };
    const decisions = new Map<string, LabelDecision>();

    // Helper: centroid of a polygon's points
    const centroid = (pts: Point[]) => ({
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    });

    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    // ── STEP 1: COUNT polygon clustering ────────────────────────────────────────
    // Group count polygons by classificationId and cluster them spatially.
    const countPolygons = polygons.filter(
      (p) => (classificationById.get(p.classificationId)?.type ?? 'area') === 'count'
    );

    // Simple greedy clustering: O(n²) is fine for typical polygon counts (<1000).
    const visited = new Set<string>();
    for (const anchor of countPolygons) {
      if (visited.has(anchor.id)) continue;
      const anchorCent = centroid(anchor.points.length > 0 ? anchor.points : [{ x: 0, y: 0 }]);
      // Find all same-classification polygons within 100px
      const cluster = countPolygons.filter(
        (p) =>
          p.classificationId === anchor.classificationId &&
          dist(anchorCent, centroid(p.points.length > 0 ? p.points : [{ x: 0, y: 0 }])) <= cluster100px
      );
      cluster.forEach((p) => visited.add(p.id));

      if (cluster.length > 3) {
        // Suppress all individual labels; nominate the first one to carry the summary.
        const groupCentX = cluster.reduce((s, p) => {
          const c = centroid(p.points.length > 0 ? p.points : [{ x: 0, y: 0 }]);
          return s + c.x;
        }, 0) / cluster.length;
        const groupCentY = cluster.reduce((s, p) => {
          const c = centroid(p.points.length > 0 ? p.points : [{ x: 0, y: 0 }]);
          return s + c.y;
        }, 0) / cluster.length;
        const cls = classificationById.get(anchor.classificationId);
        const rawLabel = (anchor.label ?? cls?.name ?? '').trim();
        const summaryLabel = rawLabel
          ? `${rawLabel}: ${cluster.length} EA`
          : `${cluster.length} EA`;
        const nominee = cluster[0];
        cluster.forEach((p) => {
          decisions.set(p.id, {
            show: p.id === nominee.id,
            summaryLabel: p.id === nominee.id ? summaryLabel : undefined,
            summaryCentroid: p.id === nominee.id ? { x: groupCentX, y: groupCentY } : undefined,
          });
        });
      } else {
        // Small cluster — show individual labels normally (dedup pass below may still suppress)
        cluster.forEach((p) => {
          if (!decisions.has(p.id)) decisions.set(p.id, { show: true });
        });
      }
    }

    // ── STEP 2: AREA polygon minimum-size guard ──────────────────────────────────
    const areaPolygons = polygons.filter(
      (p) => (classificationById.get(p.classificationId)?.type ?? 'area') === 'area'
    );
    for (const p of areaPolygons) {
      if (decisions.has(p.id)) continue; // already decided
      // Approximate rendered pixel area of the polygon
      const pts = p.points;
      if (pts.length < 3) {
        // AG-005: in agent mode always show labels so agent can read measurements
        decisions.set(p.id, { show: agentMode });
        continue;
      }
      // Shoelace in baseDim units → convert to px²
      let shoelace = 0;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        shoelace += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      }
      const areaPx2 = Math.abs(shoelace / 2) * pxPerUnitX * pxPerUnitY;
      // AG-005: bypass minimum-area threshold in agent mode
      decisions.set(p.id, { show: agentMode || areaPx2 >= minArea3000px2 });
    }

    // Default all remaining (linear) polygons to show
    for (const p of polygons) {
      if (!decisions.has(p.id)) decisions.set(p.id, { show: true });
    }

    // ── STEP 3: Generic 60px deduplication ──────────────────────────────────────
    // Collect centroids of all polygons whose labels are still visible after steps 1-2.
    // Sort by descending area (area polys) or descending confidence for others, so the
    // most prominent label wins when two overlap.
    type Candidate = {
      id: string;
      cx: number;
      cy: number;
      priority: number; // higher = more prominent
    };
    const candidates: Candidate[] = [];
    for (const p of polygons) {
      const d = decisions.get(p.id);
      if (!d?.show) continue;
      const pts = p.points;
      if (pts.length === 0) continue;
      const cx = pts.reduce((s, pt) => s + pt.x, 0) / pts.length;
      const cy = pts.reduce((s, pt) => s + pt.y, 0) / pts.length;
      // Use summary centroid for nominated COUNT summary labels
      const finalCx = d.summaryCentroid ? d.summaryCentroid.x : cx;
      const finalCy = d.summaryCentroid ? d.summaryCentroid.y : cy;
      const clsType = classificationById.get(p.classificationId)?.type ?? 'area';
      // Priority: area polygons rank by rendered area; others by confidence
      const priority = clsType === 'area'
        ? p.area * pxPerUnitX * pxPerUnitY
        : (p.confidence ?? 0.5) * 1000;
      candidates.push({ id: p.id, cx: finalCx, cy: finalCy, priority });
    }
    // Sort descending by priority
    candidates.sort((a, b) => b.priority - a.priority);

    const placed: { x: number; y: number }[] = [];
    for (const cand of candidates) {
      const tooClose = placed.some((p) => dist(p, { x: cand.cx, y: cand.cy }) < dedup60px);
      if (tooClose) {
        // Suppress this label
        const existing = decisions.get(cand.id);
        if (existing) decisions.set(cand.id, { ...existing, show: false });
      } else {
        placed.push({ x: cand.cx, y: cand.cy });
      }
    }

    return decisions;
    // Re-compute when polygons, classifications, or wrapper size changes.
    // We intentionally depend on baseDims (which changes with page/zoom) instead of
    // reading wrapperRef.current inside the deps array (refs are not reactive).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygons, classificationById, baseDims]);

  // BUG-MX-004 fix: label collision-avoidance offsets.
  // For labels that survive the deduplication pass above, run a single collision sweep:
  // if two visible labels are within 40px vertically AND 80px horizontally (in screen space),
  // offset the later one by +24px on Y. One pass is sufficient for typical densities.
  const labelYOffsets = useMemo(() => {
    const offsets = new Map<string, number>(); // polygonId → extra Y offset in baseDim units
    const wrapperEl = wrapperRef.current;
    const wrapperW = wrapperEl ? wrapperEl.getBoundingClientRect().width : 0;
    const wrapperH = wrapperEl ? wrapperEl.getBoundingClientRect().height : 0;
    const pxPerUnitX = wrapperW > 0 ? wrapperW / baseDims.width : 1000 / baseDims.width;
    const pxPerUnitY = wrapperH > 0 ? wrapperH / baseDims.height : 1000 / baseDims.height;
    // Thresholds in baseDim units
    const thresh40pxY = 40 / pxPerUnitY;
    const thresh80pxX = 80 / pxPerUnitX;
    const shift24pxY = 24 / pxPerUnitY;

    // Collect visible label centroids in order (polygon render order)
    type LabelPos = { id: string; cx: number; cy: number };
    const visible: LabelPos[] = [];
    for (const p of polygons) {
      const d = labelDecisions.get(p.id);
      if (!d?.show) continue;
      if (!p.points || p.points.length === 0) continue;
      const cx = d.summaryCentroid ? d.summaryCentroid.x : p.points.reduce((s, pt) => s + pt.x, 0) / p.points.length;
      const cy = d.summaryCentroid ? d.summaryCentroid.y : p.points.reduce((s, pt) => s + pt.y, 0) / p.points.length;
      visible.push({ id: p.id, cx, cy });
    }

    // Single forward pass: compare each label against all previously placed ones
    const placed: LabelPos[] = [];
    for (const label of visible) {
      let yOff = 0;
      for (const prior of placed) {
        const dx = Math.abs(label.cx - prior.cx);
        const dy = Math.abs((label.cy + yOff) - prior.cy);
        if (dy < thresh40pxY && dx < thresh80pxX) {
          // Collision — shift this label down
          yOff += shift24pxY;
        }
      }
      if (yOff !== 0) offsets.set(label.id, yOff);
      placed.push({ ...label, cy: label.cy + yOff });
    }
    return offsets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygons, labelDecisions, baseDims]);
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
  // BUG-A7-5-052 fix: compute centroid across ALL selected polygons, not just the last one
  const batchMenuPosition = useMemo(() => {
    if (selectedPolygonsOnPage.length === 0) return null;
    const allPoints = selectedPolygonsOnPage.flatMap((p) => p.points);
    if (allPoints.length === 0) return null;
    const sumX = allPoints.reduce((s, p) => s + p.x, 0);
    const sumY = allPoints.reduce((s, p) => s + p.y, 0);
    return {
      xPct: (sumX / allPoints.length / baseDims.width) * 100,
      yPct: (sumY / allPoints.length / baseDims.height) * 100,
    };
  }, [selectedPolygonsOnPage, baseDims]);
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

  // BUG-A7-5-046 fix: use union type for SVGPolygonElement, SVGPolylineElement, and SVGCircleElement
  // so no unsafe `as unknown as` cast is needed on the polyline/circle onClick handlers.
  type SvgPolyHandler = React.MouseEventHandler<SVGPolygonElement | SVGPolylineElement | SVGCircleElement>;

  const handlePolygonClick: SvgPolyHandler = useCallback(
    (e: React.MouseEvent<SVGPolygonElement | SVGPolylineElement | SVGCircleElement>) => {
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

  const handlePolygonContextMenu: SvgPolyHandler = useCallback(
    (e: React.MouseEvent<SVGPolygonElement | SVGPolylineElement | SVGCircleElement>) => {
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

  // BUG-A7-4-007: use batchUpdatePolygons for single undo snapshot
  const handleBatchReclassify = useCallback(
    (classificationId: string) => {
      const patches = selectedPolygons
        .filter((polygonId) => polygonIds.has(polygonId))
        .map((polygonId) => ({ id: polygonId, patch: { classificationId } }));
      if (patches.length > 0) {
        batchUpdatePolygons(patches);
      }
      setShowBatchClassificationPicker(false);
    },
    [selectedPolygons, polygonIds, batchUpdatePolygons]
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

  // BUG-A7-5-039 fix: store.deletePolygon already handles API sync — removed
  // duplicate raw fetch() DELETE that caused double-delete
  const handleFloatingDelete = useCallback(() => {
    if (!singleSelectedPoly) return;
    deletePolygon(singleSelectedPoly.id);
  }, [singleSelectedPoly, deletePolygon]);

  // BUG-A7-4-057: use baseDims-relative offset instead of hardcoded +20
  const handleFloatingDuplicate = useCallback(() => {
    if (!singleSelectedPoly) return;
    const offset = Math.max(1, baseDims.width * 0.01);
    addPolygon({
      points: singleSelectedPoly.points.map((p) => ({ x: p.x + offset, y: p.y + offset })),
      classificationId: singleSelectedPoly.classificationId,
      pageNumber: singleSelectedPoly.pageNumber,
      area: singleSelectedPoly.area,
      linearFeet: singleSelectedPoly.linearFeet,
      isComplete: singleSelectedPoly.isComplete,
      label: singleSelectedPoly.label,
    });
  }, [singleSelectedPoly, addPolygon, baseDims.width]);

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

  // BUG-A7-4-056: stable callbacks for polygon group hover — read id from data-polygon-id
  const handleGroupPointerEnter = useCallback((e: React.PointerEvent<SVGGElement>) => {
    const id = e.currentTarget.dataset.polygonId;
    if (id) setHoveredPoly({ id, clientX: e.clientX, clientY: e.clientY });
  }, []);
  const handleGroupPointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    const id = e.currentTarget.dataset.polygonId;
    if (id) setHoveredPoly((prev) => prev?.id === id ? { id, clientX: e.clientX, clientY: e.clientY } : prev);
  }, []);
  const handleGroupPointerLeave = useCallback((e: React.PointerEvent<SVGGElement>) => {
    const id = e.currentTarget.dataset.polygonId;
    setHoveredPoly((prev) => prev?.id === id ? null : prev);
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
        ref={svgRef}
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
          const isSelected = selectedSet.has(poly.id) || selectedPolygon === poly.id;
          const isHighlighted = highlightedPolygonId === poly.id;
          const isDraggingThis = dragging?.polygonId === poly.id;
          const displayPoints = isDraggingThis && dragPoints ? dragPoints : poly.points;
          const pointsStr = displayPoints.map((p: Point) => `${p.x},${p.y}`).join(' ');
          const polyWithDisplay = poly as typeof poly & { color?: string; fillOpacity?: number };
          const color = getPolygonColor(polyWithDisplay, cls?.color);
          const fillOpacity = getPolygonFillOpacity(polyWithDisplay, isSelected, isHighlighted, prefs.polygonFillOpacity);
          const isLinearPoly = cls?.type === 'linear';
          const isCountPoly = cls?.type === 'count';
          const countIndex = polygonIndexInClassMap.get(poly.id) ?? 1;
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
              data-polygon-id={poly.id}
              onPointerEnter={(currentTool === 'select' || currentTool === 'pan') ? handleGroupPointerEnter : undefined}
              onPointerMove={(currentTool === 'select' || currentTool === 'pan') ? handleGroupPointerMove : undefined}
              onPointerLeave={(currentTool === 'select' || currentTool === 'pan') ? handleGroupPointerLeave : undefined}
            >
              {isCountPoly ? (
                (() => {
                  const cx = displayPoints[0]?.x ?? 0;
                  const cy = displayPoints[0]?.y ?? 0;
                  return (
                    <>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={8}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                        style={sharedStyle}
                        data-polygon-id={poly.id}
                        onClick={handlePolygonClick}
                        onContextMenu={handlePolygonContextMenu}
                        aria-label={cls?.name ?? 'Count marker'}
                      >
                        <title>{`${cls?.name ?? 'Count marker'} #${countIndex}`}</title>
                      </circle>
                      <text
                        x={cx}
                        y={cy + 4}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="700"
                        fontFamily="sans-serif"
                        fill="#ffffff"
                        pointerEvents="none"
                        style={{ userSelect: 'none' }}
                      >
                        {countIndex}
                      </text>
                      {isSelected && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={12}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth={2}
                          strokeDasharray="4 3"
                          opacity={0.75}
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />
                      )}
                      {isClassHovered && !isSelected && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={12}
                          fill="rgba(255,255,255,0.15)"
                          stroke="#00d4ff"
                          strokeWidth={2}
                          opacity={0.8}
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />
                      )}
                    </>
                  );
                })()
              ) : isLinearPoly ? (
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
                    onClick={handlePolygonClick}
                    onContextMenu={handlePolygonContextMenu}
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
              {isSelected && !isCountPoly && (
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
              {isClassHovered && !isSelected && !isCountPoly && (
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
              {/* BUG-A6-015 fix: stable keys for vertex handles */}
              {isSelected &&
                displayPoints.map((pt: Point, i: number) => (
                  <rect
                    key={`v-${poly.id}-${i}`}
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
                // fix(canvas): check smart label deduplication decision
                const labelDecision = labelDecisions.get(poly.id);
                if (labelDecision && !labelDecision.show) return null;

                const pts = displayPoints;
                const clsType = cls?.type ?? 'area';
                // Count markers have 1 point, linear can have 2 — allow labels for those
                const minPts = clsType === 'count' ? 1 : clsType === 'linear' ? 2 : 3;
                if (pts.length < minPts) return null;

                // For COUNT summary labels, use the pre-computed group centroid; otherwise use polygon centroid
                const defaultCentX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
                const defaultCentY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
                const centX = labelDecision?.summaryCentroid ? labelDecision.summaryCentroid.x : defaultCentX;
                // BUG-MX-004 fix: apply collision-avoidance Y offset when labels are too close
                const centY = (labelDecision?.summaryCentroid ? labelDecision.summaryCentroid.y : defaultCentY)
                  + (labelYOffsets.get(poly.id) ?? 0);

                if (centX < 0 || centY < 0 || centX > baseDims.width || centY > baseDims.height) return null;
                const pageScale = scales[poly.pageNumber] ?? scale;
                const ppu = pageScale?.pixelsPerUnit || 1;
                // For count: show number of polygons in this classification on this page
                const countForClass = clsType === 'count'
                  ? (polygonCountByClassification.get(poly.classificationId) ?? 0)
                  : 0;
                const countIndex = polygonIndexInClassMap.get(poly.id) ?? 1;
                const areaReal = poly.area / (ppu * ppu);
                // BUG-A7-5-053 fix: use closed=false only for linear (open-path) polygons;
                // area polygons are closed so their perimeter includes the closing segment.
                const linearReal = calculateLinearFeet(poly.points, ppu, clsType !== 'linear');
                // BUG-W28-004: always use live cls.name so rename propagates immediately to canvas labels.
                // Fall back to poly.label only when the classification is not found (deleted/unknown).
                const rawLabel = (cls?.name ?? poly.label ?? '').trim();

                // If this is a COUNT polygon summary (nominated for a dense cluster), use the
                // pre-computed summary label; otherwise build the label normally.
                let displayStr: string;
                let isCountSummary = false;
                if (clsType === 'count' && labelDecision?.summaryLabel) {
                  displayStr = labelDecision.summaryLabel;
                  isCountSummary = true;
                } else {
                  const measureStr =
                    clsType === 'linear'
                      ? `${linearReal.toFixed(1)} LF`
                      : clsType === 'count'
                      ? `${countForClass} EA`
                      : `${areaReal.toFixed(1)} SF`;
                  displayStr = rawLabel ? `${rawLabel}: ${measureStr}` : measureStr;
                }

                const labelColor = cls?.color ?? '#00d4ff';

                // For COUNT polygons (dots/markers) render a compact badge when not a summary;
                // for dense summaries render a slightly larger pill badge.
                if (clsType === 'count') {
                  // Badge dimensions — tighter than full text labels
                  const badgeText = isCountSummary ? displayStr : `${countIndex}`;
                  const badgeW = Math.max(isCountSummary ? 80 : 26, badgeText.length * 7 + 10);
                  const badgeH = isCountSummary ? 20 : 18;
                  const badgeX = centX - badgeW / 2;
                  const badgeY = centY - badgeH / 2 - (isCountSummary ? 0 : 10); // nudge dot badge above marker
                  return (
                    <g
                      pointerEvents={isSelected ? 'all' : 'none'}
                      style={{ cursor: isSelected ? 'pointer' : undefined }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setShowFloatingReclassify(true);
                      }}
                    >
                      {/* Colored dot */}
                      {!isCountSummary && (
                        <circle
                          cx={centX}
                          cy={centY}
                          r={5}
                          fill={labelColor}
                          stroke="#fff"
                          strokeWidth={1}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {/* Count badge / summary pill */}
                      <rect
                        x={badgeX}
                        y={badgeY}
                        width={badgeW}
                        height={badgeH}
                        fill={isCountSummary ? 'rgba(0,0,0,0.80)' : hexToRgba(labelColor, 0.85)}
                        rx={badgeH / 2}
                        stroke={isCountSummary ? labelColor : undefined}
                        strokeWidth={isCountSummary ? 1 : undefined}
                      />
                      <text
                        x={centX}
                        y={badgeY + badgeH / 2 + 4}
                        fontSize={isCountSummary ? '10' : '9'}
                        fill={isCountSummary ? labelColor : '#fff'}
                        textAnchor="middle"
                        fontFamily="sans-serif"
                        fontWeight="700"
                        style={{ userSelect: 'none' }}
                      >
                        {badgeText}
                      </text>
                    </g>
                  );
                }

                // Standard text label for area / linear polygons
                const longestLen = displayStr.length;
                const labelW = Math.max(60, longestLen * 7 + 14);
                const labelH = 20;
                const rectX = centX - labelW / 2;
                const rectY = centY - labelH / 2;
                return (
                  <g
                    pointerEvents={isSelected ? 'all' : 'none'}
                    style={{ cursor: isSelected ? 'pointer' : undefined }}
                    // BUG-A6-5-009 fix: handler unconditional; pointerEvents already blocks non-selected
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setShowFloatingReclassify(true);
                    }}
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
                      data-testid="polygon-label"
                      data-polygon-id={poly.id}
                      data-type={clsType}
                      data-value={displayStr}
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
      {/* P4-01: Collaborator cursors — render other users' cursor positions */}
      {useStore.getState().collaborators
        .filter((c) => c.cursor && c.cursor.page === (useStore.getState().currentPage ?? 1))
        .map((c) => {
          if (!c.cursor) return null;
          const pctX = (c.cursor.x / baseDims.width) * 100;
          const pctY = (c.cursor.y / baseDims.height) * 100;
          return (
            <div
              key={c.id}
              data-testid="collaborator-cursor"
              style={{
                position: 'absolute',
                left: `${pctX}%`,
                top: `${pctY}%`,
                pointerEvents: 'none',
                transform: 'translate(-2px, -2px)',
                zIndex: 50,
              }}
            >
              <svg width="16" height="20" viewBox="0 0 16 20" fill={c.color} aria-hidden="true">
                <path d="M0 0 L0 16 L4 12 L7 18 L9 17 L6 11 L11 11 Z" stroke="#fff" strokeWidth="1" />
              </svg>
              <span style={{
                position: 'absolute',
                top: 16,
                left: 4,
                background: c.color,
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 4px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
              }}>
                {c.name}
              </span>
            </div>
          );
        })}
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
          // BUG-A7-5-071 fix: use pre-built map instead of O(n) filter+findIndex
          const idx = polygonIndexInClassMap.get(poly.id) ?? 1;
          const total = polygonCountByClassification.get(poly.classificationId) ?? 1;
          lines.push(`${cls?.name ?? 'Item'} ${idx} of ${total}`);
        }
        lines.push(`Page ${poly.pageNumber}`);
        if (poly.detectedByModel || poly.confidence !== undefined) {
          const parts: string[] = [];
          if (poly.detectedByModel) parts.push(`Detected by: ${getModelDisplayName(poly.detectedByModel)}`);
          if (poly.confidence !== undefined) parts.push(`Confidence: ${Math.round(poly.confidence * 100)}%`);
          lines.push(parts.join(" | "));
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
            {/* BUG-A6-015 fix: stable keys for tooltip lines */}
            {lines.map((line, i) => (
              <div key={`tl-${i}`} style={i === 0 ? { color: labelColor, fontWeight: 600 } : undefined}>
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
        const svgEl = svgRef.current;
        const svgRect = svgEl?.getBoundingClientRect();
        if (!svgRect || svgRect.width === 0 || svgRect.height === 0 || baseDims.width === 0) return null;
        const scaleX = svgRect.width / baseDims.width;
        const scaleY = svgRect.height / baseDims.height;
        // BUG-A6-040 fix: use wrapper-relative coordinates with scroll offset compensation
        const wrapperRect = wrapperRef.current?.getBoundingClientRect();
        const offsetLeft = wrapperRect ? svgRect.left - wrapperRect.left : 0;
        const offsetTop = wrapperRect ? svgRect.top - wrapperRect.top : 0;
        const screenX = offsetLeft + floatingToolbarPos.centX * scaleX;
        const screenY = offsetTop + floatingToolbarPos.centY * scaleY;
        return (
          <div
            style={{
              position: 'absolute',
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
        const svgEl = svgRef.current;
        const svgRect = svgEl?.getBoundingClientRect();
        if (!svgRect || svgRect.width === 0 || svgRect.height === 0 || baseDims.width === 0) return null;
        const scaleX = svgRect.width / baseDims.width;
        const scaleY = svgRect.height / baseDims.height;
        // BUG-A6-040 fix: use wrapper-relative coordinates
        const wrapperRect2 = wrapperRef.current?.getBoundingClientRect();
        const offsetLeft2 = wrapperRect2 ? svgRect.left - wrapperRect2.left : 0;
        const offsetTop2 = wrapperRect2 ? svgRect.top - wrapperRect2.top : 0;
        const screenX = offsetLeft2 + floatingToolbarPos.centX * scaleX;
        const screenY = offsetTop2 + floatingToolbarPos.centY * scaleY;
        return (
          <div
            style={{
              position: 'absolute',
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

// P1-04 audit: CanvasOverlay has no isTrusted, synthetic, or simulated event guards.
// onCanvasPointerDown and all pointer/mouse handlers accept both trusted (human)
// and synthetic (CDP agent, browser-use) events without filtering.
export default React.memo(CanvasOverlay);
export { hexToRgba, getPolygonColor };
