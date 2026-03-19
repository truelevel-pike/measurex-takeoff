'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Classification, Polygon, ScaleCalibration } from '@/lib/types';
import { calculateLinearFeet } from '@/lib/polygon-utils';
import {
  loadMeasurementSettings,
  formatArea,
  formatLinear,
  formatCount,
  AREA_UNIT_LABELS,
  LINEAR_UNIT_LABELS,
} from '@/lib/measurement-settings';

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

  const settings = useMemo(() => loadMeasurementSettings(), []);

  // Load state from localStorage (same Zustand store the main app uses)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('measurex-state');
      if (!raw) {
        setError('No project data found. Open a project first.');
        return;
      }
      const parsed = JSON.parse(raw);
      const storeState = parsed.state || parsed;

      setState({
        projectName,
        currentPage: pageNum,
        classifications: storeState.classifications || [],
        polygons: (storeState.polygons || []).filter(
          (p: Polygon) => p.pageNumber === pageNum,
        ),
        scale: storeState.scale || null,
        scales: storeState.scales || {},
        pageDims: storeState.pageBaseDimensions?.[pageNum] || { width: 612, height: 792 },
      });
    } catch {
      setError('Failed to load project data.');
    }
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
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

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

  // Scale factor from base dims to canvas dims for SVG overlay
  const svgScale = useMemo(() => {
    if (!state || !canvasRef.current) return 1;
    return (canvasRef.current?.width ?? state.pageDims.width) / state.pageDims.width;
  }, [state, pdfLoaded]);

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

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

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
            viewBox={`0 0 ${canvasRef.current?.width ?? state.pageDims.width} ${canvasRef.current?.height ?? state.pageDims.height}`}
            preserveAspectRatio="none"
          >
            {state.polygons.map(poly => {
              const cls = state.classifications.find(c => c.id === poly.classificationId);
              if (!cls || !cls.visible) return null;
              const points = poly.points
                .map(p => `${p.x * svgScale},${p.y * svgScale}`)
                .join(' ');
              return (
                <polygon
                  key={poly.id}
                  points={points}
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
          body { margin: 0; padding: 0; }
          .print-view { padding: 0; }
          .print-header { padding: 12pt 24pt; }
          .print-drawing { page-break-inside: avoid; }
          .print-quantities { page-break-inside: avoid; }
          .print-color-swatch { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          svg polygon { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page {
            margin: 0.5in;
            size: landscape;
          }
        }
      `}</style>
    </div>
  );
}

// ── Page wrapper with Suspense ───────────────────────────────────────────────

export default function PrintPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-white"><p className="text-gray-500">Loading...</p></div>}>
      <PrintViewInner />
    </Suspense>
  );
}
