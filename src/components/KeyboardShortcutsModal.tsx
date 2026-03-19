'use client';

import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useFocusTrap } from '@/lib/use-focus-trap';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

type ShortcutEntry = {
  keyCombo: string;
  action: string;
};

const shortcuts: ShortcutEntry[] = [
  { keyCombo: 'V', action: 'Select tool' },
  { keyCombo: 'H', action: 'Pan tool' },
  { keyCombo: 'D', action: 'Draw tool' },
  { keyCombo: 'A', action: 'AI Takeoff' },
  { keyCombo: 'G', action: 'Merge / Group tool' },
  { keyCombo: 'S', action: 'Split tool' },
  { keyCombo: 'C', action: 'Cut tool' },
  { keyCombo: 'M', action: 'Measure tool' },
  { keyCombo: 'Escape', action: 'Cancel / deselect' },
  { keyCombo: 'Delete / Backspace', action: 'Delete selected polygon' },
  { keyCombo: 'Ctrl+Z', action: 'Undo' },
  { keyCombo: 'Ctrl+Y / Ctrl+Shift+Z', action: 'Redo' },
  { keyCombo: 'Ctrl+D', action: 'Duplicate last polygon' },
  { keyCombo: '1–7', action: 'Jump to page 1–7' },
  { keyCombo: 'F', action: 'Toggle fullscreen' },
  { keyCombo: '?', action: 'Show this help' },
  { keyCombo: '+ / -', action: 'Zoom in/out' },
  { keyCombo: '0', action: 'Reset zoom' },
  { keyCombo: 'Space (hold)', action: 'Pan mode (hold)' },
];

export default function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
    >
      <div
        ref={focusTrapRef}
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-[rgba(0,212,255,0.35)] bg-[#10131d] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[rgba(0,212,255,0.2)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-[#00d4ff]" aria-hidden="true" />
            <h2 id="keyboard-shortcuts-title" className="text-base font-semibold text-white">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-transparent p-1 text-gray-300 transition hover:border-[rgba(0,212,255,0.35)] hover:bg-[rgba(0,212,255,0.12)] hover:text-white"
            aria-label="Close keyboard shortcuts"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <table className="w-full border-separate border-spacing-y-1.5 text-sm">
            <thead>
              <tr>
                <th className="w-1/3 px-3 py-2 text-left font-medium tracking-wide text-[#00d4ff]">Key</th>
                <th className="px-3 py-2 text-left font-medium tracking-wide text-[#00d4ff]">Action</th>
              </tr>
            </thead>
            <tbody>
              {shortcuts.map((shortcut) => (
                <tr key={shortcut.keyCombo} className="rounded-lg bg-[rgba(255,255,255,0.03)]">
                  <td className="rounded-l-lg px-3 py-2">
                    <span className="inline-flex rounded border border-[rgba(0,212,255,0.35)] bg-[rgba(0,212,255,0.1)] px-2 py-0.5 font-mono text-xs text-[#9ef1ff]">
                      {shortcut.keyCombo}
                    </span>
                  </td>
                  <td className="rounded-r-lg px-3 py-2 text-gray-200">{shortcut.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
