jest.mock('@turf/turf', () => ({}));

import { useStore } from '@/lib/store';

describe('useStore — basic state', () => {
  it('store initializes with empty polygons', () => {
    const state = useStore.getState();
    expect(state.polygons).toBeDefined();
    expect(Array.isArray(state.polygons)).toBe(true);
  });

  it('store has addPolygon function', () => {
    const state = useStore.getState();
    expect(typeof state.addPolygon).toBe('function');
  });

  it('store has setScale function', () => {
    const state = useStore.getState();
    expect(typeof state.setScale).toBe('function');
  });

  it('store has classifications defined', () => {
    const state = useStore.getState();
    expect(state.classifications).toBeDefined();
    expect(Array.isArray(state.classifications)).toBe(true);
  });

  it('store has currentTool set to a valid tool', () => {
    const state = useStore.getState();
    expect(state.currentTool).toBeDefined();
    // BUG-A7-5-009 fix: 'crop' is a valid Tool and must be included so the test
    // doesn't falsely fail if currentTool is ever initialised to 'crop'.
    expect(['select', 'pan', 'draw', 'merge', 'split', 'cut', 'ai', 'measure', 'annotate', 'calibrate', 'crop']).toContain(state.currentTool);
  });

  it('store has undo/redo stacks', () => {
    const state = useStore.getState();
    expect(state.undoStack).toBeDefined();
    expect(state.redoStack).toBeDefined();
  });

  it('setTool changes current tool', () => {
    useStore.getState().setTool('draw');
    expect(useStore.getState().currentTool).toBe('draw');
    useStore.getState().setTool('select');
    expect(useStore.getState().currentTool).toBe('select');
  });

  it('setZoomLevel changes zoom', () => {
    useStore.getState().setZoomLevel(2.0);
    expect(useStore.getState().zoomLevel).toBe(2.0);
    useStore.getState().setZoomLevel(1.0);
  });
});
