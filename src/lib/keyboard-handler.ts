import { useEffect } from 'react';
import { useStore } from './store';

type OptionalActions = {
  combineSelected?: () => void;
  mergeLines?: () => void;
  deleteSelected?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
};

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

/**
 * Registers global keyboard shortcuts (undo, redo, tool switching, etc.).
 *
 * @param onShowShortcuts — Called when the user presses '?'. **Must be a
 *   stable reference** (wrap with `useCallback` in the caller). An unstable
 *   inline arrow function causes the internal `useEffect` to re-register the
 *   global `keydown` listener on every parent render. (BUG-A7-2-016)
 */
export function useKeyboardHandler(onShowShortcuts: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(document.activeElement)) return;

      const key = event.key;
      const lower = key.toLowerCase();
      const store = useStore.getState() as ReturnType<typeof useStore.getState> & OptionalActions;

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && lower === 'z') {
        event.preventDefault();
        store.redo?.();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && lower === 'y') {
        event.preventDefault();
        store.redo?.();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && lower === 'z') {
        event.preventDefault();
        store.undo?.();
        return;
      }

      if (event.metaKey && lower === 'b') {
        event.preventDefault();
        store.combineSelected?.();
        return;
      }

      if (event.metaKey && lower === 'x') {
        store.mergeLines?.();
        return;
      }

      // Ctrl+D — Duplicate last polygon with offset
      if ((event.metaKey || event.ctrlKey) && lower === 'd') {
        event.preventDefault();
        const last = store.lastPolygon;
        if (!last) return;
        const offset = 20;
        const newId = store.addPolygon({
          points: last.points.map((pt) => ({ x: pt.x + offset, y: pt.y + offset })),
          classificationId: last.classificationId,
          pageNumber: last.pageNumber,
          area: last.area,
          linearFeet: last.linearFeet,
          label: last.label,
          isComplete: true,
        });
        store.setSelectedPolygon(newId);
        store.setTool('select');
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        store.deleteSelected?.();
        return;
      }

      if (key === '?') {
        event.preventDefault();
        onShowShortcuts();
        return;
      }

      if (key === '+' || key === '=') {
        event.preventDefault();
        store.zoomIn?.();
        return;
      }

      if (key === '-') {
        event.preventDefault();
        store.zoomOut?.();
        return;
      }

      if (key === 'Escape') {
        event.preventDefault();
        // Clear multi-selection first; if nothing selected, switch to select tool
        if (store.selectedPolygons && store.selectedPolygons.length > 0) {
          store.clearPolygonSelection();
        } else {
          store.setTool('select');
        }
        return;
      }

      if (lower === 'v') {
        event.preventDefault();
        store.setTool('select');
        return;
      }

      if (lower === 'h') {
        event.preventDefault();
        store.setTool('pan');
        return;
      }

      if (lower === 'd') {
        event.preventDefault();
        store.setTool('draw');
        return;
      }

      if (lower === 'a') {
        event.preventDefault();
        store.setTool('ai');
        return;
      }

      if (lower === 'g') {
        event.preventDefault();
        store.setTool('merge');
        return;
      }

      if (lower === 's') {
        event.preventDefault();
        store.setTool('split');
        return;
      }

      if (lower === 'c') {
        event.preventDefault();
        store.setTool('cut');
        return;
      }

      if (lower === 'm') {
        event.preventDefault();
        store.setTool('measure');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onShowShortcuts]);
}
