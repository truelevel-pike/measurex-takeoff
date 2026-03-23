import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsProps {
  onClose: () => void;
}

type ShortcutRow = {
  description: string;
  keys: string[];
};

type ShortcutSection = {
  title: string;
  rows: ShortcutRow[];
};

const sections: ShortcutSection[] = [
  {
    title: 'Tools',
    rows: [
      { description: 'Select', keys: ['V'] },
      { description: 'Pan', keys: ['H'] },
      { description: 'Draw Polygon', keys: ['D'] },
      { description: 'Merge', keys: ['G'] },
      { description: 'Split', keys: ['S'] },
      { description: 'Cut', keys: ['C'] },
      { description: 'Measure', keys: ['M'] },
      { description: 'AI Takeoff', keys: ['A'] },
    ],
  },
  {
    title: 'Edit',
    rows: [
      { description: 'Undo', keys: ['Ctrl', 'Z'] },
      { description: 'Redo', keys: ['Ctrl', 'Y'] },
      { description: 'Delete polygon', keys: ['Delete'] },
    ],
  },
  {
    title: 'View',
    rows: [
      { description: 'Fit to page', keys: ['F'] },
      { description: 'Zoom in', keys: ['+'] },
      { description: 'Zoom out', keys: ['-'] },
    ],
  },
  {
    title: 'General',
    rows: [
      { description: 'Cancel / Deselect', keys: ['Esc'] },
      { description: 'Show shortcuts', keys: ['?'] },
    ],
  },
];

export default function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
    {/* Hidden machine-readable shortcuts div — agent reads this to know key bindings */}
    <div
      id="mx-keyboard-shortcuts"
      hidden
      data-r="rectangle"
      data-d="draw"
      data-v="select"
      data-h="pan"
      data-g="merge"
      data-s="split"
      data-c="cut"
      data-m="measure"
      data-a="ai-takeoff"
      data-f="fit-page"
      data-escape="cancel"
      data-enter="confirm"
    />
    <div
      data-testid="shortcut-escape"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-900 px-6 py-4">
          <div className="flex items-center gap-2">
            <Keyboard size={18} />
            <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-300 transition hover:bg-gray-800 hover:text-white"
            aria-label="Close keyboard shortcuts"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
          {sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.rows.map((row) => {
                  // Stable testid for agent-targeted shortcuts
                  const rowTestId = row.keys.length === 1
                    ? (() => {
                        const k = row.keys[0].toUpperCase();
                        if (k === 'R') return 'shortcut-r';
                        if (k === 'ESC') return 'shortcut-escape';
                        if (k === 'ENTER') return 'shortcut-enter';
                        return undefined;
                      })()
                    : undefined;
                  return (
                  <div
                    key={`${section.title}-${row.description}`}
                    {...(rowTestId ? { 'data-testid': rowTestId } : {})}
                    className="flex items-center justify-between gap-4 rounded-md bg-gray-800/50 px-3 py-2"
                  >
                    <span className="text-sm text-gray-100">{row.description}</span>
                    <div className="flex items-center gap-1">
                      {row.keys.map((key, index) => (
                        <span
                          key={`${row.description}-${key}-${index}`}
                          className="rounded border border-gray-500 bg-gray-700 px-2 py-0.5 font-mono text-sm text-white"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
