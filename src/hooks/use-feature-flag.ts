'use client';

import { useEffect, useState } from 'react';

let cachedFlags: Record<string, boolean> | null = null;
let fetchPromise: Promise<Record<string, boolean>> | null = null;
let fetchedAt = 0;
// BUG-A7-2-004: expire module-level cache after 5 minutes so flag changes
// (e.g. on project switch or server-side update) are eventually picked up.
const TTL_MS = 5 * 60 * 1000;
// BUG-A7-5-004 fix: track which projectId the cache was built for
let cacheProjectId: string | undefined;

function fetchFlags(projectId?: string): Promise<Record<string, boolean>> {
  if (!fetchPromise) {
    const url = projectId
      ? `/api/feature-flags?projectId=${encodeURIComponent(projectId)}`
      : '/api/feature-flags';
    fetchPromise = fetch(url)
      .then((res) => res.json())
      .then((data) => {
        cachedFlags = data.flags;
        fetchedAt = Date.now();
        cacheProjectId = projectId;
        return data.flags;
      })
      .catch(() => {
        fetchPromise = null;
        return {};
      });
  }
  return fetchPromise;
}

export function useFeatureFlag(flag: string, projectId?: string): boolean {
  const [enabled, setEnabled] = useState(() => cachedFlags?.[flag] ?? false);

  useEffect(() => {
    // BUG-A7-5-004 fix: reset cache if projectId changed
    if (cachedFlags && projectId !== cacheProjectId) {
      cachedFlags = null;
      fetchPromise = null;
    }
    // Expire stale cache so project/session changes pick up new flags
    if (cachedFlags && Date.now() - fetchedAt > TTL_MS) {
      cachedFlags = null;
      fetchPromise = null;
    }
    if (cachedFlags) {
      // BUG-A7-5-015 fix: re-apply cached flag value when flag name changes
      setEnabled(cachedFlags[flag] ?? false);
      return;
    }
    fetchFlags(projectId).then((flags) => {
      setEnabled(flags[flag] ?? false);
    });
  }, [flag, projectId]);

  return enabled;
}
