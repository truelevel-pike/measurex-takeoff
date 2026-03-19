'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';

interface DraftAnnotation {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  text: string;
}

const DEFAULT_COLOR = '#00d4ff';
const DEFAULT_FONT_SIZE = 14;

export default function AnnotationTool() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addAnnotation = useStore((s) => s.addAnnotation);
  const currentPage = useStore((s) => s.currentPage);
  const baseDims = useStore((s) => s.pageBaseDimensions[s.currentPage] ?? { width: 1, height: 1 });
  const [draft, setDraft] = useState<DraftAnnotation | null>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (draft) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [draft]);

  const popupStyle = useMemo(() => {
    if (!draft) return undefined;
    return {
      left: Math.max(8, draft.screenX),
      top: Math.max(8, draft.screenY),
    };
  }, [draft]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const x = (screenX / rect.width) * baseDims.width;
      const y = (screenY / rect.height) * baseDims.height;
      setDraft({ x, y, screenX, screenY, text: '' });
    },
    [baseDims]
  );

  const commit = useCallback(() => {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) {
      setDraft(null);
      return;
    }
    addAnnotation({
      page: currentPage,
      x: draft.x,
      y: draft.y,
      text,
      color: DEFAULT_COLOR,
      fontSize: DEFAULT_FONT_SIZE,
    });
    setDraft(null);
  }, [draft, addAnnotation, currentPage]);

  const cancel = useCallback(() => setDraft(null), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    },
    [cancel]
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20 cursor-crosshair outline-none"
      tabIndex={0}
      onClick={handleCanvasClick}
      onKeyDown={handleKeyDown}
    >
      {draft && (
        <div
          className="absolute z-30"
          style={popupStyle}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 rounded-md border border-cyan-300/60 bg-[#0d1119]/95 p-2 shadow-xl">
            <input
              ref={inputRef}
              value={draft.text}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, text: e.target.value } : prev))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancel();
                }
              }}
              placeholder="Add annotation"
              className="w-44 rounded border border-white/20 bg-black/40 px-2 py-1 text-xs text-white outline-none focus:border-cyan-300/60"
            />
            <button
              type="button"
              onClick={commit}
              className="rounded bg-cyan-500 px-2 py-1 text-xs font-medium text-black hover:bg-cyan-400"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
