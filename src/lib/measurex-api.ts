import { useStore } from '@/lib/store';

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
  };
}
