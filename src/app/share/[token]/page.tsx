'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import PDFViewer from '@/components/PDFViewer';
import CanvasOverlay from '@/components/CanvasOverlay';
import QuantitiesPanel from '@/components/QuantitiesPanel';
import { Layers, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';

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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

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

        // Hydrate the Zustand store so QuantitiesPanel and CanvasOverlay work
        hydrateState({
          classifications: proj.state.classifications,
          polygons: proj.state.polygons,
          scale: proj.state.scale as Parameters<typeof hydrateState>[0]['scale'],
          scales: {},
          currentPage: 1,
          totalPages: proj.state.totalPages,
          annotations: [],
        });

        // Fetch the PDF binary so the viewer can render it
        try {
          const pdfRes = await fetch(`/api/projects/${proj.id}/pdf`);
          if (pdfRes.ok && !cancelled) {
            const blob = await pdfRes.blob();
            setPdfFile(new File([blob], `${proj.id}.pdf`, { type: 'application/pdf' }));
          }
        } catch {
          // PDF may not exist (e.g. deleted) — overlay still works without it
        }
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
    <div className="h-screen w-screen flex flex-col" style={{ background: '#0a0a0f', color: '#e0e0e0' }}>
      {/* Header */}
      <header
        className="w-full backdrop-blur-sm border-b flex-shrink-0"
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
          <span className="text-zinc-400 text-sm truncate max-w-[300px]">{project.name}</span>
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

        {/* Right: open in MeasureX */}
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
      </header>
      <div style={{ height: 2, background: 'linear-gradient(90deg, rgba(0,212,255,0) 0%, rgba(0,212,255,0.6) 50%, rgba(0,212,255,0) 100%)' }} />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* PDF + overlay */}
        <div className="flex-1 relative overflow-hidden">
          <PDFViewer
            file={pdfFile}
            onPageChange={(page) => {
              setPageIndex(page - 1);
              setCurrentPage(page, totalPages);
            }}
            cursor="default"
          />
          <CanvasOverlay />
        </div>

        {/* Quantities panel (read-only) */}
        <div
          className="hidden md:flex flex-col border-l overflow-y-auto"
          style={{
            width: 360,
            background: 'rgba(10,10,15,0.95)',
            borderColor: 'rgba(0,212,255,0.15)',
          }}
        >
          <QuantitiesPanel />
        </div>
      </div>
    </div>
  );
}
