'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2, FileText, Layers } from 'lucide-react';
import { useTextSearch } from '@/hooks/use-text-search';

interface TextSearchPanelProps {
  projectId: string | null;
  onNavigate: (pageId: string, pageNumber: number) => void;
  onClose: () => void;
}

export default function TextSearchPanel({ projectId, onNavigate, onClose }: TextSearchPanelProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isLoading, error } = useTextSearch(projectId, query);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 54,
        right: 12,
        width: 360,
        maxHeight: 480,
        zIndex: 100,
        background: 'rgba(10,10,15,0.95)',
        border: '1px solid rgba(0,212,255,0.25)',
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 0 20px rgba(0,212,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Search input */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(0,212,255,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={15} style={{ color: '#00d4ff', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search pages & labels…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e0e0e0',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
          aria-label="Search text across all pages"
        />
        {isLoading && <Loader2 size={14} className="animate-spin" style={{ color: '#00d4ff' }} />}
        <button
          onClick={onClose}
          aria-label="Close search"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892a0', padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {error && (
          <div style={{ padding: '12px 14px', color: '#f87171', fontSize: 12 }}>
            {error}
          </div>
        )}

        {!error && query.trim() && !isLoading && results.length === 0 && (
          <div style={{ padding: '24px 14px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
            No results found for &ldquo;{query.trim()}&rdquo;
          </div>
        )}

        {!error && !query.trim() && (
          <div style={{ padding: '24px 14px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
            Type to search page text and polygon labels
          </div>
        )}

        {results.map((result, i) => (
          <button
            key={`${result.pageNumber}-${result.matchType}-${result.snippet}-${i}`}
            type="button"
            onClick={() => onNavigate(result.pageId, result.pageNumber)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '8px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(0,212,255,0.08)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              color: '#d1d5db',
              fontSize: 12,
              fontFamily: 'inherit',
              transition: 'background 100ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,212,255,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              {result.matchType === 'text' ? (
                <FileText size={14} style={{ color: '#00d4ff' }} />
              ) : (
                <Layers size={14} style={{ color: '#a78bfa' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: '#e0faff', fontSize: 12 }}>
                  Page {result.pageNumber}
                </span>
                {result.pageLabel !== `Page ${result.pageNumber}` && (
                  <span style={{ color: '#8892a0', fontSize: 11 }}>
                    — {result.pageLabel}
                  </span>
                )}
                <span
                  style={{
                    marginLeft: 'auto',
                    background: result.matchType === 'text' ? 'rgba(0,212,255,0.15)' : 'rgba(167,139,250,0.15)',
                    color: result.matchType === 'text' ? '#00d4ff' : '#a78bfa',
                    padding: '1px 6px',
                    borderRadius: 8,
                    fontSize: 10,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {result.matchCount} {result.matchType === 'text' ? 'match' : 'polygon'}{result.matchCount !== 1 ? (result.matchType === 'text' ? 'es' : 's') : ''}
                </span>
              </div>
              <div style={{ color: '#9ca3af', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.snippet}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
