'use client';

import React, { useState } from 'react';
import { Search, X } from 'lucide-react';

interface AIImageSearchProps {
  onClose: () => void;
  projectId?: string | null;
}

const QUICK_PICKS = ['Doors', 'Windows', 'HVAC', 'Electrical', 'Plumbing', 'Steel'];

function openGoogleImages(query: string) {
  window.open(
    'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(query + ' construction'),
    '_blank',
  );
}

export function AIImageSearch({ onClose }: AIImageSearchProps) {
  const [query, setQuery] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) openGoogleImages(q);
  }

  function handleQuickPick(tag: string) {
    setQuery(tag);
    openGoogleImages(tag);
  }

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
        {/* Header */}
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
          >
            <X size={14} />
          </button>
        </div>

        {/* Search input */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(0,212,255,0.1)',
            display: 'flex',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search construction materials, fixtures, equipment..."
            autoFocus
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 10,
              padding: '9px 14px',
              fontSize: 13,
              color: '#e0e0e0',
              outline: 'none',
              transition: 'border-color 150ms ease',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)')}
          />
          <button
            type="submit"
            disabled={!query.trim()}
            style={{
              background: query.trim() ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${query.trim() ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 10,
              padding: '9px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: query.trim() ? '#00d4ff' : '#4a5568',
              cursor: query.trim() ? 'pointer' : 'default',
              transition: 'all 150ms ease',
              flexShrink: 0,
            }}
          >
            Search
          </button>
        </form>

        {/* Quick picks */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid rgba(0,212,255,0.1)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: '#4a5568', alignSelf: 'center', marginRight: 4 }}>
            Quick:
          </span>
          {QUICK_PICKS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleQuickPick(tag)}
              style={{
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 8,
                padding: '5px 12px',
                fontSize: 12,
                color: '#00d4ff',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,212,255,0.18)';
                e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,212,255,0.08)';
                e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)';
              }}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Info area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
          }}
        >
          <p style={{ fontSize: 13, color: '#4a5568', textAlign: 'center' }}>
            Results will open in Google Images
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(0,212,255,0.15)',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0,
            background: 'rgba(10,10,15,0.8)',
          }}
        >
          <button
            type="button"
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
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}

export default AIImageSearch;
