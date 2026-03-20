import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ProjectState,
  Classification,
  Polygon,
  ScaleCalibration,
  Point,
  Assembly,
  ClassificationGroup,
  Markup,
  Annotation,
  RepeatingGroup,
} from './types';
import { mergePolygons as mergePolygonPoints, splitPolygonByLine, calculatePolygonArea } from './polygon-utils';
import { assignTradeGroup } from './trade-groups';

// Helpers
const isHex = (c: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c.trim());
const trimLower = (s: string) => s.trim().toLowerCase();

// BUG-A5-C3 fix: fire-and-forget API sync helper.
// Mutations update local state optimistically, then persist to the API in the background.
function apiSync(url: string, options: RequestInit): void {
  if (typeof fetch === 'undefined') return; // SSR guard
  fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  }).catch((err) => {
    // BUG-A5-5-042: notify user when apiSync fails
    console.error(`[store] API sync failed: ${options.method} ${url}`, err);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mx:sync-error', { detail: { method: options.method, url, error: String(err) } }));
    }
  });
}

// History snapshot — includes all user-editable data so undo/redo is complete
// BUG-A5-H06: added groups, assemblies, markups to undo snapshots
interface HistorySnapshot {
  classifications: Classification[];
  polygons: Polygon[];
  annotations: Annotation[];
  scale: ScaleCalibration | null;
  scales: Record<number, ScaleCalibration>;
  selectedClassification: string | null;
  selectedPolygon: string | null;
  selectedPolygonId: string | null;
  selectedPolygons: string[];
  repeatingGroups: RepeatingGroup[];
  groups: ClassificationGroup[];
  assemblies: Assembly[];
  markups: Markup[];
}

export type Tool =
  | 'select'
  | 'pan'
  | 'draw'
  | 'merge'
  | 'split'
  | 'cut'
  | 'ai'
  | 'measure'
  | 'annotate'
  | 'calibrate'
  | 'crop';

export interface Store extends ProjectState {
  // UI state
  currentTool: Tool;
  zoomLevel: number;
  showScalePopup: boolean;
  setShowScalePopup: (show: boolean) => void;
  setZoomLevel: (zoomLevel: number) => void;
  selectedClassification: string | null;
  selectedPolygon: string | null;
  selectedPolygonId: string | null;
  selectedPolygons: string[];
  // Mobile UI state
  showQuantitiesDrawer: boolean;
  setShowQuantitiesDrawer: (show: boolean) => void;
  showMobileMenu: boolean;
  setShowMobileMenu: (show: boolean) => void;

