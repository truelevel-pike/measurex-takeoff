/**
 * Keyboard shortcut customisation — load/save custom bindings from localStorage.
 */

const STORAGE_KEY = 'mx-custom-shortcuts';

/** Default shortcut map derived from keyboard-handler.ts */
export const DEFAULT_SHORTCUTS: Record<string, string> = {
  undo: 'Meta+z',
  redo: 'Meta+Shift+z',
  combine: 'Meta+b',
  'merge-lines': 'Meta+x',
  delete: 'Delete',
  'show-shortcuts': '?',
  'zoom-in': '+',
  'zoom-out': '-',
  escape: 'Escape',
  draw: 'r',
  pan: 'v',
  merge: 'm',
  split: 's',
};

function loadOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    // ignore
  }
  return {};
}

function saveOverrides(overrides: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore
  }
}

/** Get the key binding for an action. Returns custom override or the provided default. */
export function getShortcut(action: string, defaultKey: string): string {
  const overrides = loadOverrides();
  return overrides[action] ?? defaultKey;
}

/** Save a custom key binding for an action. */
export function setShortcut(action: string, key: string): void {
  const overrides = loadOverrides();
  overrides[action] = key;
  saveOverrides(overrides);
}

/** Remove all custom shortcut overrides. */
export function resetShortcuts(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Returns the full shortcut map — defaults merged with any custom overrides. */
export function getAllShortcuts(): Record<string, string> {
  const overrides = loadOverrides();
  return { ...DEFAULT_SHORTCUTS, ...overrides };
}
