'use client';

import React, { useState, useEffect } from 'react';
import { GitCompare, X, Trash2, Loader2 } from 'lucide-react';
import type { Polygon } from '@/lib/types';

interface Project {
  id: string;
  name: string;
}

interface ClassificationDiff {
  classificationId: string;
  name: string;
  qtyA: number;
  qtyB: number;
  delta: number;
  status: 'added' | 'removed' | 'changed' | 'same';
}

interface CompareResult {
  added: Polygon[];
  removed: Polygon[];
  unchanged: Polygon[];
  summary: {
    addedCount: number;
    removedCount: number;
    unchangedCount: number;
  };
  classificationDiff?: ClassificationDiff[];
}

interface ComparePanelProps {
  currentProjectId: string;
  onOverlay: (data: { added: Polygon[]; removed: Polygon[]; unchanged: Polygon[] } | null) => void;
  onClose: () => void;
}

export default function ComparePanel({ currentProjectId, onOverlay, onClose }: ComparePanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch project list
  // BUG-A6-5-012 fix: guard fetch with cancelled flag so setProjects/setFetching
  // don't fire on an unmounted component if the panel is closed while in-flight.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('Failed to fetch projects');
        const data = await res.json();
        if (cancelled) return;
        const list: Project[] = (data.projects ?? data).filter(
          (p: Project) => p.id !== currentProjectId
        );
        setProjects(list);
        if (list.length > 0) setSelectedProjectId(list[0].id);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentProjectId]);

  const handleCompare = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/projects/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIdA: currentProjectId,
          projectIdB: selectedProjectId,
        }),
      });
      if (!res.ok) throw new Error('Compare request failed');
      const data: CompareResult = await res.json();
      setResult(data);
      onOverlay({ added: data.added, removed: data.removed, unchanged: data.unchanged });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Compare failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setResult(null);
    onOverlay(null);
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    color: '#8892a0',
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        zIndex: 60,
        background: '#0a0a0f',
        borderLeft: '1px solid rgba(0,212,255,0.25)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid rgba(0,212,255,0.2)',
          background: 'rgba(10,10,15,0.6)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitCompare size={16} style={{ color: '#00d4ff' }} />
          <div>
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: 1,
                color: '#e0faff',
                fontSize: 13,
                textTransform: 'uppercase',
                display: 'block',
              }}
            >
              COMPARE PROJECTS
            </span>
            <span style={{ fontSize: 11, color: '#8892a0', fontFamily: 'monospace' }}>
              Compare two takeoff versions side-by-side
            </span>
          </div>
        </div>
        <button
          aria-label="Close compare panel"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#8892a0',
            borderRadius: 6,
            padding: 5,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 150ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#e0e0e0';
            e.currentTarget.style.borderColor = 'rgba(255,100,100,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#8892a0';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Project selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Compare With</label>
          {fetching ? (
            <div style={{ color: '#8892a0', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div style={{ color: '#8892a0', fontSize: 12, lineHeight: 1.5 }}>
              You need at least 2 projects to use Compare. Create another project to get started.
            </div>
          ) : (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{
                background: '#12121a',
                color: '#e0faff',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} style={{ background: '#12121a' }}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleCompare}
            disabled={loading || !selectedProjectId || fetching}
            style={{
              flex: 1,
              background: loading ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.15)',
              border: '1px solid rgba(0,212,255,0.4)',
              color: '#00d4ff',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 150ms',
              opacity: !selectedProjectId || fetching ? 0.5 : 1,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Comparing...
              </>
            ) : (
              <>
                <GitCompare size={14} />
                Compare
              </>
            )}
          </button>
          {result && (
            <button
              onClick={handleClear}
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 150ms',
              }}
            >
              <Trash2 size={14} />
              Clear
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '10px 12px',
              color: '#ef4444',
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Results summary */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={labelStyle}>Results</label>

            {/* Legend + counts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    backgroundColor: 'rgba(34,197,94,0.3)',
                    border: '2px solid #22c55e',
                  }}
                />
                <span style={{ color: '#e0e0e0', fontSize: 12, fontFamily: 'monospace' }}>
                  Added
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    color: '#22c55e',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  }}
                >
                  {result.summary.addedCount}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    backgroundColor: 'rgba(239,68,68,0.3)',
                    border: '2px solid #ef4444',
                  }}
                />
                <span style={{ color: '#e0e0e0', fontSize: 12, fontFamily: 'monospace' }}>
                  Removed
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    color: '#ef4444',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  }}
                >
                  {result.summary.removedCount}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    backgroundColor: 'rgba(156,163,175,0.3)',
                    border: '2px solid #9ca3af',
                  }}
                />
                <span style={{ color: '#e0e0e0', fontSize: 12, fontFamily: 'monospace' }}>
                  Unchanged
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    color: '#9ca3af',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  }}
                >
                  {result.summary.unchangedCount}
                </span>
              </div>
            </div>

            {/* Total */}
            <div
              style={{
                borderTop: '1px solid rgba(0,212,255,0.15)',
                paddingTop: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ color: '#8892a0', fontSize: 11, fontFamily: 'monospace', textTransform: 'uppercase' }}>
                Total polygons
              </span>
              <span style={{ color: '#e0faff', fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>
                {result.summary.addedCount + result.summary.removedCount + result.summary.unchangedCount}
              </span>
            </div>

            {/* Classification Quantities */}
            {result.classificationDiff && result.classificationDiff.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <label style={labelStyle}>Classification Quantities</label>
                <div
                  style={{
                    border: '1px solid rgba(0,212,255,0.15)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  {/* Table header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 52px 52px 60px',
                      gap: 0,
                      padding: '6px 10px',
                      background: 'rgba(0,212,255,0.06)',
                      borderBottom: '1px solid rgba(0,212,255,0.1)',
                    }}
                  >
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#8892a0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Classification</span>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#8892a0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Proj A</span>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#8892a0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Proj B</span>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#8892a0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Delta</span>
                  </div>
                  {/* Table rows */}
                  {result.classificationDiff.map((cd) => {
                    const deltaColor = cd.delta > 0 ? '#22c55e' : cd.delta < 0 ? '#ef4444' : '#9ca3af';
                    const statusColors: Record<string, { bg: string; fg: string }> = {
                      added: { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e' },
                      removed: { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' },
                      changed: { bg: 'rgba(234,179,8,0.15)', fg: '#eab308' },
                      same: { bg: 'rgba(156,163,175,0.1)', fg: '#9ca3af' },
                    };
                    const sc = statusColors[cd.status];
                    return (
                      <div
                        key={cd.classificationId}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 52px 52px 60px',
                          gap: 0,
                          padding: '5px 10px',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 11, color: '#e0e0e0', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cd.name}</span>
                          <span
                            style={{
                              fontSize: 8,
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: sc.bg,
                              color: sc.fg,
                              flexShrink: 0,
                            }}
                          >
                            {cd.status}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#8892a0', textAlign: 'right' }}>{Math.round(cd.qtyA)}</span>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#8892a0', textAlign: 'right' }}>{Math.round(cd.qtyB)}</span>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: deltaColor, fontWeight: 700, textAlign: 'right' }}>
                          {cd.delta > 0 ? '+' : ''}{Math.round(cd.delta)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Diff legend */}
      <div
        style={{
          padding: '10px 16px',
          borderTop: '1px solid rgba(0,212,255,0.15)',
          display: 'flex',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e' }} />
          <span style={{ fontSize: 10, color: '#8892a0', fontFamily: 'monospace' }}>New polygons</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444' }} />
          <span style={{ fontSize: 10, color: '#8892a0', fontFamily: 'monospace' }}>Removed polygons</span>
        </div>
      </div>

      {/* Inline keyframe for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