  // History
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];

  // Actions — Classifications
  addClassification: (c: { name: string; color: string; type: Classification['type']; visible?: boolean }) => string;
  updateClassification: (id: string, patch: Partial<Classification>) => void;
  deleteClassification: (id: string) => void;
  setSelectedClassification: (id: string | null) => void;
  toggleClassification: (id: string) => void;
  mergeClassifications: (survivorId: string, mergedIds: string[]) => void;

  // Actions — Polygons
  addPolygon: (p: { points: Point[]; classificationId: string; pageNumber: number; area?: number; linearFeet?: number; label?: string; isComplete?: boolean; color?: string }) => string;
  updatePolygon: (id: string, patch: Partial<Polygon>) => void;
  deletePolygon: (id: string) => void;
  setSelectedPolygon: (id: string | null) => void;
  setSelectedPolygons: (ids: string[]) => void;
  togglePolygonSelection: (id: string) => void;
  clearPolygonSelection: () => void;
  deleteSelectedPolygons: () => void;
  batchUpdatePolygons: (patches: Array<{ id: string; patch: Partial<Polygon> }>) => void;

  // Actions — Annotations
  addAnnotation: (a: Omit<Annotation, 'id'>) => string;
  updateAnnotation: (id: string, patch: Partial<Omit<Annotation, 'id'>>) => void;
  deleteAnnotation: (id: string) => void;

  // Merge/Split/Cut
  mergePolygons: (id1: string, id2: string) => void;
  splitPolygon: (id: string, lineStart: Point, lineEnd: Point) => void;
  cutPolygon: (id: string, cutShape: Point[]) => void;

  // Scale (per page)
  setScale: (scale: ScaleCalibration) => void;
  setScaleForPage: (page: number, scale: ScaleCalibration) => void;
  getScaleForPage: (page: number) => ScaleCalibration | null;

  // General
  setTool: (tool: Tool) => void;
  setCurrentPage: (page: number, totalPages?: number) => void;
  hydrateState: (state: ProjectState) => void;

  // History controls
  undo: () => void;
  redo: () => void;

  // Project ID (set by page.tsx for sub-components to access)
  projectId: string | null;
  setProjectId: (id: string | null) => void;

  // Assemblies
  assemblies: Assembly[];
  setAssemblies: (assemblies: Assembly[]) => void;
  addAssembly: (assembly: Assembly) => void;
  updateAssembly: (id: string, updates: Partial<Assembly>) => void;
  deleteAssembly: (id: string) => void;

  // 3D View
  show3D: boolean;
  toggleShow3D: () => void;
  setShow3D: (show: boolean) => void;

  // Markups
  markups: Markup[];
  showMarkups: boolean;
  addMarkup: (markup: Markup) => void;
  deleteMarkup: (id: string) => void;
  clearMarkups: (pageNumber?: number) => void;
  toggleShowMarkups: () => void;

  // BUG-A7-5-024 fix: markup tool state in store so canvas drawing layer can read it
  activeMarkupTool: Markup['type'];
  markupColor: string;
  markupStrokeWidth: number;
  setActiveMarkupTool: (tool: Markup['type']) => void;
  setMarkupColor: (color: string) => void;
  setMarkupStrokeWidth: (width: number) => void;

  // Calibration (Draw Line mode)
  calibrationMode: boolean;
  calibrationPoints: Point[];
  setCalibrationMode: (active: boolean) => void;
  addCalibrationPoint: (p: Point) => void;
  clearCalibrationPoints: () => void;

  // Sheet names (auto-detected from PDF text)
  sheetNames: Record<number, string>;
  setSheetName: (page: number, name: string) => void;

  // Drawing sets (GAP-005) — maps page number to drawing set name
  drawingSets: Record<number, string>;
  setDrawingSet: (page: number, setName: string) => void;

  // Classification Groups
  groups: ClassificationGroup[];
  // BUG-A6-010 fix: addGroup returns the new group's ID so callers don't need
  // a setTimeout(0) workaround to find the newly created group.
  addGroup: (name: string, color: string) => string;
  updateGroup: (id: string, patch: Partial<ClassificationGroup>) => void;
  deleteGroup: (id: string) => void;
  // BUG-A6-009 fix: add reorderGroups action to support move-up/move-down in ClassificationGroups UI.
  reorderGroups: (ids: string[]) => void;
  moveClassificationToGroup: (classificationId: string, groupId: string) => void;
  addBreakdown: (groupId: string, name: string) => void;
  deleteBreakdown: (groupId: string, breakdownId: string) => void;

  // Snapping & Grid
  snappingEnabled: boolean;
  gridEnabled: boolean;
  gridSize: number;
  setSnapping: (enabled: boolean) => void;
  setGrid: (enabled: boolean) => void;
  setGridSize: (size: number) => void;

  // Page base dimensions (PDF page at scale=1, used for zoom-independent polygon coordinates)
  pageBaseDimensions: Record<number, { width: number; height: number }>;
  setPageBaseDimensions: (page: number, dims: { width: number; height: number }) => void;

  // Multi-select polygons (additional helpers)
  selectPolygon: (id: string) => void;
  deselectPolygon: (id: string) => void;
  clearSelectedPolygons: () => void;

  // Focus polygon (for "find on canvas")
  focusedPolygonId: string | null;
  focusPolygon: (id: string | null) => void;

  // Hovered classification (for canvas highlight from QuantitiesPanel)
  hoveredClassificationId: string | null;
  setHoveredClassificationId: (id: string | null) => void;

  // Last polygon added (for Ctrl+D duplicate) — NOT persisted
  lastPolygon: Polygon | null;

  // Repeating Groups
  repeatingGroups: RepeatingGroup[];
  addRepeatingGroup: (g: Omit<RepeatingGroup, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateRepeatingGroup: (id: string, patch: Partial<RepeatingGroup>) => void;
  deleteRepeatingGroup: (id: string) => void;
  isDefiningGroup: boolean;
  setIsDefiningGroup: (v: boolean) => void;
}

const MAX_UNDO_STACK = 50;

// BUG-A7-5-007 fix: abort in-flight scale fetch when page changes
let scaleAbortController: AbortController | null = null;

function snapshot(state: Store): HistorySnapshot {
  return {
    classifications: structuredClone(state.classifications),
    polygons: structuredClone(state.polygons),
    annotations: structuredClone(state.annotations ?? []),
    scale: state.scale ? structuredClone(state.scale) : null,
    scales: structuredClone(state.scales),
    selectedClassification: state.selectedClassification,
    selectedPolygon: state.selectedPolygon,
    selectedPolygonId: state.selectedPolygonId,
    selectedPolygons: structuredClone(state.selectedPolygons),
    repeatingGroups: structuredClone(state.repeatingGroups),
    groups: structuredClone(state.groups),
    assemblies: structuredClone(state.assemblies),
    markups: structuredClone(state.markups),
  };
}

