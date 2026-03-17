'use client';

import React, { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

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

  // Render thumbnails from PDF document at low DPI
  useEffect(() => {
    if (!pdfDoc || totalPages <= 0) {
      setThumbnails([]);
      return;
    }

    let cancelled = false;
    const thumbScale = 0.2;

    (async () => {
      const results: (string | null)[] = [];
      for (let i = 1; i <= totalPages; i++) {
        if (cancelled) return;
        try {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: thumbScale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            results.push(null);
            continue;
          }
          await (page as any).render({ canvasContext: ctx, viewport }).promise;
          results.push(canvas.toDataURL('image/png'));
        } catch {
          results.push(null);
        }
      }
      if (!cancelled) setThumbnails(results);
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, totalPages]);

  if (totalPages <= 0) return null;

  return (
    <div
      className="hidden lg:flex flex-col w-20 shrink-0 bg-[rgba(18,18,26,0.8)] border-r border-[#00d4ff]/20 overflow-y-auto"
      aria-label="Page thumbnails"
    >
      {Array.from({ length: totalPages }, (_, i) => {
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
                className={`w-14 h-auto rounded-sm border-2 ${
                  isActive ? 'border-[#00d4ff]' : 'border-transparent'
                }`}
                draggable={false}
              />
            ) : (
              <div
                className={`w-14 h-[52px] rounded-sm border-2 flex items-center justify-center text-xs font-mono ${
                  isActive
                    ? 'border-[#00d4ff] bg-[#00d4ff]/10 text-[#00d4ff]'
                    : 'border-[#333] bg-[#1a1a2e] text-gray-500'
                }`}
              >
                {page}
              </div>
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
