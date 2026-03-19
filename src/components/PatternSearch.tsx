'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Search, X, Boxes, Plus, CheckSquare, ChevronRight } from 'lucide-react';

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

interface PatternSearchProps {
  onClose: () => void;
  onAddToTakeoff?: (matches: PatternMatch[]) => void;
}

// ─── Stub results ─────────────────────────────────────────────────────────────

const STUB_MATCHES: PatternMatch[] = [
  { id: '1', label: 'Pattern Match #1', confidence: 97, pageNumber: 1, x: 142, y: 88,  width: 64, height: 48 },
  { id: '2', label: 'Pattern Match #2', confidence: 94, pageNumber: 1, x: 310, y: 204, width: 64, height: 48 },
  { id: '3', label: 'Pattern Match #3', confidence: 91, pageNumber: 2, x: 88,  y: 316, width: 64, height: 48 },
  { id: '4', label: 'Pattern Match #4', confidence: 88, pageNumber: 2, x: 456, y: 122, width: 64, height: 48 },
  { id: '5', label: 'Pattern Match #5', confidence: 85, pageNumber: 3, x: 200, y: 400, width: 64, height: 48 },
  { id: '6', label: 'Pattern Match #6', confidence: 81, pageNumber: 3, x: 380, y: 280, width: 64, height: 48 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PatternSearch({ onClose, onAddToTakeoff }: PatternSearchProps) {
  const [phase, setPhase] = useState<'draw' | 'results'>('draw');
  const [isDrawing, setIsDrawing] = useState(false);
  const [selection, setSelection] = useState<SelectionBox | null>(null);
  const [results, setResults] = useState<PatternMatch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
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

  const handleSearch = useCallback(() => {
    if (!selection) return;
    setIsSearching(true);
    setTimeout(() => {
      setResults(STUB_MATCHES);
      setSelected(new Set(STUB_MATCHES.map((m) => m.id)));
      setIsSearching(false);
      setPhase('results');
    }, 1200);
  }, [selection]);

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
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {phase === 'draw' ? (
          <>
            {/* Instructions */}
            <div className="px-5 pt-4 pb-2">
              <p className="text-gray-300 text-sm">
                Draw a selection box around a repeating pattern to find all instances across your drawings.
              </p>
              <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                <ChevronRight size={12} />
                One drawing at a time
              </p>
            </div>

            {/* Canvas area */}
            <div
              ref={canvasRef}
              className="relative mx-5 my-3 rounded-lg overflow-hidden select-none"
              style={{
                height: 280,
                background: '#0f0f1e',
                border: '1px dashed #3d3d6e',
                cursor: isDrawing ? 'crosshair' : 'crosshair',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Grid hint */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center text-gray-600">
                  <Search size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs opacity-50">Click and drag to draw a selection box</p>
                </div>
              </div>

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
                disabled={!selection || isSearching}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: selection && !isSearching ? '#3b82f6' : '#1e3a5f',
                  color: '#fff',
                }}
              >
                <Search size={14} />
                {isSearching ? 'Searching…' : 'Search'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Results header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-gray-300 text-sm">
                Found <span className="text-white font-semibold">{results.length}</span> matches across{' '}
                <span className="text-white font-semibold">
                  {new Set(results.map((r) => r.pageNumber)).size}
                </span>{' '}
                pages
              </span>
              <button onClick={handleReset} className="text-blue-400 hover:text-blue-300 text-xs transition-colors">
                New search
              </button>
            </div>

            {/* Results grid */}
            <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-2">
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
                    <p className="text-gray-400 text-xs">Page {match.pageNumber}</p>
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
