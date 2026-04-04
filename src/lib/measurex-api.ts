import { useStore } from '@/lib/store';
import { getEventSource, getConnectedProjectId, getLastEventId } from '@/lib/ws-client';
import type { ScaleCalibration } from '@/lib/types';

function normalizeClassificationType(type: string): 'area' | 'linear' | 'count' {
  if (type === 'area' || type === 'linear' || type === 'count') return type;
  return 'area';
}

export function installMeasurexAPI() {
  if (typeof window === 'undefined') return;

  (window as Window & { measurex?: unknown }).measurex = {
    selectPolygon(id: string) {
      useStore.getState().setSelectedPolygon(id);
    },

    reclassify(id: string, name: string) {
      const state = useStore.getState();
      const target = state.polygons.find((p) => p.id === id);
      if (!target) throw new Error(`Polygon not found: ${id}`);

      let cls = state.classifications.find((c) => c.name === name);
      if (!cls) {
        const inferredType = normalizeClassificationType(
          state.classifications.find((c) => c.id === target.classificationId)?.type || 'area'
        );
        const newId = state.addClassification({
          name,
          type: inferredType,
          color: '#3b82f6',
          visible: true,
        });
        cls = useStore.getState().classifications.find((c) => c.id === newId);
      }

      if (!cls) throw new Error(`Unable to resolve classification: ${name}`);
      state.updatePolygon(id, { classificationId: cls.id });
    },

    getPolygons() {
      return useStore.getState().polygons;
    },

    getClassifications() {
      return useStore.getState().classifications;
    },

    getState() {
      const s = useStore.getState();
      return {
        currentPage: s.currentPage,
        totalPages: s.totalPages,
        scale: s.scale,
        selectedClassification: s.selectedClassification,
        polygonCount: s.polygons.length,
        classificationCount: s.classifications.length,
      };
    },

    getTotals() {
      const s = useStore.getState();
      let areaSF = 0, lf = 0, count = 0;
      // BUG-PIKE-027 fix: use per-page ppu so multi-page projects sum correctly
      const globalPpu = s.scale?.pixelsPerUnit || 1;
      s.polygons.forEach((p) => {
        const c = s.classifications.find((x) => x.id === p.classificationId);
        const pagePpu = s.scales[p.pageNumber]?.pixelsPerUnit || globalPpu;
        if (c?.type === 'area') {
          areaSF += (p.area || (p.points?.length >= 3
            ? Math.abs(p.points.reduce((a, b, i) =>
                a + b.x * (p.points[(i + 1) % p.points.length].y - p.points[(i - 1 + p.points.length) % p.points.length].y),
              0) / 2)
            : 0)) / (pagePpu * pagePpu);
        } else if (c?.type === 'linear') {
          lf += (p.linearFeet || 0) / pagePpu;
        } else if (c?.type === 'count') {
          count++;
        }
      });
      return {
        totalAreaSF: Math.round(areaSF * 100) / 100,
        totalLF: Math.round(lf * 100) / 100,
        totalCount: count,
      };
    },

    selectClassification(id: string) {
      useStore.getState().setSelectedClassification(id);
    },

    clearPage(pageNumber: number) {
      const s = useStore.getState();
      s.polygons.filter((p) => p.pageNumber === pageNumber).forEach((p) => s.deletePolygon(p.id));
    },

    /**
     * Create a new classification in the current project.
     * Returns the new classification's ID.
     * Usage: window.measurex.addClassification('Kitchen', 'area', '#3b82f6')
     */
    addClassification(name: string, type?: string, color?: string) {
      const newId = useStore.getState().addClassification({
        name,
        type: normalizeClassificationType(type ?? 'area'),
        color: color ?? '#3b82f6',
        visible: true,
      });
      return newId;
    },

    /**
     * Navigate to a page (1-based).
     * Updates both the store AND the PDF viewer via a custom event.
     * page.tsx listens for 'mx-goto-page' to call safeGoToPage().
     */
    setPage(pageNumber: number) {
      const s = useStore.getState();
      s.setCurrentPage(pageNumber);
      // Dispatch custom event so page.tsx can also move the PDF viewer
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mx-goto-page', { detail: { page: pageNumber } }));
      }
    },

    /** Apply a scale calibration to the current page and store.
     *  Accepts a full or partial ScaleCalibration; unit defaults to 'ft'.
     */
    setScale(scale: Partial<ScaleCalibration> & { pixelsPerUnit: number }) {
      const s = useStore.getState();
      const unit = scale.unit ?? 'ft';
      const cal: ScaleCalibration = {
        pixelsPerUnit: scale.pixelsPerUnit,
        unit,
        label: scale.label ?? `${scale.pixelsPerUnit} px/${unit}`,
        source: scale.source ?? 'manual',
      };
      s.setScale(cal);
      s.setScaleForPage(s.currentPage, cal);
    },

    /**
     * Wave 37: Get polygons for a specific page (1-based).
     * Used by the agent to verify what was drawn on a particular page after takeoff.
     * Usage: window.measurex.getPolygonsForPage(1)
     */
    getPolygonsForPage(pageNumber: number) {
      return useStore.getState().polygons.filter((p) => p.pageNumber === pageNumber);
    },

    /**
     * Wave 37: Delete a polygon by ID.
     * Used by the agent to remove incorrect polygons after AI takeoff.
     * Usage: window.measurex.deletePolygon('polygon-uuid')
     */
    deletePolygon(id: string) {
      useStore.getState().deletePolygon(id);
    },

    /**
     * Wave 37: Verify takeoff state — returns a summary object the agent can
     * inspect to confirm the project is ready and results are valid.
     * Usage: window.measurex.verify()
     * → { hasPDF, hasScale, classificationCount, polygonCount, totalPages }
     */
    verify() {
      const s = useStore.getState();
      return {
        hasPDF: s.totalPages > 0,
        hasScale: !!s.scale,
        classificationCount: s.classifications.length,
        polygonCount: s.polygons.length,
        totalPages: s.totalPages,
      };
    },

    /**
     * Wave 11B: SSE connection status for agent diagnostics.
     * Returns a machine-readable object the agent can inspect via evaluate().
     *
     * Usage:
     *   window.measurex.sseStatus()
     *   // → { connected: true, projectId: "...", lastEventId: 42, readyState: 1 }
     *
     * readyState: 0=CONNECTING, 1=OPEN, 2=CLOSED
     */
    sseStatus() {
      const es = getEventSource();
      return {
        connected: es !== null && es.readyState === EventSource.OPEN,
        projectId: getConnectedProjectId(),
        lastEventId: getLastEventId(),
        readyState: es?.readyState ?? 2,
      };
    },
  };
}
