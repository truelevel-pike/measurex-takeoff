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

interface PDFViewerProps {
  file?: File | null;
  onPageChange?: (page: number, total: number) => void;
  onDimensionsChange?: (dims: { width: number; height: number }) => void;
  onTextExtracted?: (text: string, pageNum: number) => void;
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
  ({ file, onPageChange, onDimensionsChange, onTextExtracted }, ref) => {
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

    // Load PDF from file with pdfjs-dist only
    useEffect(() => {
      if (!file) return;
      let cancelled = false;
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
          if (cancelled) return;
          setPdfDoc(doc);
          setTotalPages(doc.numPages);
          totalPagesRef.current = doc.numPages;
          setCurrentPage(1);
          onPageChange?.(1, doc.numPages);
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : 'Unknown error';
          setLoadError(msg);
          console.error('PDF load error:', err);
        }
      };
      loadPdf();
      return () => { cancelled = true; };
    }, [file, onPageChange]);

    const actuallyRender = useCallback(
      async (pageNum: number) => {
        if (!pdfDoc || !canvasRef.current) return;
        setIsRendering(true);
        try {
          const page: PDFPageProxy = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: zoom * 1.5 });
          const canvas = canvasRef.current;
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

          // Store unscaled base dimensions for fitToPage calculation
          const baseViewport = page.getViewport({ scale: 1.5 });
          basePageSize.current = { width: baseViewport.width, height: baseViewport.height };

          await (page as any).render({ canvasContext: ctx, viewport, canvas }).promise;

          try {
            const textContent = await page.getTextContent();
            const fullText = (textContent.items as any[])
              .map((item) => (item.str || '').trim())
              .join('\n'); // preserve newlines for better parsing
            onTextExtracted?.(fullText, pageNum);
          } catch {}
        } finally {
          setIsRendering(false);
          if (pendingRender.current !== null) {
            const next = pendingRender.current;
            pendingRender.current = null;
            actuallyRender(next);
          }
        }
      },
      [pdfDoc, zoom, onDimensionsChange, onTextExtracted]
    );

    // Render current page with simple render queue
    const renderPage = useCallback(
      (pageNum: number) => {
        if (isRendering) {
          pendingRender.current = pageNum;
          return;
        }
        void actuallyRender(pageNum);
      },
      [isRendering, actuallyRender]
    );

    useEffect(() => {
      if (pdfDoc) renderPage(currentPage);
    }, [pdfDoc, currentPage, zoom, renderPage]);

    // Page navigation
    const goToPage = useCallback(
      (page: number) => {
        const total = totalPagesRef.current;
        const p = Math.max(1, Math.min(page, total));
        setCurrentPage(p);
        onPageChange?.(p, total);
      },
      [onPageChange]
    );

    const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);
    const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);

    // Zoom helpers
    const setZoom = useCallback((z: number) => {
      setZoomState(Math.max(0.25, Math.min(5, z)));
    }, []);

    const fitToPage = useCallback(() => {
      if (!containerRef.current || !basePageSize.current.width) return;
      const container = containerRef.current;
      // Use unscaled base dimensions (at scale 1.5) so the calculation
      // doesn't depend on the current zoom level
      const scaleX = (container.clientWidth - 40) / basePageSize.current.width;
      const scaleY = (container.clientHeight - 40) / basePageSize.current.height;
      setZoom(Math.min(scaleX, scaleY, 2));
      setPan({ x: 0, y: 0 });
    }, [setZoom]);

    // Zoom to cursor
    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - pan.x;
        const mouseY = e.clientY - rect.top - pan.y;
        const prevZoom = zoom;
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const nextZoom = Math.max(0.25, Math.min(5, prevZoom + delta));
        // adjust pan so the content under cursor stays fixed
        const scale = nextZoom / prevZoom;
        setPan({ x: pan.x - mouseX * (scale - 1), y: pan.y - mouseY * (scale - 1) });
        setZoom(nextZoom);
      },
      [zoom, pan, setZoom]
    );

    // Pan handlers with pointer cancel/out
    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
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

    // Auto fit-to-page on initial render
    useEffect(() => {
      if (!initialFitDone.current && pageDimensions.width > 0 && containerRef.current) {
        initialFitDone.current = true;
        // Use double requestAnimationFrame to ensure the container has fully laid out before measuring
        let cancelled = false;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) fitToPage();
          });
        });
        return () => { cancelled = true; };
      }
    }, [pageDimensions, fitToPage]);

    // ResizeObserver for container
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      let raf: number | null = null;
      const ro = new ResizeObserver(() => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => fitToPage());
      });
      ro.observe(el);
      return () => {
        if (raf) cancelAnimationFrame(raf);
        ro.disconnect();
      };
    }, [fitToPage]);

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
          const cx = center.x - rect.left - pan.x;
          const cy = center.y - rect.top - pan.y;
          const factor = nextZoom / zoom;
          setPan({ x: pan.x - cx * (factor - 1), y: pan.y - cy * (factor - 1) });
        }
        setZoom(nextZoom);
      }
    }, [isPanning, pan, panStart, zoom, setZoom]);

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
        const loadPdf = async () => {
          try {
            const pdfjsLib: any = await import('pdfjs-dist');
            if (pdfjsLib.GlobalWorkerOptions) {
              pdfjsLib.GlobalWorkerOptions.workerSrc =
                `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
            }
            const arrayBuffer = await file.arrayBuffer();
            const doc: PDFDocumentProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            setPdfDoc(doc);
            setTotalPages(doc.numPages);
            totalPagesRef.current = doc.numPages;
            setCurrentPage(1);
            onPageChange?.(1, doc.numPages);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setLoadError(msg);
          }
        };
        loadPdf();
      }
    }, [file, onPageChange]);

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', cursor: isPanning ? 'grabbing' : 'default', touchAction: 'none', background: '#12121a' }}
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
                <canvas ref={canvasRef} style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.15)', borderRadius: 2, background: '#fff' }} />
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
