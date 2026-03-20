'use client';

import React, { useState } from 'react';
import { X, GitCompare, Layers, Eye, SlidersHorizontal } from 'lucide-react';

// --- Types ---
interface Drawing {
  id: string;
  name: string;
  url?: string;
}

interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
}

interface DrawingComparisonProps {
  onClose?: () => void;
}

// Stub diff regions shown as colored border boxes over the canvas panels
const SAMPLE_DIFF_REGIONS: DiffRegion[] = [
  { x: 10, y: 12, width: 22, height: 18, label: 'Wall removed', color: '#ef4444' },
  { x: 45, y: 30, width: 18, height: 24, label: 'New room added', color: '#22c55e' },
  { x: 68, y: 55, width: 15, height: 12, label: 'Door relocated', color: '#f59e0b' },
];

// Sample drawing list — in a real integration this would come from your store/project
const SAMPLE_DRAWINGS: Drawing[] = [
  { id: 'd1', name: 'A1.1 - Floor Plan (Rev 0)' },
  { id: 'd2', name: 'A1.1 - Floor Plan (Rev 1)' },
  { id: 'd3', name: 'A2.0 - Elevations (Rev 0)' },
  { id: 'd4', name: 'A3.0 - Sections (Rev 0)' },
  { id: 'd5', name: 'S1.0 - Foundation Plan' },
];

// ---- Sub-components ----

function PanelPlaceholder({ label, diffRegions, showDiff }: { label: string; diffRegions: DiffRegion[]; showDiff: boolean }) {
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

export default function DrawingComparison({ onClose }: DrawingComparisonProps) {
  const [drawingAId, setDrawingAId] = useState<string>(SAMPLE_DRAWINGS[0].id);
  const [drawingBId, setDrawingBId] = useState<string>(SAMPLE_DRAWINGS[1].id);
  const [viewMode, setViewMode] = useState<'sidebyside' | 'overlay'>('sidebyside');
  const [overlayOpacity, setOverlayOpacity] = useState<number>(50);
  const [showDiff, setShowDiff] = useState<boolean>(true);

  const drawingA = SAMPLE_DRAWINGS.find((d) => d.id === drawingAId) ?? SAMPLE_DRAWINGS[0];
  const drawingB = SAMPLE_DRAWINGS.find((d) => d.id === drawingBId) ?? SAMPLE_DRAWINGS[1];

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
            drawings={SAMPLE_DRAWINGS}
          />
          <DrawingSelect
            label="Drawing B"
            value={drawingBId}
            onChange={setDrawingBId}
            drawings={SAMPLE_DRAWINGS}
          />

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
        </div>

        {/* Diff legend */}
        {showDiff && (
          <div
            style={{
              display: 'flex',
              gap: 16,
              padding: '8px 18px',
              borderBottom: '1px solid rgba(0,212,255,0.08)',
              background: 'rgba(10,10,15,0.3)',
              flexShrink: 0,
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
            <span style={{ fontSize: 11, color: 'rgba(0,212,255,0.4)', marginLeft: 'auto', fontStyle: 'italic' }}>
              {SAMPLE_DIFF_REGIONS.length} diff regions detected (stub)
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
                  A — {drawingA.name}
                </div>
                <PanelPlaceholder
                  label={drawingA.name}
                  diffRegions={SAMPLE_DIFF_REGIONS}
                  showDiff={showDiff}
                />
              </div>
              {/* Center divider */}
              <div
                style={{
                  width: 2,
                  alignSelf: 'stretch',
                  background: 'linear-gradient(to bottom, transparent, rgba(0,212,255,0.3) 30%, rgba(0,212,255,0.3) 70%, transparent)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: '#f59e0b', fontFamily: 'monospace', fontWeight: 700 }}>
                  B — {drawingB.name}
                </div>
                <PanelPlaceholder
                  label={drawingB.name}
                  diffRegions={SAMPLE_DIFF_REGIONS}
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
              <PanelPlaceholder label={drawingB.name} diffRegions={[]} showDiff={false} />
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
              {showDiff && (
                <div
                  style={{ position: 'absolute', inset: '26px 0 0 0', pointerEvents: 'none' }}
                  aria-label="Diff regions"
                >
                  {SAMPLE_DIFF_REGIONS.map((region, i) => (
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
      </div>
    </div>
  );
}
