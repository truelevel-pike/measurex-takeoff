'use client';

import React, { useEffect, useState, useRef, useMemo, Suspense, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Classification, Polygon, ScaleCalibration } from '@/lib/types';
import { calculateLinearFeet } from '@/lib/polygon-utils';
import {
  loadMeasurementSettings,
  formatArea,
  formatLinear,
  formatCount,
} from '@/lib/measurement-settings';

// BUG-A8-014 fix: error boundary for Suspense rejections
class PrintErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PrintPage] Error boundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white gap-4">
          <p className="text-red-600 text-lg">Failed to load print view.</p>
          <p className="text-gray-500 text-sm">{this.state.error.message}</p>
          <button
            onClick={() => window.close()}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded"
          >
            Close
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface PrintState {
  projectName: string;
  currentPage: number;
  classifications: Classification[];
  polygons: Polygon[];
  scale: ScaleCalibration | null;
  scales: Record<number, ScaleCalibration>;
  pageDims: { width: number; height: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    return `rgba(147,197,253,${alpha})`;
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

function pickScale(
  pageNumber: number,
  scales: Record<number, ScaleCalibration>,
  fallback: ScaleCalibration | null,
): ScaleCalibration | null {
  return scales[pageNumber] ?? fallback;
}

// ── Inner Component (uses useSearchParams) ───────────────────────────────────

function PrintViewInner() {
  const params = useSearchParams();
  const projectId = params.get('projectId');
  const projectName = params.get('name') || 'Untitled Project';
  const pageNum = parseInt(params.get('page') || '1', 10);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<PrintState | null>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // BUG-A8-4-005 fix: track canvas dimensions in state so useMemo re-computes
  // when the canvas actually renders (refs are not reactive)
  const [canvasDims, setCanvasDims] = useState<{ width: number; height: number } | null>(null);

  const settings = useMemo(() => loadMeasurementSettings(), []);

  // BUG-A8-005 fix: prefer BroadcastChannel / postMessage handshake for
  // cross-tab state transfer (works in Firefox strict / Safari ITP where
  // localStorage is partitioned).  Fall back to localStorage only if no
  // channel message arrives within 500 ms (e.g. same-tab open or legacy).
  // Also add explicit null guard before accessing state.classifications.
  useEffect(() => {
    let settled = false;

    function applyStoreState(storeState: Record<string, unknown>) {
      if (settled) return;
      settled = true;
      // BUG-A8-005 null guard: ensure we have classifications before computing quantityRows
      const classifications = Array.isArray(storeState.classifications) ? storeState.classifications as Classification[] : [];
      const allPolygons = Array.isArray(storeState.polygons) ? storeState.polygons as Polygon[] : [];
      setState({
        projectName,
        currentPage: pageNum,
        classifications,
        polygons: allPolygons.filter((p) => p.pageNumber === pageNum),
        scale: (storeState.scale as ScaleCalibration | null) ?? null,
        scales: (storeState.scales as Record<number, ScaleCalibration>) ?? {},
        pageDims: (storeState.pageBaseDimensions as Record<number, { width: number; height: number }>)?.[pageNum] ?? { width: 612, height: 792 },
      });
    }

    // 1. Try BroadcastChannel — works when localStorage is partitioned
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('measurex-print-state');
      channel.onmessage = (ev: MessageEvent) => {
        if (ev.data?.type === 'print-state' && ev.data.state) {
          applyStoreState(ev.data.state as Record<string, unknown>);
        }
      };
      // Request state from the opener
      channel.postMessage({ type: 'print-state-request' });
    } catch {
      // BroadcastChannel not available; fall through to localStorage
    }

    // 2. Fallback: localStorage (may be empty under ITP/Firefox strict mode)
    const fallbackTimer = setTimeout(() => {
      if (settled) return;
      try {
        const raw = localStorage.getItem('measurex-state');
        if (!raw) {
          setError('No project data found. Please re-open the print view from within the editor.');
          settled = true;
          return;
        }
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const storeState = (parsed.state as Record<string, unknown>) ?? parsed;
        applyStoreState(storeState);
      } catch {
        if (!settled) {
          setError('Failed to load project data. Please re-open the print view from within the editor.');
          settled = true;
        }
      }
    }, 500);

    return () => {
      clearTimeout(fallbackTimer);
      channel?.close();
    };
  }, [projectName, pageNum]);

  // Render the PDF page onto the canvas
  useEffect(() => {
    if (!projectId || !canvasRef.current || !state) return;

    let cancelled = false;

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const resp = await fetch(`/api/projects/${projectId}/pdf`);
        if (!resp.ok) {
          setError('PDF file not found.');
          return;
        }
        const arrayBuf = await resp.arrayBuffer();
        const doc: PDFDocumentProxy = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;
        if (cancelled) return;

        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // BUG-A8-4-005 fix: update canvas dims state so svgScale re-computes
        setCanvasDims({ width: viewport.width, height: viewport.height });
        const ctx = canvas.getContext('2d')!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx as unknown as any, viewport } as any).promise;

        if (!cancelled) setPdfLoaded(true);
      } catch (err) {
        if (!cancelled) setError('Failed to render PDF page.');
        console.error('[PrintView] PDF render error:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, pageNum, state]);

  // Auto-print when PDF is loaded
  const hasPrinted = useRef(false);
  useEffect(() => {
    if (pdfLoaded && !hasPrinted.current) {
      hasPrinted.current = true;
      setTimeout(() => window.print(), 500);
    }
  }, [pdfLoaded]);

  // Compute quantities for the table
  const quantityRows = useMemo(() => {
    if (!state) return [];
    const { classifications, polygons, scale, scales, currentPage } = state;
    const pageScale = pickScale(currentPage, scales, scale);
    const ppu = pageScale?.pixelsPerUnit && pageScale.pixelsPerUnit > 0 ? pageScale.pixelsPerUnit : 1;

    const rows: { name: string; type: string; value: string; color: string; count: number }[] = [];

    for (const cls of classifications) {
      const clsPolygons = polygons.filter(p => p.classificationId === cls.id);
      if (clsPolygons.length === 0) continue;

      let totalArea = 0;
      let totalLinear = 0;
      let totalCount = 0;

      for (const poly of clsPolygons) {
        if (cls.type === 'area') {
          totalArea += poly.area / (ppu * ppu);
        } else if (cls.type === 'linear') {
          totalLinear += calculateLinearFeet(poly.points, ppu, false);
        } else {
          totalCount += 1;
        }
      }

      let formattedValue: string;
      if (cls.type === 'area') {
        formattedValue = formatArea(totalArea, settings);
      } else if (cls.type === 'linear') {
        formattedValue = formatLinear(totalLinear, settings);
      } else {
        formattedValue = formatCount(totalCount);
      }

      rows.push({
        name: cls.name,
        type: cls.type.toUpperCase(),
        value: formattedValue,
        color: cls.color,
        count: clsPolygons.length,
      });
    }

    return rows;
  }, [state, settings]);

  // BUG-A8-4-005 fix: use canvasDims state (not canvasRef) so useMemo re-computes
  // when the canvas actually renders, not just when state changes.
  const svgScale = useMemo(() => {
    if (!state || !canvasDims) return 1;
    return (canvasDims.width ?? state.pageDims.width) / state.pageDims.width;
  }, [state, canvasDims]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-red-600 text-lg">{error}</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  // BUG-A8-5-012 fix: avoid SSR/client hydration mismatch by deferring dateStr
  // to client-side only. `new Date()` differs between server render time and
  // client hydration time, causing React hydration warnings. useEffect ensures
  // the value is only set on the client where it's stable.
  const [dateStr, setDateStr] = useState('');
  useEffect(() => {
    setDateStr(new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }));
  }, []);

  return (
    <div className="print-view bg-white text-black min-h-screen">
      {/* Header */}
      <header className="print-header flex items-center justify-between border-b-2 border-gray-800 px-6 py-4 mb-4">
        <div>
          <h1 className="text-xl font-bold">{state.projectName}</h1>
          <p className="text-sm text-gray-500">Page {state.currentPage}</p>
        </div>
        <div className="text-right text-sm text-gray-500">
          <p>{dateStr}</p>
          <p>MeasureX Takeoff</p>
        </div>
      </header>

      {/* Drawing with polygon overlays */}
      <div className="relative mx-auto print-drawing" style={{ maxWidth: '100%' }}>
        <canvas ref={canvasRef} className="w-full h-auto block" />

        {/* SVG overlay for polygons */}
        {pdfLoaded && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${canvasDims?.width ?? state.pageDims.width} ${canvasDims?.height ?? state.pageDims.height}`}
            preserveAspectRatio="none"
          >
            {state.polygons.map(poly => {
              const cls = state.classifications.find(c => c.id === poly.classificationId);
              if (!cls || !cls.visible) return null;
              const scaledPts = poly.points.map(p => ({
                x: p.x * svgScale,
                y: p.y * svgScale,
              }));

              if (cls.type === 'linear') {
                const pts = scaledPts.map(p => `${p.x},${p.y}`).join(' ');
                return (
                  <g key={poly.id}>
                    <polyline
                      points={pts}
                      fill="none"
                      stroke={cls.color}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {scaledPts.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={3} fill={cls.color} />
                    ))}
                  </g>
                );
              }

              if (cls.type === 'count') {
                const cx = scaledPts.reduce((s, p) => s + p.x, 0) / (scaledPts.length || 1);
                const cy = scaledPts.reduce((s, p) => s + p.y, 0) / (scaledPts.length || 1);
                return (
                  <g key={poly.id}>
                    <circle cx={cx} cy={cy} r={8} fill={hexToRgba(cls.color, 0.5)} stroke={cls.color} strokeWidth={2} />
                    <circle cx={cx} cy={cy} r={3} fill={cls.color} />
                  </g>
                );
              }

              // area polygon
              const pts = scaledPts.map(p => `${p.x},${p.y}`).join(' ');
              return (
                <polygon
                  key={poly.id}
                  points={pts}
                  fill={hexToRgba(cls.color, 0.3)}
                  stroke={cls.color}
                  strokeWidth={2}
                />
              );
            })}
          </svg>
        )}
      </div>

      {/* Quantities Table */}
      {quantityRows.length > 0 && (
        <div className="mt-6 px-6 print-quantities">
          <h2 className="text-lg font-semibold mb-3 border-b border-gray-300 pb-1">Quantities Summary</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-400">
                <th className="text-left py-2 pr-4">Classification</th>
                <th className="text-left py-2 pr-4">Type</th>
                <th className="text-right py-2 pr-4">Count</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {quantityRows.map((row, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="py-1.5 pr-4 flex items-center gap-2">
                    <span
                      className="inline-block w-3 h-3 rounded-sm print-color-swatch"
                      style={{ backgroundColor: row.color }}
                    />
                    {row.name}
                  </td>
                  <td className="py-1.5 pr-4 text-gray-600">{row.type}</td>
                  <td className="py-1.5 pr-4 text-right">{row.count}</td>
                  <td className="py-1.5 text-right font-medium">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Print-only button (hidden during print) */}
      <div className="mt-8 px-6 pb-8 no-print flex gap-3">
        <button
          onClick={() => window.print()}
          className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-500"
        >
          Print
        </button>
        <button
          onClick={() => window.close()}
          className="bg-gray-200 text-gray-700 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-300"
        >
          Close
        </button>
      </div>

      {/* Print CSS */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-view { padding: 0; }
          .print-header { padding: 8pt 16pt; margin-bottom: 4pt !important; }
          .print-drawing {
            page-break-inside: avoid;
            width: 100% !important;
            max-width: 100% !important;
          }
          .print-drawing canvas {
            width: 100% !important;
            height: auto !important;
          }
          .print-quantities { page-break-inside: avoid; margin-top: 8pt !important; }
          .print-color-swatch { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          svg polygon, svg polyline, svg circle {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            margin: 0.35in;
            size: landscape;
          }
        }
        @media screen {
          .print-drawing { max-width: 1200px; }
        }
      `}</style>
    </div>
  );
}

// ── Page wrapper with Suspense + Error Boundary ──────────────────────────────

export default function PrintPage() {
  return (
    // BUG-A8-014 fix: wrap Suspense in an error boundary to catch suspense
    // rejections (e.g. missing searchParams) and show a recoverable UI.
    <PrintErrorBoundary>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-white"><p className="text-gray-500">Loading...</p></div>}>
        <PrintViewInner />
      </Suspense>
    </PrintErrorBoundary>
  );
}
