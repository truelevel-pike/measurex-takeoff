'use client';

import React, { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PageThumbnailSidebarProps {
  totalPages: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
  pdfDoc?: PDFDocumentProxy | null;
}

export default function PageThumbnailSidebar({
  totalPages,
  currentPage,
  onPageSelect,
  pdfDoc,
}: PageThumbnailSidebarProps) {
  const [thumbnails, setThumbnails] = useState<(string | null)[]>([]);
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  // Render thumbnails from PDF document at low DPI — parallel with progressive reveal
  useEffect(() => {
    if (!pdfDoc || totalPages <= 0) {
      setThumbnails([]);
      setFailedPages(new Set());
      return;
    }

    let cancelled = false;
    const thumbScale = 0.2;

    // Pre-fill with nulls so page buttons render immediately (showing page numbers)
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

    // Launch all renders in parallel; update state progressively as each finishes
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

  if (totalPages <= 0) return null;

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

      {!collapsed && Array.from({ length: totalPages }, (_, i) => {
        const page = i + 1;
        const isActive = page === currentPage;
        const thumb = thumbnails[i];

        return (
          <button
            key={page}
            type="button"
            onClick={() => onPageSelect(page)}
            className={`flex flex-col items-center gap-1 px-1 py-2 transition-colors ${
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
        );
      })}
    </div>
  );
}
