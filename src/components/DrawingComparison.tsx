'use client';

import React, { useState, useCallback } from 'react';
import { X, GitCompare, Layers, Eye, SlidersHorizontal, Loader2, AlertCircle } from 'lucide-react';

// --- Types ---
interface Drawing {
  id: string;
  name: string;
}

interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
}

interface ClassificationDiffEntry {
  classificationId: string;
  name: string;
  qtyA: number;
  qtyB: number;
  delta: number;
  status: 'added' | 'removed' | 'changed' | 'same';
}

interface CompareResult {
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
  classificationDiff: ClassificationDiffEntry[];
  diffRegions: DiffRegion[];
}

interface DrawingComparisonProps {
  /** List of drawings (projects) available to compare. Pass real project data from your store. */
  drawings?: Drawing[];
  onClose?: () => void;
}

// ---- Helpers ----

/** Convert classification diff entries into canvas-overlay diff regions.
 *  Since we don't have pixel coordinates from the polygon data, we render
 *  a tabular legend instead of canvas boxes.  This function is kept for
 *  future use when polygon bounding-box data is available from the API.
 */
function classificationDiffToRegions(diff: ClassificationDiffEntry[]): DiffRegion[] {
  const statusColors: Record<string, string> = {
    added: '#22c55e',
    removed: '#ef4444',
    changed: '#f59e0b',
  };
  return diff
    .filter((d) => d.status !== 'same')
    .map((d, i) => ({
      // Spread vertically across the panel for visibility
      x: 5,
      y: 5 + i * 12,
      width: 90,
      height: 10,
      label: `${d.name}: ${d.delta > 0 ? '+' : ''}${d.delta.toFixed(1)}`,
      color: statusColors[d.status] ?? '#a3a3a3',
    }));
}

