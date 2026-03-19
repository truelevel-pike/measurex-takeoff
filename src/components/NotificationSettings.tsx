'use client';

import React, { useState, useCallback } from 'react';

export interface NotificationPrefs {
  aiTakeoffComplete: boolean;
  scaleChanged: boolean;
  polygonDeleted: boolean;
  exportReady: boolean;
}

const STORAGE_KEY = 'mx-notification-prefs';

const DEFAULT_PREFS: NotificationPrefs = {
  aiTakeoffComplete: true,
  scaleChanged: true,
  polygonDeleted: true,
  exportReady: true,
};

export function getNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs: NotificationPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable
  }
}

const PREF_LABELS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'aiTakeoffComplete', label: 'AI Takeoff Complete' },
  { key: 'scaleChanged', label: 'Scale Changed' },
  { key: 'polygonDeleted', label: 'Polygon Deleted' },
  { key: 'exportReady', label: 'Export Ready' },
];

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(getNotificationPrefs);

  const toggle = useCallback((key: keyof NotificationPrefs) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      savePrefs(next);
      return next;
    });
  }, []);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-300 uppercase tracking-wide">
        Notification Preferences
      </h3>
      <div className="space-y-2">
        {PREF_LABELS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer text-sm text-gray-200">
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={() => toggle(key)}
              className="accent-emerald-500 h-4 w-4"
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
