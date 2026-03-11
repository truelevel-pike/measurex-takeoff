'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { File as FileIcon } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { useStore } from '@/lib/store';
import type { DetectedElement, PDFViewerHandle, ProjectState } from '@/lib/types';
import { detectScaleFromText, detectedToCalibration, DetectedScale } from '@/lib/auto-scale';
import { capturePageScreenshot, triggerAITakeoff } from '@/lib/ai-takeoff';
import { useIsMobile } from '@/lib/utils';
import { loadAIResults } from '@/lib/ai-results-loader';
import { downloadExcel } from '@/lib/export';
import { convertTakeoffTo3D } from '@/lib/takeoff-to-3d';
import { installMeasurexAPI } from '@/lib/measurex-api';

import TopNavBar from '@/components/TopNavBar';
import LeftToolbar from '@/components/LeftToolbar';
import PDFViewer from '@/components/PDFViewer';
import CanvasOverlay from '@/components/CanvasOverlay';
import BottomStatusBar from '@/components/BottomStatusBar';
import QuantitiesPanel from '@/components/QuantitiesPanel';
import MeasurementTool from '@/components/MeasurementTool';
import DrawingTool from '@/components/DrawingTool';
import MergeSplitTool from '@/components/MergeSplitTool';
import ScalePopup from '@/components/ScalePopup';
import ScaleCalibration from '@/components/ScaleCalibration';
import ThreeDScene from '@/components/ThreeDScene';

const toolKeys: Record<string, 'select'|'pan'|'draw'|'measure'> = {
  v: 'select',
  h: 'pan',
  d: 'draw',
  m: 'measure',
};

