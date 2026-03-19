'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '@/lib/store';

const DRAWING_SET_OPTIONS = [
  '',
  'Architectural',
  'Structural',
  'Mechanical',
  'Electrical',
  'Plumbing',
  'Civil',
  'Landscape',
] as const;

interface PageThumbnailSidebarProps {
  totalPages: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
  pdfDoc?: PDFDocumentProxy | null;
}

function PageThumbnailSidebar({
  totalPages,
  currentPage,
  onPageSelect,
  pdfDoc,
}: PageThumbnailSidebarProps) {
  const [thumbnails, setThumbnails] = useState<(string | null)[]>([]);
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [editingPage, setEditingPage] = useState<number | null>(null);

  const drawingSets = useStore((s) => s.drawingSets);
  const setDrawingSet = useStore((s) => s.setDrawingSet);
  const sheetNames = useStore((s) => s.sheetNames);

  // Render thumbnails from PDF document at low DPI — parallel with progressive reveal
  useEffect(() => {
    if (!pdfDoc || totalPages <= 0) {
      setThumbnails([]);
      setFailedPages(new Set());
      return;
    }

    let cancelled = false;
    const thumbScale = 0.2;

    setThumbnails(Array(totalPages).fill(null));
    setFailedPages(new Set());

    const renderPage = async (pageNumber: number): Promise<string | null> => {
      if (cancelled) return null;
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: thumbScale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        await (page as any).render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/png');
      } catch {
        if (!cancelled) {
          setFailedPages((prev) => new Set(prev).add(pageNumber));
        }
        return null;
      }
    };

    Array.from({ length: totalPages }, (_, i) => {
      const pageNumber = i + 1;
      renderPage(pageNumber).then((dataUrl) => {
        if (cancelled) return;
        setThumbnails((prev) => {
          const next = [...prev];
          next[i] = dataUrl;
          return next;
        });
      });
    });

    return () => { cancelled = true; };
  }, [pdfDoc, totalPages]);

  // Group pages by drawing set
  const groupedPages = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (let i = 1; i <= totalPages; i++) {
      const setName = drawingSets[i] || '';
      const list = groups.get(setName);
      if (list) list.push(i);
      else groups.set(setName, [i]);
    }
    // Sort: named sets first (alphabetical), then unassigned
    const entries = Array.from(groups.entries()).sort((a, b) => {
      if (!a[0] && b[0]) return 1;
      if (a[0] && !b[0]) return -1;
      return a[0].localeCompare(b[0]);
    });
    return entries;
  }, [totalPages, drawingSets]);

  const hasAnySets = groupedPages.some(([name]) => name !== '');

  if (totalPages <= 0) return null;

  function renderPageButton(page: number) {
    const isActive = page === currentPage;
    const thumb = thumbnails[page - 1];

    return (
      <div key={page} className="relative group/page">
        <button
          type="button"
          onClick={() => onPageSelect(page)}
          className={`flex flex-col items-center gap-1 px-1 py-2 transition-colors w-full ${
            isActive
              ? 'bg-[#00d4ff]/10 ring-2 ring-blue-500'
              : 'hover:bg-[#0e1016]'
          }`}
          aria-label={`Go to page ${page}`}
          aria-current={isActive ? 'page' : undefined}
        >
          {thumb ? (
            <img
              src={thumb}
              alt={`Page ${page}`}
              className={`w-14 h-auto rounded-sm ${
                isActive ? 'ring-2 ring-blue-500 ring-offset-1' : 'ring-1 ring-gray-700'
              }`}
              draggable={false}
            />
          ) : failedPages.has(page) ? (
            <span
              className="w-14 h-[52px] rounded-sm flex items-center justify-center text-red-400 text-sm font-bold ring-1 ring-gray-700 bg-[#1a1a2e]"
              aria-label={`Thumbnail failed for page ${page}`}
            >
              !
            </span>
          ) : (
            <div
              className={`w-14 h-[52px] rounded-sm animate-pulse bg-zinc-700 ${
                isActive ? 'ring-2 ring-blue-500 ring-offset-1' : 'ring-1 ring-gray-700'
              }`}
            />
          )}
          <span
            className={`text-[10px] font-mono ${
              isActive ? 'text-[#00d4ff]' : 'text-gray-500'
            }`}
          >
            {page}
          </span>
        </button>
        {/* Drawing set assignment dropdown trigger */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditingPage(editingPage === page ? null : page);
          }}
          className="absolute top-1 right-1 opacity-0 group-hover/page:opacity-100 bg-black/60 rounded p-0.5 text-gray-300 hover:text-[#00d4ff] transition-opacity"
          aria-label={`Assign drawing set for page ${page}`}
          title="Assign drawing set"
        >
          <ChevronDown size={10} />
        </button>
        {editingPage === page && (
          <div className="absolute top-0 left-full ml-1 z-50 bg-[#1a1a2e] border border-[#00d4ff]/25 rounded-lg shadow-xl py-1 min-w-[130px]">
            {DRAWING_SET_OPTIONS.map((opt) => (
              <button
                key={opt || '__none__'}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawingSet(page, opt);
                  setEditingPage(null);
                }}
                className={`block w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#00d4ff]/10 transition-colors ${
                  (drawingSets[page] || '') === opt ? 'text-[#00d4ff] font-semibold' : 'text-gray-300'
                }`}
              >
                {opt || 'Unassigned'}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`hidden md:flex flex-col shrink-0 bg-[rgba(18,18,26,0.8)] border-r border-[#00d4ff]/20 overflow-y-auto ${
        collapsed ? 'w-6' : 'w-20'
      }`}
      aria-label="Page thumbnails"
    >
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex items-center justify-center h-8 border-b border-[#00d4ff]/20 text-gray-300 hover:bg-[#0e1016]"
        aria-label={collapsed ? 'Expand page thumbnails' : 'Collapse page thumbnails'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {!collapsed && (
        hasAnySets ? (
          groupedPages.map(([setName, pages]) => (
            <div key={setName || '__unassigned__'}>
              <div className="px-1 py-1 text-[9px] font-mono tracking-wider text-gray-400 bg-[#0e1016] border-b border-[#00d4ff]/10 truncate text-center uppercase">
                {setName || 'Unassigned'}
              </div>
              {pages.map(renderPageButton)}
            </div>
          ))
        ) : (
          Array.from({ length: totalPages }, (_, i) => renderPageButton(i + 1))
        )
      )}
    </div>
  );
}

export default React.memo(PageThumbnailSidebar);
