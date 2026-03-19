'use client';

import { useCallback, useEffect, useState } from 'react';

export const USER_PREFS_STORAGE_KEY = 'mx-user-prefs';

export type ThemeMode = 'dark' | 'light';
export type UnitSystem = 'ft' | 'm';
export type DecimalPlaces = 0 | 1 | 2;
export type SnapSensitivity = 'low' | 'med' | 'high';
export type CloseThresholdPx = 15 | 25 | 40;
export type ToastDurationMs = 2000 | 4000 | 8000;

export interface UserPrefs {
  themeMode: ThemeMode;
  showPolygonLabels: boolean;
  defaultUnit: UnitSystem;
  decimalPlaces: DecimalPlaces;
  snapSensitivity: SnapSensitivity;
  closeThresholdPx: CloseThresholdPx;
  defaultClassificationColor: string;
  toastDurationMs: ToastDurationMs;
}

export const DEFAULT_PREFS: UserPrefs = {
  themeMode: 'dark',
  showPolygonLabels: true,
  defaultUnit: 'ft',
  decimalPlaces: 1,
  snapSensitivity: 'med',
  closeThresholdPx: 25,
  defaultClassificationColor: '#3b82f6',
  toastDurationMs: 4000,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toThemeMode(value: unknown): ThemeMode | undefined {
  return value === 'dark' || value === 'light' ? value : undefined;
}

function toUnitSystem(value: unknown): UnitSystem | undefined {
  return value === 'ft' || value === 'm' ? value : undefined;
}

function toDecimalPlaces(value: unknown): DecimalPlaces | undefined {
  return value === 0 || value === 1 || value === 2 ? value : undefined;
}

function toSnapSensitivity(value: unknown): SnapSensitivity | undefined {
  return value === 'low' || value === 'med' || value === 'high' ? value : undefined;
}

function toCloseThresholdPx(value: unknown): CloseThresholdPx | undefined {
  return value === 15 || value === 25 || value === 40 ? value : undefined;
}

function toToastDurationMs(value: unknown): ToastDurationMs | undefined {
  return value === 2000 || value === 4000 || value === 8000 ? value : undefined;
}

function toHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
  return undefined;
}

function sanitizeUserPrefs(raw: unknown): UserPrefs {
  if (!isObject(raw)) return DEFAULT_PREFS;

  return {
    themeMode: toThemeMode(raw.themeMode) ?? DEFAULT_PREFS.themeMode,
    showPolygonLabels:
      typeof raw.showPolygonLabels === 'boolean'
        ? raw.showPolygonLabels
        : DEFAULT_PREFS.showPolygonLabels,
    defaultUnit: toUnitSystem(raw.defaultUnit) ?? DEFAULT_PREFS.defaultUnit,
    decimalPlaces: toDecimalPlaces(raw.decimalPlaces) ?? DEFAULT_PREFS.decimalPlaces,
    snapSensitivity: toSnapSensitivity(raw.snapSensitivity) ?? DEFAULT_PREFS.snapSensitivity,
    closeThresholdPx: toCloseThresholdPx(raw.closeThresholdPx) ?? DEFAULT_PREFS.closeThresholdPx,
    defaultClassificationColor:
      toHexColor(raw.defaultClassificationColor) ?? DEFAULT_PREFS.defaultClassificationColor,
    toastDurationMs: toToastDurationMs(raw.toastDurationMs) ?? DEFAULT_PREFS.toastDurationMs,
  };
}

export function loadUserPrefs(): UserPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;

  try {
    const raw = window.localStorage.getItem(USER_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return sanitizeUserPrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveUserPrefs(prefs: UserPrefs): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(USER_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable in private/restricted contexts.
  }
}

export function useUserPrefs() {
  const [prefs, setPrefsState] = useState<UserPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefsState(loadUserPrefs());
  }, []);

  const setPrefs = useCallback((updater: UserPrefs | ((prev: UserPrefs) => UserPrefs)) => {
    setPrefsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveUserPrefs(next);
      return next;
    });
  }, []);

  return { prefs, setPrefs };
}
