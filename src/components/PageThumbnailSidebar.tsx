'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [thumbnails, setThumbnails] = useState<(string | null)[]>([]);
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set());
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const [collapsed, setCollapsed] = useState(false);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const renderQueueRef = useRef<number[]>([]);
  const queuedPagesRef = useRef<Set<number>>(new Set());
  const requestedPagesRef = useRef<Set<number>>(new Set());
  const activeRenderCountRef = useRef(0);
  const renderSessionRef = useRef(0);
  const currentPageRef = useRef(currentPage);

  const drawingSets = useStore((s) => s.drawingSets);
  const setDrawingSet = useStore((s) => s.setDrawingSet);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const processThumbnailQueue = useCallback(() => {
    const activeSession = renderSessionRef.current;
    if (!pdfDoc) return;
    const thumbScale = 0.2;
    const maxConcurrentRenders = 2;

    while (activeRenderCountRef.current < maxConcurrentRenders) {
      const pageNumber = renderQueueRef.current.shift();
      if (!pageNumber) break;
      queuedPagesRef.current.delete(pageNumber);
      activeRenderCountRef.current += 1;

      void (async () => {
        try {
          const page = await pdfDoc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: thumbScale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (renderSessionRef.current !== activeSession) return;
          setThumbnails((prev) => {
            if (prev[pageNumber - 1]) return prev;
            const next = [...prev];
            next[pageNumber - 1] = canvas.toDataURL('image/png');
            return next;
          });
        } catch {
          if (renderSessionRef.current !== activeSession) return;
          setFailedPages((prev) => new Set(prev).add(pageNumber));
        } finally {
          activeRenderCountRef.current = Math.max(0, activeRenderCountRef.current - 1);
          if (renderSessionRef.current === activeSession) {
            processThumbnailQueue();
          }
        }
      })();
    }
  }, [pdfDoc]);

  // Reset thumbnail generation state when the loaded PDF changes.
  useEffect(() => {
    renderSessionRef.current += 1;
    renderQueueRef.current = [];
    queuedPagesRef.current.clear();
    requestedPagesRef.current.clear();
    activeRenderCountRef.current = 0;

    if (!pdfDoc || totalPages <= 0) {
      setThumbnails([]);
      setFailedPages(new Set());
      setVisiblePages(new Set());
      return;
    }

    setThumbnails(Array(totalPages).fill(null));
    setFailedPages(new Set());
    setVisiblePages(new Set([currentPage]));
  }, [pdfDoc, totalPages, currentPage]);

  // Observe page buttons and mark pages that are within ~2 viewport heights.
  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || collapsed) return;

    const marginPx = Math.max(root.clientHeight * 2, 600);
    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const attr = (entry.target as HTMLElement).dataset.pageNumber;
            const pageNumber = attr ? Number(attr) : NaN;
            if (!Number.isFinite(pageNumber)) continue;
            if (entry.isIntersecting) next.add(pageNumber);
            else next.delete(pageNumber);
          }
          next.add(currentPageRef.current);
          return next;
        });
      },
      {
        root,
        rootMargin: `${marginPx}px 0px ${marginPx}px 0px`,
        threshold: 0,
      }
    );

    root.querySelectorAll<HTMLElement>('[data-page-number]').forEach((node) => observer.observe(node));

    // Watch for new [data-page-number] nodes added after the initial query
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.dataset.pageNumber) {
            observer.observe(node);
          }
          node.querySelectorAll<HTMLElement>('[data-page-number]').forEach((child) => observer.observe(child));
        }
      }
    });
    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [collapsed, drawingSets, totalPages]);

  // Queue only near-viewport pages and render thumbnails with max concurrency 2.
  useEffect(() => {
    if (!pdfDoc || totalPages <= 0) return;

    for (const pageNumber of visiblePages) {
      if (pageNumber < 1 || pageNumber > totalPages) continue;
      if (requestedPagesRef.current.has(pageNumber)) continue;
      requestedPagesRef.current.add(pageNumber);
      if (queuedPagesRef.current.has(pageNumber)) continue;
      queuedPagesRef.current.add(pageNumber);
      renderQueueRef.current.push(pageNumber);
    }

    processThumbnailQueue();
  }, [visiblePages, pdfDoc, totalPages, processThumbnailQueue]);

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
      <div key={page} className="relative group/page" data-page-number={page}>
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
            <Image
              src={thumb}
              alt={`Page ${page}`}
              width={56}
              height={52}
              unoptimized
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
      ref={scrollContainerRef}
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