/** Push a snapshot onto the undo stack, capping at MAX_UNDO_STACK entries to prevent unbounded memory growth. */
function pushUndo(existing: HistorySnapshot[], entry: HistorySnapshot): HistorySnapshot[] {
  const next = [...existing, entry];
  return next.length > MAX_UNDO_STACK ? next.slice(next.length - MAX_UNDO_STACK) : next;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
  // ProjectState
  classifications: [],
  polygons: [],
  annotations: [],
  scale: null,
  scales: {},
  currentPage: 1,
  totalPages: 1,

  // UI
  currentTool: 'select',
  zoomLevel: 1,
  showScalePopup: false,
  setShowScalePopup: (show) => set({ showScalePopup: show }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel: Math.max(0.25, Math.min(4, zoomLevel)) }),
  selectedClassification: null,
  selectedPolygon: null,
  selectedPolygonId: null,
  selectedPolygons: [],
  showQuantitiesDrawer: false,
  setShowQuantitiesDrawer: (show) => set({ showQuantitiesDrawer: show }),
  showMobileMenu: false,
  setShowMobileMenu: (show) => set({ showMobileMenu: show }),

  // History
  undoStack: [],
  redoStack: [],

  // Classifications
  addClassification: ({ name, color, type, visible = true }) => {
    const s = get();
    const norm = trimLower(name);
    if (!name.trim()) throw new Error('Classification name is required');
    if (!isHex(color)) throw new Error('Color must be a valid hex like #10b981');
    if (s.classifications.some((c) => trimLower(c.name) === norm)) {
      // Return existing id to de-dup
      const existing = s.classifications.find((c) => trimLower(c.name) === norm)!;
      return existing.id;
    }
    const id = crypto.randomUUID();
    const tradeGroup = assignTradeGroup(name.trim());
    const next: Classification = { id, name: name.trim(), color: color.trim(), type, visible, tradeGroup };
    const before = snapshot(s);
    set({ classifications: [...s.classifications, next], undoStack: pushUndo(s.undoStack, before), redoStack: [] });
    // BUG-A5-C3: sync to API
    const pid = s.projectId;
    if (pid) {
      apiSync(`/api/projects/${pid}/classifications`, {
        method: 'POST',
        body: JSON.stringify({ id, name: next.name, type: next.type, color: next.color, visible: next.visible }),
      });
    }
    return id;
  },

  updateClassification: (id, patch) => {
    const s = get();
    if (patch.name !== undefined) {
      const nm = patch.name.trim();
      if (!nm) return; // ignore empty
      // dedupe
      if (get().classifications.some((c) => c.id !== id && trimLower(c.name) === trimLower(nm))) return;
      patch.name = nm;
    }
    if (patch.color !== undefined && !isHex(patch.color)) return;
    const before = snapshot(s);
    set({
      classifications: s.classifications.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
    // BUG-A5-C3: sync to API
    const pid = s.projectId;
    if (pid) {
      apiSync(`/api/projects/${pid}/classifications/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
    }
  },

  deleteClassification: (id) => {
    const s = get();
    const before = snapshot(s);
    const deletedPolygonIds = new Set(s.polygons.filter((p) => p.classificationId === id).map((p) => p.id));
    set({
      classifications: s.classifications.filter((c) => c.id !== id),
      polygons: s.polygons.filter((p) => p.classificationId !== id),
      selectedClassification: s.selectedClassification === id ? null : s.selectedClassification,
      selectedPolygon: s.selectedPolygon && s.polygons.find((p) => p.id === s.selectedPolygon && p.classificationId === id) ? null : s.selectedPolygon,
      selectedPolygonId: s.selectedPolygonId && s.polygons.find((p) => p.id === s.selectedPolygonId && p.classificationId === id) ? null : s.selectedPolygonId,
      selectedPolygons: s.selectedPolygons.filter((polygonId) => !deletedPolygonIds.has(polygonId)),
      groups: s.groups.map((g) => ({
        ...g,
        classificationIds: g.classificationIds.filter((cid) => cid !== id),
        breakdowns: g.breakdowns.map((b) => ({
          ...b,
          classificationIds: b.classificationIds.filter((cid) => cid !== id),
        })),
      })),
      assemblies: s.assemblies.filter((a) => a.classificationId !== id),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
    // BUG-A5-C3: sync to API
    const pid = s.projectId;
    if (pid) {
      apiSync(`/api/projects/${pid}/classifications/${id}`, { method: 'DELETE' });
    }
  },

  setSelectedClassification: (id) => set({ selectedClassification: id }),

  toggleClassification: (id) => {
    const s = get();
    const before = snapshot(s);
    set({
      classifications: s.classifications.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  mergeClassifications: (survivorId, mergedIds) => {
    const s = get();
    const idsToRemove = mergedIds.filter((id) => id !== survivorId);
    if (idsToRemove.length === 0) return;
    const removeSet = new Set(idsToRemove);
    const before = snapshot(s);
    set({
      classifications: s.classifications.filter((c) => !removeSet.has(c.id)),
      polygons: s.polygons.map((p) =>
        removeSet.has(p.classificationId) ? { ...p, classificationId: survivorId } : p,
      ),
      groups: s.groups.map((g) => ({
        ...g,
        classificationIds: g.classificationIds.filter((cid) => !removeSet.has(cid)),
        breakdowns: g.breakdowns.map((b) => ({
          ...b,
          classificationIds: b.classificationIds.filter((cid) => !removeSet.has(cid)),
        })),
      })),
      assemblies: s.assemblies.map((a) =>
        removeSet.has(a.classificationId) ? { ...a, classificationId: survivorId } : a,
      ),
      selectedClassification: removeSet.has(s.selectedClassification ?? '') ? survivorId : s.selectedClassification,
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  // Polygons
  addPolygon: ({ points, classificationId, pageNumber, area, linearFeet, label, isComplete = true }) => {
    const s = get();
    const id = crypto.randomUUID();
    const polygon: Polygon = {
      id,
      points: structuredClone(points),
      classificationId,
      pageNumber,
      area: area ?? 0,
      linearFeet: linearFeet ?? 0,
      isComplete,
      label,
    };
    const before = snapshot(s);
    set({ polygons: [...s.polygons, polygon], lastPolygon: polygon, undoStack: pushUndo(s.undoStack, before), redoStack: [] });
    // BUG-A5-C3: sync to API
    const pid = s.projectId;
    if (pid) {
      apiSync(`/api/projects/${pid}/polygons`, {
        method: 'POST',
        body: JSON.stringify({ id: polygon.id, points: polygon.points, classificationId: polygon.classificationId, pageNumber: polygon.pageNumber, area: polygon.area, linearFeet: polygon.linearFeet, isComplete: polygon.isComplete, label: polygon.label }),
      });
    }
    return id;
  },

  updatePolygon: (id, patch) => {
    const s = get();
    const before = snapshot(s);
    set({
      polygons: s.polygons.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
    // BUG-A5-C3: sync to API
    const pid = s.projectId;
    if (pid) {
      apiSync(`/api/projects/${pid}/polygons/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
    }
  },

  deletePolygon: (id) => {
    const s = get();
    const before = snapshot(s);
    set({
      polygons: s.polygons.filter((p) => p.id !== id),
      selectedPolygon: s.selectedPolygon === id ? null : s.selectedPolygon,
      selectedPolygonId: s.selectedPolygonId === id ? null : s.selectedPolygonId,
      selectedPolygons: s.selectedPolygons.filter((polygonId) => polygonId !== id),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
    // BUG-A5-C3: sync to API
    const pid = s.projectId;
    if (pid) {
      apiSync(`/api/projects/${pid}/polygons/${id}`, { method: 'DELETE' });
    }
  },

  setSelectedPolygon: (id) => set({
    selectedPolygon: id,
    selectedPolygonId: id,
    selectedPolygons: id ? [id] : [],
  }),

  setSelectedPolygons: (ids) => {
    const uniqueIds = Array.from(new Set(ids));
    const lastId = uniqueIds.length > 0 ? uniqueIds[uniqueIds.length - 1] : null;
    set({
      selectedPolygons: uniqueIds,
      selectedPolygon: lastId,
      selectedPolygonId: lastId,
    });
  },

  togglePolygonSelection: (id) => {
    const s = get();
    const isSelected = s.selectedPolygons.includes(id);
    const next = isSelected ? s.selectedPolygons.filter((polygonId) => polygonId !== id) : [...s.selectedPolygons, id];
    const lastId = next.length > 0 ? next[next.length - 1] : null;
    set({
      selectedPolygons: next,
      selectedPolygon: lastId,
      selectedPolygonId: lastId,
    });
  },

  clearPolygonSelection: () => set({
    selectedPolygons: [],
    selectedPolygon: null,
    selectedPolygonId: null,
  }),

  deleteSelectedPolygons: () => {
    const s = get();
    const idsToDelete = s.selectedPolygons;
    if (idsToDelete.length === 0) return;
    const idSet = new Set(idsToDelete);
    const before = snapshot(s);
    set({
      polygons: s.polygons.filter((p) => !idSet.has(p.id)),
      selectedPolygons: [],
      selectedPolygon: null,
      selectedPolygonId: null,
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
    // R-C5-001 fix: single batch DELETE instead of per-ID forEach
    if (!s.projectId) return;
    apiSync(`/api/projects/${s.projectId}/polygons`, {
      method: 'DELETE',
      body: JSON.stringify({ ids: idsToDelete }),
    });
  },

  // BUG-A7-4-007: batch update polygons with a single undo snapshot
  batchUpdatePolygons: (patches) => {
    const s = get();
    if (patches.length === 0) return;
    const before = snapshot(s);
    const patchMap = new Map(patches.map((p) => [p.id, p.patch]));
    set({
      polygons: s.polygons.map((p) => {
        const patch = patchMap.get(p.id);
        return patch ? { ...p, ...patch } : p;
      }),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
    // Sync each update to API
    const pid = s.projectId;
    if (pid) {
      for (const { id, patch } of patches) {
        apiSync(`/api/projects/${pid}/polygons/${id}`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
      }
    }
  },

  addAnnotation: (a) => {
    const s = get();
    const id = crypto.randomUUID();
    const annotation: Annotation = {
      id,
      page: a.page,
      x: a.x,
      y: a.y,
      text: a.text,
      color: a.color,
      fontSize: a.fontSize,
    };
    const before = snapshot(s);
    set({ annotations: [...(s.annotations ?? []), annotation], undoStack: pushUndo(s.undoStack, before), redoStack: [] });
    return id;
  },

  updateAnnotation: (id, patch) => {
    const s = get();
    const before = snapshot(s);
    set({
      annotations: (s.annotations ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  deleteAnnotation: (id) => {
    const s = get();
    const before = snapshot(s);
    set({
      annotations: (s.annotations ?? []).filter((a) => a.id !== id),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  // Geometry actions (wired by higher-level tools calling polygon-utils)
  mergePolygons: (id1, id2) => {
    const s = get();
    const p1 = s.polygons.find((p) => p.id === id1);
    const p2 = s.polygons.find((p) => p.id === id2);
    if (!p1 || !p2 || p1.classificationId !== p2.classificationId) return;
    const before = snapshot(s);
    const mergedPoints = mergePolygonPoints(p1.points, p2.points);
    const merged: Polygon = {
      ...p1,
      id: crypto.randomUUID(),
      points: mergedPoints,
      area: calculatePolygonArea(mergedPoints),
    };
    set({
      polygons: s.polygons.filter((p) => p.id !== id1 && p.id !== id2).concat(merged),
      selectedPolygon: merged.id,
      selectedPolygonId: merged.id,
      selectedPolygons: [merged.id],
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  splitPolygon: (id, lineStart, lineEnd) => {
    const s = get();
    const poly = s.polygons.find((p) => p.id === id);
    if (!poly) return;
    const before = snapshot(s);
    const [ptsA, ptsB] = splitPolygonByLine(poly.points, lineStart, lineEnd);
    const results: Polygon[] = [];
    if (ptsA.length >= 3) {
      results.push({ ...poly, id: crypto.randomUUID(), points: ptsA, area: calculatePolygonArea(ptsA) });
    }
    if (ptsB.length >= 3) {
      results.push({ ...poly, id: crypto.randomUUID(), points: ptsB, area: calculatePolygonArea(ptsB) });
    }
    if (results.length === 0) return; // split produced nothing useful
    set({
      polygons: s.polygons.filter((p) => p.id !== id).concat(results),
      selectedPolygon: results[0].id,
      selectedPolygonId: results[0].id,
      selectedPolygons: [results[0].id],
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  cutPolygon: (id, cutShape) => {
    const s = get();
    const poly = s.polygons.find((p) => p.id === id);
    if (!poly || cutShape.length < 3) return;
    const before = snapshot(s);
    try {
      const turf = require('@turf/turf');
      const polyRing: [number, number][] = poly.points.map((p) => [p.x, p.y]);
      polyRing.push([poly.points[0].x, poly.points[0].y]);
      const cutRing: [number, number][] = cutShape.map((p) => [p.x, p.y]);
      cutRing.push([cutShape[0].x, cutShape[0].y]);
      const turfPoly = turf.polygon([polyRing]);
      const turfCut = turf.polygon([cutRing]);
      const fc = turf.featureCollection([turfPoly, turfCut]);
      const diff = turf.difference(fc as GeoJSON.FeatureCollection<GeoJSON.Polygon>);
      if (!diff) {
        // Cut removed entire polygon
        set({
          polygons: s.polygons.filter((p) => p.id !== id),
          selectedPolygons: [],
          selectedPolygon: null,
          selectedPolygonId: null,
          undoStack: pushUndo(s.undoStack, before),
          redoStack: [],
        });
        return;
      }
      const results: Polygon[] = [];
      const extractRing = (coords: number[][]) =>
        coords.slice(0, -1).map((c) => ({ x: c[0], y: c[1] }));
      if (diff.geometry.type === 'Polygon') {
        const pts = extractRing(diff.geometry.coordinates[0]);
        if (pts.length >= 3) {
          results.push({ ...poly, id: crypto.randomUUID(), points: pts, area: calculatePolygonArea(pts) });
        }
      } else {
        for (const rings of (diff.geometry as GeoJSON.MultiPolygon).coordinates) {
          const pts = extractRing(rings[0]);
          if (pts.length >= 3) {
            results.push({ ...poly, id: crypto.randomUUID(), points: pts, area: calculatePolygonArea(pts) });
          }
        }
      }
      if (results.length === 0) {
        set({
          polygons: s.polygons.filter((p) => p.id !== id),
          selectedPolygons: [],
          selectedPolygon: null,
          selectedPolygonId: null,
          undoStack: pushUndo(s.undoStack, before),
          redoStack: [],
        });
      } else {
        set({
          polygons: s.polygons.filter((p) => p.id !== id).concat(results),
          selectedPolygon: results[0].id,
          selectedPolygonId: results[0].id,
          selectedPolygons: [results[0].id],
          undoStack: pushUndo(s.undoStack, before),
          redoStack: [],
        });
      }
    } catch {
      // Fallback: delete the polygon if Turf fails
      set({
        polygons: s.polygons.filter((p) => p.id !== id),
        selectedPolygons: [],
        selectedPolygon: null,
        selectedPolygonId: null,
        undoStack: pushUndo(s.undoStack, before),
        redoStack: [],
      });
    }
  },

  // Scale per page
  setScale: (scale) => {
    // BUG-A7-4-002: reject non-finite or non-positive pixelsPerUnit
    if (!Number.isFinite(scale.pixelsPerUnit) || scale.pixelsPerUnit <= 0) return;
    const s = get();
    const before = snapshot(s);
    set({ scale, undoStack: pushUndo(s.undoStack, before), redoStack: [] });
    // BUG-A5-C3: sync to API
    const pid = s.projectId;
    if (pid) {
      apiSync(`/api/projects/${pid}/scale`, {
        method: 'POST',
        body: JSON.stringify({ pixelsPerUnit: scale.pixelsPerUnit, unit: scale.unit, label: scale.label, source: scale.source, pageNumber: scale.pageNumber }),
      });
    }
  },
  setScaleForPage: (page, scale) => {
    // BUG-A7-4-002: reject non-finite or non-positive pixelsPerUnit
    if (!Number.isFinite(scale.pixelsPerUnit) || scale.pixelsPerUnit <= 0) return;
    const s = get();
    const before = snapshot(s);
    // BUG-A7-4-003: only update global scale when page matches currentPage
    set({
      scales: { ...s.scales, [page]: scale },
      ...(page === s.currentPage ? { scale } : {}),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
    // BUG-A5-C3: sync to API
    const pid = s.projectId;
    if (pid) {
      apiSync(`/api/projects/${pid}/scale`, {
        method: 'POST',
        body: JSON.stringify({ pixelsPerUnit: scale.pixelsPerUnit, unit: scale.unit, label: scale.label, source: scale.source, pageNumber: page }),
      });
    }
  },
  getScaleForPage: (page) => get().scales[page] ?? null,

  // General
  setTool: (tool) => set({ currentTool: tool }),
  // PDF is the source of truth for totalPages: when an explicit totalPages > 1 is
  // provided (e.g. from onPageChange after loading a multi-page PDF), always use it —
  // even if hydration had previously written a stale value of 1.
  setCurrentPage: (page, totalPages) => {
    const state = get();
    // BUG-A5-H07: use per-page scale if available, otherwise null (don't carry stale scale from previous page)
    const pageScale = state.scales[page] ?? null;
    set({
      currentPage: page,
      totalPages: (totalPages !== undefined && totalPages > 1)
        ? totalPages
        : (state.totalPages > 1 ? state.totalPages : (totalPages ?? state.totalPages)),
      scale: pageScale,
    });
    // If no local per-page scale, try to fetch from API
    // BUG-A7-5-007 fix: abort previous in-flight fetch when page changes
    if (scaleAbortController) {
      scaleAbortController.abort();
      scaleAbortController = null;
    }
    if (!pageScale && state.projectId) {
      const controller = new AbortController();
      scaleAbortController = controller;
      fetch(`/api/projects/${state.projectId}/scale?pageNumber=${page}`, { signal: controller.signal })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.scale && get().currentPage === page) {
            set({ scale: data.scale, scales: { ...get().scales, [page]: data.scale } });
          }
        })
        .catch(() => {}) // non-fatal (includes AbortError)
        .finally(() => {
          if (scaleAbortController === controller) scaleAbortController = null;
        });
    }
  },

  hydrateState: (state) => {
    // DO NOT regenerate IDs — trust persisted state
    // Dedup by ID to prevent any double-hydration artifacts
    const seenCls = new Set<string>();
    const dedupedClassifications = (state.classifications || []).filter((c) => {
      if (!c?.id || seenCls.has(c.id)) return false;
      seenCls.add(c.id);
      return true;
    });
    const seenPoly = new Set<string>();
    const dedupedPolygons = (state.polygons || []).filter((p) => {
      if (!p?.id || seenPoly.has(p.id)) return false;
      seenPoly.add(p.id);
      return true;
    });
    const seenAnnotation = new Set<string>();
    const dedupedAnnotations = (state.annotations || []).filter((a) => {
      if (!a?.id || seenAnnotation.has(a.id)) return false;
      seenAnnotation.add(a.id);
      return true;
    });
    set({
      classifications: structuredClone(dedupedClassifications),
      polygons: structuredClone(dedupedPolygons),
      annotations: structuredClone(dedupedAnnotations),
      scale: state.scale ? structuredClone(state.scale) : null,
      scales: structuredClone(state.scales || {}),
      currentPage: state.currentPage || 1,
      totalPages: state.totalPages || 1,
      undoStack: [],
      redoStack: [],
      selectedClassification: null,
      selectedPolygon: null,
      selectedPolygonId: null,
      selectedPolygons: [],
      // R-002: reset fields that were previously leaked across hydrations
      groups: [],
      assemblies: [],
      markups: [],
      repeatingGroups: [],
      sheetNames: {},
      drawingSets: {},
      pageBaseDimensions: {},
    });
  },

  // History controls
  undo: () => {
    const s = get();
    if (s.undoStack.length === 0) return;
    const prev = s.undoStack[s.undoStack.length - 1];
    const rest = s.undoStack.slice(0, -1);
    const now = snapshot(s);
    set({
      classifications: prev.classifications,
      polygons: prev.polygons,
      annotations: prev.annotations,
      scale: prev.scale,
      scales: prev.scales,
      selectedClassification: prev.selectedClassification,
      selectedPolygon: prev.selectedPolygon,
      selectedPolygonId: prev.selectedPolygonId,
      selectedPolygons: prev.selectedPolygons,
      repeatingGroups: prev.repeatingGroups,
      groups: prev.groups,
      assemblies: prev.assemblies,
      markups: prev.markups,
      undoStack: rest,
      redoStack: [...s.redoStack, now],
    });
  },
  redo: () => {
    const s = get();
    if (s.redoStack.length === 0) return;
    const next = s.redoStack[s.redoStack.length - 1];
    const rest = s.redoStack.slice(0, -1);
    const now = snapshot(s);
    set({
      classifications: next.classifications,
      polygons: next.polygons,
      annotations: next.annotations,
      scale: next.scale,
      scales: next.scales,
      selectedClassification: next.selectedClassification,
      selectedPolygon: next.selectedPolygon,
      selectedPolygonId: next.selectedPolygonId,
      selectedPolygons: next.selectedPolygons,
      repeatingGroups: next.repeatingGroups,
      groups: next.groups,
      assemblies: next.assemblies,
      markups: next.markups,
      redoStack: rest,
      undoStack: [...s.undoStack, now],
    });
  },

  // ─── Project ID ───
  projectId: null,
  setProjectId: (id) => set({ projectId: id }),

  // ─── Assemblies ───
  assemblies: [],
  setAssemblies: (assemblies) => set({ assemblies }),
  addAssembly: (assembly) => {
    const s = get();
    const before = snapshot(s);
    set({ assemblies: [...s.assemblies, assembly], undoStack: pushUndo(s.undoStack, before), redoStack: [] });
  },
  updateAssembly: (id, updates) => {
    const s = get();
    const before = snapshot(s);
    set({
      assemblies: s.assemblies.map((a) => (a.id === id ? { ...a, ...updates } : a)),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },
  deleteAssembly: (id) => {
    const s = get();
    const before = snapshot(s);
    set({ assemblies: s.assemblies.filter((a) => a.id !== id), undoStack: pushUndo(s.undoStack, before), redoStack: [] });
  },

  // ─── 3D View ───
  show3D: false,
  toggleShow3D: () => set((s) => ({ show3D: !s.show3D })),
  setShow3D: (show: boolean) => set({ show3D: show }),

  // ─── Markups ───
  markups: [],
  showMarkups: true,
  addMarkup: (markup) => {
    const s = get();
    const before = snapshot(s);
    set({ markups: [...s.markups, markup], undoStack: pushUndo(s.undoStack, before), redoStack: [] });
  },
  deleteMarkup: (id) => {
    const s = get();
    const before = snapshot(s);
    set({ markups: s.markups.filter((m) => m.id !== id), undoStack: pushUndo(s.undoStack, before), redoStack: [] });
  },
  clearMarkups: (pageNumber) => {
    const s = get();
    const before = snapshot(s);
    set({
      markups: pageNumber !== undefined ? s.markups.filter((m) => m.pageNumber !== pageNumber) : [],
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },
  toggleShowMarkups: () => set((s) => ({ showMarkups: !s.showMarkups })),

  // BUG-A7-5-024 fix: markup tool state in store
  activeMarkupTool: 'text' as Markup['type'],
  markupColor: '#ef4444',
  markupStrokeWidth: 3,
  setActiveMarkupTool: (tool) => set({ activeMarkupTool: tool }),
  setMarkupColor: (color) => set({ markupColor: color }),
  setMarkupStrokeWidth: (width) => set({ markupStrokeWidth: width }),

  // ─── Calibration ───
  calibrationMode: false,
  calibrationPoints: [],
  // BUG-A7-5-017 fix: always clear calibrationPoints when activating OR deactivating
  setCalibrationMode: (active) => set({ calibrationMode: active, calibrationPoints: [] }),
  // BUG-A7-5-018 fix: return boolean indicating whether the point was added
  addCalibrationPoint: (p) => {
    const pts = get().calibrationPoints;
    if (pts.length >= 2) return;
    set({ calibrationPoints: [...pts, p] });
  },
  clearCalibrationPoints: () => set({ calibrationPoints: [], calibrationMode: false }),

  // ─── Sheet Names ───
  sheetNames: {},
  setSheetName: (page, name) => set((s) => ({ sheetNames: { ...s.sheetNames, [page]: name } })),

  // ─── Drawing Sets (GAP-005) ───
  drawingSets: {},
  setDrawingSet: (page, setName) => set((s) => ({ drawingSets: { ...s.drawingSets, [page]: setName } })),

  // ─── Classification Groups ───
  groups: [
    { id: 'grp-drywall', name: 'Drywall', color: '#f59e0b', classificationIds: [], breakdowns: [] },
    { id: 'grp-painting', name: 'Painting', color: '#3b82f6', classificationIds: [], breakdowns: [] },
    { id: 'grp-flooring', name: 'Flooring', color: '#10b981', classificationIds: [], breakdowns: [] },
    { id: 'grp-plumbing', name: 'Plumbing', color: '#6366f1', classificationIds: [], breakdowns: [] },
    { id: 'grp-electrical', name: 'Electrical', color: '#ef4444', classificationIds: [], breakdowns: [] },
    { id: 'grp-concrete', name: 'Concrete', color: '#8b5cf6', classificationIds: [], breakdowns: [] },
    { id: 'grp-masonry', name: 'Masonry', color: '#d97706', classificationIds: [], breakdowns: [] },
    { id: 'grp-framing', name: 'Framing', color: '#14b8a6', classificationIds: [], breakdowns: [] },
  ],

  // BUG-A6-010 fix: return the new group's ID so callers can avoid the fragile
  // setTimeout(0) pattern to find the newly created group.
  addGroup: (name, color) => {
    const s = get();
    const id = crypto.randomUUID();
    const before = snapshot(s);
    set({
      groups: [...s.groups, { id, name: name.trim(), color, classificationIds: [], breakdowns: [] }],
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
    return id;
  },

  updateGroup: (id, patch) => {
    const s = get();
    const before = snapshot(s);
    set({
      groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  deleteGroup: (id) => {
    const s = get();
    const before = snapshot(s);
    set({
      groups: s.groups.filter((g) => g.id !== id),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  // BUG-A6-009 fix: reorder groups by supplying an ordered array of IDs.
  // R-C5-002 fix: push undo snapshot for all group mutations
  reorderGroups: (ids) => {
    const s = get();
    const before = snapshot(s);
    const map = new Map(s.groups.map((g) => [g.id, g]));
    const reordered = ids.map((id) => map.get(id)).filter(Boolean) as typeof s.groups;
    const idSet = new Set(ids);
    const rest = s.groups.filter((g) => !idSet.has(g.id));
    set({ groups: [...reordered, ...rest], undoStack: pushUndo(s.undoStack, before), redoStack: [] });
  },

  moveClassificationToGroup: (classificationId, groupId) => {
    const s = get();
    const before = snapshot(s);
    set({
      groups: s.groups.map((g) => {
        const filtered = g.classificationIds.filter((cid) => cid !== classificationId);
        if (g.id === groupId) {
          return { ...g, classificationIds: [...filtered, classificationId] };
        }
        return { ...g, classificationIds: filtered };
      }),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  addBreakdown: (groupId, name) => {
    const s = get();
    const before = snapshot(s);
    set({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, breakdowns: [...g.breakdowns, { id: crypto.randomUUID(), name: name.trim(), classificationIds: [] }] }
          : g
      ),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  deleteBreakdown: (groupId, breakdownId) => {
    const s = get();
    const before = snapshot(s);
    set({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, breakdowns: g.breakdowns.filter((b) => b.id !== breakdownId) }
          : g
      ),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  // ─── Snapping & Grid ───
  snappingEnabled: true,
  gridEnabled: false,
  gridSize: 20,
  setSnapping: (enabled) => set({ snappingEnabled: enabled }),
  setGrid: (enabled) => set({ gridEnabled: enabled }),
  setGridSize: (size) => set({ gridSize: size }),

  // Page base dimensions (per-page map)
  pageBaseDimensions: {},
  setPageBaseDimensions: (page, dims) => set((s) => ({ pageBaseDimensions: { ...s.pageBaseDimensions, [page]: dims } })),

  // ─── Multi-select Polygons (additional helpers) ───
  selectPolygon: (id) => set((s) => ({
    selectedPolygons: s.selectedPolygons.includes(id) ? s.selectedPolygons : [...s.selectedPolygons, id],
    selectedPolygon: id,
    selectedPolygonId: id,
  })),
  deselectPolygon: (id) => set((s) => ({
    selectedPolygons: s.selectedPolygons.filter((pid) => pid !== id),
    selectedPolygon: s.selectedPolygon === id ? null : s.selectedPolygon,
    selectedPolygonId: s.selectedPolygonId === id ? null : s.selectedPolygonId,
  })),
  clearSelectedPolygons: () => set({ selectedPolygons: [], selectedPolygon: null, selectedPolygonId: null }),

  // ─── Last Polygon (for Ctrl+D duplicate) ───
  lastPolygon: null,

  // ─── Repeating Groups ───
  repeatingGroups: [],
  isDefiningGroup: false,
  setIsDefiningGroup: (v) => set({ isDefiningGroup: v }),

  addRepeatingGroup: (g) => {
    const s = get();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const group: RepeatingGroup = { ...g, id, createdAt: now, updatedAt: now };
    const before = snapshot(s);
    set({ repeatingGroups: [...s.repeatingGroups, group], undoStack: pushUndo(s.undoStack, before), redoStack: [] });
    return id;
  },

  updateRepeatingGroup: (id, patch) => {
    const s = get();
    const before = snapshot(s);
    set({
      repeatingGroups: s.repeatingGroups.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: new Date().toISOString() } : g)),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  deleteRepeatingGroup: (id) => {
    const s = get();
    const before = snapshot(s);
    set({
      repeatingGroups: s.repeatingGroups.filter((g) => g.id !== id),
      undoStack: pushUndo(s.undoStack, before),
      redoStack: [],
    });
  },

  // ─── Focus Polygon ───
  focusedPolygonId: null,
  focusPolygon: (id) => set({ focusedPolygonId: id }),

  // ─── Hovered Classification ───
  hoveredClassificationId: null,
  setHoveredClassificationId: (id) => set({ hoveredClassificationId: id }),
    }),
    {
      name: 'measurex-state',
      storage: createJSONStorage(() => {
        // SSR-safe: return a no-op storage during server render
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      // Only persist the project data — skip ephemeral UI state
      partialize: (state) => ({
        classifications: state.classifications,
        polygons: state.polygons,
        annotations: state.annotations,
        zoomLevel: state.zoomLevel,
        scale: state.scale,
        scales: state.scales,
        currentPage: state.currentPage,
        totalPages: state.totalPages,
        sheetNames: state.sheetNames,
        drawingSets: state.drawingSets,
        groups: state.groups,
        assemblies: state.assemblies,
        // BUG-A7-5-005 fix: persist markups and visibility toggle
        markups: state.markups,
        showMarkups: state.showMarkups,
        snappingEnabled: state.snappingEnabled,
        gridEnabled: state.gridEnabled,
        gridSize: state.gridSize,
        pageBaseDimensions: state.pageBaseDimensions,
        repeatingGroups: state.repeatingGroups,
      }),
      // BUG-A7-5-006 fix: version the persist schema to handle future migrations
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        const persisted = (persistedState ?? {}) as Record<string, unknown>;
        if (version === 0) {
          // v0 → v1: ensure markups/showMarkups exist
          return { ...persisted, markups: persisted.markups ?? [], showMarkups: persisted.showMarkups ?? true };
        }
        return persisted;
      },
    }
  )
);
