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
  onAITakeoffPage?: (page: number) => void;
}

function PageThumbnailSidebar({
  totalPages,
  currentPage,
  onPageSelect,
  pdfDoc,
  onAITakeoffPage,
}: PageThumbnailSidebarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [thumbnails, setThumbnails] = useState<(string | null)[]>([]);
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set());

  const [collapsed, setCollapsed] = useState(false);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ page: number; x: number; y: number } | null>(null);
  const renderQueueRef = useRef<number[]>([]);
  const queuedPagesRef = useRef<Set<number>>(new Set());

  const activeRenderCountRef = useRef(0);
  const renderSessionRef = useRef(0);
  const drawingSets = useStore((s) => s.drawingSets);
  const setDrawingSet = useStore((s) => s.setDrawingSet);
  const polygons = useStore((s) => s.polygons ?? []);
  const classifications = useStore((s) => s.classifications ?? []);
  const pageBaseDimensions = useStore((s) => s.pageBaseDimensions ?? {});

  // Pre-compute a classificationId → color map for thumbnail overlays
  const classColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of classifications ?? []) m.set(c.id, c.color);
    return m;
  }, [classifications]);

  // Group polygons by page number
  const polygonsByPage = useMemo(() => {
    const m = new Map<number, typeof polygons>();
    for (const p of polygons) {
      const list = m.get(p.pageNumber);
      if (list) list.push(p);
      else m.set(p.pageNumber, [p]);
    }
    return m;
  }, [polygons]);

  // Classification color breakdown per page for color strip bars
  const polygonClassBreakdownByPage = useMemo(() => {
    const m = new Map<number, { color: string; count: number; classificationId: string }[]>();
    for (const [page, pagePolys] of polygonsByPage) {
      const counts = new Map<string, number>();
      for (const p of pagePolys) {
        counts.set(p.classificationId, (counts.get(p.classificationId) ?? 0) + 1);
      }
      const breakdown = Array.from(counts.entries())
        .map(([classId, count]) => ({ color: classColorMap.get(classId) ?? '#00d4ff', count, classificationId: classId }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      m.set(page, breakdown);
    }
    return m;
  }, [polygonsByPage, classColorMap]);

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
    activeRenderCountRef.current = 0;

    if (!pdfDoc || totalPages <= 0) {
      setThumbnails([]);
      setFailedPages(new Set());
      return;
    }

    setThumbnails(Array(totalPages).fill(null));
    setFailedPages(new Set());
    // Pages are queued lazily via IntersectionObserver on the page buttons.
  }, [pdfDoc, totalPages]);

  // Use IntersectionObserver to lazily queue thumbnails only for visible pages.
  useEffect(() => {
    if (!pdfDoc || totalPages <= 0) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let enqueued = false;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber ?? '0');
          if (!pageNumber) continue;
          if (!queuedPagesRef.current.has(pageNumber) && !thumbnails[pageNumber - 1]) {
            queuedPagesRef.current.add(pageNumber);
            renderQueueRef.current.push(pageNumber);
            enqueued = true;
          }
        }
        if (enqueued) processThumbnailQueue();
      },
      { root: container, rootMargin: '200px' }
    );

    // Observe all page-button elements that have data-page-number.
    const pageEls = container.querySelectorAll<HTMLElement>('[data-page-number]');
    for (const el of pageEls) observer.observe(el);

    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, totalPages, processThumbnailQueue]);

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

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  if (totalPages <= 0) return null;

  function renderPageButton(page: number) {
    const isActive = page === currentPage;
    const thumb = thumbnails[page - 1];
    const setLabel = drawingSets[page] || '';
    const pagePolygons = polygonsByPage.get(page);
    const polyCount = pagePolygons?.length ?? 0;
    const hasPolygons = polyCount > 0;
    const colorBreakdown = polygonClassBreakdownByPage.get(page);

    return (
      <div
        key={page}
        className="relative group/page"
        data-page-number={page}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ page, x: e.clientX, y: e.clientY });
          setEditingPage(null);
        }}
      >
        <button
          type="button"
          data-testid="page-thumbnail"
          data-page={page}
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
            <div className="relative w-14">
              <Image
                src={thumb}
                alt={`Page ${page}`}
                width={56}
                height={52}
                unoptimized
                className={`w-14 h-auto rounded-sm ${
                  isActive
                    ? 'ring-2 ring-blue-500 ring-offset-1'
                    : hasPolygons
                      ? 'ring-1 ring-gray-700'
                      : 'ring-1 ring-dashed ring-gray-600/50'
                }`}
                draggable={false}
              />
              {/* Polygon overlay preview */}
              {(() => {
                const dims = pageBaseDimensions[page];
                if (!pagePolygons?.length || !dims) return null;
                return (
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox={`0 0 ${dims.width} ${dims.height}`}
                    preserveAspectRatio="none"
                  >
                    {pagePolygons.map((poly) => (
                      <polygon
                        key={poly.id}
                        points={poly.points.map((pt) => `${pt.x},${pt.y}`).join(' ')}
                        fill={classColorMap.get(poly.classificationId) ?? '#00d4ff'}
                        fillOpacity={0.3}
                        stroke={classColorMap.get(poly.classificationId) ?? '#00d4ff'}
                        strokeWidth={dims.width * 0.005}
                        strokeOpacity={0.6}
                      />
                    ))}
                  </svg>
                );
              })()}
              {/* Unanalyzed page hover hint */}
              {!hasPolygons && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/page:opacity-100 transition-opacity pointer-events-none">
                  <span className="text-[8px] font-mono text-gray-400 bg-black/50 rounded px-1 py-0.5">▶ AI</span>
                </div>
              )}
              {/* Polygon count badge */}
              {hasPolygons && (
                <span className="absolute bottom-0.5 right-0.5 bg-green-500 text-white text-[9px] font-mono font-bold rounded px-1 leading-tight z-10 min-w-[16px] text-center">
                  {polyCount}
                </span>
              )}
              {/* Classification color strip */}
              {colorBreakdown && colorBreakdown.length > 0 && (
                <div className="flex flex-row overflow-hidden rounded-b-sm w-full h-[3px] absolute bottom-0 left-0 right-0">
                  {colorBreakdown.map((seg, i) => (
                    <div key={seg.classificationId ?? `seg-${i}`} style={{ backgroundColor: seg.color, flex: seg.count }} />
                  ))}
                </div>
              )}
            </div>
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
          {setLabel && (
            <span className="text-[8px] text-gray-500 truncate max-w-[56px] leading-tight">
              {setLabel}
            </span>
          )}
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
      data-testid="page-thumbnail-sidebar"
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

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-[#1a1a2e] border border-[#00d4ff]/25 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setEditingPage(contextMenu.page);
              setContextMenu(null);
            }}
            className="block w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-[#00d4ff]/10 transition-colors"
          >
            Assign Drawing Set
          </button>
          <button
            type="button"
            onClick={() => {
              onPageSelect(contextMenu.page);
              setContextMenu(null);
            }}
            className="block w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-[#00d4ff]/10 transition-colors"
          >
            Go to Page
          </button>
          {onAITakeoffPage && (
            <button
              type="button"
              onClick={() => {
                onAITakeoffPage(contextMenu.page);
                setContextMenu(null);
              }}
              className="block w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-[#00d4ff]/10 transition-colors"
            >
              Run AI Takeoff on this page
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(PageThumbnailSidebar);
