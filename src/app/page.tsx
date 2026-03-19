'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { File as FileIcon, GitCompare } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { useStore } from '@/lib/store';
import type { DetectedElement, PDFViewerHandle, ProjectState } from '@/lib/types';
import { detectScaleFromText, detectedToCalibration, DetectedScale } from '@/lib/auto-scale';
import { extractSheetName } from '@/lib/sheet-namer';
import { capturePageScreenshot, triggerAITakeoff } from '@/lib/ai-takeoff';
import { useIsMobile } from '@/lib/utils';
import { loadAIResults } from '@/lib/ai-results-loader';
import { downloadExcel } from '@/lib/export';
import { convertTakeoffTo3D } from '@/lib/takeoff-to-3d';
import { installMeasurexAPI } from '@/lib/measurex-api';

import { connectToProject, disconnectFromProject } from '@/lib/ws-client';
import * as api from '@/lib/api-client';
import AIActivityLog from '@/components/AIActivityLog';
import AutoScalePopup from '@/components/AutoScalePopup';
import TopNavBar from '@/components/TopNavBar';
import LeftToolbar from '@/components/LeftToolbar';
import PDFViewer from '@/components/PDFViewer';
import CanvasOverlay from '@/components/CanvasOverlay';
import type { PolygonContextMenuPayload } from '@/components/CanvasOverlay';
import ContextMenu from '@/components/ContextMenu';
import PolygonProperties from '@/components/PolygonProperties';
import BottomStatusBar from '@/components/BottomStatusBar';
import QuantitiesPanel from '@/components/QuantitiesPanel';
import MeasurementTool from '@/components/MeasurementTool';
import DrawingTool from '@/components/DrawingTool';
import MergeSplitTool from '@/components/MergeSplitTool';
import CutTool from '@/components/CutTool';
import ScalePopup from '@/components/ScalePopup';
import ScaleCalibration from '@/components/ScaleCalibration';
import ThreeDScene from '@/components/ThreeDScene';
import TogalChat from '@/components/TogalChat';
import AIImageSearch from '@/components/AIImageSearch';
import PageThumbnailSidebar from '@/components/PageThumbnailSidebar';
import { ToastProvider, useToast } from '@/components/Toast';

const toolKeys: Record<string, 'select' | 'pan' | 'draw' | 'merge' | 'split' | 'cut' | 'measure' | 'ai'> = {
  v: 'select',
  h: 'pan',
  d: 'draw',
  g: 'merge',
  s: 'split',
  c: 'cut',
  m: 'measure',
  a: 'ai',
};

const EMPTY_STATE: ProjectState = {
  classifications: [],
  polygons: [],
  scale: null,
  scales: {},
  currentPage: 1,
  totalPages: 1,
};

function normalizeProjectState(raw: unknown): ProjectState {
  const candidate = (raw && typeof raw === 'object') ? (raw as Partial<ProjectState>) : {};

  const rawClassifications = Array.isArray(candidate.classifications) ? candidate.classifications : [];
  const rawPolygons = Array.isArray(candidate.polygons) ? candidate.polygons : [];

  // Dedup by ID to guard against any merge/hydration artifacts
  const seenClassIds = new Set<string>();
  const classifications = rawClassifications.filter((c: any) => {
    if (!c?.id || seenClassIds.has(c.id)) return false;
    seenClassIds.add(c.id);
    return true;
  });

  const seenPolyIds = new Set<string>();
  const polygons = rawPolygons.filter((p: any) => {
    if (!p?.id || seenPolyIds.has(p.id)) return false;
    seenPolyIds.add(p.id);
    return true;
  });

  return {
    classifications,
    polygons,
    scale: candidate.scale ?? null,
    scales: (candidate.scales && typeof candidate.scales === 'object') ? candidate.scales : {},
    currentPage: typeof candidate.currentPage === 'number' && candidate.currentPage > 0 ? candidate.currentPage : 1,
    totalPages: typeof candidate.totalPages === 'number' && candidate.totalPages > 0 ? candidate.totalPages : 1,
  };
}

