'use client';

// BUG-A8-001 / BUG-A8-004 fix: use isolated local state — never hydrate or
// mutate the global Zustand store from the share view.  The global store
// belongs to the main editor; overwriting it would silently discard unsaved
// work and contaminate the auto-save loop with a foreign project ID.

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
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

type TradeGroup = 'Structural' | 'Mechanical' | 'Architectural';

function inferTrade(name: string): TradeGroup {
  const n = name.toLowerCase();
  if (/concrete|steel|foundation|framing|structural/.test(n)) return 'Structural';
  if (/duct|hvac|pipe|mechanical/.test(n)) return 'Mechanical';
  return 'Architectural';
}

export default function SharedViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params?.token as string;
  // Permission level encoded by CollaborationPanel when copying the link.
  // 'view' (default) = read-only; 'edit' = can draw; 'manage' = full access.
  const permParam = searchParams?.get('perm');
  const sharePermission = (permParam === 'edit' || permParam === 'manage') ? permParam : 'view';
  const isReadOnly = sharePermission === 'view';

  const [project, setProject] = useState<SharedProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // BUG-A8-001 / BUG-A8-004: no global store access — share view is fully
  // self-contained using local React state only.

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
        // NOTE: do NOT call setProjectId or hydrateState on the global store.
        // The share view renders entirely from local `project` state to avoid
        // overwriting the editor's in-progress work.
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load shared project');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [token]);

  const totalPages = project?.state.totalPages ?? 1;

  const handlePrev = useCallback(() => {
    setPageIndex((p) => Math.max(0, p - 1));
  }, []);

  const handleNext = useCallback(() => {
    setPageIndex((p) => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  const handlePrint = useCallback(() => window.print(), []);

  // BUG-A8-002 fix: check res.ok before consuming the body; surface errors
  // instead of silently creating a corrupt download from a 401/403 body.
  const handleExport = useCallback(async (format: 'excel' | 'json' | 'pdf') => {
    setShowExportMenu(false);
    if (format === 'json' || format === 'pdf') {
      // BUG-A8-4-001 fix: encode token + use noopener,noreferrer to prevent opener leakage
      window.open(`/api/share/${encodeURIComponent(token)}/export?format=${format}`, '_blank', 'noopener,noreferrer');
    } else {
      try {
        // BUG-A8-5-045 fix: use encodeURIComponent consistently (json/pdf already do this)
        const res = await fetch(`/api/share/${encodeURIComponent(token)}/export?format=excel`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = body?.error || `Export failed (HTTP ${res.status})`;
          setError(msg);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `measurex-${project?.name?.replace(/[^a-zA-Z0-9-_]/g, '-') || 'export'}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed');
      }
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

  // Wave 12: helper to get pixelsPerUnit for a given page.
  // area is stored as pixel² and linearFeet as pixel-length — both need dividing by ppu.
  const getPPU = useCallback((pageNum: number): number => {
    if (!project) return 1;
    const pageScale = project.state.scales?.[pageNum] ?? project.state.scale;
    const ppu = (pageScale as { pixelsPerUnit?: number } | null)?.pixelsPerUnit;
    return ppu && ppu > 0 ? ppu : 1;
  }, [project]);

  // Compute per-page quantities summary
  const pageQuantities = useMemo(() => {
    if (!project) return [];
    const currentPageNum = pageIndex + 1;
    const pagePolygons = project.state.polygons.filter(
      (p) => p.pageNumber === currentPageNum && p.isComplete,
    );
    const ppu = getPPU(currentPageNum);
    return project.state.classifications.map((cls) => {
      const matching = pagePolygons.filter((p) => p.classificationId === cls.id);
      let value: string;
      let unit: string;
      if (cls.type === 'area') {
        // p.area is stored in pixel² — convert to SF via ppu²
        const total = matching.reduce((sum, p) => sum + (p.area || 0), 0) / (ppu * ppu);
        value = total.toFixed(2);
        unit = 'SF';
      } else if (cls.type === 'linear') {
        // p.linearFeet is stored in pixels — convert to LF via ppu
        const total = matching.reduce((sum, p) => sum + (p.linearFeet || 0), 0) / ppu;
        value = total.toFixed(2);
        unit = 'LF';
      } else {
        value = String(matching.length);
        unit = 'EA';
      }
      return { ...cls, value, unit, count: matching.length };
    }).filter((c) => c.count > 0);
  }, [project, pageIndex, getPPU]);

  // Compute all-page quantities for print
  const allPageQuantities = useMemo(() => {
    if (!project) return [];
    const allPolygons = project.state.polygons.filter((p) => p.isComplete);
    return project.state.classifications.map((cls) => {
      const matching = allPolygons.filter((p) => p.classificationId === cls.id);
      let value: string;
      let unit: string;
      if (cls.type === 'area') {
        const total = matching.reduce((sum, p) => {
          const ppu = getPPU(p.pageNumber);
          return sum + (p.area || 0) / (ppu * ppu);
        }, 0);
        value = total.toFixed(2);
        unit = 'SF';
      } else if (cls.type === 'linear') {
        const total = matching.reduce((sum, p) => {
          const ppu = getPPU(p.pageNumber);
          return sum + (p.linearFeet || 0) / ppu;
        }, 0);
        value = total.toFixed(2);
        unit = 'LF';
      } else {
        value = String(matching.length);
        unit = 'EA';
      }
      return { ...cls, value, unit, count: matching.length };
    }).filter((c) => c.count > 0);
  }, [project, getPPU]);

  // Grand total: count of all complete polygons
  const grandTotal = useMemo(() => {
    if (!project) return 0;
    return project.state.polygons.filter((p) => p.isComplete).length;
  }, [project]);

  // Group quantities by trade
  const groupByTrade = useCallback((quantities: typeof pageQuantities) => {
    const groups: Record<TradeGroup, typeof quantities> = {
      Structural: [],
      Mechanical: [],
      Architectural: [],
    };
    for (const q of quantities) {
      groups[inferTrade(q.name)].push(q);
    }
    return Object.entries(groups).filter(([, items]) => items.length > 0) as [TradeGroup, typeof quantities][];
  }, []);

  const sheetName = project?.state.sheetNames?.[pageIndex + 1];
  const badge = sheetName && !sheetName.startsWith('Page ')
    ? `${sheetName} \u00b7 ${pageIndex + 1}/${totalPages}`
    : `Page ${pageIndex + 1} of ${totalPages}`;

  // BUG-A8-030 fix: stable value prevents SSR/client hydration mismatch if date
  // ticks over midnight between server render and client hydration.
  const formattedDate = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    [],
  );

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
      <div
        className="h-screen w-screen flex flex-col items-center justify-center gap-4"
        style={{ background: '#0a0a0f', color: '#e0e0e0' }}
        data-testid="share-invalid-token"
      >
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

  const tradeGroups = groupByTrade(pageQuantities);
  const printTradeGroups = groupByTrade(allPageQuantities);

  const renderQuantitiesTable = (groups: typeof tradeGroups, showGrandTotal: boolean, printMode = false) => {
    const textColor = printMode ? '#111' : '#e0e0e0';
    const headerColor = printMode ? '#333' : '#6b7280';
    const valueColor = printMode ? '#000' : '#e0faff';
    const unitColor = printMode ? '#666' : '#6b7280';
    const borderColor = printMode ? '#ccc' : 'rgba(0,212,255,0.15)';
    const rowBorder = printMode ? '#e5e5e5' : 'rgba(255,255,255,0.05)';
    const tradeBg = printMode ? '#f5f5f5' : 'rgba(0,212,255,0.05)';
    const tradeColor = printMode ? '#222' : '#00d4ff';
    const badgeBg = printMode ? '#eee' : 'rgba(0,212,255,0.1)';
    const badgeColor = printMode ? '#555' : '#7a8a94';
    const badgeBorder = printMode ? '#ddd' : 'rgba(0,212,255,0.2)';

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${borderColor}` }}>
            <th style={{ textAlign: 'left', padding: '8px 8px 8px 0', color: headerColor, fontWeight: 500 }}>Classification</th>
            <th style={{ textAlign: 'left', padding: '8px', color: headerColor, fontWeight: 500 }}>Type</th>
            <th style={{ textAlign: 'right', padding: '8px 0 8px 8px', color: headerColor, fontWeight: 500 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([trade, items]) => (
            <React.Fragment key={trade}>
              <tr>
                <td colSpan={3} style={{
                  padding: '10px 0 6px 0',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: tradeColor,
                  background: tradeBg,
                  paddingLeft: 8,
                  borderBottom: `1px solid ${rowBorder}`,
                }}>
                  {trade}
                </td>
              </tr>
              {items.map((q) => (
                <tr key={q.id} style={{ borderBottom: `1px solid ${rowBorder}` }}>
                  <td style={{ padding: '8px 8px 8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: q.color,
                      flexShrink: 0,
                    }} />
                    <span style={{ color: textColor }}>{q.name}</span>
                  </td>
                  <td style={{ padding: 8 }}>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: badgeBg,
                      color: badgeColor,
                      border: `1px solid ${badgeBorder}`,
                    }}>
                      {q.type}
                    </span>
                  </td>
                  <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', color: valueColor, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {q.value} <span style={{ color: unitColor, fontWeight: 400, fontSize: 11 }}>{q.unit}</span>
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
          {showGrandTotal && (
            <tr style={{ borderTop: `2px solid ${borderColor}` }}>
              <td colSpan={3} style={{
                padding: '12px 0',
                fontSize: 13,
                fontWeight: 600,
                color: printMode ? '#111' : '#e0faff',
                textAlign: 'center',
              }}>
                {grandTotal} total measurement{grandTotal !== 1 ? 's' : ''} detected
              </td>
            </tr>
          )}
        </tbody>
      </table>
    );
  };

  return (
    <ToastProvider>
    <style>{`
      @media print {
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        .print-quantities { display: block !important; }
        body { background: white !important; color: black !important; }
      }
      @media screen {
        .print-only { display: none !important; }
        .print-quantities { display: none !important; }
      }
    `}</style>
    <div data-testid="share-page-container" className="h-screen w-screen flex flex-col" style={{ background: '#0a0a0f', color: '#e0e0e0' }}>
      {/* P4-02: Permission banner — always visible at top of share page */}
      <div
        data-testid="share-permission-banner"
        className="no-print"
        style={{
          background: sharePermission === 'view'
            ? 'rgba(234,179,8,0.08)'
            : sharePermission === 'manage'
              ? 'rgba(0,212,255,0.08)'
              : 'rgba(34,197,94,0.08)',
          borderBottom: `1px solid ${sharePermission === 'view' ? 'rgba(234,179,8,0.2)' : sharePermission === 'manage' ? 'rgba(0,212,255,0.2)' : 'rgba(34,197,94,0.2)'}`,
          padding: '6px 16px',
          fontSize: 11,
          fontFamily: 'monospace',
          color: sharePermission === 'view' ? '#d97706' : sharePermission === 'manage' ? '#00d4ff' : '#22c55e',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {sharePermission === 'view' ? '👁 View Only' : sharePermission === 'manage' ? '🔑 Can Manage' : '✏️ Can Edit'}
        {' '}— You are viewing this project as{' '}
        <strong>{sharePermission === 'view' ? 'Viewer' : sharePermission === 'manage' ? 'Manager' : 'Editor'}</strong>.
        {sharePermission === 'view' && ' Drawing tools are disabled.'}
      </div>
      {/* Print-only header */}
      <div className="print-only" style={{ padding: '32px 24px 16px', borderBottom: '2px solid #333' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>{project.name}</h1>
        <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>MeasureX Takeoff Engine &mdash; {formattedDate}</p>
      </div>

      {/* Print-only full quantities table */}
      <div className="print-quantities" style={{ padding: '24px', maxWidth: 700, margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 16 }}>All Measurements — All Pages</h2>
        {printTradeGroups.length > 0 ? renderQuantitiesTable(printTradeGroups, true, true) : (
          <p style={{ color: '#666', fontSize: 13 }}>No measurements in this project.</p>
        )}
      </div>

      {/* Header */}
      <header
        className="no-print w-full backdrop-blur-sm border-b flex-shrink-0"
        style={{
          background: 'rgba(10,10,15,0.95)',
          borderColor: 'rgba(0,212,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          fontSize: 13,
        }}
      >
        {/* Left: logo + project name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <span style={{
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '0.04em',
              background: 'linear-gradient(135deg, #00d4ff 0%, #00a0cc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1,
            }}>
              MeasureX
            </span>
            <span style={{
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.18em',
              color: '#00d4ff',
              opacity: 0.7,
              textTransform: 'uppercase',
              marginTop: 2,
            }}>
              Takeoff Engine
            </span>
          </div>
          <div style={{ width: 1, height: 36, background: 'rgba(0,212,255,0.2)', margin: '0 4px', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div className="truncate" style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, maxWidth: 300 }}>{project.name}</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '3px 10px', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
            Shared View
          </span>
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

        {/* Right: export + print + open */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            Print
          </button>
          {/* Download PDF button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              background: 'rgba(0,212,255,0.12)',
              border: '1px solid rgba(0,212,255,0.4)',
              color: '#00d4ff',
            }}
          >
            <Download size={14} />
            Download PDF
          </button>
          {/* BUG-A8-5-044 fix: use share token in the link instead of the internal project UUID
              to avoid leaking the UUID to unauthenticated viewers. The main app resolves
              the share token and redirects to the project if the viewer is authenticated. */}
          <a
            href={`/?share=${encodeURIComponent(token)}`}
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

      {/* Stats bar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 20px',
          background: 'rgba(10,10,15,0.8)',
          borderBottom: '1px solid rgba(0,212,255,0.1)',
          flexShrink: 0,
        }}
      >
        <span style={{
          fontSize: 11,
          color: '#7a8a94',
          background: 'rgba(0,212,255,0.06)',
          border: '1px solid rgba(0,212,255,0.15)',
          borderRadius: 8,
          padding: '2px 10px',
          fontWeight: 500,
        }}>
          {totalPages}-page set
        </span>
        <span style={{
          fontSize: 11,
          color: '#7a8a94',
          background: 'rgba(0,212,255,0.06)',
          border: '1px solid rgba(0,212,255,0.15)',
          borderRadius: 8,
          padding: '2px 10px',
          fontWeight: 500,
        }}>
          Updated {formattedDate}
        </span>
      </div>

      <div style={{ height: 2, background: 'linear-gradient(90deg, rgba(0,212,255,0) 0%, rgba(0,212,255,0.6) 50%, rgba(0,212,255,0) 100%)' }} className="no-print" />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* PDF preview notice + inline quantities summary */}
        <div data-testid="share-canvas" className="no-print flex-1 relative overflow-auto" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32 }}>
          {/* PDF notice */}
          <div style={{
            background: 'rgba(0,212,255,0.05)',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 12,
            padding: '24px 32px',
            textAlign: 'center',
            maxWidth: 600,
            width: '100%',
            marginBottom: 24,
          }}>
            <FileText size={40} style={{ color: '#00d4ff', margin: '0 auto 12px' }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e0faff', marginBottom: 6 }}>
              Takeoff Summary &mdash; {sheetName || `Page ${pageIndex + 1}`}
            </h2>
            <p style={{ fontSize: 13, color: '#7a8a94', lineHeight: 1.5 }}>
              {isReadOnly
                ? 'This is a read-only summary of the takeoff measurements. Open the project in MeasureX to view the full PDF with markup overlays.'
                : `You have ${sharePermission === 'manage' ? 'full management' : 'edit'} access to this project. Open MeasureX to make changes.`}
            </p>
            {!isReadOnly && (
              <div
                data-testid="share-permission-badge"
                style={{ display: 'inline-block', marginTop: 8, padding: '3px 10px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 6, fontSize: 11, color: '#00d4ff', fontFamily: 'monospace' }}
              >
                {sharePermission === 'manage' ? '🔑 Can Manage' : '✏️ Can Edit'}
              </div>
            )}
          </div>

          {/* Inline quantities summary table (grouped by trade) for current page */}
          {tradeGroups.length > 0 ? (
            <div style={{ maxWidth: 600, width: '100%' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quantities &mdash; {sheetName || `Page ${pageIndex + 1}`}
              </h3>
              {renderQuantitiesTable(tradeGroups, true)}
            </div>
          ) : (
            <p style={{ color: '#4b5563', fontSize: 13, marginTop: 8 }}>
              No measurements on this page.
            </p>
          )}

          {/* Open in MeasureX CTA */}
          {/* BUG-A8-5-044 fix: use share token instead of internal project UUID */}
          <div style={{ maxWidth: 600, width: '100%', marginTop: 32 }}>
            <a
              href={`/?share=${encodeURIComponent(token)}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                width: '100%',
                padding: '14px 20px',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                background: 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(0,212,255,0.1) 100%)',
                border: '1px solid rgba(0,212,255,0.4)',
                color: '#00d4ff',
                textDecoration: 'none',
                transition: 'background 0.2s',
              }}
            >
              <ExternalLink size={18} />
              Open in MeasureX
            </a>
          </div>
        </div>

        {/* Quantities panel (read-only) — rendered inline from local state;
            we do NOT use the global QuantitiesPanel (BUG-A8-001 fix). */}
        {allPageQuantities.length > 0 && (
          <div
            data-testid="share-quantities-panel"
            className="no-print hidden md:flex flex-col border-l overflow-y-auto"
            style={{
              width: 360,
              background: 'rgba(10,10,15,0.95)',
              borderColor: 'rgba(0,212,255,0.15)',
              padding: '16px 12px',
            }}
          >
            <h3 style={{ fontSize: 12, fontWeight: 600, color: '#7a8a94', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              All Pages — Totals
            </h3>
            {renderQuantitiesTable(groupByTrade(allPageQuantities), false)}
          </div>
        )}
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
          justifyContent: 'center',
          padding: '0 16px',
          fontSize: 11,
          color: '#6b7280',
          flexShrink: 0,
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <span>MeasureX Takeoff Engine &nbsp;|&nbsp; Powered by AI &nbsp;|&nbsp; &copy; 2026</span>
      </footer>
    </div>
    </ToastProvider>
  );
}
