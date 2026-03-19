'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Search, X, Boxes, Plus, CheckSquare, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PatternMatch {
  id: string;
  label: string;
  confidence: number;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface VisionMatch {
  name: string;
  count: number;
  description: string;
  boundingBoxes?: { x: number; y: number; width: number; height: number }[];
}

interface VisionResult {
  matches: VisionMatch[];
  summary: string;
  error?: string;
}

interface PatternSearchProps {
  onClose: () => void;
  onAddToTakeoff?: (matches: PatternMatch[]) => void;
  /** Base64 data URL of the current PDF page (e.g. from canvas.toDataURL()) */
  pdfPageImageData?: string | null;
  /** Current page number */
  currentPage?: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Crop a region from a full-page data URL using an offscreen canvas. Returns a base64 data URL. */
function cropImage(
  fullPageDataUrl: string,
  selBox: { left: number; top: number; width: number; height: number },
  containerWidth: number,
  containerHeight: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // selBox is in container-pixel coords; convert to image-pixel coords
      const scaleX = img.naturalWidth / containerWidth;
      const scaleY = img.naturalHeight / containerHeight;
      const sx = selBox.left * scaleX;
      const sy = selBox.top * scaleY;
      const sw = selBox.width * scaleX;
      const sh = selBox.height * scaleY;

      const offscreen = document.createElement('canvas');
      offscreen.width = Math.max(1, Math.round(sw));
      offscreen.height = Math.max(1, Math.round(sh));
      const ctx = offscreen.getContext('2d');
      if (!ctx) return reject(new Error('Could not get canvas context'));
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, offscreen.width, offscreen.height);
      resolve(offscreen.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = fullPageDataUrl;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PatternSearch({ onClose, onAddToTakeoff, pdfPageImageData, currentPage = 1 }: PatternSearchProps) {
  const [phase, setPhase] = useState<'draw' | 'results'>('draw');
  const [query, setQuery] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [selection, setSelection] = useState<SelectionBox | null>(null);
  const [results, setResults] = useState<PatternMatch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setIsDrawing(true);
    setSelection(null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !dragStart.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelection({
      startX: dragStart.current.x,
      startY: dragStart.current.y,
      endX: x,
      endY: y,
    });
  }, [isDrawing]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
    dragStart.current = null;
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setError(null);
    setSummary(null);
    setIsSearching(true);

    if (!pdfPageImageData) {
      setError('No PDF page loaded. Please load a PDF first.');
      setIsSearching(false);
      return;
    }

    try {
      // If a selection box was drawn, crop that region as the reference symbol
      let selectionImageData: string | undefined;
      if (selection && canvasRef.current) {
        const sb = {
          left:   Math.min(selection.startX, selection.endX),
          top:    Math.min(selection.startY, selection.endY),
          width:  Math.abs(selection.endX - selection.startX),
          height: Math.abs(selection.endY - selection.startY),
        };
        if (sb.width > 4 && sb.height > 4) {
          const rect = canvasRef.current.getBoundingClientRect();
          selectionImageData = await cropImage(pdfPageImageData, sb, rect.width, rect.height);
        }
      }

      const res = await fetch('/api/vision-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          image: pdfPageImageData,
          ...(selectionImageData ? { selectionImage: selectionImageData } : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        throw new Error(errData.error || `Vision search failed (${res.status})`);
      }

      const data: VisionResult = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setSummary(data.summary || null);

      // Convert VisionMatch[] to PatternMatch[] for the existing UI
      const patternMatches: PatternMatch[] = [];
      let matchIndex = 0;
      for (const vm of data.matches) {
        if (vm.boundingBoxes && vm.boundingBoxes.length > 0) {
          for (const bb of vm.boundingBoxes) {
            matchIndex++;
            patternMatches.push({
              id: String(matchIndex),
              label: vm.name || `Match #${matchIndex}`,
              confidence: Math.round(100 - matchIndex * 3), // approximate from order
              pageNumber: currentPage,
              x: bb.x,
              y: bb.y,
              width: bb.width,
              height: bb.height,
            });
          }
        } else {
          // No bounding boxes — still show as a result with count
          for (let i = 0; i < Math.max(1, vm.count); i++) {
            matchIndex++;
            patternMatches.push({
              id: String(matchIndex),
              label: vm.name || `Match #${matchIndex}`,
              confidence: Math.round(100 - matchIndex * 3),
              pageNumber: currentPage,
              x: 0,
              y: 0,
              width: 0,
              height: 0,
            });
          }
        }
      }

      setResults(patternMatches);
      setSelected(new Set(patternMatches.map((m) => m.id)));
      setPhase('results');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Vision search failed.');
    } finally {
      setIsSearching(false);
    }
  }, [query, pdfPageImageData, currentPage, selection]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleAddAll = () => {
    const chosen = results.filter((r) => selected.has(r.id));
    onAddToTakeoff?.(chosen);
    onClose();
  };

  const handleReset = () => {
    setPhase('draw');
    setSelection(null);
    setResults([]);
    setSelected(new Set());
    setError(null);
    setSummary(null);
  };

  // ─── Selection box geometry ───────────────────────────────────────────────

  const selBox = selection
    ? {
        left:   Math.min(selection.startX, selection.endX),
        top:    Math.min(selection.startY, selection.endY),
        width:  Math.abs(selection.endX - selection.startX),
        height: Math.abs(selection.endY - selection.startY),
      }
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative flex flex-col w-[680px] max-h-[80vh] rounded-xl shadow-2xl overflow-hidden"
           style={{ background: '#1a1a2e', border: '1px solid #2d2d4e' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2d2d4e]">
          <div className="flex items-center gap-2">
            <Boxes size={18} className="text-blue-400" />
            <span className="text-white font-semibold text-sm">Pattern Search</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">AI</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {phase === 'draw' ? (
          <>
            {/* Query input */}
            <div className="px-5 pt-4 pb-2">
              <label className="block text-gray-300 text-sm mb-2">
                Describe the pattern or element to find on this page:
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder='e.g. "doors", "electrical outlets", "windows"'
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
                style={{ background: '#0f0f1e', border: '1px solid #3d3d6e' }}
                autoFocus
              />
              {!pdfPageImageData && (
                <p className="text-yellow-400/80 text-xs mt-2 flex items-center gap-1">
                  <AlertCircle size={12} />
                  No PDF page loaded — load a PDF to enable AI pattern search.
                </p>
              )}
            </div>

            {/* Canvas area (optional region selection) */}
            <div className="px-5 pt-1 pb-1">
              <p className="text-gray-500 text-xs flex items-center gap-1">
                <ChevronRight size={12} />
                Draw a box around a symbol to find all matching instances
              </p>
            </div>
            <div
              ref={canvasRef}
              className="relative mx-5 my-2 rounded-lg overflow-hidden select-none"
              style={{
                height: 200,
                background: '#0f0f1e',
                border: '1px dashed #3d3d6e',
                cursor: 'crosshair',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Preview of PDF page if available */}
              {pdfPageImageData ? (
                <img
                  src={pdfPageImageData}
                  alt="Current page"
                  className="absolute inset-0 w-full h-full object-contain opacity-40 pointer-events-none"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-gray-600">
                    <Search size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs opacity-50">No page preview available</p>
                  </div>
                </div>
              )}

              {/* Dashed selection rectangle */}
              {selBox && selBox.width > 4 && selBox.height > 4 && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left:   selBox.left,
                    top:    selBox.top,
                    width:  selBox.width,
                    height: selBox.height,
                    border: '2px dashed #3b82f6',
                    background: 'rgba(59,130,246,0.08)',
                    borderRadius: 3,
                  }}
                />
              )}
            </div>

            {/* Error display */}
            {error && (
              <div className="mx-5 mb-2 px-3 py-2 rounded-lg text-sm flex items-center gap-2"
                   style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span className="text-red-300">{error}</span>
              </div>
            )}

            {/* Search button */}
            <div className="flex justify-end px-5 pb-5 gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 border border-[#3d3d6e] rounded-lg hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSearch}
                disabled={!query.trim() || !pdfPageImageData || isSearching}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: query.trim() && pdfPageImageData && !isSearching ? '#3b82f6' : '#1e3a5f',
                  color: '#fff',
                }}
              >
                {isSearching ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Search size={14} />
                    Search
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Results header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-gray-300 text-sm">
                Found <span className="text-white font-semibold">{results.length}</span> matches on page{' '}
                <span className="text-white font-semibold">{currentPage}</span>
              </span>
              <button onClick={handleReset} className="text-blue-400 hover:text-blue-300 text-xs transition-colors">
                New search
              </button>
            </div>

            {/* AI Summary */}
            {summary && (
              <div className="mx-5 mb-2 px-3 py-2 rounded-lg text-xs text-gray-300"
                   style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                {summary}
              </div>
            )}

            {/* Results grid */}
            <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-2">
              {results.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No matching patterns found. Try a different query.
                </div>
              )}
              {results.map((match) => (
                <div
                  key={match.id}
                  onClick={() => toggleSelect(match.id)}
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: selected.has(match.id) ? 'rgba(59,130,246,0.15)' : '#0f0f1e',
                    border: `1px solid ${selected.has(match.id) ? '#3b82f6' : '#2d2d4e'}`,
                  }}
                >
                  {/* Thumbnail stub */}
                  <div
                    className="flex-shrink-0 rounded"
                    style={{ width: 52, height: 40, background: '#1e1e3e', border: '1px solid #3d3d6e' }}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{match.label}</p>
                    <p className="text-gray-400 text-xs">
                      Page {match.pageNumber}
                      {match.x > 0 || match.y > 0 ? ` — at (${Math.round(match.x)}%, ${Math.round(match.y)}%)` : ''}
                    </p>
                  </div>

                  {/* Confidence */}
                  <div className="flex-shrink-0 text-right">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={{
                        background: match.confidence >= 90 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                        color:      match.confidence >= 90 ? '#10b981' : '#f59e0b',
                      }}
                    >
                      {match.confidence}%
                    </span>
                  </div>

                  {/* Checkbox */}
                  <CheckSquare
                    size={16}
                    className={selected.has(match.id) ? 'text-blue-400' : 'text-gray-600'}
                  />
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-[#2d2d4e]">
              <span className="text-gray-500 text-xs">{selected.size} of {results.length} selected</span>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-400 border border-[#3d3d6e] rounded-lg hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAll}
                  disabled={selected.size === 0}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: selected.size > 0 ? '#10b981' : '#1e3e35', color: '#fff' }}
                >
                  <Plus size={14} />
                  Add {selected.size > 0 ? selected.size : 'All'} to Takeoff
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
