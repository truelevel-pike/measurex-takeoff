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
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setSettingsState(loadMeasurementSettings());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setSettings = useCallback((next: MeasurementSettings) => {
    setSettingsState(next);
    saveMeasurementSettings(next);
  }, []);

  return { settings, setSettings };
}
