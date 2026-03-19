import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Trap focus within a container while active.
 * On activation, focuses the first focusable element inside.
 * On Tab / Shift+Tab at the edges, wraps focus around.
 */
export function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    // Focus first focusable element
    const firstFocusable = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  return ref;
}
