'use client';

import { useEffect, useState } from 'react';
import KeyboardShortcuts from './KeyboardShortcuts';

/**
 * Self-contained portal that registers the global '?' keyboard shortcut
 * and renders the KeyboardShortcuts modal.
 *
 * Mount once in layout.tsx — no props needed.
 */
export default function KeyboardShortcutsPortal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore when typing in an input/textarea/contentEditable
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        (document.activeElement as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if (e.key === '?') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!isOpen) return null;

  return <KeyboardShortcuts onClose={() => setIsOpen(false)} />;
}
