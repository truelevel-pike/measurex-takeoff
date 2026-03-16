'use client';

import React from 'react';

interface PageThumbnailSidebarProps {
  totalPages: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
  thumbnails?: string[];
}

export default function PageThumbnailSidebar({
  totalPages,
  currentPage,
  onPageSelect,
  thumbnails,
}: PageThumbnailSidebarProps) {
  if (totalPages <= 0) return null;

  return (
    <div
      className="hidden lg:flex flex-col w-20 shrink-0 bg-[rgba(18,18,26,0.8)] border-r border-[#00d4ff]/20 overflow-y-auto"
      aria-label="Page thumbnails"
    >
      {Array.from({ length: totalPages }, (_, i) => {
        const page = i + 1;
        const isActive = page === currentPage;
        const thumb = thumbnails?.[i];

        return (
          <button
            key={page}
            type="button"
            onClick={() => onPageSelect(page)}
            className={`flex flex-col items-center gap-1 px-1 py-2 transition-colors ${
              isActive
                ? 'bg-[#00d4ff]/10'
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
