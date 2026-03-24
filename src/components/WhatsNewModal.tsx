'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';

// BUG-MX-005 fix: use stable versioned key so seen-state persists correctly
// Wave 38B: bumped to v3 so users see the updated Wave changelog
const VERSION_KEY = 'measurex_whats_new_v3';

const CHANGELOG = [
  { title: 'AI Element Validation', desc: 'Takeoff results are now filtered — garbage polygons, out-of-bounds points, and degenerate shapes are automatically discarded before they reach your project' },
  { title: 'NTS Warning', desc: 'Drawings marked "Not to Scale" are detected automatically and a warning banner appears before you run takeoff' },
  { title: 'Scale Preset API', desc: 'Set scale via API using shorthand formats like 1/8"=1ft, 1/4"=1ft, or 1:100 — perfect for agent automation' },
  { title: 'Multi-Select Delete', desc: 'Hold Shift and click to select multiple polygons, then delete them all at once' },
  { title: 'Copy Quantities', desc: 'Copy the full quantities table to clipboard as formatted text for pasting into estimates' },
  { title: 'Agent API (window.measurex)', desc: 'Full JavaScript automation API exposed in agent mode — getState(), setPage(), setScale(), getTotals(), and more' },
  { title: 'Gemini Retry on 429', desc: 'AI takeoff now retries automatically with exponential backoff when Gemini rate limits hit, instead of failing immediately' },
  { title: 'Ctrl+S to Save', desc: 'Save your project instantly with Ctrl+S (Cmd+S on Mac) without clicking the Save button' },
  { title: 'Delete Confirmation', desc: 'Deleting a project now shows a confirmation dialog so accidental deletions don\'t happen' },
  { title: 'Per-Page Polygons API', desc: 'GET /api/projects/{id}/pages/{page}/polygons — returns enriched polygon data for a single page, perfect for agent verification' },
];

export function useWhatsNew() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(VERSION_KEY)) {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(VERSION_KEY, '1');
    setShow(false);
  };

  const open = () => setShow(true);

  return { show, dismiss, open };
}

export default function WhatsNewModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="What's New"
        style={{
          background: '#0a0a0f',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          padding: 0,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: '1px solid rgba(0,212,255,0.15)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={18} style={{ color: '#00d4ff' }} />
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: 1,
                color: '#e0faff',
                fontSize: 14,
                textTransform: 'uppercase',
              }}
            >
              What&apos;s New
            </span>
          </div>
          <button
            aria-label="Close"
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
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Entries */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {CHANGELOG.map((entry) => (
            <div key={entry.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div
                style={{
                  marginTop: 4,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#00d4ff',
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    color: '#e0faff',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    marginBottom: 2,
                  }}
                >
                  {entry.title}
                </div>
                <div style={{ color: '#8892a0', fontSize: 12, lineHeight: 1.5 }}>
                  {entry.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(0,212,255,0.15)' }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              background: 'rgba(0,212,255,0.15)',
              border: '1px solid rgba(0,212,255,0.4)',
              color: '#00d4ff',
              borderRadius: 8,
              padding: '10px 0',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
