'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Search, X, FileText, ChevronRight, MapPin } from 'lucide-react';
import { useStore, Store } from '@/lib/store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TextResult {
  id: string;
  pageNumber: number;
  snippet: string;
  fullText: string;
  x: number;
  y: number;
}

interface TextSearchProps {
  onClose: () => void;
}

// ─── Stub data ────────────────────────────────────────────────────────────────

function buildStubResults(query: string): TextResult[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const pool: TextResult[] = [
    { id: '1', pageNumber: 1,  snippet: 'SCALE: 1/8" = 1\' 0"',                fullText: 'SCALE: 1/8" = 1\' 0"',                     x: 120, y: 44  },
    { id: '2', pageNumber: 1,  snippet: 'GENERAL NOTES — see sheet A-001',      fullText: 'GENERAL NOTES — see sheet A-001 for details', x: 240, y: 860 },
    { id: '3', pageNumber: 2,  snippet: 'FLOOR PLAN — Level 1',                 fullText: 'FLOOR PLAN — Level 1 (Ground Floor)',         x: 400, y: 60  },
    { id: '4', pageNumber: 2,  snippet: 'DOOR SCHEDULE — Type A, 3\'×7\'',      fullText: 'DOOR SCHEDULE — Type A, 3\'×7\' HM frame',   x: 88,  y: 540 },
    { id: '5', pageNumber: 3,  snippet: 'CEILING HEIGHT: 9\'-0" AFF',           fullText: 'CEILING HEIGHT: 9\'-0" AFF (above finish floor)', x: 300, y: 200 },
    { id: '6', pageNumber: 3,  snippet: 'PARTITION TYPE: 3-5/8" MTL STUD',      fullText: 'PARTITION TYPE: 3-5/8" MTL STUD @ 16" OC',   x: 160, y: 620 },
    { id: '7', pageNumber: 4,  snippet: 'MECHANICAL ROOM — 12\'×16\'',          fullText: 'MECHANICAL ROOM — 12\'×16\' MIN CLEAR',      x: 500, y: 300 },
    { id: '8', pageNumber: 5,  snippet: 'ELECTRICAL PANEL — 200A, 120/240V',    fullText: 'ELECTRICAL PANEL — 200A, 120/240V single phase', x: 80, y: 410 },
  ];
  return pool.filter(
    (r) => r.snippet.toLowerCase().includes(q) || r.fullText.toLowerCase().includes(q)
  );
}

function highlightSnippet(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(250,204,21,0.35)', color: '#fde047', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TextSearch({ onClose }: TextSearchProps) {
  const [query, setQuery]               = useState('');
  const [searchAll, setSearchAll]       = useState(true);
  const [results, setResults]           = useState<TextResult[]>([]);
  const [hasSearched, setHasSearched]   = useState(false);
  const [activeId, setActiveId]         = useState<string | null>(null);
  const inputRef                        = useRef<HTMLInputElement>(null);

  const setCurrentPage = useStore((s: Store) => s.setCurrentPage);
  const totalPages     = useStore((s: Store) => s.totalPages);

  const runSearch = useCallback((q: string) => {
    setHasSearched(true);
    setResults(buildStubResults(q));
    setActiveId(null);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length >= 2) {
      runSearch(val);
    } else {
      setResults([]);
      setHasSearched(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) runSearch(query);
    if (e.key === 'Escape') onClose();
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setActiveId(null);
    inputRef.current?.focus();
  };

  const handleResultClick = (result: TextResult) => {
    setActiveId(result.id);
    setCurrentPage(result.pageNumber, totalPages);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/60">
      <div
        className="relative flex flex-col w-[560px] max-h-[70vh] rounded-xl shadow-2xl overflow-hidden"
        style={{ background: '#1a1a2e', border: '1px solid #2d2d4e' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2d2d4e]">
          <Search size={16} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search labels, callouts, and annotations…"
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 outline-none"
          />
          {query && (
            <button onClick={handleClear} className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0">
              <X size={14} />
            </button>
          )}
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0 ml-1">
            <X size={16} />
          </button>
        </div>

        {/* Options bar */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-[#2d2d4e]">
          <button
            onClick={() => setSearchAll((v) => !v)}
            className="flex items-center gap-2 text-xs transition-colors"
            style={{ color: searchAll ? '#3b82f6' : '#6b7280' }}
          >
            <div
              className="w-8 h-4 rounded-full flex items-center transition-colors"
              style={{ background: searchAll ? '#3b82f6' : '#374151', padding: '2px' }}
            >
              <div
                className="w-3 h-3 bg-white rounded-full transition-transform"
                style={{ transform: searchAll ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </div>
            Search across all drawings
          </button>

          {hasSearched && (
            <span className="text-gray-500 text-xs ml-auto">
              {results.length === 0
                ? 'No results'
                : `${results.length} result${results.length !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {results.length > 0 ? (
            <ul className="divide-y divide-[#2d2d4e]">
              {results.map((result) => (
                <li
                  key={result.id}
                  onClick={() => handleResultClick(result)}
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors"
                  style={{
                    background: activeId === result.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (activeId !== result.id)
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    if (activeId !== result.id)
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  {/* Page icon */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center rounded mt-0.5"
                    style={{ width: 28, height: 28, background: '#0f0f1e', border: '1px solid #2d2d4e' }}
                  >
                    <FileText size={12} className="text-blue-400" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-mono leading-snug truncate">
                      {highlightSnippet(result.snippet, query)}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin size={10} className="text-gray-500 flex-shrink-0" />
                      <span className="text-gray-500 text-xs">Page {result.pageNumber}</span>
                    </div>
                  </div>

                  {/* Nav arrow */}
                  <ChevronRight
                    size={14}
                    className="flex-shrink-0 mt-1 transition-colors"
                    style={{ color: activeId === result.id ? '#3b82f6' : '#4b5563' }}
                  />
                </li>
              ))}
            </ul>
          ) : hasSearched && query.length >= 2 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search size={28} className="text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm">No matches for &ldquo;{query}&rdquo;</p>
              <p className="text-gray-600 text-xs mt-1">Try a different search term</p>
            </div>
          ) : !query ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search size={28} className="text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Start typing to search annotations</p>
              <p className="text-gray-600 text-xs mt-1">Searches labels, callouts, and text across all pages</p>
            </div>
          ) : null}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-[#2d2d4e]">
            <p className="text-gray-600 text-xs flex items-center gap-1">
              <ChevronRight size={10} />
              Click a result to jump to that page
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
