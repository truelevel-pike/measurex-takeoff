'use client';

import React from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useStore } from '@/lib/store';

interface ImageSearchResult {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  title: string;
  source: string;
  pageNumber?: number;
  sheetName?: string;
}

interface AIImageSearchProps {
  onClose: () => void;
  projectId?: string | null;
}

export function AIImageSearch({ onClose, projectId }: AIImageSearchProps) {
  const storeProjectId = useStore((s) => s.projectId);
  const effectiveProjectId = projectId ?? storeProjectId;
  const [query, setQuery] = React.useState('');
  const [searchedQuery, setSearchedQuery] = React.useState('');
  const [results, setResults] = React.useState<ImageSearchResult[]>([]);
  const [provider, setProvider] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedImage, setSelectedImage] = React.useState<ImageSearchResult | null>(null);

  React.useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedImage) setSelectedImage(null);
      else onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [selectedImage, onClose]);

  const handleSearch = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = query.trim();
    if (!normalized) {
      setError('Enter a search term.');
      return;
    }

    setLoading(true);
    setError(null);
    setSearchedQuery(normalized);

    try {
      const res = await fetch('/api/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: normalized, projectId: effectiveProjectId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `Search failed (${res.status})`);
      setResults(Array.isArray(payload?.results) ? payload.results : []);
      setProvider(typeof payload?.provider === 'string' ? payload.provider : '');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed.';
      setResults([]);
      setProvider('');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [effectiveProjectId, query]);

  return (
    <>
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

      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Image Search"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 760,
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

        <form
          onSubmit={handleSearch}
          style={{
            display: 'flex',
            gap: 8,
            padding: '14px 20px',
            borderBottom: '1px solid rgba(0,212,255,0.1)',
            background: 'rgba(0,212,255,0.04)',
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            placeholder="Search construction images (e.g. exterior door, roof flashing)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(0,212,255,0.25)',
              borderRadius: 8,
              color: '#e0faff',
              padding: '9px 11px',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              minWidth: 92,
              background: loading ? 'rgba(0,212,255,0.08)' : 'rgba(0,212,255,0.15)',
              border: '1px solid rgba(0,212,255,0.4)',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: '#00d4ff',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {loading ? <Loader2 size={14} style={{ animation: 'mxSpin 0.9s linear infinite' }} /> : <Search size={14} />}
            {loading ? 'Searching' : 'Search'}
          </button>
        </form>

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
            {loading
              ? 'Searching...'
              : searchedQuery
                ? `${results.length} result${results.length === 1 ? '' : 's'} for "${searchedQuery}"`
                : 'Search to find reference images'}
          </p>

          {provider && !loading && (
            <p style={{ margin: '0 0 12px', fontSize: 11, color: '#66d9ef' }}>
              Provider: {provider}
            </p>
          )}

          {error && (
            <div
              style={{
                border: '1px solid rgba(239,68,68,0.5)',
                background: 'rgba(239,68,68,0.08)',
                color: '#fca5a5',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && searchedQuery && results.length === 0 && (
            <div
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.03)',
                color: '#9ca3af',
                borderRadius: 10,
                padding: '12px 14px',
                fontSize: 12,
              }}
            >
              No images found.
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            {results.map((result) => (
              <ResultCard key={result.id} result={result} onClick={() => setSelectedImage(result)} />
            ))}
          </div>
        </div>

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
          >
            Close
          </button>
        </div>
      </div>

      {selectedImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedImage.title}
          onClick={() => setSelectedImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 302,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 'min(1100px, calc(100vw - 48px))',
              maxHeight: 'calc(100vh - 48px)',
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.2)',
              background: '#090a0f',
              boxShadow: '0 24px 60px rgba(0,0,0,0.65)',
            }}
          >
            <img
              src={selectedImage.fullUrl}
              alt={selectedImage.title}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 98px)',
                objectFit: 'contain',
                background: '#111827',
              }}
            />
            <div style={{ padding: '10px 12px', color: '#e5e7eb', fontSize: 12 }}>
              {selectedImage.title}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes mxSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

function ResultCard({ result, onClick }: { result: ImageSearchResult; onClick: () => void }) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={result.title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hovered ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 10,
        padding: '10px 9px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 150ms ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 7,
        boxShadow: hovered ? '0 0 16px rgba(0,212,255,0.18)' : 'none',
      }}
    >
      <img
        src={result.thumbUrl}
        alt={result.title}
        style={{
          width: '100%',
          height: 90,
          borderRadius: 8,
          objectFit: 'cover',
          border: '1px solid rgba(255,255,255,0.08)',
          background: '#111827',
        }}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />

      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: hovered ? '#e0faff' : '#d0d8e4',
          lineHeight: 1.3,
          textAlign: 'left',
          wordBreak: 'break-word',
          transition: 'color 150ms ease',
        }}
      >
        {result.title}
      </span>

      <span
        style={{
          alignSelf: 'flex-start',
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 8,
          background: 'rgba(0,212,255,0.1)',
          border: '1px solid rgba(0,212,255,0.35)',
          color: '#67e8f9',
          fontFamily: 'monospace',
          letterSpacing: '0.04em',
        }}
      >
        {result.sheetName ? `${result.sheetName} · ${result.source}` : result.source}
      </span>
    </button>
  );
}

export default AIImageSearch;