async function fetchComparisonResult(projectIdA: string, projectIdB: string): Promise<CompareResult> {
  const res = await fetch('/api/projects/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectIdA, projectIdB }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  const classificationDiff: ClassificationDiffEntry[] = data.classificationDiff ?? [];
  const diffRegions = classificationDiffToRegions(classificationDiff);
  return {
    addedCount: data.summary?.addedCount ?? 0,
    removedCount: data.summary?.removedCount ?? 0,
    unchangedCount: data.summary?.unchangedCount ?? 0,
    classificationDiff,
    diffRegions,
  };
}

// ---- Sub-components ----

function PanelPlaceholder({
  label,
  diffRegions,
  showDiff,
}: {
  label: string;
  diffRegions: DiffRegion[];
  showDiff: boolean;
}) {
  return (
    <div
      className="relative w-full h-full flex items-center justify-center rounded"
      style={{
        background: '#0d0d14',
        border: '1px solid rgba(0,212,255,0.15)',
        minHeight: 320,
        overflow: 'hidden',
      }}
    >
      {/* Grid background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Placeholder content */}
      <div className="relative flex flex-col items-center gap-3 text-center px-4">
        <Layers size={36} style={{ color: 'rgba(0,212,255,0.25)' }} />
        <span style={{ color: '#8892a0', fontSize: 13 }}>{label}</span>
        <span style={{ color: 'rgba(0,212,255,0.4)', fontSize: 11, fontFamily: 'monospace' }}>
          PDF canvas renders here
        </span>
      </div>

      {/* Diff region overlays */}
      {showDiff &&
        diffRegions.map((region, i) => (
          <div
            key={`diff-${region.label}-${i}`}
            title={region.label}
            style={{
              position: 'absolute',
              left: `${region.x}%`,
              top: `${region.y}%`,
              width: `${region.width}%`,
              height: `${region.height}%`,
              border: `2px solid ${region.color}`,
              borderRadius: 4,
              boxShadow: `0 0 8px ${region.color}66`,
              backgroundColor: `${region.color}18`,
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -18,
                left: 0,
                fontSize: 9,
                color: region.color,
                fontFamily: 'monospace',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                textShadow: '0 0 4px #000',
              }}
            >
              {region.label}
            </span>
          </div>
        ))}
    </div>
  );
}

function DrawingSelect({
  label,
  value,
  onChange,
  drawings,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  drawings: Drawing[];
}) {
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <label
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          color: '#8892a0',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: '#12121a',
          color: '#e0faff',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 12,
          outline: 'none',
          cursor: 'pointer',
          width: '100%',
        }}
        aria-label={`Select ${label}`}
      >
        {drawings.length === 0 && (
          <option value="" disabled>
            No drawings available
          </option>
        )}
        {drawings.map((d) => (
          <option key={d.id} value={d.id} style={{ background: '#12121a' }}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---- Main Component ----

export default function DrawingComparison({ drawings = [], onClose }: DrawingComparisonProps) {
  const [drawingAId, setDrawingAId] = useState<string>(drawings[0]?.id ?? '');
  const [drawingBId, setDrawingBId] = useState<string>(drawings[1]?.id ?? drawings[0]?.id ?? '');
  const [viewMode, setViewMode] = useState<'sidebyside' | 'overlay'>('sidebyside');
  const [overlayOpacity, setOverlayOpacity] = useState<number>(50);
  const [showDiff, setShowDiff] = useState<boolean>(true);

  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const drawingA = drawings.find((d) => d.id === drawingAId) ?? drawings[0];
  const drawingB = drawings.find((d) => d.id === drawingBId) ?? drawings[1] ?? drawings[0];

  const diffRegions = compareResult?.diffRegions ?? [];
  const hasDiff = diffRegions.length > 0;

  const handleCompare = useCallback(async () => {
    if (!drawingAId || !drawingBId) return;
    setComparing(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const result = await fetchComparisonResult(drawingAId, drawingBId);
      setCompareResult(result);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  }, [drawingAId, drawingBId]);

  const btnBase: React.CSSProperties = {
    background: '#12121a',
    border: '1px solid rgba(0,212,255,0.2)',
    color: '#b0dff0',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 150ms ease',
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: 'rgba(0,212,255,0.15)',
    border: '1px solid rgba(0,212,255,0.5)',
    color: '#e0faff',
    boxShadow: '0 0 10px rgba(0,212,255,0.2) inset',
  };

  return (
    <div
      role="dialog"
      aria-label="Compare Drawings"
      data-testid="drawing-comparison-container"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: '#0a0a0f',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: 16,
          boxShadow: '0 0 40px rgba(0,212,255,0.18)',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: 1100,
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(0,212,255,0.2)',
            background: 'rgba(10,10,15,0.6)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GitCompare size={18} style={{ color: '#00d4ff' }} />
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: 1,
                color: '#e0faff',
                fontSize: 14,
              }}
            >
              COMPARE DRAWINGS
            </span>
          </div>
          <button
            aria-label="Close comparison"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#8892a0',
              borderRadius: 8,
              padding: 6,
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
            <X size={16} />
          </button>
        </div>

        {/* Controls bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 14,
            padding: '12px 18px',
            borderBottom: '1px solid rgba(0,212,255,0.12)',
            background: 'rgba(10,10,15,0.4)',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          {/* Drawing selectors */}
          <DrawingSelect
            label="Drawing A"
            value={drawingAId}
            onChange={setDrawingAId}
            drawings={drawings}
          />
          <DrawingSelect
            label="Drawing B"
            value={drawingBId}
            onChange={setDrawingBId}
            drawings={drawings}
          />

          {/* Compare button */}
          <button
            onClick={handleCompare}
            disabled={comparing || !drawingAId || !drawingBId || drawings.length < 2}
            style={{
              ...btnBase,
              background: 'rgba(0,212,255,0.15)',
              border: '1px solid rgba(0,212,255,0.4)',
              color: '#e0faff',
              opacity: comparing || drawings.length < 2 ? 0.6 : 1,
              cursor: comparing || drawings.length < 2 ? 'not-allowed' : 'pointer',
              alignSelf: 'flex-end',
              marginBottom: 2,
            }}
            aria-label="Run comparison"
          >
            {comparing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <GitCompare size={13} />
            )}
            {comparing ? 'Comparing…' : 'Compare'}
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 36, background: 'rgba(0,212,255,0.15)', flexShrink: 0 }} />

          {/* View mode toggle */}
          <div className="flex flex-col gap-1">
            <label
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                color: '#8892a0',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
              }}
            >
              View Mode
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={viewMode === 'sidebyside' ? btnActive : btnBase}
                onClick={() => setViewMode('sidebyside')}
                aria-pressed={viewMode === 'sidebyside'}
              >
                <GitCompare size={13} />
                Side by Side
              </button>
              <button
                style={viewMode === 'overlay' ? btnActive : btnBase}
                onClick={() => setViewMode('overlay')}
                aria-pressed={viewMode === 'overlay'}
              >
                <Eye size={13} />
                Overlay
              </button>
            </div>
          </div>

          {/* Opacity slider (overlay mode only) */}
          {viewMode === 'overlay' && (
            <div className="flex flex-col gap-1" style={{ minWidth: 180 }}>
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1,
                  color: '#8892a0',
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <SlidersHorizontal size={11} />
                Opacity: {overlayOpacity}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                aria-label="Overlay opacity"
                style={{
                  accentColor: '#00d4ff',
                  width: '100%',
                  cursor: 'pointer',
                }}
              />
            </div>
          )}

          {/* Diff highlight toggle */}
          {compareResult && (
            <div className="flex flex-col gap-1">
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1,
                  color: '#8892a0',
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                }}
              >
                Diff Highlight
              </label>
              <button
                onClick={() => setShowDiff(!showDiff)}
                aria-pressed={showDiff}
                style={showDiff ? btnActive : btnBase}
              >
                {showDiff ? 'On' : 'Off'}
              </button>
            </div>
          )}
        </div>

        {/* Error banner */}
        {compareError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              background: 'rgba(239,68,68,0.1)',
              borderBottom: '1px solid rgba(239,68,68,0.3)',
              flexShrink: 0,
            }}
          >
            <AlertCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#fca5a5' }}>{compareError}</span>
          </div>
        )}

        {/* Diff legend — only shown after a successful comparison with results */}
        {compareResult && hasDiff && showDiff && (
          <div
            data-testid="drawing-comparison-result"
            style={{
              display: 'flex',
              gap: 16,
              padding: '8px 18px',
              borderBottom: '1px solid rgba(0,212,255,0.08)',
              background: 'rgba(10,10,15,0.3)',
              flexShrink: 0,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {[
              { color: '#ef4444', label: 'Removed' },
              { color: '#22c55e', label: 'Added' },
              { color: '#f59e0b', label: 'Modified' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    border: `2px solid ${color}`,
                    backgroundColor: `${color}22`,
                    boxShadow: `0 0 4px ${color}55`,
                  }}
                />
                <span style={{ fontSize: 11, color: '#8892a0', fontFamily: 'monospace' }}>{label}</span>
              </div>
            ))}
            <span style={{ fontSize: 11, color: 'rgba(0,212,255,0.7)', marginLeft: 'auto', fontFamily: 'monospace' }}>
              +{compareResult.addedCount} added · -{compareResult.removedCount} removed · {compareResult.unchangedCount} unchanged
            </span>
          </div>
        )}

        {/* Empty state — shown after comparison with zero diff */}
        {compareResult && !hasDiff && (
          <div
            data-testid="drawing-comparison-empty"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderBottom: '1px solid rgba(0,212,255,0.08)',
              background: 'rgba(10,10,15,0.3)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 12, color: '#8892a0', fontFamily: 'monospace' }}>
              No differences detected between the selected drawings.
            </span>
          </div>
        )}

        {/* No drawings state */}
        {drawings.length < 2 && (
          <div
            data-testid="drawing-comparison-empty"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderBottom: '1px solid rgba(0,212,255,0.08)',
              background: 'rgba(10,10,15,0.3)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 12, color: '#8892a0', fontFamily: 'monospace' }}>
              At least two drawings are required to compare.
            </span>
          </div>
        )}

        {/* Canvas panels */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            gap: viewMode === 'sidebyside' ? 8 : 0,
            padding: 14,
            background: '#07070d',
          }}
        >
          {viewMode === 'sidebyside' ? (
            <>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: '#00d4ff', fontFamily: 'monospace', fontWeight: 700 }}>
                  A — {drawingA?.name ?? 'Drawing A'}
                </div>
                <PanelPlaceholder
                  label={drawingA?.name ?? 'Drawing A'}
                  diffRegions={showDiff ? diffRegions : []}
                  showDiff={showDiff}
                />
              </div>
              {/* Center divider */}
              <div
                style={{
                  width: 2,
                  alignSelf: 'stretch',
                  background:
                    'linear-gradient(to bottom, transparent, rgba(0,212,255,0.3) 30%, rgba(0,212,255,0.3) 70%, transparent)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: '#f59e0b', fontFamily: 'monospace', fontWeight: 700 }}>
                  B — {drawingB?.name ?? 'Drawing B'}
                </div>
                <PanelPlaceholder
                  label={drawingB?.name ?? 'Drawing B'}
                  diffRegions={showDiff ? diffRegions : []}
                  showDiff={showDiff}
                />
              </div>
            </>
          ) : (
            /* Overlay mode */
            <div style={{ flex: 1, position: 'relative' }}>
              <div style={{ fontSize: 11, color: '#8892a0', fontFamily: 'monospace', marginBottom: 6 }}>
                Overlay — <span style={{ color: '#00d4ff' }}>A</span> over{' '}
                <span style={{ color: '#f59e0b' }}>B</span> at {overlayOpacity}% opacity
              </div>
              {/* Base drawing B */}
              <PanelPlaceholder label={drawingB?.name ?? 'Drawing B'} diffRegions={[]} showDiff={false} />
              {/* Drawing A on top with opacity */}
              <div
                style={{
                  position: 'absolute',
                  inset: '26px 0 0 0',
                  opacity: overlayOpacity / 100,
                  pointerEvents: 'none',
                  border: '2px solid rgba(0,212,255,0.3)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  background: 'rgba(0,50,80,0.3)',
                }}
                aria-hidden
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundImage:
                      'linear-gradient(rgba(0,212,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.06) 1px, transparent 1px)',
                    backgroundSize: '30px 30px',
                  }}
                />
              </div>
              {/* Diff regions on overlay */}
              {showDiff && hasDiff && (
                <div
                  style={{ position: 'absolute', inset: '26px 0 0 0', pointerEvents: 'none' }}
                  aria-label="Diff regions"
                >
                  {diffRegions.map((region, i) => (
                    <div
                      key={`diff-${region.label}-${i}`}
                      style={{
                        position: 'absolute',
                        left: `${region.x}%`,
                        top: `${region.y}%`,
                        width: `${region.width}%`,
                        height: `${region.height}%`,
                        border: `2px solid ${region.color}`,
                        borderRadius: 4,
                        boxShadow: `0 0 10px ${region.color}88`,
                        backgroundColor: `${region.color}22`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Classification diff table — shown after comparison */}
        {compareResult && compareResult.classificationDiff.filter((d) => d.status !== 'same').length > 0 && (
          <div
            style={{
              borderTop: '1px solid rgba(0,212,255,0.15)',
              background: '#07070d',
              maxHeight: 180,
              overflowY: 'auto',
              flexShrink: 0,
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ background: 'rgba(0,212,255,0.05)' }}>
                  <th style={{ padding: '6px 14px', textAlign: 'left', color: '#8892a0', fontWeight: 700 }}>Classification</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', color: '#8892a0', fontWeight: 700 }}>Qty A</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', color: '#8892a0', fontWeight: 700 }}>Qty B</th>
                  <th style={{ padding: '6px 14px', textAlign: 'right', color: '#8892a0', fontWeight: 700 }}>Delta</th>
                </tr>
              </thead>
              <tbody>
                {compareResult.classificationDiff
                  .filter((d) => d.status !== 'same')
                  .map((d) => {
                    const color =
                      d.status === 'added' ? '#22c55e' : d.status === 'removed' ? '#ef4444' : '#f59e0b';
                    return (
                      <tr key={d.classificationId} style={{ borderTop: '1px solid rgba(0,212,255,0.06)' }}>
                        <td style={{ padding: '5px 14px', color: '#e0faff' }}>{d.name}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#8892a0' }}>
                          {d.qtyA.toFixed(1)}
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#8892a0' }}>
                          {d.qtyB.toFixed(1)}
                        </td>
                        <td style={{ padding: '5px 14px', textAlign: 'right', color }}>
                          {d.delta > 0 ? '+' : ''}{d.delta.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
