'use client';

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { FileX, WifiOff } from 'lucide-react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useStore } from '@/lib/store';

interface PDFViewerProps {
  file?: File | null;
  onPageChange?: (page: number, total: number) => void;
  onDimensionsChange?: (dims: { width: number; height: number }) => void;
  onTextExtracted?: (text: string, pageNum: number) => void;
  /** CSS cursor value to apply when not actively panning (e.g. 'crosshair'). Defaults to 'default'. */
  cursor?: string;
  /** Optional overlay content rendered inside the pan/zoom transform, co-located with the PDF canvas. */
  children?: React.ReactNode;
}

export interface PDFViewerHandle {
  containerEl: HTMLDivElement | null;
  zoom: number;
  pan: { x: number; y: number };
  pageDimensions: { width: number; height: number };
  goToPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  fitToPage: () => void;
  getPageCanvas: () => HTMLCanvasElement | null;
}

const PDFViewer = forwardRef<PDFViewerHandle, PDFViewerProps>(
  ({ file, onPageChange, onDimensionsChange, onTextExtracted, cursor = 'default', children }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [zoom, setZoomState] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
    const [isRendering, setIsRendering] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState(false);
    const pendingRender = useRef<number | null>(null);
    const initialFitDone = useRef(false);
    const basePageSize = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
    const totalPagesRef = useRef(0);
    // Stable refs so callbacks never close over stale state
    const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
    const zoomRef = useRef(1);
    const isRenderingRef = useRef(false);
    const currentPageRef = useRef(1);
    // Render-version counter: incremented before each render; checked at each await to abort stale renders
    const renderVersionRef = useRef(0);
    // Current in-flight renderTask for cancellation
    const renderTaskRef = useRef<any>(null);
    const retryCancelRef = useRef<(() => void) | null>(null);
    // Keep onPageChange in a ref so load/goToPage always call the latest version without needing it in deps
    const onPageChangeRef = useRef(onPageChange);
    useEffect(() => { onPageChangeRef.current = onPageChange; }, [onPageChange]);

    // Offline detection
    useEffect(() => {
      const goOffline = () => setIsOffline(true);
      const goOnline = () => setIsOffline(false);
      setIsOffline(!navigator.onLine);
      window.addEventListener('offline', goOffline);
      window.addEventListener('online', goOnline);
      return () => {
        window.removeEventListener('offline', goOffline);
        window.removeEventListener('online', goOnline);
      };
    }, []);

    // ISSUE #1: When file becomes null/undefined, clear prior viewer state
    useEffect(() => {
      if (file) return;
      retryCancelRef.current?.();
      retryCancelRef.current = null;
      // Destroy any loaded doc
      if (pdfDocRef.current) {
        void pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
      setPdfDoc(null);
      setTotalPages(0);
      totalPagesRef.current = 0;
      setCurrentPage(1);
      currentPageRef.current = 1;
      setLoadError(null);
      setIsRendering(false);
      isRenderingRef.current = false;
      pendingRender.current = null;
      initialFitDone.current = false;
      // Clear the canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
      }
    }, [file]);

    // Load PDF from file with pdfjs-dist only
    // ISSUE #2: Destroy prior doc on file change or unmount
    useEffect(() => {
      if (!file) return;
      let cancelled = false;
      let loadedDoc: PDFDocumentProxy | null = null;
      // Destroy the previously loaded document before loading a new one
      if (pdfDocRef.current) {
        void pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
      setLoadError(null);
      initialFitDone.current = false;
      const loadPdf = async () => {
        try {
          const pdfjsLib: any = await import('pdfjs-dist');
          if (pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc =
              `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
          }
          const arrayBuffer = await file.arrayBuffer();
          const doc: PDFDocumentProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          if (cancelled) {
            void doc.destroy();
            return;
          }
          loadedDoc = doc;
          pdfDocRef.current = doc;
          setPdfDoc(doc);
          setTotalPages(doc.numPages);
          totalPagesRef.current = doc.numPages;
          setCurrentPage(1);
          onPageChangeRef.current?.(1, doc.numPages);
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : 'Unknown error';
          setLoadError(msg);
          console.error('PDF load error:', err);
        }
      };
      loadPdf();
      return () => {
        cancelled = true;
        retryCancelRef.current?.();
        retryCancelRef.current = null;
        // ISSUE #2: Destroy on unmount or file change
        if (loadedDoc) {
          void loadedDoc.destroy();
          loadedDoc = null;
        }
        if (pdfDocRef.current) {
          void pdfDocRef.current.destroy();
          pdfDocRef.current = null;
        }
      };
    }, [file]);

    // actuallyRender uses refs so it's always current — no stale closure issues
    // ISSUE #4: render-version guard aborts stale renders after each await
    // ISSUE #5: cancel superseded render tasks before starting a new one
    const actuallyRender = useCallback(
      async (pageNum: number) => {
        const doc = pdfDocRef.current;
        if (!doc || !canvasRef.current) return;

        // Increment render version; capture ours for stale-check
        const myVersion = ++renderVersionRef.current;

        // ISSUE #5: Cancel any in-flight render task before starting a new one
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch {}
          renderTaskRef.current = null;
        }

        isRenderingRef.current = true;
        setIsRendering(true);
        try {
          const page: PDFPageProxy = await doc.getPage(pageNum);
          // Stale check #1: abort if a newer render was requested
          if (renderVersionRef.current !== myVersion) return;

          const viewport = page.getViewport({ scale: zoomRef.current * 1.5 });
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d')!;
          const dpr = window.devicePixelRatio || 1;

          canvas.width = viewport.width * dpr;
          canvas.height = viewport.height * dpr;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          const dims = { width: viewport.width, height: viewport.height };
          setPageDimensions(dims);
          onDimensionsChange?.(dims);

          // Store raw (scale=1) page dimensions for fitToPage calculation and zoom-independent overlays
          const baseViewport = page.getViewport({ scale: 1 });
          basePageSize.current = { width: baseViewport.width, height: baseViewport.height };
          useStore.getState().setPageBaseDimensions(pageNum, { width: baseViewport.width, height: baseViewport.height });

          // ISSUE #5: Store the render task so it can be cancelled if superseded
          const renderTask = (page as any).render({ canvasContext: ctx, viewport, canvas });
          renderTaskRef.current = renderTask;
          try {
            await renderTask.promise;
          } catch (err: any) {
            // RenderingCancelledException is expected when we cancel; swallow it
            if (err?.name === 'RenderingCancelledException') return;
            throw err;
          } finally {
            if (renderTaskRef.current === renderTask) renderTaskRef.current = null;
          }

          // Stale check #2: abort if superseded during render
          if (renderVersionRef.current !== myVersion) return;

          try {
            const textContent = await page.getTextContent();
            // Stale check #3: abort if superseded during text extraction
            if (renderVersionRef.current !== myVersion) return;
            const fullText = (textContent.items as any[])
              .map((item) => (item.str || '').trim())
              .join('\n');
            onTextExtracted?.(fullText, pageNum);
          } catch {}
        } finally {
          // Only reset rendering flag if this is still the current render
          if (renderVersionRef.current === myVersion || isRenderingRef.current) {
            isRenderingRef.current = false;
            setIsRendering(false);
          }
          if (pendingRender.current !== null) {
            const next = pendingRender.current;
            pendingRender.current = null;
            void actuallyRender(next);
          }
        }
      },
      [onDimensionsChange, onTextExtracted]
    );

    // ISSUE #6 FIX: pendingRender uses a "latest-wins / dirty-flag" pattern.
    // Rapid page changes collapse to a single queued render: each new call overwrites
    // pendingRender with the LATEST requested page number. When the current render
    // finishes, actuallyRender drains the pending slot once — always rendering the
    // most-recently requested page. This avoids unbounded queuing while guaranteeing
    // the final visible page is always the most recently requested one.
    const renderPage = useCallback(
      (pageNum: number) => {
        if (isRenderingRef.current) {
          // Latest wins: overwrite any earlier pending page with the newest request
          pendingRender.current = pageNum;
          return;
        }
        void actuallyRender(pageNum);
      },
      [actuallyRender]
    );

    // Keep zoomRef and currentPageRef in sync
    useEffect(() => {
      zoomRef.current = zoom;
    }, [zoom]);

    useEffect(() => {
      currentPageRef.current = currentPage;
    }, [currentPage]);

    // Re-render when zoom changes — use ref so we always render the correct current page
    useEffect(() => {
      if (pdfDocRef.current) renderPage(currentPageRef.current);
      // Only zoom in deps — renderPage is stable (useCallback with stable deps)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoom]);

    // Initial render when PDF first loads — pdfDoc state change triggers this once.
    // We do NOT reset currentPageRef here; the load effect already set it to 1.
    useEffect(() => {
      if (pdfDoc && currentPageRef.current >= 1) {
        renderPage(currentPageRef.current);
      }
      // renderPage is stable; pdfDoc only changes on new file load
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdfDoc]);

    // Page navigation — update ref + state, then directly trigger render (don't wait for useEffect)
    const goToPage = useCallback(
      (page: number) => {
        const total = totalPagesRef.current;
        const p = Math.max(1, Math.min(page, Math.max(total, 1)));
        currentPageRef.current = p;
        setCurrentPage(p);
        // Call via ref so we always use the latest callback without it being a dep
        onPageChangeRef.current?.(p, total);
        // Directly call renderPage so nav works even if React batches the state update
        if (pdfDocRef.current) renderPage(p);
      },
      [renderPage]
    );

    const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);
    const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);

    // Zoom helpers
    const setZoom = useCallback((z: number) => {
      setZoomState(Math.max(0.25, Math.min(5, z)));
    }, []);

    const fitToPage = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      // basePageSize stores raw (scale=1) PDF page dimensions.
      // actuallyRender renders at zoom * 1.5, so rendered width = zoom * 1.5 * rawW.
      // To fill horizontal width: zoom = (containerWidth - padding) / (1.5 * rawW).
      const rawW = basePageSize.current.width;
      const rawH = basePageSize.current.height;
      if (containerWidth <= 0 || containerHeight <= 0 || rawW <= 0 || rawH <= 0) return;
      const PADDING = 24;
      const renderMultiplier = 1.5;
      const scaleX = (containerWidth - PADDING) / (renderMultiplier * rawW);
      const scaleY = (containerHeight - PADDING) / (renderMultiplier * rawH);
      // Fit to width — the page should fill the horizontal width of the viewport.
      const fitZoom = Math.min(scaleX, scaleY, 3);
      setZoom(fitZoom);
      setPan({ x: 0, y: 0 });
    }, [setZoom]);

    // Zoom to cursor
    // ISSUE #7 FIX: correct cursor-anchored zoom math.
    // Previous code subtracted pan before computing the canvas-space pivot, but that
    // produced wrong offsets because the pan translation lives outside the canvas
    // coordinate space. The correct approach:
    //   1. Convert mouse position to canvas-space coords by accounting for container
    //      origin AND the current pan offset: canvasX = (mouseX - containerLeft - panX) / currentScale
    //      (divided by scale because the canvas itself is rendered at zoom * 1.5)
    //   2. After applying the new zoom, recompute panX so the same canvas point
    //      remains under the cursor: panX' = mouseX - containerLeft - canvasX * nextZoom
    // We skip the /currentScale division here because pan is in CSS pixels (not canvas
    // render pixels), so the simpler formulation is: keep the screen-space vector from
    // origin to cursor invariant — i.e. panX' = panX - pivotX*(newZoom/oldZoom - 1)
    // where pivotX = mouseX - containerLeft - panX (screen offset from pan-origin to cursor).
    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const prevZoom = zoom;
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const nextZoom = Math.max(0.25, Math.min(5, prevZoom + delta));

        const pointerX = e.clientX - rect.left;
        const pointerY = e.clientY - rect.top;
        const pageWidthAtZoom1 = pageDimensions.width > 0 ? pageDimensions.width / prevZoom : 0;
        const pageHeightAtZoom1 = pageDimensions.height > 0 ? pageDimensions.height / prevZoom : 0;
        const prevOffsetX = pageWidthAtZoom1 > 0 ? (container.clientWidth - pageWidthAtZoom1 * prevZoom) / 2 : 0;
        const prevOffsetY = pageHeightAtZoom1 > 0 ? (container.clientHeight - pageHeightAtZoom1 * prevZoom) / 2 : 0;
        const nextOffsetX = pageWidthAtZoom1 > 0 ? (container.clientWidth - pageWidthAtZoom1 * nextZoom) / 2 : 0;
        const nextOffsetY = pageHeightAtZoom1 > 0 ? (container.clientHeight - pageHeightAtZoom1 * nextZoom) / 2 : 0;
        // Pivot point in centered-page space (page origin inside flex container + pan).
        const pivotX = pointerX - pan.x - prevOffsetX;
        const pivotY = pointerY - pan.y - prevOffsetY;
        const ratio = nextZoom / prevZoom;
        setPan({
          x: pan.x - pivotX * (ratio - 1) + (prevOffsetX - nextOffsetX),
          y: pan.y - pivotY * (ratio - 1) + (prevOffsetY - nextOffsetY),
        });
        setZoom(nextZoom);
      },
      [zoom, pan, pageDimensions, setZoom]
    );

    // Pan handlers with pointer cancel/out
    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        const tool = useStore.getState().currentTool;
        if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && tool === 'pan')) {
          setIsPanning(true);
          setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }
      },
      [pan]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!isPanning) return;
        setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      },
      [isPanning, panStart]
    );

    const endPan = useCallback(() => setIsPanning(false), []);

    // Auto fit-to-page on initial render — retry until container has layout
    useEffect(() => {
      if (!pageDimensions.width) return;
      if (initialFitDone.current) return;
      let attempts = 0;
      let rafId: number;
      const tryFit = () => {
        const container = containerRef.current;
        if (container && container.clientWidth > 0 && basePageSize.current.width > 0) {
          initialFitDone.current = true;
          fitToPage();
        } else if (attempts < 15) {
          attempts++;
          rafId = requestAnimationFrame(tryFit);
        }
      };
      rafId = requestAnimationFrame(tryFit);
      return () => cancelAnimationFrame(rafId);
    }, [pageDimensions, fitToPage]);

    // Keyboard navigation
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        const active = document.activeElement as HTMLElement | null;
        if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') nextPage();
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') prevPage();
        if (e.key === '+' || e.key === '=') setZoom(zoom + 0.1);
        if (e.key === '-') setZoom(zoom - 0.1);
        if (e.key === '0' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fitToPage(); }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [nextPage, prevPage, zoom, setZoom, fitToPage]);

    // Expose methods to parent
    useImperativeHandle(
      ref,
      () => ({
        containerEl: containerRef.current,
        zoom,
        pan,
        pageDimensions,
        goToPage,
        setZoom,
        fitToPage,
        getPageCanvas: () => canvasRef.current,
      }),
      [zoom, pan, pageDimensions, goToPage, setZoom, fitToPage]
    );

    // Touch handlers for mobile: pan (one finger) and pinch-to-zoom (two fingers)
    const pinchInfo = useRef<{ dist: number; center: { x: number; y: number }; startZoom: number } | null>(null);
    const getTouchPoint = (t: Touch) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: t.clientX - rect.left - pan.x, y: t.clientY - rect.top - pan.y };
    };
    const touchDistance = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const touchCenter = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    const onTouchStart = useCallback((e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        // ISSUE #9 FIX: only activate one-finger pan when a navigation tool is active.
        // Draw/measure tools need single-finger touch for their own gesture handling;
        // allowing pan here would intercept pointer events before the tool can act.
        const tool = useStore.getState().currentTool;
        const panTools: string[] = ['pan', 'select'];
        if (!panTools.includes(tool)) return;
        // begin pan
        setIsPanning(true);
        const t = e.touches[0];
        setPanStart({ x: t.clientX - pan.x, y: t.clientY - pan.y });
      } else if (e.touches.length === 2) {
        // begin pinch
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = touchDistance(a, b);
        const c = touchCenter(a, b);
        pinchInfo.current = { dist, center: c, startZoom: zoom };
      }
    }, [pan, zoom]);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
      if (e.touches.length === 1 && isPanning) {
        const t = e.touches[0];
        setPan({ x: t.clientX - panStart.x, y: t.clientY - panStart.y });
      } else if (e.touches.length === 2 && pinchInfo.current) {
        e.preventDefault();
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = touchDistance(a, b);
        const center = touchCenter(a, b);
        const prevZoom = pinchInfo.current.startZoom;
        const scale = dist / pinchInfo.current.dist;
        const nextZoom = Math.max(0.25, Math.min(5, prevZoom * scale));
        // adjust pan so the content under pinch center stays fixed
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const pointerX = center.x - rect.left;
          const pointerY = center.y - rect.top;
          const pageWidthAtZoom1 = pageDimensions.width > 0 ? pageDimensions.width / zoom : 0;
          const pageHeightAtZoom1 = pageDimensions.height > 0 ? pageDimensions.height / zoom : 0;
          const prevOffsetX = pageWidthAtZoom1 > 0 ? (rect.width - pageWidthAtZoom1 * zoom) / 2 : 0;
          const prevOffsetY = pageHeightAtZoom1 > 0 ? (rect.height - pageHeightAtZoom1 * zoom) / 2 : 0;
          const nextOffsetX = pageWidthAtZoom1 > 0 ? (rect.width - pageWidthAtZoom1 * nextZoom) / 2 : 0;
          const nextOffsetY = pageHeightAtZoom1 > 0 ? (rect.height - pageHeightAtZoom1 * nextZoom) / 2 : 0;
          const cx = pointerX - pan.x - prevOffsetX;
          const cy = pointerY - pan.y - prevOffsetY;
          const factor = nextZoom / zoom;
          setPan({
            x: pan.x - cx * (factor - 1) + (prevOffsetX - nextOffsetX),
            y: pan.y - cy * (factor - 1) + (prevOffsetY - nextOffsetY),
          });
        }
        setZoom(nextZoom);
      }
    }, [isPanning, pan, panStart, zoom, pageDimensions, setZoom]);

    const onTouchEnd = useCallback(() => {
      setIsPanning(false);
      pinchInfo.current = null;
    }, []);

    const retryLoad = useCallback(() => {
      setLoadError(null);
      setPdfDoc(null);
      setCurrentPage(1);
      // Re-trigger load by forcing effect — toggle a render cycle
      if (file) {
        retryCancelRef.current?.();
        let cancelled = false;
        retryCancelRef.current = () => { cancelled = true; };
        const isCancelled = () => cancelled;

        const loadPdf = async () => {
          try {
            const pdfjsLib: any = await import('pdfjs-dist');
            if (isCancelled()) return;
            if (pdfjsLib.GlobalWorkerOptions) {
              pdfjsLib.GlobalWorkerOptions.workerSrc =
                `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
            }
            const arrayBuffer = await file.arrayBuffer();
            if (isCancelled()) return;
            const doc: PDFDocumentProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            if (isCancelled()) {
              void doc.destroy();
              return;
            }
            pdfDocRef.current = doc;
            setPdfDoc(doc);
            setTotalPages(doc.numPages);
            totalPagesRef.current = doc.numPages;
            setCurrentPage(1);
            onPageChange?.(1, doc.numPages);
          } catch (err) {
            if (isCancelled()) return;
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setLoadError(msg);
          }
        };
        void loadPdf();
      }
    }, [file, onPageChange]);

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', cursor: isPanning ? 'grabbing' : cursor, touchAction: 'none', background: '#12121a' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onPointerOut={(e) => { if ((e.target as Node) === containerRef.current) endPan(); }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Offline banner */}
        {isOffline && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
            <WifiOff size={16} />
            You appear to be offline
          </div>
        )}

        {/* Error fallback */}
        {loadError ? (
          <div className="flex items-center justify-center w-full h-full">
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-8 text-center max-w-sm">
              <FileX size={48} className="text-zinc-500 mx-auto mb-4" />
              <div className="text-lg font-semibold text-zinc-200 mb-2">Could not load PDF</div>
              <div className="text-sm text-zinc-400 mb-4">Please check the file and try again.</div>
              <button
                onClick={retryLoad}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* HUD: zoom/pan pill */}
            <div style={{ position: 'absolute', right: 12, top: 12, zIndex: 20 }}>
              <div className="font-mono text-xs px-3 py-1 rounded-full backdrop-blur-sm border border-[#00d4ff]/30 text-[#00d4ff] bg-[rgba(10,10,15,0.6)] shadow-[0_0_12px_rgba(0,212,255,0.15)]">
                {Math.round(zoom * 100)}% · x{Math.round(pan.x)} y{Math.round(pan.y)}
              </div>
            </div>
            {pdfDoc && (
              <div style={{ position: 'absolute', transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: 'center center', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <canvas ref={canvasRef} style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.15)', borderRadius: 2, background: '#fff', display: 'block', cursor: 'inherit' }} />
                  {children}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }
);

PDFViewer.displayName = 'PDFViewer';
export default PDFViewer;
