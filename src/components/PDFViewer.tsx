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
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { useStore } from '@/lib/store';

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  version: string;
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PDFDocumentProxy> };
}

// Sheet-name detection patterns
const SHEET_CODE_RE = /\b([A-Z]{1,2})[-.]?(\d{1,3})(?:\.(\d{1,2}))?\b/;
const SHEET_KEYWORDS = [
  'Architectural', 'Structural', 'Mechanical', 'Electrical', 'Plumbing',
  'Civil', 'Floor Plan', 'Site Plan', 'Roof Plan', 'Elevation', 'Section', 'Detail',
];
const SHEET_KEYWORD_RE = new RegExp(`\\b(${SHEET_KEYWORDS.join('|')})\\b`, 'i');

function detectSheetName(text: string): string | null {
  const codeMatch = text.match(SHEET_CODE_RE);
  if (codeMatch) return codeMatch[0];
  const kwMatch = text.match(SHEET_KEYWORD_RE);
  if (kwMatch) return kwMatch[1];
  return null;
}

interface PDFViewerProps {
  file?: File | null;
  /** Project ID — when provided, extracted text and sheet names are PATCHed to the server. */
  projectId?: string;
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
  focusOnNormalizedPoint: (point: { x: number; y: number }, targetZoom?: number) => void;
  getPageCanvas: () => HTMLCanvasElement | null;
  renderPageForCapture: (page: number) => Promise<HTMLCanvasElement | null>;
}

