'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';

const VERSION_KEY = 'whats-new-seen-v0.1.0';

const CHANGELOG = [
  { title: 'Project Compare View', desc: 'Compare classification quantities side-by-side across two bids' },
  { title: 'Duplicate Project', desc: 'Right-click any project card to create an exact copy' },
  { title: "What's New Modal", desc: 'First-run changelog popup so you never miss updates' },
  { title: 'AI Takeoff All Pages', desc: 'Run AI takeoff across all PDF pages in one click' },
  { title: 'Contractor Report Export', desc: 'Export full estimates as Excel/PDF' },
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
          {CHANGELOG.map((entry, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
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
