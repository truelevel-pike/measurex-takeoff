'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import QuantitiesPanel from '@/components/QuantitiesPanel';
import { ToastProvider } from '@/components/Toast';
import { Layers, ChevronLeft, ChevronRight, ExternalLink, Loader2, FileText, Printer, Download } from 'lucide-react';

interface SharedProject {
  id: string;
  name: string;
  readOnly: boolean;
  state: {
    classifications: Array<{
      id: string;
      name: string;
      color: string;
      type: 'area' | 'linear' | 'count';
      visible: boolean;
      formula?: string;
      formulaUnit?: string;
    }>;
    polygons: Array<{
      id: string;
      points: Array<{ x: number; y: number }>;
      classificationId: string;
      pageNumber: number;
      area: number;
      linearFeet: number;
      isComplete: boolean;
      label?: string;
    }>;
    scale: {
      pixelsPerUnit: number;
      unit: string;
      label: string;
      source: string;
      pageNumber?: number;
    } | null;
    scales: Record<number, unknown>;
    currentPage: number;
    totalPages: number;
    sheetNames: Record<number, string>;
    drawingSets: Record<number, string>;
  };
}

export default function SharedViewPage() {
  const params = useParams();
  const token = params?.token as string;

  const [project, setProject] = useState<SharedProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const hydrateState = useStore((s) => s.hydrateState);
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const setProjectId = useStore((s) => s.setProjectId);

  // Fetch shared project data
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/share/${token}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;

        const proj = data.project as SharedProject;
        setProject(proj);
        setProjectId(proj.id);

        // Hydrate the Zustand store so QuantitiesPanel works
        hydrateState({
          classifications: proj.state.classifications,
          polygons: proj.state.polygons,
          scale: proj.state.scale as Parameters<typeof hydrateState>[0]['scale'],
          scales: {},
          currentPage: 1,
          totalPages: proj.state.totalPages,
          annotations: [],
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load shared project');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [token, hydrateState, setProjectId]);

  const totalPages = project?.state.totalPages ?? 1;

  const handlePrev = useCallback(() => {
    setPageIndex((p) => {
      const next = Math.max(0, p - 1);
      setCurrentPage(next + 1, totalPages);
      return next;
    });
  }, [totalPages, setCurrentPage]);

  const handleNext = useCallback(() => {
    setPageIndex((p) => {
      const next = Math.min(totalPages - 1, p + 1);
      setCurrentPage(next + 1, totalPages);
      return next;
    });
  }, [totalPages, setCurrentPage]);

  const handlePrint = useCallback(() => window.print(), []);

  const handleExport = useCallback(async (format: 'excel' | 'json' | 'pdf') => {
    setShowExportMenu(false);
    if (format === 'json' || format === 'pdf') {
      window.open(`/api/share/${token}/export?format=${format}`, '_blank');
    } else {
      const res = await fetch(`/api/share/${token}/export?format=excel`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `measurex-${project?.name?.replace(/[^a-zA-Z0-9-_]/g, '-') || 'export'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [token, project?.name]);

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  // Compute per-page quantities summary
  const pageQuantities = useMemo(() => {
    if (!project) return [];
    const currentPageNum = pageIndex + 1;
    const pagePolygons = project.state.polygons.filter(
      (p) => p.pageNumber === currentPageNum && p.isComplete,
    );
    return project.state.classifications.map((cls) => {
      const matching = pagePolygons.filter((p) => p.classificationId === cls.id);
      let value: string;
      let unit: string;
      if (cls.type === 'area') {
        const total = matching.reduce((sum, p) => sum + (p.area || 0), 0);
        value = total.toFixed(2);
        unit = 'sqft';
      } else if (cls.type === 'linear') {
        const total = matching.reduce((sum, p) => sum + (p.linearFeet || 0), 0);
        value = total.toFixed(2);
        unit = 'ft';
      } else {
        value = String(matching.length);
        unit = 'count';
      }
      return { ...cls, value, unit, count: matching.length };
    }).filter((c) => c.count > 0);
  }, [project, pageIndex]);

  const sheetName = project?.state.sheetNames?.[pageIndex + 1];
  const badge = sheetName && !sheetName.startsWith('Page ')
    ? `${sheetName} \u00b7 ${pageIndex + 1}/${totalPages}`
    : `Page ${pageIndex + 1} of ${totalPages}`;

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: '#0a0a0f', color: '#e0e0e0' }}>
        <Loader2 size={32} className="animate-spin text-cyan-400" />
        <span className="ml-3 text-lg">Loading shared project…</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0a0a0f', color: '#e0e0e0' }}>
        <h1 className="text-xl font-semibold text-red-400">{error || 'Project not found'}</h1>
        <p className="text-zinc-500">This share link may have been revoked or is invalid.</p>
        <a
          href="/"
          className="mt-4 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: '#12121a', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}
        >
          Open MeasureX
        </a>
      </div>
    );
  }

  return (
    <ToastProvider>
    <style>{`@media print { .no-print { display: none !important; } .print-only { display: block !important; } }`}</style>
    <div className="h-screen w-screen flex flex-col" style={{ background: '#0a0a0f', color: '#e0e0e0' }}>
      {/* Print-only header */}
      <div className="print-only" style={{ display: 'none', padding: '24px 16px', borderBottom: '2px solid #333' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>{project.name}</h1>
        <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>MeasureX Takeoff Report &mdash; {new Date().toLocaleDateString()}</p>
      </div>
      {/* Header */}
      <header
        className="no-print w-full backdrop-blur-sm border-b flex-shrink-0"
        style={{
          height: 52,
          background: 'rgba(10,10,15,0.95)',
          borderColor: 'rgba(0,212,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          fontSize: 13,
        }}
      >
        {/* Left: title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="font-mono tracking-wider text-white text-sm">MEASUREX</span>
          <span className="font-mono tracking-wider text-[10px]" style={{ color: '#00d4ff' }}>SHARED VIEW</span>
          <div style={{ width: 1, height: 24, background: 'rgba(0,212,255,0.2)', margin: '0 6px' }} />
          <span className="truncate max-w-[300px]" style={{ color: '#ffffff', fontSize: '0.875rem' }}>{project.name}</span>
        </div>

        {/* Center: page nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            aria-label="Previous page"
            onClick={handlePrev}
            disabled={pageIndex === 0}
            className="p-1.5 rounded-lg"
            style={{
              background: '#12121a',
              border: '1px solid rgba(0,212,255,0.15)',
              color: pageIndex === 0 ? '#555' : '#b0dff0',
              cursor: pageIndex === 0 ? 'default' : 'pointer',
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <div
            style={{
              background: 'rgba(0,212,255,0.1)',
              border: '1px solid rgba(0,212,255,0.35)',
              color: '#e0faff',
              padding: '4px 10px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Layers size={13} />
            {badge}
          </div>
          <button
            aria-label="Next page"
            onClick={handleNext}
            disabled={pageIndex >= totalPages - 1}
            className="p-1.5 rounded-lg"
            style={{
              background: '#12121a',
              border: '1px solid rgba(0,212,255,0.15)',
              color: pageIndex >= totalPages - 1 ? '#555' : '#b0dff0',
              cursor: pageIndex >= totalPages - 1 ? 'default' : 'pointer',
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Right: read-only badge + export + print + open in MeasureX */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '2px 8px', fontWeight: 500 }}>
            Read-only preview
          </span>
          {/* Export dropdown */}
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                background: '#12121a',
                border: '1px solid rgba(0,212,255,0.3)',
                color: '#00d4ff',
              }}
            >
              <Download size={14} />
              Export
            </button>
            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: '#12121a',
                  border: '1px solid rgba(0,212,255,0.3)',
                  borderRadius: 8,
                  padding: 4,
                  minWidth: 180,
                  zIndex: 50,
                }}
              >
                {[
                  { label: 'Excel (.xlsx)', format: 'excel' as const },
                  { label: 'JSON', format: 'json' as const },
                  { label: 'Contractor Report', format: 'pdf' as const },
                ].map((opt) => (
                  <button
                    key={opt.format}
                    onClick={() => handleExport(opt.format)}
                    className="w-full text-left px-3 py-2 rounded text-sm hover:bg-[rgba(0,212,255,0.1)]"
                    style={{ color: '#e0e0e0', display: 'block' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Print button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              background: '#12121a',
              border: '1px solid rgba(0,212,255,0.3)',
              color: '#00d4ff',
            }}
          >
            <Printer size={14} />
            Print Report
          </button>
          <a
            href={`/?project=${project.id}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              background: '#12121a',
              border: '1px solid rgba(0,212,255,0.3)',
              color: '#00d4ff',
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} />
            Open in MeasureX
          </a>
        </div>
      </header>
      <div style={{ height: 2, background: 'linear-gradient(90deg, rgba(0,212,255,0) 0%, rgba(0,212,255,0.6) 50%, rgba(0,212,255,0) 100%)' }} />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* PDF preview notice + inline quantities summary */}
        <div className="flex-1 relative overflow-auto" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32 }}>
          {/* PDF notice */}
          <div style={{
            background: 'rgba(0,212,255,0.05)',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 12,
            padding: '24px 32px',
            textAlign: 'center',
            maxWidth: 520,
            width: '100%',
            marginBottom: 24,
          }}>
            <FileText size={40} style={{ color: '#00d4ff', margin: '0 auto 12px' }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e0faff', marginBottom: 6 }}>
              Takeoff Summary &mdash; {sheetName || `Page ${pageIndex + 1}`}
            </h2>
            <p style={{ fontSize: 13, color: '#7a8a94', lineHeight: 1.5 }}>
              This is a read-only summary of the takeoff measurements. Open the project in MeasureX to view the full PDF with markup overlays.
            </p>
            <a
              href={`/?project=${project.id}`}
              className="inline-flex items-center gap-2 mt-4 px-5 py-2 rounded-lg text-sm font-semibold"
              style={{
                background: 'rgba(0,212,255,0.15)',
                border: '1px solid rgba(0,212,255,0.4)',
                color: '#00d4ff',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={14} />
              Open in MeasureX
            </a>
          </div>

          {/* Inline quantities summary table for current page */}
          {pageQuantities.length > 0 ? (
            <div style={{ maxWidth: 520, width: '100%' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quantities &mdash; {sheetName || `Page ${pageIndex + 1}`}
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(0,212,255,0.15)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 8px 8px 0', color: '#6b7280', fontWeight: 500 }}>Classification</th>
                    <th style={{ textAlign: 'left', padding: '8px', color: '#6b7280', fontWeight: 500 }}>Type</th>
                    <th style={{ textAlign: 'right', padding: '8px 0 8px 8px', color: '#6b7280', fontWeight: 500 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pageQuantities.map((q) => (
                    <tr key={q.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px 8px 8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: q.color,
                          flexShrink: 0,
                        }} />
                        <span style={{ color: '#e0e0e0' }}>{q.name}</span>
                      </td>
                      <td style={{ padding: 8, color: '#7a8a94' }}>{q.type}</td>
                      <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', color: '#e0faff', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {q.value} <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 11 }}>{q.unit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#4b5563', fontSize: 13, marginTop: 8 }}>
              No measurements on this page.
            </p>
          )}
        </div>

        {/* Quantities panel (read-only) */}
        <div
          className="no-print hidden md:flex flex-col border-l overflow-y-auto"
          style={{
            width: 360,
            background: 'rgba(10,10,15,0.95)',
            borderColor: 'rgba(0,212,255,0.15)',
          }}
        >
          <QuantitiesPanel />
        </div>
      </div>

      {/* Footer */}
      <footer
        className="no-print"
        style={{
          height: 36,
          background: 'rgba(10,10,15,0.95)',
          borderTop: '1px solid rgba(0,212,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          fontSize: 11,
          color: '#6b7280',
          flexShrink: 0,
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <span>&copy; 2026 MeasureX &middot; Shared View</span>
        <span style={{ color: '#4b5563' }}>Powered by MeasureX Takeoff Engine</span>
        <a href="/" style={{ color: '#00d4ff', textDecoration: 'none', fontSize: 11 }}>Get MeasureX &rarr;</a>
      </footer>
    </div>
    </ToastProvider>
  );
}