function PageInner() {
  const router = useRouter();
  const search = useSearchParams();

  // Store bindings
  const setTool = useStore((s) => s.setTool);
  const currentTool = useStore((s) => s.currentTool);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const setSelectedClassification = useStore((s) => s.setSelectedClassification);
  const deletePolygon = useStore((s) => s.deletePolygon);
  const selectedPolygon = useStore((s) => s.selectedPolygon);
  const setSelectedPolygon = useStore((s) => s.setSelectedPolygon);
  const setScale = useStore((s) => s.setScale);
  const setScaleForPage = useStore((s) => s.setScaleForPage);
  const setShowScalePopup = useStore((s) => s.setShowScalePopup);
  const showScalePopup = useStore((s) => s.showScalePopup);

  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const scales = useStore((s) => s.scales);

  const show3D = useStore((s) => s.show3D);
  const toggleShow3D = useStore((s) => s.toggleShow3D);
  const threeData = React.useMemo(
    () => convertTakeoffTo3D(polygons, classifications),
    [polygons, classifications, scale]
  );

  const pdfViewerRef = useRef<PDFViewerHandle>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [showCalModal, setShowCalModal] = useState(false);
  const [detectedScale, setDetectedScale] = useState<DetectedScale | null>(null);
  const [pdfTextureUrl, setPdfTextureUrl] = useState<string | null>(null);

  // AI takeoff UI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  // Project state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Load project by URL param
  useEffect(() => {
    const pid = search.get('project');
    if (!pid) return;

    (async () => {
      try {
        const res = await fetch(`/api/projects/${pid}`);
        if (!res.ok) throw new Error(`Load failed (${res.status})`);
        const data = await res.json();
        if (data?.project?.state) {
          const raw = data.project.state;
          useStore.getState().hydrateState({
            classifications: raw.classifications || [],
            polygons: raw.polygons || [],
            scale: raw.scale || null,
            scales: raw.scales || {},
            currentPage: raw.currentPage || 1,
            totalPages: raw.totalPages || 1,
          } as ProjectState);
          setProjectId(data.project.id);
          setProjectName(data.project.name || 'Untitled');
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, [search]);

  // Keyboard shortcuts (ignore when focused in inputs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const isForm = el && ['INPUT', 'TEXTAREA'].includes(el.tagName);
      if (isForm) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape') {
        setTool('select');
        setSelectedPolygon(null);
        setSelectedClassification(null);
        setShowCalModal(false);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPolygon) deletePolygon(selectedPolygon);
      } else if (e.key === "3") {
        toggleShow3D();
      } else if (toolKeys[e.key.toLowerCase() as keyof typeof toolKeys]) {
        setTool(toolKeys[e.key.toLowerCase() as keyof typeof toolKeys]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [redo, undo, setTool, setSelectedPolygon, setSelectedClassification, deletePolygon, selectedPolygon, setShowCalModal, toggleShow3D]);

  // Store a PDF doc reference for texture rendering.
  useEffect(() => {
    if (!pdfFile) {
      pdfDocRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib: any = await import('pdfjs-dist');
        const arrayBuffer = await pdfFile.arrayBuffer();
        const doc: PDFDocumentProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
      } catch (e) {
        console.warn('Could not load PDF document for 3D texture capture:', e);
      }
    })();
    return () => {
      cancelled = true;
      pdfDocRef.current = null;
    };
  }, [pdfFile]);

  // Capture PDF texture whenever page renders or changes (so it's ready for 3D)
  const lastCapturedPage = useRef<number>(0);
  useEffect(() => {
    if (!pdfFile) return;
    // Capture on every page change or when file loads, regardless of 3D state
    const timer = setTimeout(() => {
      void (async () => {
        const doc = pdfDocRef.current;
        if (!doc) return;
        try {
          const page = await doc.getPage(currentPageNum);
          const viewport = page.getViewport({ scale: 1.5 });
          const offCanvas = document.createElement('canvas');
          offCanvas.width = viewport.width;
          offCanvas.height = viewport.height;
          const canvasContext = offCanvas.getContext('2d');
          if (!canvasContext) return;

          await (page as any).render({ canvasContext, viewport }).promise;
          setPdfTextureUrl(offCanvas.toDataURL('image/png'));
          lastCapturedPage.current = currentPageNum;
        } catch (e) {
          console.warn('Could not capture PDF texture:', e);
        }
      })();
    }, 500); // small delay to ensure pdf.js has rendered
    return () => clearTimeout(timer);
  }, [pdfFile, currentPageNum]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') setPdfFile(f);
  };

  // Text extraction → auto-scale detection
  const handleTextExtracted = useCallback((text: string, pageNum: number) => {
    const detected = detectScaleFromText(text);
    if (detected) {
      setDetectedScale(detected);
      setCurrentPageNum(pageNum);
      setShowScalePopup(true);
    }
  }, [setShowScalePopup]);

  const handleAcceptScale = useCallback(() => {
    if (detectedScale) {
      const cal = detectedToCalibration(detectedScale);
      setScale(cal);
      setScaleForPage(currentPageNum, cal);
    }
    setShowScalePopup(false);
    setDetectedScale(null);
  }, [detectedScale, currentPageNum, setScale, setScaleForPage, setShowScalePopup]);

  const handleManualScale = useCallback(() => {
    setShowScalePopup(false);
    setDetectedScale(null);
    setShowCalModal(true);
  }, [setShowScalePopup]);

  // Install automation API for browser/AI drivers
  useEffect(() => {
    installMeasurexAPI();
  }, []);

  // Save project
  const handleSave = useCallback(async () => {
    const state: ProjectState = {
      classifications: useStore.getState().classifications,
      polygons: useStore.getState().polygons,
      scale: useStore.getState().scale,
      scales: useStore.getState().scales,
      currentPage: currentPageNum,
      totalPages: pdfViewerRef.current?.pageDimensions?.height ? 0 : 0, // TODO: wire actual totalPages
    };

    setSaving(true);
    try {
      if (!projectId) {
        const name = prompt('Project name:');
        if (!name) { setSaving(false); return; }
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, state }),
        });
        if (!res.ok) throw new Error(`Create failed (${res.status})`);
        const data = await res.json();
        setProjectId(data.project.id);
        setProjectName(name);
        window.history.replaceState({}, '', `/?project=${data.project.id}`);
        setSaveStatus('Saved!');
      } else {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state }),
        });
        if (!res.ok) throw new Error(`Update failed (${res.status})`);
        setSaveStatus('Saved!');
      }
    } catch (err: any) {
      console.error(err);
      setSaveStatus(`Error: ${err.message || 'Save failed'}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [projectId, currentPageNum]);

  const handleExport = useCallback(() => {
    downloadExcel(classifications, polygons, scale, scales);
  }, [classifications, polygons, scale, scales]);

  // AI Takeoff flow
  const handleAITakeoff = useCallback(async () => {
    const pageCanvas = pdfViewerRef.current?.getPageCanvas?.();
    if (!pageCanvas) return;
    setAiLoading(true);
    setAiStatus('Capturing blueprint...');
    try {
      const imageBase64 = capturePageScreenshot(pageCanvas);
      const dims = pdfViewerRef.current?.pageDimensions || { width: pageCanvas.width, height: pageCanvas.height };
      setAiStatus('AI analyzing blueprint... (10-30 seconds)');
      const elements: DetectedElement[] = await triggerAITakeoff(imageBase64, useStore.getState().scale, dims.width, dims.height);
      setAiStatus(`Found ${elements.length} elements. Loading...`);
      const stats = loadAIResults(elements, {
        addClassification: useStore.getState().addClassification,
        addPolygon: useStore.getState().addPolygon,
        classifications: useStore.getState().classifications,
        scale: useStore.getState().scale,
        currentPage: useStore.getState().currentPage,
        getState: () => {
          const s = useStore.getState();
          return {
            classifications: s.classifications,
            scale: s.scale,
            currentPage: s.currentPage,
          };
        },
      });
      setAiStatus(`Done! ${stats.areas} rooms, ${stats.lines} walls, ${stats.counts} fixtures`);
      setTimeout(() => setAiStatus(null), 5000);
    } catch (err: any) {
      console.error(err);
      setAiStatus(`Error: ${err.message || 'AI failed'}`);
      setTimeout(() => setAiStatus(null), 7000);
    } finally {
      setAiLoading(false);
    }
  }, []);

  const isMobile = useIsMobile();
  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0a0f] text-white">
      <TopNavBar onAITakeoff={handleAITakeoff} aiLoading={aiLoading} onExport={handleExport} onSave={handleSave} saving={saving} projectName={projectName || undefined} />
      <div className={show3D ? "flex-1 min-h-0" : "hidden"}>
        <ThreeDScene className="h-full w-full" walls={threeData.walls} areas={threeData.areas} labels={threeData.labels} pdfTextureUrl={pdfTextureUrl} />
      </div>
      <div className={show3D ? "hidden" : "flex flex-1 min-h-0 flex-col lg:flex-row"}>
          {/* Left toolbar: vertical on desktop, bottom bar on mobile */}
          <div className="hidden lg:block"><LeftToolbar /></div>
          {/* Main content */}
          <div className="flex flex-col flex-1 min-h-0 order-1">
            <div className="flex flex-1 min-h-0 relative">
              {!pdfFile ? (
                <div className="flex-1 flex items-center justify-center p-4" role="region" aria-describedby="upload-help"
                     onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                     onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f && f.type==='application/pdf') setPdfFile(f); }}>
                  <label className="cursor-pointer bg-white border-2 border-dashed border-neutral-300 rounded-xl p-8 md:p-12 hover:border-blue-400 transition-colors text-center w-full max-w-xl">
                    <div className="flex items-center justify-center mb-3"><FileIcon className="text-neutral-400" size={40} /></div>
                    <div className="text-lg font-medium text-neutral-700">Upload Blueprint PDF</div>
                    <div id="upload-help" className="text-sm text-neutral-400 mt-1">Click to select or drag & drop</div>
                    <input type="file" accept=".pdf" onChange={onFileChange} className="hidden" />
                  </label>
                </div>
              ) : (
                <>
                  <PDFViewer ref={pdfViewerRef} file={pdfFile} onTextExtracted={handleTextExtracted} onPageChange={(page) => setCurrentPageNum(page)} />
                  <CanvasOverlay />
                  {currentTool === 'draw' && <DrawingTool />}
                  {(currentTool === 'merge' || currentTool === 'split') && <MergeSplitTool />}
                  {currentTool === 'measure' && <MeasurementTool />}
                </>
              )}
            </div>
            <BottomStatusBar onScaleClick={() => setShowCalModal(true)} />
          </div>
          {/* QuantitiesPanel: component handles its own mobile (drawer) vs desktop (sidebar) layout */}
          <QuantitiesPanel />
        </div>
      {/* Mobile bottom toolbar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 border-t">
        <LeftToolbar />
      </div>
      {/* Mobile quantities drawer toggle (simple placeholder tab) */}
      {/* A7 to wire real drawer: using store.showQuantitiesDrawer */}

      {showScalePopup && detectedScale && (
        <ScalePopup detectedScaleText={detectedScale.scale.label} onAccept={handleAcceptScale} onManual={handleManualScale} />
      )}

      {showCalModal && <ScaleCalibration />}

      {aiLoading && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-8 shadow-2xl text-center max-w-md">
            <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <div className="text-lg font-semibold text-neutral-800">AI Takeoff in Progress</div>
            <div className="text-sm text-neutral-500 mt-2">{aiStatus}</div>
          </div>
        </div>
      )}

      {saveStatus && (
        <div className="fixed top-14 right-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
          {saveStatus}
        </div>
      )}

      {!aiLoading && aiStatus && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-lg text-sm font-medium">
          {aiStatus}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-[#1a1a2e] text-white">Loading...</div>}>
      <PageInner />
    </Suspense>
  );
}
