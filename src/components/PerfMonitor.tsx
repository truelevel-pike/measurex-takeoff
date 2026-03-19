'use client';
import { useEffect } from 'react';
import { initPerfMonitor } from '@/lib/perf-monitor';

export function PerfMonitor() {
  useEffect(() => {
    initPerfMonitor({ reportUrl: '/api/perf' });
  }, []);

  return null;
}
