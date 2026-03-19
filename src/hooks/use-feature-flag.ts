'use client';

import { useEffect, useState } from 'react';

let cachedFlags: Record<string, boolean> | null = null;
let fetchPromise: Promise<Record<string, boolean>> | null = null;

function fetchFlags(): Promise<Record<string, boolean>> {
  if (!fetchPromise) {
    fetchPromise = fetch('/api/feature-flags')
      .then((res) => res.json())
      .then((data) => {
        cachedFlags = data.flags;
        return data.flags;
      })
      .catch(() => {
        fetchPromise = null;
        return {};
      });
  }
  return fetchPromise;
}

export function useFeatureFlag(flag: string): boolean {
  const [enabled, setEnabled] = useState(() => cachedFlags?.[flag] ?? false);

  useEffect(() => {
    if (cachedFlags) {
      setEnabled(cachedFlags[flag] ?? false);
      return;
    }
    fetchFlags().then((flags) => {
      setEnabled(flags[flag] ?? false);
    });
  }, [flag]);

  return enabled;
}
