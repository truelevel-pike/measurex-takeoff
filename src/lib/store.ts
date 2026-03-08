import { create } from 'zustand';
import type {
  ProjectState,
  Classification,
  Polygon,
  ScaleCalibration,
  Point,
} from './types';

// Helpers
const isHex = (c: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c.trim());
const trimLower = (s: string) => s.trim().toLowerCase();

// History snapshot limited to core state we need to restore
interface HistorySnapshot {
  classifications: Classification[];
  polygons: Polygon[];
  scale: ScaleCalibration | null;
  scales: Record<number, ScaleCalibration>;
  selectedClassification: string | null;
  selectedPolygon: string | null;
}

export type Tool =
  | 'select'
  | 'pan'
  | 'draw'
  | 'merge'
  | 'split'
  | 'cut'
  | 'ai'
  | 'measure';

export interface Store extends ProjectState {
  // UI state
  currentTool: Tool;
  showScalePopup: boolean;
  setShowScalePopup: (show: boolean) => void;
  selectedClassification: string | null;
  selectedPolygon: string | null;
  hiddenClassificationIds: string[];
  toggleClassificationVisibility: (id: string) => void;
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

  // 3D View
  show3D: boolean;
  toggleShow3D: () => void;
  setShow3D: (show: boolean) => void;
}

function snapshot(state: Store): HistorySnapshot {
  return {
    classifications: structuredClone(state.classifications),
    polygons: structuredClone(state.polygons),
    scale: state.scale ? structuredClone(state.scale) : null,
    scales: structuredClone(state.scales),
    selectedClassification: state.selectedClassification,
    selectedPolygon: state.selectedPolygon,
  };
}

export const useStore = create<Store>((set, get) => ({
  // ProjectState
  classifications: [],
  polygons: [],
  scale: null,
  scales: {},
  currentPage: 1,
  totalPages: 1,

  // UI
  currentTool: 'select',
  showScalePopup: false,
  setShowScalePopup: (show) => set({ showScalePopup: show }),
  selectedClassification: null,
  selectedPolygon: null,
  hiddenClassificationIds: [],
  toggleClassificationVisibility: (id) =>
    set((state) => ({
      hiddenClassificationIds: state.hiddenClassificationIds.includes(id)
        ? state.hiddenClassificationIds.filter((x) => x !== id)
        : [...state.hiddenClassificationIds, id],
    })),
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
    const next: Classification = { id, name: name.trim(), color: color.trim(), type, visible };
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
    set({
      classifications: s.classifications.filter((c) => c.id !== id),
      polygons: s.polygons.filter((p) => p.classificationId !== id),
      selectedClassification: s.selectedClassification === id ? null : s.selectedClassification,
      selectedPolygon: s.selectedPolygon && s.polygons.find((p) => p.id === s.selectedPolygon && p.classificationId === id) ? null : s.selectedPolygon,
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
    set({ polygons: [...s.polygons, polygon], undoStack: [...s.undoStack, before], redoStack: [] });
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
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
  },

  setSelectedPolygon: (id) => set({ selectedPolygon: id }),

  // Geometry actions (wired by higher-level tools calling polygon-utils)
  mergePolygons: (id1, id2) => {
    const s = get();
    const p1 = s.polygons.find((p) => p.id === id1);
    const p2 = s.polygons.find((p) => p.id === id2);
    if (!p1 || !p2 || p1.classificationId !== p2.classificationId) return;
    const before = snapshot(s);
    // Expect a higher-level util to compute merged points/area; here we do simple concat placeholder
    const merged: Polygon = {
      ...p1,
      id: crypto.randomUUID(),
      points: [...p1.points, ...p2.points],
      // area recalculated by caller or subsequent update
    } as Polygon;
    set({
      polygons: s.polygons.filter((p) => p.id !== id1 && p.id !== id2).concat(merged),
      selectedPolygon: merged.id,
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
  },

  splitPolygon: (id, lineStart, lineEnd) => {
    const s = get();
    const poly = s.polygons.find((p) => p.id === id);
    if (!poly) return;
    const before = snapshot(s);
    // Placeholder: UI layer should compute proper split; here we produce two halves by index
    const mid = Math.max(2, Math.floor(poly.points.length / 2));
    const a: Polygon = { ...poly, id: crypto.randomUUID(), points: poly.points.slice(0, mid) };
    const b: Polygon = { ...poly, id: crypto.randomUUID(), points: poly.points.slice(mid) };
    set({
      polygons: s.polygons.filter((p) => p.id !== id).concat([a, b]),
      selectedPolygon: a.id,
      undoStack: [...s.undoStack, before],
      redoStack: [],
    });
  },

  cutPolygon: (id, _cutShape) => {
    const s = get();
    const before = snapshot(s);
    set({
      polygons: s.polygons.filter((p) => p.id !== id),
      selectedPolygon: null,
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
  setCurrentPage: (page, totalPages) => set((state) => ({ currentPage: page, totalPages: totalPages ?? state.totalPages })),

  hydrateState: (state) => {
    // DO NOT regenerate IDs — trust persisted state
    set({
      classifications: structuredClone(state.classifications),
      polygons: structuredClone(state.polygons),
      scale: state.scale ? structuredClone(state.scale) : null,
      scales: structuredClone(state.scales || {}),
      currentPage: state.currentPage || 1,
      totalPages: state.totalPages || 1,
      undoStack: [],
      redoStack: [],
      selectedClassification: null,
      selectedPolygon: null,
      hiddenClassificationIds: [],
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
      scale: prev.scale,
      scales: prev.scales,
      selectedClassification: prev.selectedClassification,
      selectedPolygon: prev.selectedPolygon,
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
      scale: next.scale,
      scales: next.scales,
      selectedClassification: next.selectedClassification,
      selectedPolygon: next.selectedPolygon,
      redoStack: rest,
      undoStack: [...s.undoStack, now],
    });
  },

  // ─── 3D View ───
  show3D: false,
  toggleShow3D: () => set((s) => ({ show3D: !s.show3D })),
  setShow3D: (show: boolean) => set({ show3D: show }),
}));
