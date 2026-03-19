'use client';

import { useEffect, useRef, useState } from 'react';

function usePerfQuery(): boolean {
  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('perf') === '1';
  });
  return enabled;
}

export default function DevPerfOverlay() {
  const queryEnabled = usePerfQuery();
  const isDev = process.env.NODE_ENV === 'development';
  const show = isDev || queryEnabled;

  const rafRef = useRef(0);
  const framesRef = useRef(0);
  const lastTimeRef = useRef<number>(0);
  const [fps, setFps] = useState(0);
  const [marks, setMarks] = useState<{ pdfRender: number | null; aiTakeoff: number | null; polygonDraw: number | null }>({
    pdfRender: null,
    aiTakeoff: null,
    polygonDraw: null,
  });

  useEffect(() => {
    if (!show) return;

    // Initialise global perf marks store
    if (!window.__perfMarks) {
      window.__perfMarks = { pdfRender: null, aiTakeoff: null, polygonDraw: null };
    }

    lastTimeRef.current = performance.now();

    function tick() {
      framesRef.current++;
      const now = performance.now();
      if (now - lastTimeRef.current >= 500) {
        setFps(Math.round((framesRef.current / (now - lastTimeRef.current)) * 1000));
        framesRef.current = 0;
        lastTimeRef.current = now;

        // Read perf marks
        setMarks({ ...window.__perfMarks });
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [show]);

  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.75)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 11,
        padding: '6px 10px',
        borderRadius: 6,
        pointerEvents: 'none',
        lineHeight: 1.6,
      }}
    >
      <div>FPS: {fps}</div>
      <div>PDF render: {marks.pdfRender !== null ? `${marks.pdfRender.toFixed(0)}ms` : '—'}</div>
      <div>AI Takeoff: {marks.aiTakeoff !== null ? `${marks.aiTakeoff.toFixed(0)}ms` : '—'}</div>
      <div>Polygon draw: {marks.polygonDraw !== null ? `${marks.polygonDraw.toFixed(0)}ms` : '—'}</div>
    </div>
  );
}
