'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  name: string;
  count: number;
  emoji: string;
  color: string;
}

interface AIImageSearchProps {
  onClose: () => void;
}

// ─── Stub data ────────────────────────────────────────────────────────────────

const SAMPLE_RESULTS: SearchResult[] = [
  { id: '1', name: 'Exterior Door',    count: 14, emoji: '🚪', color: '#3b82f6' },
  { id: '2', name: 'Window (2×4)',     count: 28, emoji: '🪟', color: '#10b981' },
  { id: '3', name: 'Duplex Outlet',    count: 62, emoji: '🔌', color: '#f59e0b' },
  { id: '4', name: 'Light Fixture',    count: 41, emoji: '💡', color: '#8b5cf6' },
  { id: '5', name: 'HVAC Diffuser',    count: 19, emoji: '🌀', color: '#06b6d4' },
  { id: '6', name: 'Fire Sprinkler',   count: 33, emoji: '🔴', color: '#ef4444' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AIImageSearch({ onClose }: AIImageSearchProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 300,
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Image Search"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 540,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 64px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(10,10,15,0.97)',
          border: '1px solid rgba(0,212,255,0.3)',
          borderRadius: 16,
          boxShadow: '0 0 48px rgba(0,212,255,0.15), 0 24px 64px rgba(0,0,0,0.7)',
          zIndex: 301,
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          color: '#e0e0e0',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '16px 20px',
            borderBottom: '1px solid rgba(0,212,255,0.2)',
            background: 'rgba(0,212,255,0.05)',
            flexShrink: 0,
          }}
        >
          <Search size={16} style={{ color: '#00d4ff' }} />
          <span
            style={{
              flex: 1,
              fontFamily: 'monospace',
              letterSpacing: '0.08em',
              fontWeight: 600,
              fontSize: 13,
              color: '#e0faff',
              textTransform: 'uppercase',
            }}
          >
            AI Image Search
          </span>
          <button
            aria-label="Close AI Image Search"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 6,
              color: '#8892a0',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
              e.currentTarget.style.color = '#e0faff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)';
              e.currentTarget.style.color = '#8892a0';
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Instruction banner ── */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(0,212,255,0.1)',
            background: 'rgba(0,212,255,0.04)',
            flexShrink: 0,
          }}
        >
          {/* Selection box animation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 10,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 56,
                height: 56,
                border: '2px dashed rgba(0,212,255,0.5)',
                borderRadius: 8,
                background: 'rgba(0,212,255,0.06)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxShadow: '0 0 16px rgba(0,212,255,0.1) inset',
              }}
            >
              {/* Corner handles */}
              {[
                { top: -3, left: -3 },
                { top: -3, right: -3 },
                { bottom: -3, left: -3 },
                { bottom: -3, right: -3 },
              ].map((pos, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    width: 6,
                    height: 6,
                    background: '#00d4ff',
                    borderRadius: 1,
                    ...pos,
                  }}
                />
              ))}
              <Search size={18} style={{ color: 'rgba(0,212,255,0.6)' }} />
            </div>

            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#e0faff',
                  marginBottom: 4,
                }}
              >
                Draw a box around an object to search for similar items
              </p>
              <p style={{ margin: 0, fontSize: 11, color: '#8892a0' }}>
                Click and drag on the canvas, then release to find matching components in the takeoff.
              </p>
            </div>
          </div>

          {/* Fake in-progress indicator */}
          <div
            style={{
              height: 2,
              background: 'rgba(0,212,255,0.15)',
              borderRadius: 2,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                height: '100%',
                width: '60%',
                background: 'linear-gradient(90deg, rgba(0,212,255,0) 0%, rgba(0,212,255,0.7) 50%, rgba(0,212,255,0) 100%)',
                animation: 'mxScanline 2s ease-in-out infinite',
              }}
            />
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 10, color: '#4a5568', textAlign: 'right' }}>
            Sample results shown · V1 stub
          </p>
        </div>

        {/* ── Results grid ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
          }}
        >
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              color: '#8892a0',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
            }}
          >
            {SAMPLE_RESULTS.length} matches found
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
            }}
          >
            {SAMPLE_RESULTS.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(0,212,255,0.15)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            flexShrink: 0,
            background: 'rgba(10,10,15,0.8)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '7px 16px',
              fontSize: 12,
              color: '#8892a0',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
              e.currentTarget.style.color = '#e0e0e0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.color = '#8892a0';
            }}
          >
            Cancel
          </button>
          <button
            style={{
              background: 'rgba(0,212,255,0.15)',
              border: '1px solid rgba(0,212,255,0.4)',
              borderRadius: 8,
              padding: '7px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: '#00d4ff',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,212,255,0.25)';
              e.currentTarget.style.borderColor = 'rgba(0,212,255,0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0,212,255,0.15)';
              e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)';
            }}
          >
            Add to Takeoff
          </button>
        </div>
      </div>

      {/* Scan animation */}
      <style>{`
        @keyframes mxScanline {
          0%   { left: -60%; }
          100% { left: 120%; }
        }
      `}</style>
    </>
  );
}

// ─── Result card ─────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: SearchResult }) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      aria-label={`${result.name}, count ${result.count}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hovered ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 10,
        padding: '12px 10px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 150ms ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        boxShadow: hovered ? `0 0 16px ${result.color}22` : 'none',
      }}
    >
      {/* Thumbnail */}
      <div
        aria-hidden="true"
        style={{
          width: 64,
          height: 64,
          borderRadius: 8,
          background: `${result.color}18`,
          border: `1px solid ${result.color}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          boxShadow: `0 0 12px ${result.color}25 inset`,
        }}
      >
        {result.emoji}
      </div>

      {/* Name */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: hovered ? '#e0faff' : '#d0d8e4',
          lineHeight: 1.3,
          wordBreak: 'break-word',
          transition: 'color 150ms ease',
        }}
      >
        {result.name}
      </span>

      {/* Count badge */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 8,
          background: `${result.color}22`,
          border: `1px solid ${result.color}50`,
          color: result.color,
          fontFamily: 'monospace',
          letterSpacing: '0.04em',
        }}
      >
        {result.count} EA
      </span>
    </button>
  );
}

export default AIImageSearch;
