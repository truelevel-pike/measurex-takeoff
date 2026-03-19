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
} from './types';
import { mergePolygons as mergePolygonPoints, splitPolygonByLine, calculatePolygonArea } from './polygon-utils';
import { assignTradeGroup } from './trade-groups';

// Helpers
const isHex = (c: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c.trim());
const trimLower = (s: string) => s.trim().toLowerCase();

// History snapshot limited to core state we need to restore
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

  // Actions — Polygons
  addPolygon: (p: { points: Point[]; classificationId: string; pageNumber: number; area?: number; linearFeet?: number; label?: string; isComplete?: boolean; color?: string }) => string;
  updatePolygon: (id: string, patch: Partial<Polygon>) => void;
  deletePolygon: (id: string) => void;
  setSelectedPolygon: (id: string | null) => void;
  setSelectedPolygons: (ids: string[]) => void;
  togglePolygonSelection: (id: string) => void;
  clearPolygonSelection: () => void;
  deleteSelectedPolygons: () => void;

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
  addGroup: (name: string, color: string) => void;
  updateGroup: (id: string, patch: Partial<ClassificationGroup>) => void;
  deleteGroup: (id: string) => void;
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

  // Last polygon added (for Ctrl+D duplicate) — NOT persisted
  lastPolygon: Polygon | null;
}

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
  };
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
    set({ classifications: [...s.classifications, next], undoStack: [...s.undoStack, before], redoStack: [] });
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
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
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
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
  },

  setSelectedClassification: (id) => set({ selectedClassification: id }),

  toggleClassification: (id) => {
    const s = get();
    const before = snapshot(s);
    set({
      classifications: s.classifications.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)),
      undoStack: [...s.undoStack, before],
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
    set({ polygons: [...s.polygons, polygon], lastPolygon: polygon, undoStack: [...s.undoStack, before], redoStack: [] });
    return id;
  },

  updatePolygon: (id, patch) => {
    const s = get();
    const before = snapshot(s);
    set({
      polygons: s.polygons.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
  },

  deletePolygon: (id) => {
    const s = get();
    const before = snapshot(s);
    set({
      polygons: s.polygons.filter((p) => p.id !== id),
      selectedPolygon: s.selectedPolygon === id ? null : s.selectedPolygon,
      selectedPolygonId: s.selectedPolygonId === id ? null : s.selectedPolygonId,
      selectedPolygons: s.selectedPolygons.filter((polygonId) => polygonId !== id),
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
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
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
    if (!s.projectId) return;
    idsToDelete.forEach((polygonId) => {
      fetch(`/api/projects/${s.projectId}/polygons/${polygonId}`, { method: 'DELETE' }).catch((err) =>
        console.error(`API deletePolygon failed for ${polygonId}:`, err)
      );
    });
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
    set({ annotations: [...(s.annotations ?? []), annotation], undoStack: [...s.undoStack, before], redoStack: [] });
    return id;
  },

  updateAnnotation: (id, patch) => {
    const s = get();
    const before = snapshot(s);
    set({
      annotations: (s.annotations ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
  },

  deleteAnnotation: (id) => {
    const s = get();
    const before = snapshot(s);
    set({
      annotations: (s.annotations ?? []).filter((a) => a.id !== id),
      undoStack: [...s.undoStack, before],
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
      undoStack: [...s.undoStack, before],
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
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
  },

  cutPolygon: (id, cutShape) => {
    void cutShape;
    const s = get();
    const before = snapshot(s);
    set({
      polygons: s.polygons.filter((p) => p.id !== id),
      selectedPolygons: [],
      selectedPolygon: null,
      selectedPolygonId: null,
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
  },

  // Scale per page
  setScale: (scale) => {
    const before = snapshot(get());
    set({ scale, undoStack: [...get().undoStack, before], redoStack: [] });
  },
  setScaleForPage: (page, scale) => {
    const s = get();
    const before = snapshot(s);
    set({ scales: { ...s.scales, [page]: scale }, scale, undoStack: [...s.undoStack, before], redoStack: [] });
  },
  getScaleForPage: (page) => get().scales[page] ?? null,

  // General
  setTool: (tool) => set({ currentTool: tool }),
  // PDF is the source of truth for totalPages: when an explicit totalPages > 1 is
  // provided (e.g. from onPageChange after loading a multi-page PDF), always use it —
  // even if hydration had previously written a stale value of 1.
  setCurrentPage: (page, totalPages) => set((state) => ({
    currentPage: page,
    totalPages: (totalPages !== undefined && totalPages > 1)
      ? totalPages
      : (state.totalPages > 1 ? state.totalPages : (totalPages ?? state.totalPages)),
    scale: state.scales[page] ?? state.scale,
  })),

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
  addAssembly: (assembly) => set((s) => ({ assemblies: [...s.assemblies, assembly] })),
  updateAssembly: (id, updates) =>
    set((s) => ({
      assemblies: s.assemblies.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),
  deleteAssembly: (id) => set((s) => ({ assemblies: s.assemblies.filter((a) => a.id !== id) })),

  // ─── 3D View ───
  show3D: false,
  toggleShow3D: () => set((s) => ({ show3D: !s.show3D })),
  setShow3D: (show: boolean) => set({ show3D: show }),

  // ─── Markups ───
  markups: [],
  showMarkups: true,
  addMarkup: (markup) => set((s) => ({ markups: [...s.markups, markup] })),
  deleteMarkup: (id) => set((s) => ({ markups: s.markups.filter((m) => m.id !== id) })),
  clearMarkups: (pageNumber) =>
    set((s) => ({
      markups: pageNumber !== undefined ? s.markups.filter((m) => m.pageNumber !== pageNumber) : [],
    })),
  toggleShowMarkups: () => set((s) => ({ showMarkups: !s.showMarkups })),

  // ─── Calibration ───
  calibrationMode: false,
  calibrationPoints: [],
  setCalibrationMode: (active) => set({ calibrationMode: active, calibrationPoints: active ? [] : get().calibrationPoints }),
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

  addGroup: (name, color) => {
    const id = crypto.randomUUID();
    set((s) => ({
      groups: [...s.groups, { id, name: name.trim(), color, classificationIds: [], breakdowns: [] }],
    }));
  },

  updateGroup: (id, patch) =>
    set((s) => ({
      groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })),

  deleteGroup: (id) =>
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== id),
    })),

  moveClassificationToGroup: (classificationId, groupId) =>
    set((s) => ({
      groups: s.groups.map((g) => {
        // Remove from all groups first
        const filtered = g.classificationIds.filter((cid) => cid !== classificationId);
        // Add to target group
        if (g.id === groupId) {
          return { ...g, classificationIds: [...filtered, classificationId] };
        }
        return { ...g, classificationIds: filtered };
      }),
    })),

  addBreakdown: (groupId, name) =>
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, breakdowns: [...g.breakdowns, { id: crypto.randomUUID(), name: name.trim(), classificationIds: [] }] }
          : g
      ),
    })),

  deleteBreakdown: (groupId, breakdownId) =>
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, breakdowns: g.breakdowns.filter((b) => b.id !== breakdownId) }
          : g
      ),
    })),

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

  // ─── Focus Polygon ───
  focusedPolygonId: null,
  focusPolygon: (id) => set({ focusedPolygonId: id }),
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
        snappingEnabled: state.snappingEnabled,
        gridEnabled: state.gridEnabled,
        gridSize: state.gridSize,
        pageBaseDimensions: state.pageBaseDimensions,
      }),
    }
  )
);
