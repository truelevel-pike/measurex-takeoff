import { useStore } from '@/lib/store';
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
      const ppu = s.scale?.pixelsPerUnit || 1;
      s.polygons.forEach((p) => {
        const c = s.classifications.find((x) => x.id === p.classificationId);
        if (c?.type === 'area') {
          areaSF += (p.area || (p.points?.length >= 3
            ? Math.abs(p.points.reduce((a, b, i) =>
                a + b.x * (p.points[(i + 1) % p.points.length].y - p.points[(i - 1 + p.points.length) % p.points.length].y),
              0) / 2)
            : 0)) / (ppu * ppu);
        } else if (c?.type === 'linear') {
          lf += (p.linearFeet || 0) / ppu;
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

    /** Navigate to a page (1-based). Updates store; caller must also trigger PDF viewer navigation. */
    setPage(pageNumber: number) {
      const s = useStore.getState();
      s.setCurrentPage(pageNumber);
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
  };
}