function PageInner() {
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
  // showScalePopup removed — GAP-006: AutoScalePopup is the sole confirmation
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const setSheetName = useStore((s) => s.setSheetName);

  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const scales = useStore((s) => s.scales);
  const totalPages = useStore((s) => s.totalPages);
  const currentPage = useStore((s) => s.currentPage);
  const sheetNames = useStore((s) => s.sheetNames);

  const { addToast } = useToast();



  const show3D = useStore((s) => s.show3D);
  const toggleShow3D = useStore((s) => s.toggleShow3D);
  const threeData = React.useMemo(() => convertTakeoffTo3D(polygons, classifications), [polygons, classifications]);

  const pdfViewerRef = useRef<PDFViewerHandle>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);

  // Track known polygon/classification IDs so we only POST truly new items.
  // Initialize from the Zustand-persisted store state so that items rehydrated
  // from localStorage are never treated as "new" by the sync effects.
  const knownPolygonIds = useRef<Set<string>>(
    new Set(useStore.getState().polygons.map((p) => p.id))
  );
  const knownClassificationIds = useRef<Set<string>>(
    new Set(useStore.getState().classifications.map((c) => c.id))
  );
  const [pdfDocState, setPdfDocState] = useState<PDFDocumentProxy | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [showCalModal, setShowCalModal] = useState(false);
  const [detectedScale, setDetectedScale] = useState<DetectedScale | null>(null);
  const [pdfTextureUrl, setPdfTextureUrl] = useState<string | null>(null);

  // Context menu + properties panel state
  const [menuState, setMenuState] = useState<{ polygonId: string; x: number; y: number } | null>(null);
  const [showProperties, setShowProperties] = useState(false);

  // Auto-scale popup state (GAP-006)
  const [showAutoScalePopup, setShowAutoScalePopup] = useState(false);
  const [detectedScaleInfo, setDetectedScaleInfo] = useState<{ scale: string; confidence: number } | null>(null);

  // Chat & Image Search panel state
  const [showChat, setShowChat] = useState(false);
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  // AI takeoff UI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  // BUG-R6-002: Track whether the PDF viewer has reported its actual page count.
  // The store initializes totalPages to 1; we must not show "Page 1 of 1" until
  // PDFViewer fires onPageChange. Reset to false whenever a new PDF is loaded.
  const [pdfPageCountReady, setPdfPageCountReady] = useState(false);

  // BUG-R5-002: Track whether the auto-fetched PDF is loading during hydration.
  const [pdfFetching, setPdfFetching] = useState(false);

  // Project state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  // Show the full viewer layout (sidebars, panels, overlays) when a project has data,
  // even if pdfFile is null (PDF isn't stored server-side, user needs to re-upload).
  const hasProjectData = Boolean(projectId || classifications.length > 0 || polygons.length > 0);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const hydrateAbortRef = useRef<AbortController | null>(null);
  const isCreatingProjectRef = useRef(false);

  const persistSaveStatus = useCallback((text: string, clearMs = 2200) => {
    setSaveStatus(text);
    if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
    saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus(null), clearMs);
  }, []);

  const buildStatePayload = useCallback((pageOverride?: number): ProjectState => {
    const s = useStore.getState();
    return {
      classifications: s.classifications,
      polygons: s.polygons,
      scale: s.scale,
      scales: s.scales,
      currentPage: pageOverride ?? s.currentPage,
      totalPages: s.totalPages || 1,
    };
  }, []);

  const flushSave = useCallback(async (showToast: boolean) => {
    if (!projectId) return;

    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    isSavingRef.current = true;
    setSaving(true);

    try {
      const payload = buildStatePayload(currentPageNum);
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: payload }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);

      if (showToast) persistSaveStatus('Saved!');
      else persistSaveStatus('Auto-saved', 1200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      persistSaveStatus(`Error: ${message}`, 3500);
    } finally {
      isSavingRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void flushSave(false);
      }
    }
  }, [projectId, buildStatePayload, currentPageNum, persistSaveStatus]);

  const requestAutoSave = useCallback(() => {
    if (!projectId) return;
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      void flushSave(false);
    }, 1200);
  }, [projectId, flushSave]);

  const closeContextMenu = useCallback(() => setMenuState(null), []);

  const clampContextMenuPosition = useCallback((x: number, y: number) => {
    const menuWidth = 240;
    const menuHeight = 320;
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    return {
      x: Math.max(pad, Math.min(x, vw - menuWidth - pad)),
      y: Math.max(pad, Math.min(y, vh - menuHeight - pad)),
    };
  }, []);

  const handlePolygonContextMenu = useCallback((payload: PolygonContextMenuPayload) => {
    const clamped = clampContextMenuPosition(payload.x, payload.y);
    setMenuState({ polygonId: payload.polygonId, x: clamped.x, y: clamped.y });
  }, [clampContextMenuPosition]);

  // Hydrate project from API — tries full project endpoint, falls back to granular endpoints
  const hydrateProject = useCallback(async (pid: string) => {
    // Cancel any in-flight hydration to prevent stale data from overwriting newer requests
    hydrateAbortRef.current?.abort();
    const controller = new AbortController();
    hydrateAbortRef.current = controller;

    try {
      // Try full project endpoint first (returns all state in one call)
      const res = await fetch(`/api/projects/${pid}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.ok) {
        const data = await res.json();
        if (controller.signal.aborted) return;
        const normalized = normalizeProjectState(data?.project?.state ?? EMPTY_STATE);

        // Populate known IDs BEFORE hydrating so the sync effects never see
        // API-loaded data as "new" and try to re-POST it (which would 500 on Supabase PK conflict).
        knownPolygonIds.current = new Set(normalized.polygons.map((p) => p.id));
        knownClassificationIds.current = new Set(normalized.classifications.map((c) => c.id));

        useStore.getState().hydrateState(normalized);
        setCurrentPageNum(normalized.currentPage || 1);
        setCurrentPage(normalized.currentPage || 1, normalized.totalPages || 1);
        setProjectId(data.project.id);
        setProjectName(data.project.name || 'Untitled');
        localStorage.setItem('measurex_project_id', data.project.id);

        // Auto-fetch stored PDF so the viewer loads without re-upload (BUG-R5-002)
        setPdfFetching(true);
        fetch(`/api/projects/${pid}/pdf`, { signal: controller.signal })
          .then(async (pdfRes) => {
            if (controller.signal.aborted) return;
            if (!pdfRes.ok) return;
            const blob = await pdfRes.blob();
            if (controller.signal.aborted) return;
            const file = new File([blob], `${data.project.name || pid}.pdf`, { type: 'application/pdf' });
            // BUG-R6-002: Reset page count ready flag before setting new PDF file
            setPdfPageCountReady(false);
            setPdfFile(file);
          })
          .catch(() => null) // non-fatal — user can still upload manually
          .finally(() => {
            if (!controller.signal.aborted) setPdfFetching(false);
          });

        return;
      }

      // Fallback: hydrate from granular endpoints
      const [classRes, polyRes, scaleRes] = await Promise.all([
        fetch(`/api/projects/${pid}/classifications`, { signal: controller.signal }).catch(() => null),
        fetch(`/api/projects/${pid}/polygons`, { signal: controller.signal }).catch(() => null),
        fetch(`/api/projects/${pid}/scale`, { signal: controller.signal }).catch(() => null),
      ]);
      if (controller.signal.aborted) return;

      const classData = classRes?.ok ? await classRes.json() : {};
      const polyData = polyRes?.ok ? await polyRes.json() : {};
      const scaleData = scaleRes?.ok ? await scaleRes.json() : {};
      if (controller.signal.aborted) return;

      const fetchedClassifications = Array.isArray(classData.classifications) ? classData.classifications : [];
      const fetchedPolygons = Array.isArray(polyData.polygons) ? polyData.polygons : [];
      const fetchedScale = scaleData.scale ?? null;

      const normalized = normalizeProjectState({
        classifications: fetchedClassifications,
        polygons: fetchedPolygons,
        scale: fetchedScale,
        scales: {},
        currentPage: 1,
        totalPages: 1,
      });
      knownPolygonIds.current = new Set(normalized.polygons.map((p) => p.id));
      knownClassificationIds.current = new Set(normalized.classifications.map((c) => c.id));
      useStore.getState().hydrateState(normalized);
      setCurrentPageNum(normalized.currentPage || 1);
      setCurrentPage(normalized.currentPage || 1, normalized.totalPages || 1);
      setProjectId(pid);
      setProjectName('Untitled');
      localStorage.setItem('measurex_project_id', pid);
    } catch (err) {
      // Ignore AbortError — it means a newer hydration superseded this one
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('Hydration failed:', err);
    }
  }, [setCurrentPage]);

  // Load project by URL param or localStorage on mount
  useEffect(() => {
    const pid = search.get('project') || localStorage.getItem('measurex_project_id');
    if (!pid) return;
    hydrateProject(pid);
  }, [search, hydrateProject]);

  // Connect SSE when project is loaded
  useEffect(() => {
    if (!projectId) return;
    connectToProject(projectId);
    return () => disconnectFromProject();
  }, [projectId]);

  // Sync projectId into Zustand store so sub-components (e.g. AssembliesPanel) can access it
  const storeSetProjectId = useStore((s) => s.setProjectId);
  useEffect(() => {
    storeSetProjectId(projectId);
  }, [projectId, storeSetProjectId]);

  // Global close behavior for context menu
  useEffect(() => {
    if (!menuState) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuState, closeContextMenu]);

  // Keyboard shortcuts (ignore when focused in inputs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement as HTMLElement)?.isContentEditable;
      if (isEditable) return;

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
        closeContextMenu();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPolygon) {
          deletePolygon(selectedPolygon);
          if (projectId) {
            api.deletePolygon(projectId, selectedPolygon).catch((err) => console.error('API deletePolygon failed:', err));
          }
        }
      } else if (e.key === '3') {
        toggleShow3D();
      } else if (e.key.toLowerCase() === 'a') {
        handleAITakeoff();
      } else if (toolKeys[e.key.toLowerCase() as keyof typeof toolKeys]) {
        setTool(toolKeys[e.key.toLowerCase() as keyof typeof toolKeys]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [redo, undo, setTool, setSelectedPolygon, setSelectedClassification, deletePolygon, selectedPolygon, toggleShow3D, closeContextMenu]);

  // Store a PDF doc reference for texture rendering.
  useEffect(() => {
    if (!pdfFile) {
      pdfDocRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        const arrayBuffer = await pdfFile.arrayBuffer();
        const doc: PDFDocumentProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setPdfDocState(doc);
      } catch (e) {
        console.warn('Could not load PDF document for 3D texture capture:', e);
      }
    })();
    return () => {
      cancelled = true;
      pdfDocRef.current = null;
      setPdfDocState(null);
    };
  }, [pdfFile]);

  // Capture PDF texture whenever page renders or changes (so it's ready for 3D)
  useEffect(() => {
    if (!pdfFile) return;
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

          await page.render({ canvas: offCanvas as HTMLCanvasElement, canvasContext, viewport } as Parameters<typeof page.render>[0]).promise;
          setPdfTextureUrl(offCanvas.toDataURL('image/png'));
        } catch (e) {
          console.warn('Could not capture PDF texture:', e);
        }
      })();
    }, 500);
    return () => clearTimeout(timer);
  }, [pdfFile, currentPageNum]);

  // Autosave on state changes (project loaded)
  const autosaveFingerprint = useMemo(() => JSON.stringify({
    projectId,
    classifications,
    polygons,
    scale,
    scales,
    currentPage,
    totalPages,
  }), [projectId, classifications, polygons, scale, scales, currentPage, totalPages]);

  useEffect(() => {
    if (!projectId) return;
    requestAutoSave();
  }, [autosaveFingerprint, projectId, requestAutoSave]);

  // Sync new polygons to API individually
  useEffect(() => {
    if (!projectId) return;
    const newPolygons = polygons.filter((p) => !knownPolygonIds.current.has(p.id));
    for (const p of newPolygons) {
      knownPolygonIds.current.add(p.id);
      api.createPolygon(projectId, p).catch((err) => console.error('API createPolygon failed:', err));
    }
    // Prune deleted IDs from tracking set
    const currentIds = new Set(polygons.map((p) => p.id));
    for (const id of knownPolygonIds.current) {
      if (!currentIds.has(id)) knownPolygonIds.current.delete(id);
    }
  }, [projectId, polygons]);

  // Sync new classifications to API individually
  useEffect(() => {
    if (!projectId) return;
    const newClassifications = classifications.filter((c) => !knownClassificationIds.current.has(c.id));
    for (const c of newClassifications) {
      knownClassificationIds.current.add(c.id);
      api.createClassification(projectId, c).catch((err) => console.error('API createClassification failed:', err));
    }
    // Prune deleted IDs from tracking set
    const currentIds = new Set(classifications.map((c) => c.id));
    for (const id of knownClassificationIds.current) {
      if (!currentIds.has(id)) knownClassificationIds.current.delete(id);
    }
  }, [projectId, classifications]);

  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
    };
  }, []);

  // Auto-create a project when a PDF is loaded and no project exists yet
  // GAP-006: State for server-detected scale banner (from upload response)
  const [uploadDetectedScale, setUploadDetectedScale] = useState<{ pixelsPerUnit: number; unit: string; description: string } | null>(null);

  const ensureProject = useCallback(async (fileName: string, file?: File) => {
    if (projectId) return;
    // Prevent duplicate project creation from rapid uploads
    if (isCreatingProjectRef.current) return;
    isCreatingProjectRef.current = true;
    try {
      // Reset known IDs and hydrate empty state for a fresh project.
      // Preserve totalPages if the PDF has already reported it (PDFViewer fires
      // onPageChange before ensureProject completes, so the store may already
      // hold the correct count — don't clobber it back to 1).
      const preservedTotalPages = useStore.getState().totalPages;
      knownPolygonIds.current = new Set();
      knownClassificationIds.current = new Set();
      useStore.getState().hydrateState({
        ...EMPTY_STATE,
        totalPages: preservedTotalPages > 1 ? preservedTotalPages : 1,
      });

      const name = fileName.replace(/\.pdf$/i, '') || 'Untitled';
      const project = await api.createProject(name);
      setProjectId(project.id);
      setProjectName(project.name || name);
      localStorage.setItem('measurex_project_id', project.id);
      window.history.replaceState({}, '', `/?project=${project.id}`);

      // GAP-006: Upload PDF to server and check for auto-detected scale
      if (file) {
        try {
          const uploadResult = await api.uploadPDF(project.id, file);
          if (uploadResult.detectedScale) {
            setUploadDetectedScale(uploadResult.detectedScale);
          }
        } catch (uploadErr) {
          console.error('PDF upload failed:', uploadErr);
        }
      }
    } catch (err) {
      console.error('Failed to auto-create project:', err);
    } finally {
      isCreatingProjectRef.current = false;
    }
  }, [projectId]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') {
      // BUG-R6-002: Reset page count ready flag so TopNavBar shows loading state
      // until PDFViewer fires onPageChange with the real total.
      setPdfPageCountReady(false);
      setPdfFile(f);
      void ensureProject(f.name, f);
    }
  };

  // Text extraction → auto-scale detection + sheet naming
  // Stable callback — memoized so PDFViewer's goToPage dep array doesn't churn
  // BUG-R5-001: PDFViewer is the authoritative source for totalPages.
  // Always push the PDF-reported total into the store so it overrides any
  // stale value left by API hydration or EMPTY_STATE initialization.
  // BUG-R6-002: Mark the page count as ready once PDFViewer reports it so we
  // don't show a misleading "Page 1 of 1" before the PDF has loaded.
  const handlePDFPageChange = useCallback((page: number, total: number) => {
    setCurrentPageNum(page);
    setCurrentPage(page, total);
    setPdfPageCountReady(true);
  }, [setCurrentPage]);

  const handleTextExtracted = useCallback((text: string, pageNum: number) => {
    // QA-006 / QA-007: Image-only PDFs (no text layer) produce empty text.
    // Skip auto-scale detection silently — no popup, no error.
    // Sheet naming falls back to "Page N" in BottomStatusBar when no name is stored.
    if (!text?.trim()) return;

    // QA-007: Extract sheet name from PDF text (e.g. page codes like A1.00, FLOOR PLAN, etc.)
    const sheetName = extractSheetName(text);
    if (sheetName) {
      setSheetName(pageNum, sheetName);
    }

    // QA-006: Detect scale from text — only reached when text is non-empty
    const detected = detectScaleFromText(text);
    if (detected) {
      setDetectedScale(detected);
      setCurrentPageNum(pageNum);
      setCurrentPage(pageNum, useStore.getState().totalPages);

      // GAP-006: Show AutoScalePopup as the sole confirmation dialog.
      // Scale is NOT applied until user explicitly accepts.
      const hidden = typeof window !== 'undefined' && localStorage.getItem('measurex_hide_scale_popup') === 'true';
      if (!hidden) {
        setDetectedScaleInfo({ scale: detected.scale.label, confidence: detected.confidence });
        setShowAutoScalePopup(true);
      }
    }
  }, [setCurrentPage, setSheetName]);

  const handleAcceptScale = useCallback(() => {
    if (detectedScale) {
      const cal = detectedToCalibration(detectedScale);
      setScale(cal);
      setScaleForPage(currentPageNum, cal);
    }
    setDetectedScale(null);
  }, [detectedScale, currentPageNum, setScale, setScaleForPage]);

  // Install automation API for browser/AI drivers
  useEffect(() => {
    installMeasurexAPI();
  }, []);

  // Manual save
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (!projectId) {
        const name = prompt('Project name:');
        if (!name) {
          setSaving(false);
          return;
        }

        const payload = buildStatePayload(currentPageNum);
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, state: payload }),
        });

        if (!res.ok) throw new Error(`Create failed (${res.status})`);

        const data = await res.json();
        const normalized = normalizeProjectState(data?.project?.state ?? payload);
        useStore.getState().hydrateState(normalized);
        setCurrentPageNum(normalized.currentPage || 1);
        setCurrentPage(normalized.currentPage || 1, normalized.totalPages || 1);

        setProjectId(data.project.id);
        setProjectName(data.project.name || name);
        localStorage.setItem('measurex_project_id', data.project.id);
        window.history.replaceState({}, '', `/?project=${data.project.id}`);
        persistSaveStatus('Saved!');
        addToast('Project saved', 'success');
      } else {
        await flushSave(true);
        addToast('Project saved', 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      persistSaveStatus(`Error: ${message}`, 3500);
      addToast('Failed to save project', 'error');
    } finally {
      setSaving(false);
    }
  }, [projectId, currentPageNum, buildStatePayload, setCurrentPage, persistSaveStatus, flushSave, addToast]);

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
    } catch (error) {
      console.error(error);
      setAiStatus(`Error: ${error instanceof Error ? error.message : 'AI failed'}`);
      setTimeout(() => setAiStatus(null), 7000);
    } finally {
      setAiLoading(false);
    }
  }, []);

  useIsMobile();

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0a0f] text-white" onClick={closeContextMenu}>
      <TopNavBar
        onAITakeoff={handleAITakeoff}
        aiLoading={aiLoading}
        onExport={handleExport}
        onSave={handleSave}
        saving={saving}
        projectName={projectName || undefined}
        onChat={() => setShowChat((v) => !v)}
        onToggleImageSearch={() => setShowImageSearch((v) => !v)}
        onCompare={() => setShowCompare(true)}
        sheetName={sheetNames[currentPageNum] || `Page ${currentPageNum}`}
        pageIndex={pdfFile && pdfPageCountReady ? currentPageNum - 1 : undefined}
        totalPages={pdfFile && pdfPageCountReady ? totalPages : undefined}
        onPrev={() => {
          const prev = Math.max(1, currentPageNum - 1);
          setCurrentPageNum(prev);
          setCurrentPage(prev, totalPages);
          pdfViewerRef.current?.goToPage(prev);
        }}
        onNext={() => {
          const next = Math.min(totalPages, currentPageNum + 1);
          setCurrentPageNum(next);
          setCurrentPage(next, totalPages);
          pdfViewerRef.current?.goToPage(next);
        }}
      />

      <div className={show3D ? 'flex-1 min-h-0' : 'hidden'}>
        <ThreeDScene className="h-full w-full" walls={threeData.walls} areas={threeData.areas} labels={threeData.labels} pdfTextureUrl={pdfTextureUrl} />
      </div>

      <div className={show3D ? 'hidden' : 'flex flex-1 min-h-0 flex-col lg:flex-row'}>
        <div className="hidden lg:block"><LeftToolbar /></div>

        {/* Thumbnail sidebar: show when PDF is loaded OR when project has data (shows page count from store) */}
        {(pdfFile || hasProjectData) && (
          <PageThumbnailSidebar
            totalPages={totalPages}
            currentPage={currentPageNum}
            pdfDoc={pdfDocState}
            onPageSelect={(page) => {
              setCurrentPageNum(page);
              setCurrentPage(page, totalPages);
              pdfViewerRef.current?.goToPage(page);
            }}
          />
        )}

        <div className="flex flex-col flex-1 min-h-0 order-1">
          <div className="flex flex-1 min-h-0 relative" style={{ cursor: currentTool === 'draw' || currentTool === 'measure' ? 'crosshair' : currentTool === 'pan' ? 'grab' : undefined }}>
            {pdfFile ? (
              /* ── PDF loaded — full viewer ── */
              <>
                <PDFViewer
                  ref={pdfViewerRef}
                  file={pdfFile}
                  onTextExtracted={handleTextExtracted}
                  onPageChange={handlePDFPageChange}
                  cursor={
                    currentTool === 'draw' || currentTool === 'measure'
                      ? 'crosshair'
                      : currentTool === 'pan'
                      ? 'grab'
                      : 'default'
                  }
                >
                  {/* All overlay tools live inside the PDF pan/zoom transform so coords align */}
                  <CanvasOverlay
                    onPolygonContextMenu={handlePolygonContextMenu}
                    onCanvasPointerDown={closeContextMenu}
                  />
                  {currentTool === 'draw' && <DrawingTool />}
                  {(currentTool === 'merge' || currentTool === 'split') && <MergeSplitTool />}
                  {currentTool === 'cut' && <CutTool />}
                  {currentTool === 'measure' && <MeasurementTool />}
                </PDFViewer>

                {menuState && (
                  <ContextMenu
                    polygonId={menuState.polygonId}
                    x={menuState.x}
                    y={menuState.y}
                    onClose={closeContextMenu}
                    onOpenProperties={(polygonId) => {
                      setSelectedPolygon(polygonId);
                      setShowProperties(true);
                    }}
                  />
                )}

                {showProperties && (
                  <div className="absolute top-3 right-3 z-40" onClick={(e) => e.stopPropagation()}>
                    <PolygonProperties onClose={() => setShowProperties(false)} />
                  </div>
                )}
              </>
            ) : hasProjectData ? (
              /* ── Project loaded but no PDF file — show spinner or re-upload prompt ── */
              /* BUG-R5-002: show loading spinner while auto-fetching the saved PDF.      */
              /* The viewer shell (sidebars, quantities, scale bar) remains visible.      */
              <div
                className="flex-1 flex items-center justify-center p-4 bg-[#0a0a0f]"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const f = e.dataTransfer.files?.[0];
                  if (f && f.type === 'application/pdf') setPdfFile(f);
                }}
              >
                {pdfFetching ? (
                  /* BUG-R5-002: spinner while auto-fetching saved PDF */
                  <div className="flex flex-col items-center gap-4 text-[rgba(0,212,255,0.7)]">
                    <svg className="animate-spin h-10 w-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span className="text-sm font-medium">Loading PDF…</span>
                  </div>
                ) : (
                  <label className="cursor-pointer border-2 border-dashed border-[rgba(0,212,255,0.4)] rounded-xl p-8 md:p-12 hover:border-[rgba(0,212,255,0.8)] transition-colors text-center w-full max-w-xl bg-[rgba(0,212,255,0.03)]">
                    <div className="flex items-center justify-center mb-3"><FileIcon className="text-[rgba(0,212,255,0.5)]" size={40} /></div>
                    <div className="text-base font-semibold text-[rgba(0,212,255,0.9)] mb-1">
                      {projectName || 'Project loaded'}
                    </div>
                    <div className="text-sm text-zinc-400 mb-3">
                      {classifications.length} classification{classifications.length !== 1 ? 's' : ''} · {polygons.length} polygon{polygons.length !== 1 ? 's' : ''} · {totalPages} page{totalPages !== 1 ? 's' : ''}
                    </div>
                    <div className="text-sm text-zinc-500">Re-upload the PDF to view the blueprint</div>
                    <div className="text-xs text-zinc-600 mt-1">Click to select or drag & drop</div>
                    <input type="file" accept=".pdf" onChange={onFileChange} className="sr-only" />
                  </label>
                )}
              </div>
            ) : (
              /* ── No project, no PDF — fresh upload screen ── */
              <div
                className="flex-1 flex items-center justify-center p-4"
                role="region"
                aria-describedby="upload-help"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const f = e.dataTransfer.files?.[0];
                  if (f && f.type === 'application/pdf') {
                    setPdfFile(f);
                    void ensureProject(f.name, f);
                  }
                }}
              >
                <label className="cursor-pointer bg-white border-2 border-dashed border-neutral-300 rounded-xl p-8 md:p-12 hover:border-blue-400 transition-colors text-center w-full max-w-xl">
                  <div className="flex items-center justify-center mb-3"><FileIcon className="text-neutral-400" size={40} /></div>
                  <div className="text-lg font-medium text-neutral-700">Upload Blueprint PDF</div>
                  <div id="upload-help" className="text-sm text-neutral-400 mt-1">Click to select or drag & drop</div>
                  <input type="file" accept=".pdf" onChange={onFileChange} className="sr-only" />
                </label>
              </div>
            )}
          </div>

          <BottomStatusBar onScaleClick={() => setShowCalModal(true)} />
        </div>

        <QuantitiesPanel />
      </div>

      {/* Mobile/Tablet bottom toolbar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0f]/95 backdrop-blur-sm border-t border-[rgba(0,212,255,0.2)]">
        <LeftToolbar />
      </div>

      {/* GAP-006: Single confirmation dialog before applying detected scale */}
      {showAutoScalePopup && detectedScaleInfo && (
        <AutoScalePopup
          detectedScale={detectedScaleInfo.scale}
          confidence={detectedScaleInfo.confidence}
          onDismiss={() => setShowAutoScalePopup(false)}
          onDontShowAgain={() => {
            localStorage.setItem('measurex_hide_scale_popup', 'true');
            setShowAutoScalePopup(false);
          }}
          onAccept={() => {
            handleAcceptScale();
            setShowAutoScalePopup(false);
          }}
        />
      )}

      {showCalModal && <ScaleCalibration onClose={() => setShowCalModal(false)} />}

      {aiLoading && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-8 shadow-2xl text-center max-w-md w-full max-h-[90vh] overflow-y-auto">
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

      {/* AI Activity Log — bottom-left corner */}
      {projectId && (
        <div className="fixed bottom-16 left-2 z-30 hidden lg:block">
          <AIActivityLog />
        </div>
      )}

      {showChat && <TogalChat onClose={() => setShowChat(false)} />}
      {showImageSearch && <AIImageSearch onClose={() => setShowImageSearch(false)} />}

      {/* Compare modal stub */}
      {showCompare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCompare(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <GitCompare size={40} className="text-[#00d4ff] mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">Compare Projects</h2>
            <p className="text-sm text-gray-400 mb-6">Select two projects to compare takeoff quantities side-by-side.</p>
            <button
              onClick={() => setShowCompare(false)}
              className="bg-[rgba(0,212,255,0.15)] border border-[rgba(0,212,255,0.4)] text-[#00d4ff] px-5 py-2 rounded-lg font-medium text-sm hover:bg-[rgba(0,212,255,0.25)] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ToastProvider>
      <Suspense fallback={<div className="flex items-center justify-center h-screen bg-[#1a1a2e] text-white">Loading...</div>}>
        <PageInner />
      </Suspense>
    </ToastProvider>
  );
}
