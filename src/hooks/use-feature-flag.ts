'use client';

import { useEffect, useState } from 'react';

let cachedFlags: Record<string, boolean> | null = null;
let fetchPromise: Promise<Record<string, boolean>> | null = null;
let fetchedAt = 0;
// BUG-A7-2-004: expire module-level cache after 5 minutes so flag changes
// (e.g. on project switch or server-side update) are eventually picked up.
const TTL_MS = 5 * 60 * 1000;

function fetchFlags(): Promise<Record<string, boolean>> {
  if (!fetchPromise) {
    fetchPromise = fetch('/api/feature-flags')
      .then((res) => res.json())
      .then((data) => {
        cachedFlags = data.flags;
        fetchedAt = Date.now();
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
    // Expire stale cache so project/session changes pick up new flags
    if (cachedFlags && Date.now() - fetchedAt > TTL_MS) {
      cachedFlags = null;
      fetchPromise = null;
    }
    if (cachedFlags) return;
    fetchFlags().then((flags) => {
      setEnabled(flags[flag] ?? false);
    });
  }, [flag]);

  return enabled;
}
