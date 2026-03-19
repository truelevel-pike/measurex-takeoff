'use client';

import React, { useState, useEffect } from 'react';
import { Search, X, Loader, Eye, MapPin } from 'lucide-react';
import { useFocusTrap } from '@/lib/use-focus-trap';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VisionMatch {
  name: string;
  count: number;
  description: string;
  boundingBoxes?: BoundingBox[];
}

interface VisionResult {
  matches: VisionMatch[];
  summary: string;
}

interface AIImageSearchProps {
  onClose: () => void;
  projectId?: string | null;
  getPageCanvas?: () => HTMLCanvasElement | null;
  hasPdf?: boolean;
  onHighlight?: (regions: BoundingBox[]) => void;
}

const QUICK_PICKS = ['Doors', 'Windows', 'HVAC', 'Electrical', 'Plumbing', 'Steel'];

function openGoogleImages(query: string) {
  window.open(
    'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(query + ' construction'),
    '_blank',
  );
}

export function AIImageSearch({ onClose, hasPdf, getPageCanvas, onHighlight }: AIImageSearchProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisionResult | null>(null);
  const focusTrapRef = useFocusTrap(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleVisionSearch(q: string) {
    if (!q.trim()) return;

    const canvas = getPageCanvas?.();
    if (!canvas) {
      setError('Could not capture the current page. Make sure a PDF is loaded.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const res = await fetch('/api/vision-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, query: q.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        return;
      }

      setResult(data as VisionResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Vision search failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    if (hasPdf) {
      handleVisionSearch(q);
    } else {
      openGoogleImages(q);
    }
  }

  function handleQuickPick(tag: string) {
    setQuery(tag);
    if (hasPdf) {
      handleVisionSearch(tag);
    } else {
      openGoogleImages(tag);
    }
  }

  function handleHighlight(boxes: BoundingBox[]) {
    onHighlight?.(boxes);
  }

  const totalMatches = result?.matches.reduce((sum, m) => sum + m.count, 0) ?? 0;

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
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI Image Search"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 580,
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
          {hasPdf && (
            <span
              style={{
                fontSize: 10,
                color: '#00d4ff',
                background: 'rgba(0,212,255,0.12)',
                border: '1px solid rgba(0,212,255,0.3)',
                borderRadius: 6,
                padding: '2px 8px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Vision AI
            </span>
          )}
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
            placeholder={
              hasPdf
                ? 'Find elements on this page (e.g. "doors", "fire extinguishers")...'
                : 'Search construction materials, fixtures, equipment...'
            }
            autoFocus
            disabled={loading}
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
            disabled={!query.trim() || loading}
            style={{
              background: query.trim() && !loading ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${query.trim() && !loading ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 10,
              padding: '9px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: query.trim() && !loading ? '#00d4ff' : '#4a5568',
              cursor: query.trim() && !loading ? 'pointer' : 'default',
              transition: 'all 150ms ease',
              flexShrink: 0,
            }}
          >
            {loading ? 'Analyzing...' : 'Search'}
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
              disabled={loading}
              style={{
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 8,
                padding: '5px 12px',
                fontSize: 12,
                color: '#00d4ff',
                cursor: loading ? 'default' : 'pointer',
                transition: 'all 150ms ease',
                opacity: loading ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = 'rgba(0,212,255,0.18)';
                  e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
                }
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

        {/* Content area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            minHeight: 120,
          }}
        >
          {/* Loading state */}
          {loading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: 32,
              }}
            >
              <Loader
                size={24}
                style={{
                  color: '#00d4ff',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              <p style={{ fontSize: 13, color: '#8892a0', textAlign: 'center' }}>
                Analyzing blueprint with AI Vision...
              </p>
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(255,60,60,0.1)',
                border: '1px solid rgba(255,60,60,0.3)',
                borderRadius: 10,
                fontSize: 13,
                color: '#ff6b6b',
              }}
            >
              {error}
            </div>
          )}

          {/* Results */}
          {!loading && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Summary */}
              {result.summary && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(0,212,255,0.06)',
                    border: '1px solid rgba(0,212,255,0.2)',
                    borderRadius: 10,
                    fontSize: 13,
                    color: '#c0d8e0',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Eye size={13} style={{ color: '#00d4ff' }} />
                    <span style={{ fontWeight: 600, fontSize: 11, color: '#00d4ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Summary
                    </span>
                    {totalMatches > 0 && (
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8892a0' }}>
                        {totalMatches} item{totalMatches !== 1 ? 's' : ''} found
                      </span>
                    )}
                  </div>
                  {result.summary}
                </div>
              )}

              {/* Match list */}
              {result.matches.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {result.matches.map((match, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10,
                        transition: 'border-color 150ms ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#e0e0e0' }}>
                          {match.name}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#0a0a0f',
                            background: '#00d4ff',
                            borderRadius: 6,
                            padding: '1px 8px',
                            minWidth: 22,
                            textAlign: 'center',
                          }}
                        >
                          {match.count}
                        </span>
                        {match.boundingBoxes && match.boundingBoxes.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleHighlight(match.boundingBoxes!)}
                            style={{
                              marginLeft: 'auto',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'rgba(0,212,255,0.1)',
                              border: '1px solid rgba(0,212,255,0.3)',
                              borderRadius: 6,
                              padding: '3px 10px',
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#00d4ff',
                              cursor: 'pointer',
                              transition: 'all 150ms ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(0,212,255,0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(0,212,255,0.1)';
                            }}
                          >
                            <MapPin size={11} />
                            Highlight
                          </button>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: '#8892a0', lineHeight: 1.45, margin: 0 }}>
                        {match.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* No matches */}
              {result.matches.length === 0 && !result.summary && (
                <p style={{ fontSize: 13, color: '#4a5568', textAlign: 'center', padding: 24 }}>
                  No elements found matching your query.
                </p>
              )}
            </div>
          )}

          {/* Default state */}
          {!loading && !error && !result && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 32,
              }}
            >
              <p style={{ fontSize: 13, color: '#4a5568', textAlign: 'center' }}>
                {hasPdf
                  ? 'Search for elements on the current blueprint page using AI Vision'
                  : 'Results will open in Google Images'}
              </p>
            </div>
          )}
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