const PDFViewer = forwardRef<PDFViewerHandle, PDFViewerProps>(
  ({ file, projectId, onPageChange, onDimensionsChange, onTextExtracted, cursor = 'default', children }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [zoom, setZoomState] = useState(0.5); // Start at 50% — fitToPage will correct to exact fit on load
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
    const [, setIsRendering] = useState(false);
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
    const renderTaskRef = useRef<RenderTask | null>(null);
    const retryCancelRef = useRef<(() => void) | null>(null);
    // Resolve callback for renderPageForCapture — called when a render completes
    const renderCompleteResolveRef = useRef<((canvas: HTMLCanvasElement | null) => void) | null>(null);
    // Keep onPageChange in a ref so load/goToPage always call the latest version without needing it in deps
    const onPageChangeRef = useRef(onPageChange);
    useEffect(() => { onPageChangeRef.current = onPageChange; }, [onPageChange]);
    // Keep projectId in a ref so the PATCH inside actuallyRender always reads the latest value,
    // even if the render started before projectId was set (race condition on new uploads).
    const projectIdRef = useRef(projectId);
    useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

    // Final cleanup guard for worker/doc resources on component unmount.
    useEffect(() => {
      return () => {
        retryCancelRef.current?.();
        retryCancelRef.current = null;
        pendingRender.current = null;
        try { renderTaskRef.current?.cancel?.(); } catch {}
        renderTaskRef.current = null;
        if (renderCompleteResolveRef.current) {
          const resolve = renderCompleteResolveRef.current;
          renderCompleteResolveRef.current = null;
          resolve(null);
        }
        const doc = pdfDocRef.current;
        pdfDocRef.current = null;
        if (doc) {
          void doc.destroy();
        }
      };
    }, []);

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

    // BUG-A6-5-028 fix: shared helper used by both the initial load effect and retryLoad,
    // eliminating ~30 lines of duplicated PDF load logic that could diverge.
    const loadPdfFromFile = useCallback(
      async (pdfFile: File, isCancelled: () => boolean): Promise<PDFDocumentProxy | null> => {
        const pdfjsLib = await import('pdfjs-dist') as unknown as PdfJsLib;
        if (isCancelled()) return null;
        if (pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }
        const arrayBuffer = await pdfFile.arrayBuffer();
        if (isCancelled()) return null;
        const doc: PDFDocumentProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (isCancelled()) {
          void doc.destroy();
          return null;
        }
        return doc;
      },
      [],
    );

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
      const doLoad = async () => {
        try {
          const doc = await loadPdfFromFile(file, () => cancelled);
          if (!doc) return;
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
      doLoad();
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
    }, [file, loadPdfFromFile]);

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
          // Large PDF support: DPR clamped to prevent canvas overflow on high-DPI displays
          const MAX_CANVAS_DIM = 4096;
          const clampedDpr = Math.min(dpr, MAX_CANVAS_DIM / Math.max(viewport.width, viewport.height, 1));
          const effectiveDpr = Math.max(1, clampedDpr);

          canvas.width = viewport.width * effectiveDpr;
          canvas.height = viewport.height * effectiveDpr;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          // Fill white before render to prevent transparent/blank flash during page navigation
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);

          const dims = { width: viewport.width, height: viewport.height };
          setPageDimensions(dims);
          onDimensionsChange?.(dims);

          // Store raw (scale=1) page dimensions for fitToPage calculation and zoom-independent overlays
          const baseViewport = page.getViewport({ scale: 1 });
          basePageSize.current = { width: baseViewport.width, height: baseViewport.height };
          useStore.getState().setPageBaseDimensions(pageNum, { width: baseViewport.width, height: baseViewport.height });

          // ISSUE #5: Store the render task so it can be cancelled if superseded
          performance.mark('pdf-render-start');
          const renderTask = page.render({ canvas, canvasContext: ctx, viewport });
          renderTaskRef.current = renderTask;
          try {
            await renderTask.promise;
          } catch (err: unknown) {
            // RenderingCancelledException is expected when we cancel; swallow it
            if (err instanceof Error && err.name === 'RenderingCancelledException') return;
            throw err;
          } finally {
            if (renderTaskRef.current === renderTask) renderTaskRef.current = null;
          }
          performance.mark('pdf-render-end');
          const pdfMeasure = performance.measure('pdf-render', 'pdf-render-start', 'pdf-render-end');
          if (typeof window !== 'undefined') {
            if (!window.__perfMarks) window.__perfMarks = { pdfRender: null, aiTakeoff: null, polygonDraw: null };
            window.__perfMarks.pdfRender = pdfMeasure.duration;
          }

          // Stale check #2: abort if superseded during render
          if (renderVersionRef.current !== myVersion) return;

          try {
            const textContent = await page.getTextContent();
            // Stale check #3: abort if superseded during text extraction
            if (renderVersionRef.current !== myVersion) return;
            const fullText = textContent.items
              .map((item: Record<string, unknown>) => ('str' in item ? String(item.str) : '').trim())
              .join('\n');
            onTextExtracted?.(fullText, pageNum);

            // Send extracted text + auto-detected sheet name to server.
            // Use projectIdRef (not the closure value) so we pick up the latest
            // projectId even when the render started before it was set.
            const pid = projectIdRef.current;
            if (pid && fullText.trim()) {
              const sheetName = detectSheetName(fullText);
              const patchBody: Record<string, unknown> = { pageNum, text: fullText };
              if (sheetName) patchBody.sheet_name = sheetName;
              fetch(`/api/projects/${pid}/pages`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patchBody),
              }).catch(() => {/* best-effort */});
            }
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
          } else if (renderCompleteResolveRef.current && renderVersionRef.current === myVersion) {
            // No pending render and this is the latest version — resolve the capture promise
            const resolve = renderCompleteResolveRef.current;
            renderCompleteResolveRef.current = null;
            resolve(canvasRef.current);
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
      // Sync to store so external ZoomControls displays the correct percentage
      useStore.getState().setZoomLevel(fitZoom);
    }, [setZoom]);

    const focusOnNormalizedPoint = useCallback((point: { x: number; y: number }, targetZoom = 2) => {
      const container = containerRef.current;
      if (!container) return;

      const clampedPoint = {
        x: Math.max(0, Math.min(1, point.x)),
        y: Math.max(0, Math.min(1, point.y)),
      };
      const nextZoom = Math.max(0.25, Math.min(5, targetZoom));
      const renderMultiplier = 1.5;
      const pageWidthAtZoom1 = basePageSize.current.width > 0
        ? basePageSize.current.width * renderMultiplier
        : (pageDimensions.width > 0 ? pageDimensions.width / Math.max(zoomRef.current, 0.01) : 0);
      const pageHeightAtZoom1 = basePageSize.current.height > 0
        ? basePageSize.current.height * renderMultiplier
        : (pageDimensions.height > 0 ? pageDimensions.height / Math.max(zoomRef.current, 0.01) : 0);
      if (pageWidthAtZoom1 <= 0 || pageHeightAtZoom1 <= 0) {
        setZoom(nextZoom);
        return;
      }

      const pageWidth = pageWidthAtZoom1 * nextZoom;
      const pageHeight = pageHeightAtZoom1 * nextZoom;
      const panX = (0.5 - clampedPoint.x) * pageWidth;
      const panY = (0.5 - clampedPoint.y) * pageHeight;

      setZoomState(nextZoom);
      zoomRef.current = nextZoom;
      setPan({
        x: Number.isFinite(panX) ? panX : 0,
        y: Number.isFinite(panY) ? panY : 0,
      });
    }, [pageDimensions, setZoom]);

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
        const renderMultiplier = 1.5;
        const pageWidthAtZoom1 = basePageSize.current.width > 0
          ? basePageSize.current.width * renderMultiplier
          : (pageDimensions.width > 0 ? pageDimensions.width / prevZoom : 0);
        const pageHeightAtZoom1 = basePageSize.current.height > 0
          ? basePageSize.current.height * renderMultiplier
          : (pageDimensions.height > 0 ? pageDimensions.height / prevZoom : 0);
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
        // Sync to store so external ZoomControls displays the correct percentage
        useStore.getState().setZoomLevel(nextZoom);
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
      let timeoutId: ReturnType<typeof setTimeout>;
      const tryFit = () => {
        const container = containerRef.current;
        if (container && container.clientWidth > 50 && basePageSize.current.width > 0) {
          initialFitDone.current = true;
          fitToPage();
        } else if (attempts < 40) {
          attempts++;
          rafId = requestAnimationFrame(tryFit);
        }
      };
      // RAF loop for fast layout
      rafId = requestAnimationFrame(tryFit);
      // Fallback: force fit after 500ms regardless
      timeoutId = setTimeout(() => {
        if (!initialFitDone.current) {
          initialFitDone.current = true;
          fitToPage();
        }
      }, 500);
      return () => { cancelAnimationFrame(rafId); clearTimeout(timeoutId); };
    }, [pageDimensions, fitToPage]);

    // Keyboard navigation (page only — zoom keys handled by page.tsx to avoid conflicts)
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        const active = document.activeElement as HTMLElement | null;
        if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') nextPage();
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') prevPage();
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [nextPage, prevPage]);

    // renderPageForCapture: navigate to a page, wait for render, return canvas
    // BUG-A6-5-027 fix: use a queue keyed by a monotonically increasing call ID so
    // concurrent callers (e.g. multi-page export loops) each get exactly one resolve.
    // The previous single-ref approach overwrote the first caller's resolve, hanging it.
    const captureQueueRef = useRef<Map<number, (canvas: HTMLCanvasElement | null) => void>>(new Map());
    const captureCallIdRef = useRef(0);
    const renderPageForCapture = useCallback(
      (page: number): Promise<HTMLCanvasElement | null> => {
        return new Promise((resolve) => {
          const callId = ++captureCallIdRef.current;
          captureQueueRef.current.set(callId, resolve);
          // Patch renderCompleteResolveRef to drain all queued resolvers when the render finishes
          renderCompleteResolveRef.current = (canvas) => {
            captureQueueRef.current.forEach((r) => r(canvas));
            captureQueueRef.current.clear();
          };
          goToPage(page);
        });
      },
      [goToPage]
    );

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
        focusOnNormalizedPoint,
        getPageCanvas: () => canvasRef.current,
        renderPageForCapture,
      }),
      [zoom, pan, pageDimensions, goToPage, setZoom, fitToPage, focusOnNormalizedPoint, renderPageForCapture]
    );

    // Touch handlers for mobile: pan (one finger) and pinch-to-zoom (two fingers)
    const pinchInfo = useRef<{ dist: number; center: { x: number; y: number }; startZoom: number } | null>(null);
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
          const renderMultiplier = 1.5;
          const pageWidthAtZoom1 = basePageSize.current.width > 0
            ? basePageSize.current.width * renderMultiplier
            : (pageDimensions.width > 0 ? pageDimensions.width / zoom : 0);
          const pageHeightAtZoom1 = basePageSize.current.height > 0
            ? basePageSize.current.height * renderMultiplier
            : (pageDimensions.height > 0 ? pageDimensions.height / zoom : 0);
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
        // Sync to store so external ZoomControls displays the correct percentage
        useStore.getState().setZoomLevel(nextZoom);
      }
    }, [isPanning, pan, panStart, zoom, pageDimensions, setZoom]);

    const onTouchEnd = useCallback(() => {
      setIsPanning(false);
      pinchInfo.current = null;
    }, []);

    // BUG-A6-5-028 fix: retryLoad now uses shared loadPdfFromFile helper
    const retryLoad = useCallback(() => {
      setLoadError(null);
      setPdfDoc(null);
      setCurrentPage(1);
      if (file) {
        retryCancelRef.current?.();
        let cancelled = false;
        retryCancelRef.current = () => { cancelled = true; };
        const doRetry = async () => {
          try {
            const doc = await loadPdfFromFile(file, () => cancelled);
            if (!doc) return;
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
          }
        };
        void doRetry();
      }
    }, [file, loadPdfFromFile]);

    return (
      <div
        ref={containerRef}
        id="pdf-print-area"
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
            <div data-testid="pdf-load-error" className="bg-zinc-800 border border-zinc-700 rounded-xl p-8 text-center max-w-sm">
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
            {pdfDoc && (
              <div style={{ position: 'absolute', transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: 'center center', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <canvas ref={canvasRef} role="img" aria-label={`PDF page ${currentPage} of ${totalPages}`} data-testid="canvas-area" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.15)', borderRadius: 2, background: '#fff', display: 'block', cursor: 'inherit' }} />
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
