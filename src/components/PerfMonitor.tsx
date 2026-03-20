'use client';
import { useEffect, useRef } from 'react';
import { initPerfMonitor } from '@/lib/perf-monitor';

export function PerfMonitor() {
  const initialized = useRef(false);

  useEffect(() => {
    // BUG-A6-006 fix: guard against double-invocation in React StrictMode
    // (double-mount) and hot-reloads. web-vitals listeners cannot be removed,
    // so we ensure initPerfMonitor is called at most once per page load.
    // The module-level `initialized` flag in perf-monitor.ts is the canonical
    // idempotency guard; this ref adds a component-level guard as defense-in-depth.
    if (initialized.current) return;
    initialized.current = true;
    initPerfMonitor({ reportUrl: '/api/perf' });
    // No cleanup needed: web-vitals listeners are intentionally long-lived and
    // there is no API to unregister them. initPerfMonitor itself is idempotent.
  }, []);

  return null;
}
