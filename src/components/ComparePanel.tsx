'use client';

import React, { useState, useEffect } from 'react';
import { GitCompare, X, Trash2, Loader2 } from 'lucide-react';
import type { Polygon } from '@/lib/types';

interface Project {
  id: string;
  name: string;
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
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('Failed to fetch projects');
        const data = await res.json();
        const list: Project[] = (data.projects ?? data).filter(
          (p: Project) => p.id !== currentProjectId
        );
        setProjects(list);
        if (list.length > 0) setSelectedProjectId(list[0].id);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load projects');
      } finally {
        setFetching(false);
      }
    })();
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
    } catch (err: any) {
      setError(err.message ?? 'Compare failed');
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
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: 1,
              color: '#e0faff',
              fontSize: 13,
              textTransform: 'uppercase',
            }}
          >
            COMPARE PROJECTS
          </span>
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
            <div style={{ color: '#8892a0', fontSize: 12 }}>No other projects available</div>
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
          </div>
        )}
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
