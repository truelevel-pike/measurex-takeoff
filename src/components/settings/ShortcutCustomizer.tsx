'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getAllShortcuts,
  setShortcut,
  resetShortcuts,
  DEFAULT_SHORTCUTS,
} from '@/lib/custom-shortcuts';

function formatKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push('Meta');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = e.key;
  // Avoid adding modifier keys as the actual key
  if (!['Meta', 'Control', 'Alt', 'Shift'].includes(key)) {
    parts.push(key.length === 1 ? key : key);
  }

  return parts.join('+') || key;
}

export default function ShortcutCustomizer() {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>(() => getAllShortcuts());
  const [listening, setListening] = useState<string | null>(null);

  const reload = useCallback(() => {
    setShortcuts(getAllShortcuts());
  }, []);

  useEffect(() => {
    if (!listening) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setListening(null);
        return;
      }

      // Ignore bare modifier presses
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;

      const formatted = formatKey(e);
      setShortcut(listening, formatted);
      setListening(null);
      reload();
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [listening, reload]);

  const handleReset = () => {
    resetShortcuts();
    reload();
  };

  const isCustom = (action: string) =>
    shortcuts[action] !== DEFAULT_SHORTCUTS[action];

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
        <button
          onClick={handleReset}
          className="rounded bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          Reset to defaults
        </button>
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b dark:border-gray-700">
            <th className="pb-2 font-medium">Action</th>
            <th className="pb-2 font-medium">Key Binding</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(shortcuts).map(([action, key]) => (
            <tr
              key={action}
              className="cursor-pointer border-b hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              onClick={() => setListening(action)}
            >
              <td className="py-2">{action}</td>
              <td className="py-2">
                {listening === action ? (
                  <span className="italic text-blue-500">Press a key…</span>
                ) : (
                  <span>
                    <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-700">
                      {key}
                    </kbd>
                    {isCustom(action) && (
                      <span className="ml-2 text-xs text-blue-500">custom</span>
                    )}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {listening && (
        <p className="mt-3 text-xs text-gray-500">
          Press Escape to cancel, or press any key combo to assign it to <strong>{listening}</strong>.
        </p>
      )}
    </div>
  );
}
