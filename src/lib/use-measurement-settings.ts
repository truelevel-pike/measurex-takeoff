'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  type MeasurementSettings,
  loadMeasurementSettings,
  saveMeasurementSettings,
} from './measurement-settings';

const STORAGE_KEY = 'mx-measurement-settings';

/**
 * React hook that reads/writes measurement settings from localStorage.
 * Triggers re-render on change and syncs across tabs via storage event.
 */
export function useMeasurementSettings() {
  const [settings, setSettingsState] = useState<MeasurementSettings>(() => loadMeasurementSettings());

  useEffect(() => {
    // Cross-tab sync: fires when another tab changes settings
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setSettingsState(loadMeasurementSettings());
      }
    };
    // Wave 17B Bug 2: same-tab sync via custom event dispatched by saveMeasurementSettings.
    // Browsers do NOT fire StorageEvent on the originating tab, so we use a CustomEvent
    // so the Settings page and QuantitiesPanel stay in sync within the same session.
    const customHandler = (e: Event) => {
      const detail = (e as CustomEvent<ReturnType<typeof loadMeasurementSettings>>).detail;
      if (detail) setSettingsState(detail);
      else setSettingsState(loadMeasurementSettings());
    };
    window.addEventListener('storage', storageHandler);
    window.addEventListener('mx-measurement-settings-changed', customHandler);
    return () => {
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener('mx-measurement-settings-changed', customHandler);
    };
  }, []);

  const setSettings = useCallback((next: MeasurementSettings) => {
    setSettingsState(next);
    saveMeasurementSettings(next);
  }, []);

  return { settings, setSettings };
}
