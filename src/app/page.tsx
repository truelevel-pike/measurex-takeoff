'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { File as FileIcon, Layers3 } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { useStore } from '@/lib/store';
import type { Classification, DetectedElement, PDFViewerHandle, Polygon, ProjectState } from '@/lib/types';
import { detectScaleFromText, detectedToCalibration, isNotToScale, DetectedScale } from '@/lib/auto-scale';
import { extractSheetName } from '@/lib/sheet-namer';
import { capturePageScreenshot, triggerAITakeoff } from '@/lib/ai-takeoff';
import { useIsMobile } from '@/lib/utils';
// downloadExcel dynamically imported to avoid bundling XLSX (~300KB) at load time
import { convertTakeoffTo3D } from '@/lib/takeoff-to-3d';
import { installMeasurexAPI } from '@/lib/measurex-api';
import { loadAiSettings } from '@/lib/ai-settings';

import { connectToProject, disconnectFromProject, subscribeToActivity } from '@/lib/ws-client';
import * as api from '@/lib/api-client';
import AIActivityLog from '@/components/AIActivityLog';
import AutoScalePopup from '@/components/AutoScalePopup';
import TopNavBar from '@/components/TopNavBar';
import LeftToolbar from '@/components/LeftToolbar';
import MobileToolbar from '@/components/MobileToolbar';
import PDFViewer from '@/components/PDFViewer';
import CanvasOverlay from '@/components/CanvasOverlay';
import type { PolygonContextMenuPayload } from '@/components/CanvasOverlay';
import ZoomControls from '@/components/ZoomControls';
import ContextMenu from '@/components/ContextMenu';
import PolygonProperties from '@/components/PolygonProperties';
import BottomStatusBar from '@/components/BottomStatusBar';
import ContextToolbar from '@/components/ContextToolbar';
import QuantitiesPanel from '@/components/QuantitiesPanel';
import TextSearchPanel from '@/components/TextSearchPanel';
import MeasurementTool from '@/components/MeasurementTool';
import DrawingTool from '@/components/DrawingTool';
import CoordInputPanel from '@/components/CoordInputPanel';
import AnnotationTool from '@/components/AnnotationTool';
import ScaleCalibrationPanel from '@/components/ScaleCalibrationPanel';
import MergeSplitTool from '@/components/MergeSplitTool';
import CutTool from '@/components/CutTool';
import ScaleCalibration from '@/components/ScaleCalibration';
const ThreeDScene = dynamic(() => import('@/components/ThreeDScene'), { ssr: false });
import MXChat from '@/components/MXChat';
import AIImageSearch from '@/components/AIImageSearch';
import PatternSearch from '@/components/PatternSearch';
import CropOverlay from '@/components/CropOverlay';
import RepeatingGroupTool from '@/components/RepeatingGroupTool';
const ComparePanel = dynamic(() => import('@/components/ComparePanel'), { ssr: false });
const WhatsNewModal = dynamic(() => import('@/components/WhatsNewModal'), { ssr: false });
import { useWhatsNew } from '@/components/WhatsNewModal';
const ExportPanel = dynamic(() => import('@/components/ExportPanel'), { ssr: false });
import PageThumbnailSidebar from '@/components/PageThumbnailSidebar';
import KeyboardShortcutsModal from '@/components/KeyboardShortcutsModal';
import ProjectSettingsPanel from '@/components/ProjectSettingsPanel';
import { ToastProvider, useToast } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import QuickTakeoffMode from '@/components/QuickTakeoffMode';
import ReTogal from '@/components/ReTogal';
import { useQuickTakeoff } from '@/lib/quick-takeoff';
import TakeoffProgressModal from '@/components/TakeoffProgressModal';
import type { PageStatus, TakeoffSummary } from '@/components/TakeoffProgressModal';
import FirstRunTooltips from '@/components/FirstRunTooltips';
import { DEMO_PROJECT_ID, isDemoProject, loadDemoProject, saveDemoProject, DEMO_PROJECT_STATE } from '@/lib/demo-data';

const toolKeys: Record<string, 'select' | 'pan' | 'draw' | 'merge' | 'split' | 'cut' | 'measure' | 'annotate' | 'ai'> = {
  v: 'select',
  h: 'pan',
  d: 'draw',
  g: 'merge',
  s: 'split',
  c: 'cut',
  m: 'measure',
  t: 'annotate',
  a: 'ai',
};
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const MAX_CLASSIFICATIONS = 20;

/**
 * Synonym groups: any word within a group is treated as equivalent to any other.
 * Used during dedup so "Room", "Space", "Area", "Rooms", "Room/Space" all collapse
 * to a single canonical classification (shortest/simplest name wins).
 */
const DEDUP_SYNONYM_GROUPS: string[][] = [
  ['room', 'space', 'area'],
];

/**
 * Return the synonym-group index for a normalized base word, or -1 if none.
 */
function synonymGroupIndex(word: string): number {
  return DEDUP_SYNONYM_GROUPS.findIndex((g) => g.includes(word));
}

/**
 * Given a normalized name (e.g. "room space", "rooms", "spaces"), extract the
 * primary base words (stripping trailing 's' for plurals) and return the first
 * synonym-group index found among them, or -1.
 */
function getSynonymGroup(normalizedName: string): number {
  const words = normalizedName.split(' ').filter((w) => w.length > 1);
  for (const w of words) {
    // Try exact match first, then de-pluralised form
    let idx = synonymGroupIndex(w);
    if (idx === -1 && w.endsWith('s')) idx = synonymGroupIndex(w.slice(0, -1));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Merge all pairs of classifications with similar names regardless of total count.
 * Runs after every AI takeoff to prevent the panel from filling up with near-duplicate
 * entries like "Room", "Room/Space", "Rooms" that the AI generates for the same concept.
 */
function deduplicateSimilarClassifications(
  classifications: Classification[],
  mergeClassificationsFn: (survivorId: string, ids: string[]) => void,
) {
  const normalize = (name: string) =>
    name.trim().toLowerCase().replace(/[\/\-]+/g, ' ').replace(/\s+/g, ' ');
  const splitWords = (name: string) =>
    normalize(name).split(' ').filter((w) => w.length > 2);
  const isSimilar = (a: string, b: string) => {
    const na = normalize(a), nb = normalize(b);
    if (na === nb || na.includes(nb) || nb.includes(na)) return true;
    // Synonym-group check: if both names resolve to the same synonym group they are duplicates
    const ga = getSynonymGroup(na), gb = getSynonymGroup(nb);
    if (ga !== -1 && ga === gb) return true;
    const wa = splitWords(a), wb = splitWords(b);
    if (!wa.length || !wb.length) return false;
    const overlap = wa.filter((w) => wb.includes(w));
    return overlap.length >= Math.min(wa.length, wb.length);
  };

  // Group by type so we only merge within the same measurement type
  const byType = new Map<string, Classification[]>();
  for (const c of classifications) {
    const t = c.type || 'area';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(c);
  }

  for (const group of byType.values()) {
    let remaining = [...group];
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let i = 0; i < remaining.length; i++) {
        for (let j = i + 1; j < remaining.length; j++) {
          if (isSimilar(remaining[i].name, remaining[j].name)) {
            const a = remaining[i];
            const b = remaining[j];
            // Keep the shorter (simpler) name as survivor
            const survivor = a.name.trim().length <= b.name.trim().length ? a : b;
            const loser = survivor === a ? b : a;
            mergeClassificationsFn(survivor.id, [survivor.id, loser.id]);
            remaining = remaining.filter((c) => c.id !== loser.id);
            changed = true;
            break outer;
          }
        }
      }
    }
  }
}

function autoMergeToLimit(
  classifications: Classification[],
  mergeClassificationsFn: (survivorId: string, ids: string[]) => void,
  maxCount = MAX_CLASSIFICATIONS
) {
  if (classifications.length <= maxCount) return;

  const normalize = (name: string) =>
    name.trim().toLowerCase().replace(/[\/\-]+/g, ' ').replace(/\s+/g, ' ');
  const splitWords = (name: string) =>
    normalize(name).split(' ').filter((w) => w.length > 2);
  const isSimilar = (a: string, b: string) => {
    const na = normalize(a), nb = normalize(b);
    if (na === nb || na.includes(nb) || nb.includes(na)) return true;
    const wa = splitWords(a), wb = splitWords(b);
    if (!wa.length || !wb.length) return false;
    const overlap = wa.filter((w) => wb.includes(w));
    return overlap.length >= Math.min(wa.length, wb.length);
  };

  let remaining = [...classifications];

  while (remaining.length > maxCount) {
    let bestI = -1, bestJ = -1;
    for (let i = 0; i < remaining.length && bestI === -1; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        if (isSimilar(remaining[i].name, remaining[j].name)) {
          bestI = i;
          bestJ = j;
          break;
        }
      }
    }

    if (bestI === -1) {
      bestI = remaining.length - 2;
      bestJ = remaining.length - 1;
    }

    const a = remaining[bestI];
    const b = remaining[bestJ];
    const survivor = a.name.length <= b.name.length ? a : b;
    const loser = survivor === a ? b : a;

    mergeClassificationsFn(survivor.id, [survivor.id, loser.id]);
    remaining = remaining.filter((c) => c.id !== loser.id);
  }
}

interface TakeoffSearchResult {
  id: string;
  classificationId: string;
  classificationName: string;
  pageNumber: number;
  polygonCount: number;
  polygonId: string;
}

const EMPTY_STATE: ProjectState = {
  classifications: [],
  polygons: [],
  annotations: [],
  scale: null,
  scales: {},
  currentPage: 1,
  totalPages: 1,
};

function normalizeProjectState(raw: unknown): ProjectState {
  const candidate = (raw && typeof raw === 'object') ? (raw as Partial<ProjectState>) : {};

  const rawClassifications = Array.isArray(candidate.classifications) ? candidate.classifications : [];
  const rawPolygons = Array.isArray(candidate.polygons) ? candidate.polygons : [];
  const rawAnnotations = Array.isArray(candidate.annotations) ? candidate.annotations : [];

  // Dedup by ID to guard against any merge/hydration artifacts
  const seenClassIds = new Set<string>();
  const classifications = rawClassifications.filter((c: { id?: string }) => {
    if (!c?.id || seenClassIds.has(c.id)) return false;
    seenClassIds.add(c.id);
    return true;
  });

  const seenPolyIds = new Set<string>();
  const polygons = rawPolygons.filter((p: { id?: string }) => {
    if (!p?.id || seenPolyIds.has(p.id)) return false;
    seenPolyIds.add(p.id);
    return true;
  });
  const seenAnnotationIds = new Set<string>();
  const annotations = rawAnnotations.filter((a: { id?: string }) => {
    if (!a?.id || seenAnnotationIds.has(a.id)) return false;
    seenAnnotationIds.add(a.id);
    return true;
  });

  return {
    classifications,
    polygons,
    annotations,
    scale: candidate.scale ?? null,
    scales: (candidate.scales && typeof candidate.scales === 'object') ? candidate.scales : {},
    currentPage: typeof candidate.currentPage === 'number' && candidate.currentPage > 0 ? candidate.currentPage : 1,
    totalPages: typeof candidate.totalPages === 'number' && candidate.totalPages > 0 ? candidate.totalPages : 1,
  };
}

/** Renders compare diff polygons as a transparent SVG overlay aligned with the canvas. */
function CompareOverlaySVG({ data }: { data: { added: Polygon[]; removed: Polygon[]; unchanged: Polygon[] } }) {
  const currentPage = useStore((s) => s.currentPage);
  const rawBaseDims = useStore((s) => s.pageBaseDimensions[s.currentPage]);
  const baseDims = rawBaseDims ?? { width: 1, height: 1 };

  const renderPolygons = (polys: Polygon[], fill: string, stroke: string) =>
    polys
      .filter((p) => p.pageNumber === currentPage)
      .map((p) => {
        const pointsStr = p.points.map((pt) => `${pt.x},${pt.y}`).join(' ');
        return (
          <polygon
            key={p.id}
            points={pointsStr}
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        );
      });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 15,
      }}
    >
      <svg
        viewBox={`0 0 ${baseDims.width} ${baseDims.height}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
      >
        {renderPolygons(data.unchanged, 'rgba(156,163,175,0.3)', '#9ca3af')}
        {renderPolygons(data.added, 'rgba(34,197,94,0.3)', '#22c55e')}
        {renderPolygons(data.removed, 'rgba(239,68,68,0.3)', '#ef4444')}
      </svg>
    </div>
  );
}

/** Thin connector component that supplies reactive store state to ContextToolbar. */
function ContextToolbarConnected({
  currentTool,
  polygonsExist,
  onMerge,
  addToast: toast,
}: {
  currentTool: import('@/lib/store').Tool;
  polygonsExist: boolean;
  onMerge: () => void;
  addToast: (msg: string, type: import('@/components/Toast').ToastType) => void;
}) {
  const selectedPolygons = useStore((s) => s.selectedPolygons);
  const snappingEnabled = useStore((s) => s.snappingEnabled);
  const gridEnabled = useStore((s) => s.gridEnabled);
  const setSnapping = useStore((s) => s.setSnapping);
  const setGrid = useStore((s) => s.setGrid);
  const deleteSelectedPolygons = useStore((s) => s.deleteSelectedPolygons);
  const deletePolygon = useStore((s) => s.deletePolygon);
  const addPolygon = useStore((s) => s.addPolygon);

  return (
    <ContextToolbar
      selectedPolygonIds={selectedPolygons}
      currentTool={currentTool}
      snappingEnabled={snappingEnabled}
      gridEnabled={gridEnabled}
      hasPolygons={polygonsExist}
      onCombine={onMerge}
      onMergeLines={onMerge}
      onDeleteSelected={() => {
        const s = useStore.getState();
        if (s.selectedPolygons.length > 0) deleteSelectedPolygons();
        else if (s.selectedPolygon) deletePolygon(s.selectedPolygon);
      }}
      onToggleSnapping={() => setSnapping(!snappingEnabled)}
      onToggleGrid={() => setGrid(!gridEnabled)}
      onDuplicate={() => {
        const s = useStore.getState();
        const id = s.selectedPolygonId ?? s.selectedPolygon;
        const poly = (id && s.polygons.find((p) => p.id === id)) ?? s.lastPolygon;
        if (poly) {
          addPolygon({ points: poly.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })), classificationId: poly.classificationId, pageNumber: poly.pageNumber, area: poly.area, linearFeet: poly.linearFeet, isComplete: true, label: poly.label });
          toast('Polygon duplicated', 'info');
        }
      }}
    />
  );
}

function PageInner() {
  const search = useSearchParams();
  const agentMode = search.get('agent') === '1';

  // ── Reactive state subscriptions (fine-grained selectors — each only re-renders on its own change) ──
  const currentTool = useStore((s) => s.currentTool);
  const isDefiningGroup = useStore((s) => s.isDefiningGroup);
  const selectedPolygon = useStore((s) => s.selectedPolygon);
  const zoomLevel = useStore((s) => s.zoomLevel);
  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const selectedClassificationId = useStore((s) => s.selectedClassification);
  const annotations = useStore((s) => s.annotations);
  const scale = useStore((s) => s.scale);
  const scales = useStore((s) => s.scales);
  const totalPages = useStore((s) => s.totalPages);
  const currentPage = useStore((s) => s.currentPage);
  const pageBaseDimensions = useStore((s) => s.pageBaseDimensions);
  const sheetNames = useStore((s) => s.sheetNames);
  const show3D = useStore((s) => s.show3D);

  // ── Stable action refs (Zustand actions never change identity — read once, skip subscriptions) ──
  // This reduces the subscription count by ~12 and avoids registering listeners that
  // can never trigger a re-render anyway (stable references always pass selector equality).
  const {
    setTool,
    undo,
    redo,
    setSelectedClassification,
    deletePolygon,
    setSelectedPolygon,
    setScale,
    setScaleForPage,
    setZoomLevel,
    setCurrentPage,
    setSheetName,
    setShow3D,
    toggleShow3D,
  } = React.useMemo(() => useStore.getState(), []);

  const { addToast } = useToast();

  const quickTakeoff = useQuickTakeoff();
  const whatsNew = useWhatsNew();
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
  const syncedClassificationsById = useRef<Map<string, Classification>>(
    new Map(useStore.getState().classifications.map((c) => [c.id, c]))
  );
  const [pdfDocState, setPdfDocState] = useState<PDFDocumentProxy | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [showCalModal, setShowCalModal] = useState(false);
  const [showScaleCalibPanel, setShowScaleCalibPanel] = useState(false);
  const [calibrationClicks, setCalibrationClicks] = useState<{x: number, y: number}[]>([]);
  const [detectedScale, setDetectedScale] = useState<DetectedScale | null>(null);
  const [pdfTextureUrl, setPdfTextureUrl] = useState<string | null>(null);

  // Context menu + properties panel state
  const [menuState, setMenuState] = useState<{ polygonId: string; x: number; y: number } | null>(null);
  const [showProperties, setShowProperties] = useState(false);

  // Auto-scale popup state (GAP-006)
  const [showAutoScalePopup, setShowAutoScalePopup] = useState(false);
  // Wave 19B: NTS (Not to Scale) warning state
  const [ntsWarning, setNtsWarning] = useState(false);
  const [detectedScaleInfo, setDetectedScaleInfo] = useState<{ scale: string; confidence: number } | null>(null);

  // Chat & Image Search panel state
  const [showChat, setShowChat] = useState(false);
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [croppedImageBase64, setCroppedImageBase64] = useState<string | null>(null);
  const [showPatternSearch, setShowPatternSearch] = useState(false);
  const [patternSearchPageImage, setPatternSearchPageImage] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [showExport, setShowExport] = useState(false);
  // BUG-W14-001: replace window.prompt with proper modal for project naming
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [showTakeoffSearch, setShowTakeoffSearch] = useState(false);
  const [showTextSearch, setShowTextSearch] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [highlightedPolygonId, setHighlightedPolygonId] = useState<string | null>(null);

  // Compare overlay state
  const [compareOverlay, setCompareOverlay] = useState<{ added: Polygon[]; removed: Polygon[]; unchanged: Polygon[] } | null>(null);

  // AI takeoff UI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiAllPagesMode, setAiAllPagesMode] = useState(false);
  const [aiAllPagesProgress, setAiAllPagesProgress] = useState<{current: number, total: number} | null>(null);
  const [aiPageStatuses, setAiPageStatuses] = useState<PageStatus[]>([]);
  // Wave 15B Bug 4: default to empty string — actual default resolved in useEffect below
  // to avoid SSR/client mismatch and to sync with ai-settings.defaultModel.
  const [aiModel, setAiModel] = useState<string>("");
  const [takeoffSummary, setTakeoffSummary] = useState<TakeoffSummary | null>(null);
  const aiCancelRef = useRef(false);

  // BUG-R6-002: Track whether the PDF viewer has reported its actual page count.
  // The store initializes totalPages to 1; we must not show "Page 1 of 1" until
  // PDFViewer fires onPageChange. Reset to false whenever a new PDF is loaded.
  const [pdfPageCountReady, setPdfPageCountReady] = useState(false);

  // BUG-R5-002: Track whether the auto-fetched PDF is loading during hydration.
  const [pdfFetching, setPdfFetching] = useState(false);
  const [pdfFetchAttemptCompleted, setPdfFetchAttemptCompleted] = useState(false);
  const [quantitiesLoading, setQuantitiesLoading] = useState(true);
  const [projectNotFound, setProjectNotFound] = useState(false);

  // Project state
  const [projectId, setProjectId] = useState<string | null>(null);
  // Pending page text: queued when text is extracted before projectId is set (new upload race).
  // Flushed to server once projectId becomes available.
  const pendingPageTextRef = useRef<Map<number, { text: string; sheetName: string | null }>>(new Map());
  const [projectName, setProjectName] = useState<string | null>(null);
  // Wave 39B: page-1 thumbnail loaded from the project record for PageThumbnailSidebar fallback
  const [projectPage1Thumbnail, setProjectPage1Thumbnail] = useState<string | null>(null);
  // Show the full viewer layout (sidebars, panels, overlays) when a project has data,
  // even if pdfFile is null (PDF isn't stored server-side, user needs to re-upload).
  const hasProjectData = Boolean(projectId || classifications.length > 0 || polygons.length > 0);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  // Wave 12B Bug 1: track last-saved fingerprint to compute isDirty
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const hydrateAbortRef = useRef<AbortController | null>(null);
  const hydrateRequestIdRef = useRef(0);
  const isCreatingProjectRef = useRef(false);
  const thumbnailCapturedRef = useRef(false);
  const hasAppliedPageParam = useRef(false);
  const isMountedRef = useRef(true);
  const pdfAutoRetryAttemptedProjectRef = useRef<string | null>(null);
  // BUG-A8-5-006 fix: re-entry guard for AI takeoff — prevents concurrent
  // requests from rapid keypresses during the brief window before aiLoading state updates.
  const aiTakeoffInFlightRef = useRef(false);

  const reloadProjectPolygonsAndClassifications = useCallback(async (pid: string) => {
    const [classRes, polyRes] = await Promise.all([
      fetch(`/api/projects/${pid}/classifications`).catch(() => null),
      fetch(`/api/projects/${pid}/polygons`).catch(() => null),
    ]);

    if (!classRes?.ok || !polyRes?.ok) {
      throw new Error('Failed to refresh AI takeoff results from server');
    }

    const classData = await classRes.json();
    const polyData = await polyRes.json();
    const fetchedClassifications = Array.isArray(classData.classifications) ? classData.classifications : [];
    const fetchedPolygons = Array.isArray(polyData.polygons) ? polyData.polygons : [];

    knownClassificationIds.current = new Set(fetchedClassifications.map((c: { id: string }) => c.id));
    knownPolygonIds.current = new Set(fetchedPolygons.map((p: { id: string }) => p.id));
    syncedClassificationsById.current = new Map(
      fetchedClassifications.map((c: Classification) => [c.id, c]),
    );

    useStore.setState({
      classifications: fetchedClassifications,
      polygons: fetchedPolygons,
    });
  }, []);

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
      annotations: s.annotations,
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

      // Wave 12B Bug 1: snapshot the fingerprint at save time so isDirty resets
      lastSavedFingerprintRef.current = JSON.stringify({
        projectId,
        classifications: useStore.getState().classifications,
        polygons: useStore.getState().polygons,
        annotations: useStore.getState().annotations,
        scale: useStore.getState().scale,
        scales: useStore.getState().scales,
      });
      // Wave 17B Bug 5: auto-saved shows for 2s (was 1.2s — too fast to read)
      if (showToast) persistSaveStatus('Saved!');
      else persistSaveStatus('Auto-saved', 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      // Don't show error toast for rate limit — silently retry later
      if (message.includes('429')) {
        setTimeout(() => void flushSave(false), 5000);
      } else {
        persistSaveStatus(`Error: ${message}`, 3500);
      }
    } finally {
      isSavingRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void flushSave(false);
      }
    }
  }, [projectId, buildStatePayload, currentPageNum, persistSaveStatus]);

  // Wave 11B: debounce raised to 2000ms — autosave should only fire after the user
  // stops making changes, not on every keystroke or rapid polygon placement.
  // The 2s window batches bursts of polygon creation (agent or manual) into one save.
  const AUTOSAVE_DEBOUNCE_MS = 2000;
  const requestAutoSave = useCallback(() => {
    if (!projectId) return;
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      void flushSave(false);
    }, AUTOSAVE_DEBOUNCE_MS);
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

  const safeGoToPage = useCallback((page: number, source: string) => {
    try {
      pdfViewerRef.current?.goToPage(page);
    } catch (error) {
      console.error(`[page navigation] Failed to go to page ${page} from ${source}:`, error);
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchStoredPdf = useCallback(async (pid: string, fileNameHint?: string) => {
    if (!pid || isDemoProject(pid)) return false;
    if (isMountedRef.current) setPdfFetching(true);

    try {
      const pdfRes = await fetch(`/api/projects/${pid}/pdf`);
      if (!pdfRes.ok) return false;

      const blob = await pdfRes.blob();
      if (!isMountedRef.current) return false;

      const file = new File([blob], `${fileNameHint || pid}.pdf`, { type: 'application/pdf' });
      // BUG-R6-002: Reset page count ready flag before setting new PDF file
      setPdfPageCountReady(false);
      setPdfFile(file);
      return true;
    } catch {
      return false;
    } finally {
      if (isMountedRef.current) {
        setPdfFetching(false);
        setPdfFetchAttemptCompleted(true);
      }
    }
  }, []);

  // Hydrate project from API — tries full project endpoint, falls back to granular endpoints
  const hydrateProject = useCallback(async (pid: string) => {
    const requestId = ++hydrateRequestIdRef.current;
    setQuantitiesLoading(true);
    setPdfFetchAttemptCompleted(false);
    pdfAutoRetryAttemptedProjectRef.current = null;
    // Wave 27B: reset dirty-state tracking so the save button shows clean
    // immediately after loading a project (not dirty until user makes a change).
    lastSavedFingerprintRef.current = null;

    // Demo project: load from localStorage, skip all API calls
    try {
      if (isDemoProject(pid)) {
        saveDemoProject(); // ensure it exists in localStorage
        const demo = loadDemoProject();
        const state = demo?.state ?? DEMO_PROJECT_STATE;
        const normalized = normalizeProjectState(state);
        useStore.getState().hydrateState(normalized);
        setCurrentPageNum(normalized.currentPage || 1);
        setCurrentPage(normalized.currentPage || 1, normalized.totalPages || 1);
        setProjectId(DEMO_PROJECT_ID);
        setProjectName(demo?.meta?.name ?? 'Demo Project');
        localStorage.setItem('measurex_project_id', DEMO_PROJECT_ID);
        return;
      }

      // Cancel any in-flight hydration to prevent stale data from overwriting newer requests
      hydrateAbortRef.current?.abort();
      const controller = new AbortController();
      hydrateAbortRef.current = controller;

      // Try full project endpoint first (returns all state in one call)
      const res = await fetch(`/api/projects/${pid}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.status === 404) {
        // Project does not exist — show a clear error instead of blank canvas
        setProjectNotFound(true);
        localStorage.removeItem('measurex_project_id');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (controller.signal.aborted) return;
        const normalized = normalizeProjectState(data?.project?.state ?? EMPTY_STATE);

        // Populate known IDs BEFORE hydrating so the sync effects never see
        // API-loaded data as "new" and try to re-POST it (which would 500 on Supabase PK conflict).
        knownPolygonIds.current = new Set(normalized.polygons.map((p) => p.id));
        knownClassificationIds.current = new Set(normalized.classifications.map((c) => c.id));
        syncedClassificationsById.current = new Map(normalized.classifications.map((c) => [c.id, c]));

        useStore.getState().hydrateState(normalized);
        setCurrentPageNum(normalized.currentPage || 1);
        setCurrentPage(normalized.currentPage || 1, normalized.totalPages || 1);
        setProjectId(data.project.id);
        setProjectName(data.project.name || 'Untitled');
        // Wave 39B: cache the stored thumbnail for PageThumbnailSidebar page-1 fallback
        if (data.project.thumbnail) setProjectPage1Thumbnail(data.project.thumbnail);
        localStorage.setItem('measurex_project_id', data.project.id);

        // Hydrate server-side sheet names and drawing sets (extracted during upload)
        const serverSheetNames = data?.project?.state?.sheetNames;
        if (serverSheetNames && typeof serverSheetNames === 'object') {
          for (const [page, name] of Object.entries(serverSheetNames)) {
            if (name) setSheetName(Number(page), name as string);
          }
        }
        const serverDrawingSets = data?.project?.state?.drawingSets;
        if (serverDrawingSets && typeof serverDrawingSets === 'object') {
          const { setDrawingSet } = useStore.getState();
          for (const [page, setName] of Object.entries(serverDrawingSets)) {
            if (setName) setDrawingSet(Number(page), setName as string);
          }
        }

        // Auto-fetch stored PDF so the viewer loads without re-upload (BUG-R5-002).
        // Use a dedicated fetch path (not hydration abort signal) so early hydration
        // aborts do not silently leave pdfFile null.
        void fetchStoredPdf(pid, data.project.name || pid);

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
        annotations: [],
        scale: fetchedScale,
        scales: {},
        currentPage: 1,
        totalPages: 1,
      });
      knownPolygonIds.current = new Set(normalized.polygons.map((p) => p.id));
      knownClassificationIds.current = new Set(normalized.classifications.map((c) => c.id));
      syncedClassificationsById.current = new Map(normalized.classifications.map((c) => [c.id, c]));
      useStore.getState().hydrateState(normalized);
      setCurrentPageNum(normalized.currentPage || 1);
      setCurrentPage(normalized.currentPage || 1, normalized.totalPages || 1);
      setProjectId(pid);
      setProjectName('Untitled');
      localStorage.setItem('measurex_project_id', pid);
    } catch (err) {
      // Ignore AbortError — it means a newer hydration superseded this one
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Hydration failed:', err);
    } finally {
      if (hydrateRequestIdRef.current === requestId) {
        setQuantitiesLoading(false);
      }
    }
  }, [setCurrentPage, setSheetName, fetchStoredPdf]);

  // Hydrate aiModel from localStorage on mount (useEffect avoids Next.js SSR hydration mismatch)
  // Wave 15B Bug 4: prefer the canvas-specific "measurex_ai_model" key (set when user
  // changes model via the canvas selector), then fall back to ai-settings.defaultModel
  // (set in Settings page), then fall back to "gemini-2.5-flash" as the product default.
  // This ensures the canvas model selector and Settings page are always in sync.
  useEffect(() => {
    const saved = localStorage.getItem("measurex_ai_model");
    if (saved) {
      setAiModel(saved);
    } else {
      // No canvas override — read from ai-settings.defaultModel (set in Settings page)
      try {
        const settings = loadAiSettings();
        setAiModel(settings.defaultModel || "gemini-2.5-flash");
      } catch {
        setAiModel("gemini-2.5-flash");
      }
    }
  }, []);

  // Load project by URL param or localStorage on mount
  useEffect(() => {
    const pid = search.get('project') || localStorage.getItem('measurex_project_id');
    if (!pid) {
      setQuantitiesLoading(false);
      return;
    }
    hydrateProject(pid);
  }, [search, hydrateProject]);

  // BUG-W43-001: if initial PDF auto-fetch settles with no file, retry once after 3s.
  useEffect(() => {
    if (!projectId || !!pdfFile || pdfFetching || !pdfFetchAttemptCompleted) return;
    if (pdfAutoRetryAttemptedProjectRef.current === projectId) return;

    const retryTimer = setTimeout(() => {
      if (!isMountedRef.current || !!pdfFile || pdfFetching) return;
      pdfAutoRetryAttemptedProjectRef.current = projectId;
      void fetchStoredPdf(projectId, projectName || projectId);
    }, 3000);

    return () => clearTimeout(retryTimer);
  }, [projectId, projectName, pdfFile, pdfFetching, pdfFetchAttemptCompleted, fetchStoredPdf]);

  // BUG-W41-002: apply ?page=N once after project/PDF load when real page count is known.
  useEffect(() => {
    if (hasAppliedPageParam.current) return;
    if (!pdfPageCountReady) return;

    const pageParam = parseInt(search.get('page') || '1', 10);
    if (pageParam > 1 && pageParam <= totalPages) {
      safeGoToPage(pageParam, 'url-param:page-on-load');
    }
    hasAppliedPageParam.current = true;
  }, [pdfPageCountReady, search, totalPages, safeGoToPage]);

  // BUG-W26-002: after hydration, check sessionStorage for a newer backup and offer restore
  useEffect(() => {
    if (!projectId || isDemoProject(projectId)) return;
    // Only run once per project load
    let isCancelled = false;
    const timer = setTimeout(() => {
      if (isCancelled) return;
      try {
        const raw = sessionStorage.getItem('mx-session-backup');
        if (!raw) return;
        const backup = JSON.parse(raw) as { projectId: string; polygons: unknown[]; classifications: unknown[]; savedAt: number };
        if (backup.projectId !== projectId) return;
        const storePolygonCount = useStore.getState().polygons.length;
        const backupPolygonCount = backup.polygons.length;
        // Offer restore only if backup has more polygons than what's in the store
        if (backupPolygonCount > storePolygonCount) {
          addToast(
            `Restore ${backupPolygonCount - storePolygonCount} unsaved polygon${backupPolygonCount - storePolygonCount !== 1 ? 's' : ''} from last session?`,
            'info',
            10000,
          );
        }
      } catch {
        // non-fatal — bad backup JSON
      }
    }, 2000); // wait 2s for hydration to settle
    return () => { isCancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Flush any pending page text that was extracted before projectId was set
  useEffect(() => {
    if (!projectId) return;
    const pending = pendingPageTextRef.current;
    if (pending.size === 0) return;
    for (const [pageNum, { text, sheetName }] of pending) {
      const body: Record<string, unknown> = { pageNum, text };
      if (sheetName) body.sheet_name = sheetName;
      fetch(`/api/projects/${projectId}/pages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => {/* best-effort */});
    }
    pending.clear();
  }, [projectId]);

  // Connect SSE when project is loaded
  useEffect(() => {
    if (!projectId || isDemoProject(projectId)) return;
    connectToProject(projectId);
    return () => disconnectFromProject();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || isDemoProject(projectId)) return;
    const unsubscribe = subscribeToActivity((event, data) => {
      if (event === 'ai-takeoff:started') {
        const page = typeof data.page === 'number' ? data.page : '?';
        setAiStatus(`AI takeoff started for page ${page}...`);
        return;
      }

      if (event === 'ai-takeoff:complete') {
        const page = typeof data.page === 'number' ? data.page : '?';
        const persisted = typeof data.persistedPolygons === 'number' ? data.persistedPolygons : null;
        setAiStatus(
          persisted !== null
            ? `AI takeoff complete on page ${page} (${persisted} polygons persisted)`
            : `AI takeoff complete on page ${page}`,
        );
        void reloadProjectPolygonsAndClassifications(projectId).catch((err) => {
          console.error('Failed to reload AI takeoff results:', err);
        });
      }
    });
    return unsubscribe;
  }, [projectId, reloadProjectPolygonsAndClassifications]);

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

  // AI Takeoff flow — processes ALL pages in the PDF
  const handleAITakeoff = useCallback(async () => {
    // BUG-A8-5-006 fix: use ref for re-entry prevention (React state update is async;
    // rapid keypresses could queue concurrent calls before aiLoading becomes true).
    if (aiTakeoffInFlightRef.current) return;
    aiTakeoffInFlightRef.current = true;

    // BUG-W24-003: guard against no-PDF state
    if (!pdfFile) {
      addToast('Please upload a PDF first before running AI takeoff', 'warning');
      aiTakeoffInFlightRef.current = false;
      return;
    }

    const viewer = pdfViewerRef.current;
    if (!viewer || !projectId) {
      setAiStatus('AI takeoff requires a saved project');
      setTimeout(() => setAiStatus(null), 4000);
      aiTakeoffInFlightRef.current = false;
      return;
    }

    // Warn if no scale is set — AI detection still works but measurements will be inaccurate.
    // Do NOT block: scale is needed for display/export accuracy, not for AI element detection.
    const currentScale = useStore.getState().scale;
    const currentScales = useStore.getState().scales;
    const hasAnyScale = currentScale || (currentScales && Object.keys(currentScales).length > 0);
    if (!hasAnyScale) {
      addToast('No scale set — AI takeoff may be inaccurate. Set scale first for best results.', 'warning');
    }

    const pages = useStore.getState().totalPages || 1;
    const originalPage = useStore.getState().currentPage || 1;

    setAiLoading(true);
    let totalDetected = 0;

    try {
      for (let pageNum = 1; pageNum <= pages; pageNum++) {
        setAiStatus(`Processing page ${pageNum} of ${pages}...`);

        // Navigate to the page and wait for the canvas to render
        const canvas = await viewer.renderPageForCapture(pageNum);
        if (!canvas) {
          const renderWarnMsg = `AI Takeoff: could not render page ${pageNum} for capture — PDF may still be loading. Try again in a moment.`;
          console.error(renderWarnMsg);
          addToast(renderWarnMsg, 'warning');
          setAiStatus(renderWarnMsg);
          continue;
        }

        const imageBase64 = capturePageScreenshot(canvas);
        const dims = viewer.pageDimensions || { width: canvas.width, height: canvas.height };
        const pageScale = useStore.getState().scales?.[pageNum] ?? useStore.getState().scale;

        setAiStatus(`AI analyzing page ${pageNum} of ${pages}... (10-30s per page)`);
        const elements: DetectedElement[] = await triggerAITakeoff(
          imageBase64,
          pageScale,
          dims.width,
          dims.height,
          projectId,
          pageNum,
          aiModel,
        );
        totalDetected += elements.length;

        setAiStatus(`Page ${pageNum}: detected ${elements.length} elements, persisted to project`);
      }

      // Return to the original page
      safeGoToPage(originalPage, 'ai-takeoff:return');
      await reloadProjectPolygonsAndClassifications(projectId);

      // Deduplicate similar classifications unconditionally (e.g. "Room" + "Room/Space" → "Room")
      const currentClassifications = useStore.getState().classifications;
      deduplicateSimilarClassifications(currentClassifications, useStore.getState().mergeClassifications);

      // Additionally enforce hard cap if still over limit after dedup
      const afterDedup = useStore.getState().classifications;
      if (afterDedup.length > MAX_CLASSIFICATIONS) {
        autoMergeToLimit(afterDedup, useStore.getState().mergeClassifications, MAX_CLASSIFICATIONS);
      }

      localStorage.setItem('mx-onboarding-takeoff-run', 'true');
      if (totalDetected === 0) {
        const zeroMsg = 'AI found no elements. Try a different page or check scale.';
        setAiStatus(`Error: ${zeroMsg}`);
        setTimeout(() => setAiStatus(null), 7000);
      } else {
        // Wave 19B: compute per-type breakdown from store after reload
        const storePolygons = useStore.getState().polygons;
        const storeClassifications = useStore.getState().classifications;
        const clsById = new Map(storeClassifications.map((c: Classification) => [c.id, c]));
        const areas = storePolygons.filter((p: Polygon) => clsById.get(p.classificationId)?.type === 'area');
        const linears = storePolygons.filter((p: Polygon) => clsById.get(p.classificationId)?.type === 'linear');
        const counts = storePolygons.filter((p: Polygon) => clsById.get(p.classificationId)?.type === 'count');
        const doneMsg = `Done: ${areas.length} areas, ${linears.length} walls, ${counts.length} items | Total: ${totalDetected} elements`;
        setAiStatus(doneMsg);
        setTimeout(() => setAiStatus(null), 5000);

        const { getNotificationPrefs } = await import('@/components/NotificationSettings');
        if (getNotificationPrefs().aiTakeoffComplete) {
          addToast(doneMsg, 'success');
        }
      }
    } catch (error) {
      console.error(error);
      const errMsg = error instanceof Error ? error.message : 'AI failed';
      let friendlyMsg: string;
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('too many')) {
        friendlyMsg = 'Too many requests. Wait 60s and try again.';
      } else if (errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('timed out') || errMsg.toLowerCase().includes('aborted')) {
        friendlyMsg = 'Takeoff timed out. Try again.';
      } else {
        friendlyMsg = errMsg;
      }
      setAiStatus(`Error: ${friendlyMsg}`);
      setTimeout(() => setAiStatus(null), 7000);
    } finally {
      setAiLoading(false);
      aiTakeoffInFlightRef.current = false; // BUG-A8-5-006 fix: release re-entry guard
    }
  }, [addToast, aiModel, projectId, reloadProjectPolygonsAndClassifications, safeGoToPage]);

  // Keyboard shortcuts (ignore when focused in inputs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const state = useStore.getState();
        // BUG-W28-003: prefer the currently selected polygon over lastPolygon so
        // Ctrl+D duplicates what the user has selected, not what was last drawn.
        const selectedId = state.selectedPolygonId ?? state.selectedPolygon;
        const polyToDuplicate = (selectedId && state.polygons.find((p) => p.id === selectedId))
          ?? state.lastPolygon;
        if (polyToDuplicate) {
          const offset = 20;
          state.addPolygon({
            points: polyToDuplicate.points.map((p) => ({ x: p.x + offset, y: p.y + offset })),
            classificationId: polyToDuplicate.classificationId,
            pageNumber: polyToDuplicate.pageNumber,
            area: polyToDuplicate.area,
            linearFeet: polyToDuplicate.linearFeet,
            isComplete: true,
            label: polyToDuplicate.label,
          });
          addToast('Polygon duplicated', 'info');
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        // handleSave is declared later — dispatch a custom event to decouple
        window.dispatchEvent(new CustomEvent('mx-save'));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        // BUG-W34-002: Ctrl+A — select all polygons on the current page
        e.preventDefault();
        const page = useStore.getState().currentPage;
        const allIds = useStore.getState().polygons
          .filter((p) => p.pageNumber === page)
          .map((p) => p.id);
        useStore.getState().setSelectedPolygons(allIds);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
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
        setShowKeyboardHelp(false);
        closeContextMenu();
      } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShowKeyboardHelp((prev) => !prev);
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoomLevel(Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP));
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoomLevel(Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoomLevel(Math.max(MIN_ZOOM, zoomLevel - ZOOM_STEP));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setZoomLevel(Math.max(MIN_ZOOM, zoomLevel - ZOOM_STEP));
      } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        pdfViewerRef.current?.fitToPage();
      } else if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setZoomLevel(1);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPolygon) {
          deletePolygon(selectedPolygon);
          if (projectId) {
            api.deletePolygon(projectId, selectedPolygon).catch((err) => console.error('API deletePolygon failed:', err));
          }
          import('@/components/NotificationSettings').then(({ getNotificationPrefs }) => {
            if (getNotificationPrefs().polygonDeleted) {
              addToast('Polygon deleted', 'info');
            }
          });
        }
      } else if (e.key === '3') {
        toggleShow3D();
      } else if (e.key.toLowerCase() === 't') {
        setTool(currentTool === 'annotate' ? 'select' : 'annotate');
      } else if (e.key.toLowerCase() === 'a') {
        if (aiLoading) return;
        handleAITakeoff();
      } else if (e.key === 'P' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const canvas = pdfViewerRef.current?.getPageCanvas?.();
        setPatternSearchPageImage(canvas ? canvas.toDataURL('image/png') : null);
        setShowPatternSearch(v => !v);
      } else if (e.key >= '1' && e.key <= '7' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const targetPage = parseInt(e.key, 10);
        if (targetPage <= totalPages) {
          setCurrentPageNum(targetPage);
          setCurrentPage(targetPage, totalPages);
          safeGoToPage(targetPage, 'keyboard-number');
        }
      } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        pdfViewerRef.current?.fitToPage();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && toolKeys[e.key.toLowerCase() as keyof typeof toolKeys]) {
        // Only activate tool shortcuts when no modifier key is held — prevents
        // conflicts with browser shortcuts (Ctrl+C, Ctrl+S, etc.)
        setTool(toolKeys[e.key.toLowerCase() as keyof typeof toolKeys]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [redo, undo, setTool, setSelectedPolygon, setSelectedClassification, setZoomLevel, zoomLevel, deletePolygon, selectedPolygon, toggleShow3D, closeContextMenu, currentTool, addToast, handleAITakeoff, projectId, totalPages, safeGoToPage, setCurrentPageNum, setCurrentPage]);

  // Listen for custom event from SmartTools pattern search button
  useEffect(() => {
    const handler = () => {
      const canvas = pdfViewerRef.current?.getPageCanvas?.();
      setPatternSearchPageImage(canvas ? canvas.toDataURL('image/png') : null);
      setShowPatternSearch(true);
    };
    window.addEventListener('open-pattern-search', handler);
    return () => window.removeEventListener('open-pattern-search', handler);
  }, []);

  // Pattern search: add matched polygons to takeoff
  const handlePatternSearchAdd = useCallback((matches: { id: string; label: string; confidence: number; pageNumber: number; x: number; y: number; width: number; height: number }[]) => {
    const state = useStore.getState();
    const classificationId = state.selectedClassification ?? state.classifications[0]?.id;
    if (!classificationId) {
      addToast('No classification selected — create one first', 'error');
      return;
    }

    let added = 0;
    for (const match of matches) {
      if (match.width > 0 && match.height > 0) {
        const x = match.x;
        const y = match.y;
        const w = match.width;
        const h = match.height;
        const polyId = state.addPolygon({
          points: [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
          ],
          classificationId,
          pageNumber: match.pageNumber,
          area: 0,
          linearFeet: 0,
          isComplete: true,
          label: match.label,
        });
        // Set AI confidence on the created polygon
        state.updatePolygon(polyId, { confidence: match.confidence / 100 });
        added++;
      }
    }
    addToast(`Added ${added} patterns to takeoff`, 'success');
  }, [addToast]);

  useEffect(() => {
    if (!pdfFile) return;
    pdfViewerRef.current?.setZoom(zoomLevel);
  }, [zoomLevel, pdfFile]);

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
        console.error('Could not load PDF document for 3D texture capture:', e);
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
          console.error('Could not capture PDF texture:', e);
        }
      })();
    }, 500);
    return () => clearTimeout(timer);
  }, [pdfFile, currentPageNum]);

  // Autosave on state changes (project loaded)
  // Wave 11B: exclude currentPage and totalPages from the fingerprint — navigating
  // between pages is not a "data change" and must not trigger an autosave by itself.
  // Tracks: classifications, polygons, annotations, scale, per-page scales only.
  const autosaveFingerprint = useMemo(() => JSON.stringify({
    projectId,
    classifications,
    polygons,
    annotations,
    scale,
    scales,
  }), [projectId, classifications, polygons, annotations, scale, scales]);

  // Wave 12B Bug 1: isDirty = fingerprint has changed since last successful save
  // Initialise lastSaved on first hydrate so we don't show dirty immediately on load
  useEffect(() => {
    if (lastSavedFingerprintRef.current === null && projectId && !isDemoProject(projectId)) {
      lastSavedFingerprintRef.current = autosaveFingerprint;
    }
  }, [projectId, autosaveFingerprint]);
  const isDirty = projectId && !isDemoProject(projectId)
    ? lastSavedFingerprintRef.current !== null && lastSavedFingerprintRef.current !== autosaveFingerprint
    : false;

  useEffect(() => {
    if (!projectId || isDemoProject(projectId)) return;
    requestAutoSave();
  }, [autosaveFingerprint, projectId, requestAutoSave]);

  // Sync new polygons to API individually
  useEffect(() => {
    if (!projectId || isDemoProject(projectId)) return;
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

  // BUG-W26-002: sessionStorage backup — save polygon+classification snapshot on every change
  // so that a browser refresh during mid-drawing doesn't lose unsaved work.
  useEffect(() => {
    if (!projectId || isDemoProject(projectId)) return;
    if (polygons.length === 0 && classifications.length === 0) return;
    try {
      const backup = JSON.stringify({ projectId, polygons, classifications, savedAt: Date.now() });
      // Only write if it fits (sessionStorage is ~5MB; skip if backup is huge)
      if (backup.length < 4 * 1024 * 1024) {
        sessionStorage.setItem('mx-session-backup', backup);
      }
    } catch {
      // sessionStorage can be unavailable in private browsing — non-fatal
    }
  }, [projectId, polygons, classifications]);

  // Sync new classifications to API individually
  useEffect(() => {
    if (!projectId || isDemoProject(projectId)) return;
    const newClassifications = classifications.filter((c) => !knownClassificationIds.current.has(c.id));
    for (const c of newClassifications) {
      knownClassificationIds.current.add(c.id);
      syncedClassificationsById.current.set(c.id, c);
      api.createClassification(projectId, c).catch((err) => console.error('API createClassification failed:', err));
    }
    // Prune deleted IDs from tracking set
    const currentIds = new Set(classifications.map((c) => c.id));
    for (const id of knownClassificationIds.current) {
      if (!currentIds.has(id)) {
        knownClassificationIds.current.delete(id);
        syncedClassificationsById.current.delete(id);
      }
    }
  }, [projectId, classifications]);

  // Sync updates for existing classifications (name/type/color/visibility/formula)
  useEffect(() => {
    if (!projectId || isDemoProject(projectId)) return;
    for (const c of classifications) {
      if (!knownClassificationIds.current.has(c.id)) continue;
      const prev = syncedClassificationsById.current.get(c.id);
      if (!prev) {
        syncedClassificationsById.current.set(c.id, c);
        continue;
      }

      const patch: Partial<Classification> = {};
      if (prev.name !== c.name) patch.name = c.name;
      if (prev.type !== c.type) patch.type = c.type;
      if (prev.color !== c.color) patch.color = c.color;
      if (prev.visible !== c.visible) patch.visible = c.visible;
      if (prev.formula !== c.formula) patch.formula = c.formula;
      if (prev.formulaUnit !== c.formulaUnit) patch.formulaUnit = c.formulaUnit;
      if (prev.formulaSavedToLibrary !== c.formulaSavedToLibrary) patch.formulaSavedToLibrary = c.formulaSavedToLibrary;
      if (Object.keys(patch).length === 0) continue;

      syncedClassificationsById.current.set(c.id, c);
      api.updateClassification(projectId, c.id, patch).catch((err) => console.error('API updateClassification failed:', err));
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
  // Wave 10B: upload error state — shown inline below the drop zone
  const [uploadError, setUploadError] = useState<string | null>(null);

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
      syncedClassificationsById.current = new Map();
      useStore.getState().hydrateState({
        ...EMPTY_STATE,
        totalPages: preservedTotalPages > 1 ? preservedTotalPages : 1,
      });

      const name = fileName.replace(/\.pdf$/i, '') || 'Untitled';
      const project = await api.createProject(name);
      setProjectId(project.id);
      setProjectName(project.name || name);
      localStorage.setItem('measurex_project_id', project.id);
      window.history.replaceState(null, '', `/?project=${encodeURIComponent(project.id)}`);

      // GAP-006: Upload PDF to server and check for auto-detected scale
      // BUG-A8-5-013 fix: clean up the newly-created project if PDF upload fails
      // so we don't leave orphaned projects with no PDF attached.
      if (file) {
        // Wave 10B: client-side pre-validation before hitting the server
        const MAX_CLIENT_SIZE = 200 * 1024 * 1024; // 200 MB
        if (file.size > MAX_CLIENT_SIZE) {
          const msg = `File too large — maximum size is 200 MB (this file is ${(file.size / 1024 / 1024).toFixed(0)} MB)`;
          setUploadError(msg);
          api.deleteProject(project.id).catch(() => {});
          setProjectId('');
          setProjectName('');
          localStorage.removeItem('measurex_project_id');
          window.history.replaceState(null, '', '/');
          return;
        }
        try {
          setUploadError(null);
          const uploadResult = await api.uploadPDF(project.id, file);
          if (uploadResult.detectedScale) {
            setUploadDetectedScale(uploadResult.detectedScale);
          }
        } catch (uploadErr) {
          console.error('PDF upload failed — cleaning up orphaned project:', uploadErr);
          // Wave 10B: propagate server error message so user sees the real reason
          const serverMsg = uploadErr instanceof Error ? uploadErr.message : null;
          const displayMsg = serverMsg && !serverMsg.startsWith('API error:')
            ? serverMsg
            : serverMsg?.includes('413') || serverMsg?.includes('too large') || serverMsg?.includes('FILE_TOO_LARGE')
              ? 'File too large — maximum size is 100 MB'
              : serverMsg?.includes('corrupt') || serverMsg?.includes('magic')
                ? 'Invalid PDF — the file may be corrupted or is not a valid PDF'
                : serverMsg?.includes('timeout') || serverMsg?.includes('AbortError') || serverMsg?.includes('408')
                  ? 'Upload timed out — the file may be too large for Vercel. Try a smaller PDF.'
                  : 'PDF upload failed. Please try again.';
          setUploadError(displayMsg);
          // Best-effort cleanup: delete the project we just created
          api.deleteProject(project.id).catch((cleanupErr) =>
            console.error('Failed to clean up orphaned project:', cleanupErr)
          );
          // Reset local state so the user can try again
          setProjectId('');
          setProjectName('');
          localStorage.removeItem('measurex_project_id');
          window.history.replaceState(null, '', '/');
          addToast(displayMsg, 'error');
          return;
        }
      }
    } catch (err) {
      console.error('Failed to auto-create project:', err);
    } finally {
      isCreatingProjectRef.current = false;
    }
  }, [projectId, addToast]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') {
      // Wave 10B: clear any prior upload error when user selects a new file
      setUploadError(null);
      // BUG-R6-002: Reset page count ready flag so TopNavBar shows loading state
      // until PDFViewer fires onPageChange with the real total.
      setPdfPageCountReady(false);
      setPdfFile(f);
      void ensureProject(f.name, f);
    } else if (f) {
      // Non-PDF selected — show error immediately without hitting the server
      setUploadError('Only PDF files are accepted. Please select a .pdf file.');
    }
  };

  // Text extraction → auto-scale detection + sheet naming
  // Stable callback — memoized so PDFViewer's goToPage dep array doesn't churn
  // BUG-R5-001: PDFViewer is the authoritative source for totalPages.
  // Always push the PDF-reported total into the store so it overrides any
  // stale value left by API hydration or EMPTY_STATE initialization.
  // BUG-R6-002: Mark the page count as ready once PDFViewer reports it so we
  // don't show a misleading "Page 1 of 1" before the PDF has loaded.
  const captureThumbnail = useCallback(async () => {
    if (!projectId) return;
    const pageCanvas = pdfViewerRef.current?.getPageCanvas?.();
    if (!pageCanvas) return;
    const MAX = 320;
    const ratio = Math.min(1, MAX / Math.max(pageCanvas.width, pageCanvas.height));
    const off = document.createElement('canvas');
    off.width = Math.round(pageCanvas.width * ratio);
    off.height = Math.round(pageCanvas.height * ratio);
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(pageCanvas, 0, 0, off.width, off.height);
    const dataUrl = off.toDataURL('image/jpeg', 0.7);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnail: dataUrl }),
      });
    } catch (e) {
      console.error('Thumbnail upload failed:', e);
    }
  }, [projectId]);

  const handlePDFPageChange = useCallback((page: number, total: number) => {
    setCurrentPageNum(page);
    setCurrentPage(page, total);
    setPdfPageCountReady(true);
    if (page === 1 && !thumbnailCapturedRef.current) {
      thumbnailCapturedRef.current = true;
      setTimeout(() => captureThumbnail(), 1000);
    }
  }, [setCurrentPage, captureThumbnail]);

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

    // E6: If projectId isn't set yet (new upload race), queue text for flush when it arrives.
    // PDFViewer also PATCHes text directly, but its ref may still be undefined at this point.
    if (!projectId) {
      pendingPageTextRef.current.set(pageNum, { text, sheetName });
    }

    // QA-006: Detect scale from text — only reached when text is non-empty
    // Wave 19B: also detect NTS (Not to Scale) and warn the user
    if (isNotToScale(text)) {
      setNtsWarning(true);
    } else {
      setNtsWarning(false);
    }

    const detected = detectScaleFromText(text);
    if (detected) {
      setDetectedScale(detected);
      setCurrentPageNum(pageNum);
      setCurrentPage(pageNum, useStore.getState().totalPages);

      // GAP-006: Show AutoScalePopup as the sole confirmation dialog.
      // Scale is NOT applied until user explicitly accepts.
      const autoScaleSkipKey = projectId ? `mx-autoscale-skip-${projectId}` : null;
      const hidden =
        typeof window !== 'undefined' &&
        !!autoScaleSkipKey &&
        localStorage.getItem(autoScaleSkipKey) === 'true';
      if (!hidden) {
        setDetectedScaleInfo({ scale: detected.scale.label, confidence: detected.confidence });
        setShowAutoScalePopup(true);
      }
    }
  }, [projectId, setCurrentPage, setSheetName]);

  const handleAcceptScale = useCallback(() => {
    if (detectedScale) {
      const cal = detectedToCalibration(detectedScale);
      if (!cal) {
        // detectedToCalibration returned null — invalid/zero pixelsPerUnit, skip silently
        setDetectedScale(null);
        return;
      }
      setScale(cal);
      setScaleForPage(currentPageNum, cal);
      localStorage.setItem('mx-onboarding-scale-set', 'true');
    }
    setDetectedScale(null);
  }, [detectedScale, currentPageNum, setScale, setScaleForPage]);

  // In agentMode, auto-accept detected scale without showing the popup
  useEffect(() => {
    if (agentMode && detectedScale) {
      handleAcceptScale();
    }
  }, [agentMode, detectedScale, handleAcceptScale]);

  // BUG-W13-004: auto-activate draw tool when user selects a classification
  // and the current tool is idle (select). Mirrors Togal's UX: clicking a
  // classification immediately arms the draw tool so the user can start drawing.
  useEffect(() => {
    if (!selectedClassificationId) return;
    const tool = useStore.getState().currentTool;
    if (tool === 'select') {
      setTool('draw');
    }
  }, [selectedClassificationId, setTool]);

  // Install automation API for browser/AI drivers
  // BUG-A8-5-005 fix: return cleanup function to remove window.measurex on unmount
  // (avoids stale closures if the component remounts with a different projectId etc.)
  useEffect(() => {
    installMeasurexAPI();
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as Window & { measurex?: unknown }).measurex;
      }
    };
  }, []);

  // Manual save
  // createNamedProject: called after user confirms name in modal (or directly in agentMode)
  const createNamedProject = useCallback(async (name: string) => {
    setSaving(true);
    try {
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
      window.history.replaceState(null, '', `/?project=${encodeURIComponent(data.project.id)}`);
      persistSaveStatus('Saved!');
      addToast('Project saved', 'success');
    } catch (error) {
      console.error('Failed to save project:', error);
      addToast('Failed to save project', 'error');
    } finally {
      setSaving(false);
    }
  }, [buildStatePayload, currentPageNum, setCurrentPage, setCurrentPageNum, persistSaveStatus, addToast]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (!projectId) {
        // BUG-W14-001: use proper modal instead of window.prompt
        if (agentMode) {
          // In agent mode skip the modal — use a default name
          setSaving(false);
          await createNamedProject('Untitled Project');
          return;
        }
        setSaving(false);
        setPendingName('');
        setShowNameModal(true);
        return;
      } else {
        await flushSave(true);
        addToast('Project saved', 'success');
      }
    } catch (error) {
      console.error('Failed to save project:', error);
      const message = error instanceof Error ? error.message : 'Save failed';
      persistSaveStatus(`Error: ${message}`, 3500);
      addToast('Failed to save project', 'error');
    } finally {
      setSaving(false);
    }
  }, [projectId, agentMode, createNamedProject, persistSaveStatus, flushSave, addToast]);

  // BUG-W19-005: Ctrl+S / Cmd+S → save. Uses custom event to avoid hoisting issue
  // (handleSave is declared after the main keyboard handler useEffect).
  useEffect(() => {
    const handler = () => { void handleSave(); };
    window.addEventListener('mx-save', handler);
    return () => window.removeEventListener('mx-save', handler);
  }, [handleSave]);

  // Wave 37B: sendBeacon fallback for mid-tab-close autosave.
  // fetch() is cancelled by the browser on tab close; navigator.sendBeacon is not.
  // On beforeunload we fire a beacon with the current state so in-flight data
  // is not lost even if the regular autosave fetch was in-flight or not yet triggered.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!projectId) return;
      try {
        const payload = buildStatePayload(currentPageNum);
        const body = JSON.stringify({ state: payload });
        const blob = new Blob([body], { type: 'application/json' });
        // sendBeacon is best-effort — returns false if queuing failed (browser may block).
        const sent = navigator.sendBeacon?.(`/api/projects/${projectId}`, blob);
        if (!sent) {
          // Fallback: keepalive fetch — still completes after tab close on most browsers.
          fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          }).catch(() => { /* best-effort */ });
        }
      } catch {
        // Never throw in beforeunload — could suppress the tab close dialog.
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [projectId, buildStatePayload, currentPageNum]);

  // Wave 36: window.measurex.setPage() dispatches 'mx-goto-page' so both the store
  // AND the PDF viewer are updated (store-only navigation doesn't move the rendered PDF).
  useEffect(() => {
    const handler = (e: Event) => {
      const page = (e as CustomEvent<{ page: number }>).detail?.page;
      if (typeof page === 'number' && page >= 1) {
        safeGoToPage(page, 'measurex-api:setPage');
      }
    };
    window.addEventListener('mx-goto-page', handler);
    return () => window.removeEventListener('mx-goto-page', handler);
  }, [safeGoToPage]);

  const handleExportExcel = useCallback(async () => {
    if (!projectId) {
      const { downloadExcel } = await import('@/lib/export');
      downloadExcel(classifications, polygons, scale, scales);
      return;
    }

    try {
      const blob = await api.exportExcel(projectId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `measurex-${projectId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      import('@/components/NotificationSettings').then(({ getNotificationPrefs }) => {
        if (getNotificationPrefs().exportReady) addToast('Excel export downloaded', 'success');
      });
    } catch (error) {
      console.error(error);
      addToast('Failed to export Excel', 'error');
    }
  }, [projectId, classifications, polygons, scale, scales, addToast]);

  const handleExportJson = useCallback(async () => {
    if (!projectId) {
      const payload = { classifications, polygons, scale, scales };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'measurex-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      import('@/components/NotificationSettings').then(({ getNotificationPrefs }) => {
        if (getNotificationPrefs().exportReady) addToast('JSON export downloaded', 'success');
      });
      return;
    }

    try {
      const payload = await api.exportJSON(projectId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `measurex-${projectId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      import('@/components/NotificationSettings').then(({ getNotificationPrefs }) => {
        if (getNotificationPrefs().exportReady) addToast('JSON export downloaded', 'success');
      });
    } catch (error) {
      console.error(error);
      addToast('Failed to export JSON', 'error');
    }
  }, [projectId, classifications, polygons, scale, scales, addToast]);

  const handleAITakeoffAllPages = useCallback(async () => {
    if (!pdfFile) {
      addToast('Please upload a PDF first before running AI takeoff', 'warning');
      return;
    }

    const viewer = pdfViewerRef.current;
    if (!viewer || !projectId) {
      setAiStatus('AI takeoff requires a saved project');
      setTimeout(() => setAiStatus(null), 4000);
      return;
    }

    // Warn if no scale set — allow takeoff to proceed, measurements will be approximate.
    const allPagesScale = useStore.getState().scale;
    const allPagesScales = useStore.getState().scales;
    const allPagesHasScale = allPagesScale || (allPagesScales && Object.keys(allPagesScales).length > 0);
    if (!allPagesHasScale) {
      addToast('No scale set — AI takeoff may be inaccurate. Set scale first for best results.', 'warning');
    }

    // GAP-011: If an agent webhook URL is configured, delegate to the agent instead of calling the AI API directly
    const agentWebhookUrl = typeof window !== 'undefined' ? localStorage.getItem('mx-agent-webhook-url') : null;
    if (agentWebhookUrl) {
      try {
        await fetch(agentWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, action: 'takeoff', totalPages: useStore.getState().totalPages }),
        });
        setAiStatus('Agent takeoff triggered via webhook');
        setTimeout(() => setAiStatus(null), 3000);
      } catch (err) {
        console.error('Webhook dispatch failed:', err);
        setAiStatus('Webhook failed — falling back to AI API');
        setTimeout(() => setAiStatus(null), 2000);
      }
      return;
    }

    const total = useStore.getState().totalPages;
    const originalPage = useStore.getState().currentPage || 1;
    const startTime = Date.now();
    aiCancelRef.current = false;
    setAiLoading(true);
    setTakeoffSummary(null);
    setAiAllPagesProgress({ current: 1, total });

    // Initialize per-page statuses
    const initialStatuses: PageStatus[] = Array.from({ length: total }, (_, i) => ({
      page: i + 1,
      status: 'queued' as const,
    }));
    setAiPageStatuses(initialStatuses);

    let totalPolygons = 0;
    let totalPagesCompleted = 0;

    for (let page = 1; page <= total; page++) {
      if (aiCancelRef.current) break;

      setAiAllPagesProgress({ current: page, total });
      setAiStatus(`Page ${page}/${total}: Capturing...`);

      // Mark page as running
      setAiPageStatuses(prev => prev.map(ps => ps.page === page ? { ...ps, status: 'running' as const } : ps));

      const canvas = await viewer.renderPageForCapture(page);
      if (!canvas) {
        const renderWarnMsg = `AI Takeoff: could not render page ${page} for capture — PDF may still be loading. Try again in a moment.`;
        addToast(renderWarnMsg, 'warning');
        setAiStatus(renderWarnMsg);
        setAiPageStatuses(prev => prev.map(ps => ps.page === page ? { ...ps, status: 'failed' as const, errorMsg: renderWarnMsg } : ps));
        continue;
      }

      if (aiCancelRef.current) break;

      setAiStatus(`Page ${page}/${total}: AI analyzing...`);
      try {
        const imageBase64 = capturePageScreenshot(canvas);
        const dims = viewer.pageDimensions || { width: canvas.width, height: canvas.height };
        const pageScale = useStore.getState().scales?.[page] ?? useStore.getState().scale;
        const elements: DetectedElement[] = await triggerAITakeoff(
          imageBase64,
          pageScale,
          dims.width,
          dims.height,
          projectId,
          page,
          aiModel,
        );
        totalPolygons += elements.length;
        totalPagesCompleted++;
        setAiPageStatuses(prev => prev.map(ps => ps.page === page ? { ...ps, status: 'done' as const, polygonCount: elements.length } : ps));
        setAiStatus(`Page ${page}/${total}: Done — ${elements.length} elements persisted`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'failed';
        setAiPageStatuses(prev => prev.map(ps => ps.page === page ? { ...ps, status: 'failed' as const, errorMsg } : ps));
        setAiStatus(`Page ${page}/${total}: Error — ${errorMsg}`);
      }
    }

    safeGoToPage(originalPage, 'ai-takeoff-all-pages:return');
    await reloadProjectPolygonsAndClassifications(projectId);

    // Deduplicate similar classifications unconditionally (e.g. "Room" + "Room/Space" → "Room")
    const premergeClassifications = useStore.getState().classifications || [];
    deduplicateSimilarClassifications(premergeClassifications, useStore.getState().mergeClassifications);

    // Additionally enforce hard cap if still over limit after dedup
    const afterDedupClassifications = useStore.getState().classifications || [];
    if (afterDedupClassifications.length > MAX_CLASSIFICATIONS) {
      autoMergeToLimit(afterDedupClassifications, useStore.getState().mergeClassifications, MAX_CLASSIFICATIONS);
    }

    const elapsedMs = Date.now() - startTime;
    // Gather unique classifications from the reloaded store
    const currentClassifications = useStore.getState().classifications || [];
    const classificationNames = currentClassifications.map((c: Classification) => c.name);

    setAiAllPagesProgress(null);
    setAiLoading(false);

    if (!aiCancelRef.current) {
      // Wave 19B: compute per-type breakdown from stored polygons
      const allPolygons = useStore.getState().polygons;
      const allClassifications = useStore.getState().classifications;
      const classById = new Map(allClassifications.map((c: Classification) => [c.id, c]));
      const scaleState = useStore.getState().scale;
      const ppu = scaleState?.pixelsPerUnit ?? 1;
      let areaCount = 0, areaTotalSF = 0, linearCount = 0, linearTotalLF = 0, countItems = 0;
      for (const poly of allPolygons) {
        const cls = classById.get(poly.classificationId);
        if (!cls) continue;
        if (cls.type === 'area') { areaCount++; areaTotalSF += ppu > 0 ? poly.area / (ppu * ppu) : 0; }
        else if (cls.type === 'linear') { linearCount++; linearTotalLF += ppu > 0 ? poly.linearFeet / ppu : 0; }
        else if (cls.type === 'count') countItems++;
      }
      // Show celebratory summary
      setTakeoffSummary({
        totalPolygons,
        totalPages: totalPagesCompleted,
        classifications: classificationNames,
        elapsedMs,
        areaCount,
        areaTotalSF: Math.round(areaTotalSF * 100) / 100,
        linearCount,
        linearTotalLF: Math.round(linearTotalLF * 100) / 100,
        countItems,
      });
    } else {
      setAiPageStatuses([]);
      addToast(`Takeoff cancelled after ${totalPagesCompleted} pages — ${totalPolygons} polygons found`, 'success');
    }
  }, [aiModel, projectId, reloadProjectPolygonsAndClassifications, safeGoToPage, addToast]);

  const handleCancelTakeoff = useCallback(() => {
    aiCancelRef.current = true;
  }, []);

  // Crop & Search: when user completes a bounding box, crop the canvas region and send for AI analysis
  const handleCropComplete = useCallback((cropRect: { x: number; y: number; width: number; height: number }) => {
    const canvas = pdfViewerRef.current?.getPageCanvas?.();
    if (!canvas) return;

    const baseDims = pdfViewerRef.current?.pageDimensions || { width: canvas.width, height: canvas.height };
    // Convert base coords to actual canvas pixel coords
    const scaleX = canvas.width / baseDims.width;
    const scaleY = canvas.height / baseDims.height;

    const sx = cropRect.x * scaleX;
    const sy = cropRect.y * scaleY;
    const sw = cropRect.width * scaleX;
    const sh = cropRect.height * scaleY;

    // Crop to offscreen canvas
    const off = document.createElement('canvas');
    off.width = Math.round(sw);
    off.height = Math.round(sh);
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, off.width, off.height);

    const dataUrl = off.toDataURL('image/png');
    setCroppedImageBase64(dataUrl);
    setCropMode(false);
    setTool('select');
    // Reopen image search modal with the cropped image
    setShowImageSearch(true);
  }, [setTool]);

  const handleTakeoffSearchSelect = useCallback((result: TakeoffSearchResult) => {
    const polygon = useStore.getState().polygons.find((p) => p.id === result.polygonId);
    if (!polygon) return;

    const page = result.pageNumber;
    setCurrentPageNum(page);
    setCurrentPage(page, useStore.getState().totalPages);
    setSelectedPolygon(polygon.id);
    setHighlightedPolygonId(polygon.id);
    setZoomLevel(2);

    window.setTimeout(() => {
      setHighlightedPolygonId((current) => (current === polygon.id ? null : current));
    }, 2000);

    const dims = pageBaseDimensions[page] ?? { width: 1, height: 1 };
    const centroid = polygon.points.reduce(
      (acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }),
      { x: 0, y: 0 }
    );
    const count = Math.max(1, polygon.points.length);
    const avgX = centroid.x / count;
    const avgY = centroid.y / count;
    const isNormalized = polygon.points.every((pt) => pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1);
    const normalizedPoint = isNormalized
      ? { x: avgX, y: avgY }
      : {
          x: avgX / Math.max(1, dims.width),
          y: avgY / Math.max(1, dims.height),
        };
    normalizedPoint.x = Math.max(0, Math.min(1, normalizedPoint.x));
    normalizedPoint.y = Math.max(0, Math.min(1, normalizedPoint.y));

    const viewer = pdfViewerRef.current;
    if (viewer) {
      safeGoToPage(page, 'takeoff-search');
      void viewer.renderPageForCapture(page)
        .then(() => {
          viewer.focusOnNormalizedPoint(normalizedPoint, 2);
        })
        .catch((error) => {
          console.error(`[page navigation] Failed to render page ${page} from takeoff-search:`, error);
        });
    }

  }, [pageBaseDimensions, setCurrentPage, setSelectedPolygon, setZoomLevel, safeGoToPage]);

  const handleClassificationZoom = useCallback((classificationId: string) => {
    const state = useStore.getState();
    const page = state.currentPage;
    const classPolygons = state.polygons.filter(
      (p) => p.classificationId === classificationId && p.pageNumber === page && p.points.length > 0
    );
    if (classPolygons.length === 0) return;

    // Compute bounding box of all matching polygons
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of classPolygons) {
      for (const pt of poly.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }

    const dims = pageBaseDimensions[page] ?? { width: 1, height: 1 };
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Check if points are normalized (0-1)
    const isNormalized = minX >= 0 && maxX <= 1 && minY >= 0 && maxY <= 1;
    const normalizedCenter = isNormalized
      ? { x: centerX, y: centerY }
      : { x: centerX / Math.max(1, dims.width), y: centerY / Math.max(1, dims.height) };
    normalizedCenter.x = Math.max(0, Math.min(1, normalizedCenter.x));
    normalizedCenter.y = Math.max(0, Math.min(1, normalizedCenter.y));

    // Compute zoom to fit bounding box with padding
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    const container = viewer.containerEl;
    if (!container) return;

    const bboxW = isNormalized ? (maxX - minX) * dims.width : (maxX - minX);
    const bboxH = isNormalized ? (maxY - minY) * dims.height : (maxY - minY);
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    const fitZoom = Math.min(
      containerW / (Math.max(bboxW, 1) * 1.3),
      containerH / (Math.max(bboxH, 1) * 1.3)
    );
    const clampedZoom = Math.max(0.5, Math.min(5, fitZoom));

    viewer.focusOnNormalizedPoint(normalizedCenter, clampedZoom);
  }, [pageBaseDimensions]);

  const isMobileViewport = useIsMobile();

  return (
    <div className="relative flex flex-col h-screen w-screen bg-[#0a0a0f] text-white" onClick={closeContextMenu}>
      {/* Hidden print header — populated by ExportPanel before window.print() */}
      <div id="print-header" className="print-header" />
      {isMobileViewport && (
        <div
          className="w-full px-4 py-2 text-center text-xs font-medium flex-shrink-0"
          style={{
            background: 'linear-gradient(90deg, rgba(0,212,255,0.15) 0%, rgba(0,212,255,0.08) 100%)',
            borderBottom: '1px solid rgba(0,212,255,0.2)',
            color: '#8892a0',
          }}
        >
          MeasureX works best on desktop. Use a tablet or computer for full functionality.
        </div>
      )}
      {isDemoProject(projectId) && (
        <div
          className="w-full px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3 flex-shrink-0"
          style={{
            background: 'linear-gradient(90deg, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0.08) 100%)',
            borderBottom: '1px solid rgba(251,191,36,0.3)',
            color: '#fbbf24',
          }}
        >
          <span>This is a demo project. Upload your own PDF to get started.</span>
          <button
            onClick={() => window.location.href = '/projects'}
            className="bg-yellow-600/30 hover:bg-yellow-600/50 text-yellow-200 px-3 py-0.5 rounded text-xs font-semibold transition-colors border border-yellow-600/40"
          >
            Go to Projects
          </button>
        </div>
      )}
      <TopNavBar
        onAITakeoff={handleAITakeoff}
        aiLoading={aiLoading}
        hasScale={!!scale}
        hasRunTakeoff={polygons.length > 0}
        currentPagePolygonCount={polygons.filter(p => p.pageNumber === currentPageNum).length}
        onExportExcel={handleExportExcel}
        onExportJson={handleExportJson}
        onExportPanel={() => { localStorage.setItem('mx-onboarding-exported', 'true'); setShowExport(true); }}
        onPrintBlueprint={() => {
          const name = projectName || 'Untitled Project';
          const printUrl = `/print?projectId=${projectId}&name=${encodeURIComponent(name)}&page=${currentPageNum}`;
          window.open(printUrl, '_blank');
        }}
        onSave={handleSave}
        saving={saving}
        isDirty={isDirty}
        projectName={projectName || undefined}
        projectId={projectId || undefined}
        onProjectNameSaved={(newName) => {
          setProjectName(newName);
        }}
        onChat={() => setShowChat((v) => !v)}
        onToggleImageSearch={() => setShowImageSearch((v) => !v)}
        onCompare={() => setShowCompare(true)}
        sheetName={sheetNames[currentPageNum] || `Page ${currentPageNum}`}
        pageIndex={pdfFile && pdfPageCountReady ? currentPageNum - 1 : undefined}
        totalPages={pdfFile && pdfPageCountReady ? totalPages : undefined}
        aiAllPagesMode={aiAllPagesMode}
        onAiAllPagesModeChange={setAiAllPagesMode}
        aiAllPagesProgress={aiAllPagesProgress}
        onAITakeoffAllPages={handleAITakeoffAllPages}
        aiModel={aiModel}
        onAiModelChange={(m: string) => { setAiModel(m); localStorage.setItem("measurex_ai_model", m); }}
        onSettings={() => setShowProjectSettings(true)}
        onToggleTakeoffSearch={() => setShowTakeoffSearch((prev) => !prev)}
        isTakeoffSearchOpen={showTakeoffSearch}
        onToggleTextSearch={() => setShowTextSearch((prev) => !prev)}
        isTextSearchOpen={showTextSearch}
        onGoToPage={(zeroBasedPage) => {
          const page = zeroBasedPage + 1;
          const clamped = Math.max(1, Math.min(totalPages, page));
          setCurrentPageNum(clamped);
          setCurrentPage(clamped, totalPages);
          safeGoToPage(clamped, 'top-nav:go-to-page');
        }}
        onPrev={() => {
          const prev = Math.max(1, currentPageNum - 1);
          setCurrentPageNum(prev);
          setCurrentPage(prev, totalPages);
          safeGoToPage(prev, 'top-nav:prev');
        }}
        onNext={() => {
          const next = Math.min(totalPages, currentPageNum + 1);
          setCurrentPageNum(next);
          setCurrentPage(next, totalPages);
          safeGoToPage(next, 'top-nav:next');
        }}
      />
      {pdfFetching && (
        <div
          data-testid="pdf-loading-indicator"
          role="status"
          aria-live="polite"
          className="absolute right-4 top-2 z-[70] rounded-md border border-[rgba(0,212,255,0.4)] bg-[rgba(0,212,255,0.12)] px-3 py-1 text-xs font-semibold text-[#7be9ff] shadow-[0_0_12px_rgba(0,212,255,0.25)]"
        >
          Loading PDF...
        </div>
      )}
      {!pdfFile && !pdfFetching && pdfFetchAttemptCompleted && projectId && (
        <button
          data-testid="reload-pdf-btn"
          onClick={() => void fetchStoredPdf(projectId, projectName || projectId)}
          className="absolute right-4 top-2 z-[70] rounded-md border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300 hover:border-amber-300 hover:bg-amber-400/20"
          aria-label="Reload PDF"
        >
          Reload PDF
        </button>
      )}
      {showTextSearch && (
        <TextSearchPanel
          projectId={projectId}
          onNavigate={(_pageId, pageNumber) => {
            const clamped = Math.max(1, Math.min(totalPages, pageNumber));
            setCurrentPageNum(clamped);
            setCurrentPage(clamped, totalPages);
            safeGoToPage(clamped, 'text-search:navigate');
            setShowTextSearch(false);
          }}
          onClose={() => setShowTextSearch(false)}
        />
      )}
      {/* Floating 2D/3D toggle — always visible */}
      <div className="absolute top-14 left-3 z-50 flex items-center gap-1 bg-[rgba(18,18,26,0.92)] backdrop-blur-sm border border-[#00d4ff]/20 rounded-lg p-1 shadow-[0_0_20px_rgba(0,212,255,0.15)]">
        <button
          onClick={() => setShow3D(false)}
          className={`h-8 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition ${
            !show3D
              ? 'bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#00d4ff]'
              : 'bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white hover:border-[#00d4ff]/35'
          }`}
        >
          2D
        </button>
        <button
          onClick={() => setShow3D(true)}
          className={`h-8 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition inline-flex items-center gap-1.5 ${
            show3D
              ? 'bg-[#00ff88]/15 border-[#00ff88]/50 text-[#00ff88]'
              : 'bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white hover:border-[#00d4ff]/35'
          }`}
        >
          <Layers3 size={13} />
          3D
        </button>
      </div>

      <div className={show3D ? 'flex-1 min-h-0 pb-16 lg:pb-0' : 'hidden'}>
        <ThreeDScene className="h-full w-full" walls={threeData.walls} areas={threeData.areas} labels={threeData.labels} pdfTextureUrl={pdfTextureUrl} />
      </div>

      <div className={show3D ? 'hidden' : 'flex flex-1 min-h-0 flex-col lg:flex-row pb-16 lg:pb-0'}>
        <div className={`hidden lg:block transition-all duration-200 ease-in-out ${quickTakeoff.isActive ? 'lg:w-0 lg:overflow-hidden lg:opacity-0' : ''}`}>
          <LeftToolbar />
        </div>

        {/* Thumbnail sidebar: show when PDF is loaded OR when project has data (shows page count from store) */}
        {(pdfFile || hasProjectData) && (
          <PageThumbnailSidebar
            totalPages={totalPages}
            currentPage={currentPageNum}
            pdfDoc={pdfDocState}
            page1Thumbnail={projectPage1Thumbnail}
            onPageSelect={(page) => {
              setCurrentPageNum(page);
              setCurrentPage(page, totalPages);
              safeGoToPage(page, 'thumbnail-sidebar');
            }}
            onAITakeoffPage={(page) => {
              safeGoToPage(page, 'thumbnail-context-menu:ai-takeoff');
              handleAITakeoff();
            }}
          />
        )}

        <div id="main-content" className="flex flex-col flex-1 min-h-0 order-1">
          {/* Wave 34B: project-loading-spinner — shown while hydrateProject is in flight
              with a projectId in the URL so the user sees a spinner instead of blank content */}
          {quantitiesLoading && !pdfFile && !hasProjectData && projectId && !projectNotFound && (
            <div
              data-testid="project-loading-skeleton"
              className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#0a0a0f]"
              role="status"
              aria-label="Loading project"
            >
              <svg className="animate-spin h-10 w-10 text-[#00d4ff]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm text-[#8892a0] font-mono">Loading project…</span>
            </div>
          )}

          {/* BUG-W39-001: project not found — show clear error with link back to /projects */}
          {projectNotFound && (
            <div
              data-testid="project-not-found"
              className="flex-1 flex flex-col items-center justify-center gap-5 bg-[#0a0a0f] p-8"
              role="alert"
            >
              <div className="text-5xl">🔍</div>
              <h2 className="text-xl font-semibold text-white">Project not found</h2>
              <p className="text-sm text-zinc-400 text-center max-w-sm">
                This project doesn&apos;t exist or may have been deleted.
              </p>
              <a
                href="/projects"
                className="px-5 py-2.5 rounded-xl bg-[#00d4ff] text-[#00131d] text-sm font-semibold hover:bg-[#00bce0] transition-colors"
              >
                ← Back to Projects
              </a>
            </div>
          )}
          <div className="flex flex-1 min-h-0 relative" style={{ cursor: currentTool === 'draw' || currentTool === 'measure' || currentTool === 'annotate' ? 'crosshair' : currentTool === 'pan' ? 'grab' : undefined }}>
            {pdfFile ? (
              /* ── PDF loaded — full viewer ── */
              <>
                <ErrorBoundary name="PDFViewer">
                <PDFViewer
                  ref={pdfViewerRef}
                  file={pdfFile}
                  projectId={projectId ?? undefined}
                  onTextExtracted={handleTextExtracted}
                  onPageChange={handlePDFPageChange}
                  cursor={
                    currentTool === 'draw' || currentTool === 'measure' || currentTool === 'annotate'
                      ? 'crosshair'
                      : currentTool === 'pan'
                      ? 'grab'
                      : 'default'
                  }
                >
                  {/* All overlay tools live inside the PDF pan/zoom transform so coords align */}
                  <ErrorBoundary name="CanvasOverlay">
                  <CanvasOverlay
                    onPolygonContextMenu={handlePolygonContextMenu}
                    onCanvasPointerDown={closeContextMenu}
                    highlightedPolygonId={highlightedPolygonId}
                  />
                  </ErrorBoundary>
                  {/* Compare diff overlay */}
                  {compareOverlay && <CompareOverlaySVG data={compareOverlay} />}
                  {currentTool === 'draw' && <DrawingTool />}
                  {(currentTool === 'merge' || currentTool === 'split') && <MergeSplitTool />}
                  {currentTool === 'cut' && <CutTool />}
                  {currentTool === 'measure' && <MeasurementTool />}
                  {currentTool === 'annotate' && <AnnotationTool />}
                  {cropMode && currentTool === 'crop' && (
                    <CropOverlay
                      onCropComplete={handleCropComplete}
                      onCancel={() => {
                        setCropMode(false);
                        setTool('select');
                        setShowImageSearch(true);
                      }}
                    />
                  )}
                  {isDefiningGroup && <RepeatingGroupTool />}
                </PDFViewer>
                </ErrorBoundary>
                <ZoomControls onFitToPage={() => pdfViewerRef.current?.fitToPage()} />

                {menuState && !agentMode && (
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
                  if (f && f.type === 'application/pdf') {
                    setUploadError(null);
                    setPdfFile(f);
                    // Wave 36B: also call ensureProject when there is no project yet
                    // so dropping a PDF on the canvas always auto-creates a project
                    if (!projectId) void ensureProject(f.name, f);
                  }
                }}
              >
                {pdfFetching ? (
                  /* BUG-R5-002: spinner while auto-fetching saved PDF */
                  <div
                    className="flex flex-col items-center gap-4 text-[rgba(0,212,255,0.7)]"
                    data-testid="pdf-loading-indicator-canvas"
                    aria-label="Loading PDF"
                    role="status"
                  >
                    <svg className="animate-spin h-10 w-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span className="text-sm font-medium">Loading PDF…</span>
                  </div>
                ) : (() => {
                  // BUG-W15-001: distinguish "new project (never had PDF)" from
                  // "project had a PDF but it's not in memory".
                  // A project has had a PDF if it has polygons, totalPages > 1, or
                  // if the pdfUrl is stored on the project (Supabase mode).
                  const hadPdf = polygons.length > 0 || totalPages > 1;
                  return hadPdf ? (
                    <label
                      data-testid="empty-state-re-upload"
                      className="cursor-pointer border-2 border-dashed border-[rgba(0,212,255,0.4)] rounded-xl p-8 md:p-12 hover:border-[rgba(0,212,255,0.8)] transition-colors text-center w-full max-w-xl bg-[rgba(0,212,255,0.03)]"
                    >
                      <div className="flex items-center justify-center mb-3"><FileIcon className="text-[rgba(0,212,255,0.5)]" size={40} /></div>
                      <div className="text-base font-semibold text-[rgba(0,212,255,0.9)] mb-1">
                        {projectName || 'Project loaded'}
                      </div>
                      <div className="text-sm text-zinc-400 mb-3">
                        {classifications.length} classification{classifications.length !== 1 ? 's' : ''} · {polygons.length} polygon{polygons.length !== 1 ? 's' : ''} · {totalPages} page{totalPages !== 1 ? 's' : ''}
                      </div>
                      <div
                        data-testid="pdf-missing-banner"
                        className="text-sm text-amber-400 mb-2 font-medium"
                      >
                        This PDF was uploaded locally. Please re-upload to continue.
                      </div>
                      <div className="text-xs text-zinc-600 mt-1">Click to select or drag & drop</div>
                      <input type="file" accept=".pdf" onChange={onFileChange} className="sr-only" data-testid="upload-pdf-input" />
                    </label>
                  ) : (
                    <label
                      data-testid="empty-state-new-project"
                      className="cursor-pointer border-2 border-dashed border-[rgba(0,212,255,0.4)] rounded-xl p-8 md:p-12 hover:border-[rgba(0,212,255,0.8)] transition-colors text-center w-full max-w-xl bg-[rgba(0,212,255,0.03)]"
                    >
                      <div className="flex items-center justify-center mb-3"><FileIcon className="text-[rgba(0,212,255,0.5)]" size={40} /></div>
                      <div className="text-base font-semibold text-[rgba(0,212,255,0.9)] mb-1">
                        {projectName || 'New project'}
                      </div>
                      <div className="text-sm text-zinc-400 mb-3">Upload a PDF to get started with your takeoff.</div>
                      <div className="text-xs text-zinc-600 mt-1">Click to select or drag & drop · Max 100 MB</div>
                      <input type="file" accept=".pdf" onChange={onFileChange} className="sr-only" data-testid="upload-pdf-input" />
                    </label>
                  );
                })()}
              </div>
            ) : (
              /* ── No project, no PDF — fresh upload screen ── */
              <div
                data-testid="empty-state-upload-prompt"
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
                <div className="w-full max-w-xl flex flex-col items-center gap-3">
                  <label
                    data-testid="upload-dropzone"
                    className={`cursor-pointer bg-white border-2 border-dashed rounded-xl p-8 md:p-12 hover:border-blue-400 transition-colors text-center w-full ${uploadError ? 'border-red-400' : 'border-neutral-300'}`}
                  >
                    <div className="flex items-center justify-center mb-3"><FileIcon className="text-neutral-400" size={40} /></div>
                    <div className="text-lg font-medium text-neutral-700">Upload Blueprint PDF</div>
                    <div id="upload-help" className="text-sm text-neutral-400 mt-1">Click to select or drag & drop · Max 50 MB</div>
                    <input type="file" accept=".pdf" onChange={onFileChange} className="sr-only" data-testid="upload-pdf-input" />
                  </label>
                  {uploadError && (
                    <div
                      className="w-full rounded-lg px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2"
                      role="alert"
                      data-testid={uploadError.toLowerCase().includes('too large') || uploadError.toLowerCase().includes('100') ? 'upload-size-error' : 'upload-error-message'}
                    >
                      <span className="mt-0.5 shrink-0">⚠️</span>
                      <span>{uploadError}</span>
                      <button
                        type="button"
                        data-testid="upload-retry-btn"
                        onClick={() => setUploadError(null)}
                        className="ml-auto shrink-0 text-red-600 underline hover:text-red-800 text-xs font-medium"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Context toolbar — shown when polygons are selected or draw/measure tool is active */}
          {!agentMode && (
            <ContextToolbarConnected
              currentTool={currentTool}
              polygonsExist={polygons.length > 0}
              onMerge={() => setTool('merge')}
              addToast={addToast}
            />
          )}
          <BottomStatusBar onScaleClick={() => setShowScaleCalibPanel(true)} />
        </div>

        <div className={`transition-all duration-200 ease-in-out ${quickTakeoff.isActive ? 'lg:w-0 lg:overflow-hidden lg:opacity-0' : ''}`}>
          <ErrorBoundary name="QuantitiesPanel">
            <QuantitiesPanel
              showTakeoffSearch={showTakeoffSearch}
              onTakeoffSearchSelect={handleTakeoffSearchSelect}
              isLoading={quantitiesLoading}
              onClassificationZoom={handleClassificationZoom}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* Quick Takeoff Mode HUD */}
      <QuickTakeoffMode />

      {/* Agent mode: Togal button fires webhook instead of AI takeoff */}
      {agentMode && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 60 }}>
          <ReTogal
            currentPage={currentPageNum}
            hasScale={!!scale}
            hasRunTakeoff={polygons.some((p) => p.pageNumber === currentPageNum)}
            onRunTakeoff={handleAITakeoff}
            agentMode={agentMode}
          />
        </div>
      )}

      {/* Mobile/Tablet bottom toolbar */}
      <MobileToolbar />

      {/* GAP-006: Single confirmation dialog before applying detected scale */}
      {showAutoScalePopup && detectedScaleInfo && !agentMode && (
        <AutoScalePopup
          projectId={projectId}
          detectedScale={detectedScaleInfo.scale}
          confidence={detectedScaleInfo.confidence}
          onDismiss={() => setShowAutoScalePopup(false)}
          onDontShowAgain={() => {
            if (projectId) {
              localStorage.setItem(`mx-autoscale-skip-${projectId}`, 'true');
            }
            setShowAutoScalePopup(false);
          }}
          onAccept={() => {
            handleAcceptScale();
            setShowAutoScalePopup(false);
          }}
        />
      )}

      {ntsWarning && !agentMode && <div data-testid='nts-warning' className='fixed top-4 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white px-4 py-2 rounded-lg z-50'>Drawing marked as Not to Scale — measurements may be inaccurate</div>}

      {/* Wave 36B: large PDF warning — shown when PDF has > 20 pages.
          AI all-pages takeoff at ~3s/page means 50 pages ≈ 150s. Warn the user. */}
      {pdfPageCountReady && totalPages > 20 && pdfFile && !agentMode && (
        <div
          data-testid="large-pdf-warning"
          className="fixed top-14 right-4 z-50 max-w-xs rounded-xl px-4 py-3 text-sm shadow-xl"
          style={{
            background: 'rgba(161,98,7,0.15)',
            border: '1px solid rgba(251,191,36,0.45)',
            color: '#fef3c7',
            backdropFilter: 'blur(6px)',
          }}
          role="status"
        >
          <div className="font-semibold mb-1">⚠️ Large PDF detected ({totalPages} pages)</div>
          <div className="text-xs text-amber-200/80">
            AI takeoff will take ~{Math.round(totalPages * 3)}s total.
            Consider running page-by-page for faster results.
          </div>
        </div>
      )}

      {showCalModal && !agentMode && <ScaleCalibration onClose={() => setShowCalModal(false)} />}
      {showScaleCalibPanel && <ScaleCalibrationPanel onClose={() => setShowScaleCalibPanel(false)} />}
      {showProjectSettings && (
        <ProjectSettingsPanel
          open={showProjectSettings}
          onClose={() => setShowProjectSettings(false)}
          projectName={projectName}
          onProjectNameSaved={(newName) => {
            setProjectName(newName);
            persistSaveStatus('Project renamed');
          }}
          onProjectDeleted={() => {
            setProjectId(null);
            setProjectName(null);
          }}
        />
      )}

      {/* Calibration draw overlay — captures two clicks when tool is 'calibrate' */}
      {currentTool === 'calibrate' && (
        <div
          className="fixed inset-0 z-40"
          style={{ cursor: 'crosshair', background: 'transparent' }}
          onClick={(e) => {
            const canvas = pdfViewerRef.current?.getPageCanvas?.();
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const next = [...calibrationClicks, { x, y }];
            setCalibrationClicks(next);
            if (next.length >= 2) {
              const [p1, p2] = next;
              const lengthPx = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
              window.dispatchEvent(new CustomEvent('calibration-line-complete', { detail: { lengthPx } }));
              setCalibrationClicks([]);
            }
          }}
        />
      )}
      {!agentMode && <KeyboardShortcutsModal open={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />}

      {!agentMode && takeoffSummary ? (
        <TakeoffProgressModal
          open={false}
          pageStatuses={[]}
          total={0}
          currentPage={0}
          model={aiModel}
          summary={takeoffSummary}
          onDismissSummary={() => {
            setTakeoffSummary(null);
            setAiPageStatuses([]);
            // Zoom to page 1
            safeGoToPage(1, 'takeoff-summary:view-results');
          }}
        />
      ) : !agentMode && aiLoading && aiAllPagesProgress ? (
        <TakeoffProgressModal
          open={true}
          pageStatuses={aiPageStatuses}
          total={aiAllPagesProgress.total}
          currentPage={aiAllPagesProgress.current}
          model={aiModel}
          sheetNames={sheetNames}
          onCancel={handleCancelTakeoff}
        />
      ) : !agentMode && aiLoading ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-8 shadow-2xl text-center max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <div className="text-lg font-semibold text-neutral-800">AI Takeoff in Progress</div>
            <div className="text-sm text-neutral-500 mt-2">{aiStatus}</div>
            {aiAllPagesProgress && (
              <div
                data-testid="takeoff-progress-pct"
                className="text-xs font-mono text-blue-500 mt-1"
              >
                {Math.round((aiAllPagesProgress.current / Math.max(aiAllPagesProgress.total, 1)) * 100)}%
              </div>
            )}
          </div>
        </div>
      ) : null}

      {saveStatus && (
        <div
          className="fixed top-14 right-4 z-50 text-white px-3 py-1.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-1.5 transition-opacity"
          style={{
            background: saveStatus.startsWith('Error') ? 'rgba(239,68,68,0.9)' : 'rgba(34,197,94,0.85)',
            backdropFilter: 'blur(4px)',
            border: saveStatus.startsWith('Error') ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(34,197,94,0.3)',
          }}
          data-testid="save-status-indicator"
          role="status"
          aria-live="polite"
          aria-label={saveStatus}
        >
          {!saveStatus.startsWith('Error') && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {saveStatus}
        </div>
      )}

      {!aiLoading && aiStatus && (
        <div
          className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-50 text-white px-6 py-3 rounded-lg shadow-lg text-sm font-medium ${aiStatus.startsWith('Error:') || aiStatus.includes('timed out') || aiStatus.includes('failed') ? 'bg-red-600' : 'bg-emerald-600'}`}
          // Wave 11B: data-testid=api-error-display when the status is an error so
          // agents and tests can assert on visible API errors without CSS inspection.
          data-testid={aiStatus.startsWith('Error:') || aiStatus.includes('timed out') || aiStatus.includes('failed') ? 'takeoff-error-message' : undefined}
          role={aiStatus.startsWith('Error:') || aiStatus.includes('timed out') ? 'alert' : 'status'}
        >
          {aiStatus}
        </div>
      )}

      {/* AI Activity Log — bottom-left corner */}
      {projectId && (
        <div className="fixed bottom-16 left-2 z-30 hidden lg:block">
          <AIActivityLog />
        </div>
      )}

      <MXChat visible={showChat} onClose={() => setShowChat(false)} />
      {showImageSearch && (
        <AIImageSearch
          onClose={() => {
            setShowImageSearch(false);
            setCroppedImageBase64(null);
          }}
          hasPdf={!!pdfFile}
          getPageCanvas={() => pdfViewerRef.current?.getPageCanvas?.() ?? null}
          onStartCrop={() => {
            setShowImageSearch(false);
            setCropMode(true);
            setTool('crop');
          }}
          croppedImageBase64={croppedImageBase64}
        />
      )}

      {/* Pattern Search (E26) */}
      {showPatternSearch && (
        <PatternSearch
          onClose={() => setShowPatternSearch(false)}
          onAddToTakeoff={handlePatternSearchAdd}
          pdfPageImageData={patternSearchPageImage}
          currentPage={currentPageNum}
        />
      )}

      {/* Export panel */}
      {showExport && (
        <ExportPanel onClose={() => setShowExport(false)} />
      )}

      {/* Compare panel */}
      {showCompare && projectId && (
        <ComparePanel
          currentProjectId={projectId}
          onOverlay={setCompareOverlay}
          onClose={() => {
            setShowCompare(false);
            setCompareOverlay(null);
          }}
        />
      )}

      {/* What's New modal */}
      {!agentMode && whatsNew.show && <WhatsNewModal onClose={whatsNew.dismiss} />}

      {/* BUG-W14-001: Project name modal — replaces window.prompt */}
      {showNameModal && (
        <div
          data-testid="project-name-modal"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowNameModal(false)}
        >
          <div
            className="bg-[#0a0a0f] border border-[#00d4ff]/30 rounded-xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-white mb-4 font-mono tracking-wide">Name your project</h2>
            <input
              autoFocus
              type="text"
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pendingName.trim()) {
                  setShowNameModal(false);
                  void createNamedProject(pendingName.trim());
                } else if (e.key === 'Escape') {
                  setShowNameModal(false);
                }
              }}
              placeholder="e.g. 123 Main St — ADU"
              className="w-full px-3 py-2 mb-4 rounded-lg bg-[#12121a] border border-[#00d4ff]/20 text-white text-sm outline-none focus:border-[#00d4ff]/60 placeholder-gray-600"
              data-testid="project-name-modal-input"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowNameModal(false)}
                className="px-4 py-2 text-xs text-gray-400 border border-gray-700 rounded-lg hover:border-gray-500"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="project-name-modal-save"
                disabled={!pendingName.trim()}
                onClick={() => {
                  if (!pendingName.trim()) return;
                  setShowNameModal(false);
                  void createNamedProject(pendingName.trim());
                }}
                className="px-4 py-2 text-xs font-semibold text-[#00131d] bg-[#00d4ff] rounded-lg hover:bg-[#00bce0] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* First-run tooltips for new editor users */}
      {projectId && !agentMode && <FirstRunTooltips />}

      {/* GAP-006: Server-detected scale banner from upload response */}
      {uploadDetectedScale && (
        <div
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 rounded-lg shadow-2xl px-5 py-3 flex items-center gap-4"
          style={{ background: '#1a1a2e', border: '1px solid rgba(0,212,255,0.4)' }}
        >
          <span className="text-sm text-white">
            Scale detected: <strong>{uploadDetectedScale.description}</strong> — Apply?
          </span>
          <button
            onClick={() => {
              setScale({
                pixelsPerUnit: uploadDetectedScale.pixelsPerUnit,
                unit: uploadDetectedScale.unit as 'ft' | 'in' | 'm' | 'cm' | 'mm',
                label: uploadDetectedScale.description,
                source: 'auto',
              });
              setScaleForPage(1, {
                pixelsPerUnit: uploadDetectedScale.pixelsPerUnit,
                unit: uploadDetectedScale.unit as 'ft' | 'in' | 'm' | 'cm' | 'mm',
                label: uploadDetectedScale.description,
                source: 'auto',
              });
              localStorage.setItem('mx-onboarding-scale-set', 'true');
              import('@/components/NotificationSettings').then(({ getNotificationPrefs }) => {
                if (getNotificationPrefs().scaleChanged) {
                  addToast('Scale applied: ' + uploadDetectedScale.description, 'success');
                }
              });
              setUploadDetectedScale(null);
            }}
            className="rounded px-3 py-1 text-xs font-semibold"
            style={{ background: '#059669', color: '#fff', cursor: 'pointer' }}
          >
            Accept
          </button>
          <button
            onClick={() => setUploadDetectedScale(null)}
            className="rounded px-3 py-1 text-xs font-medium"
            style={{ background: 'transparent', color: '#a0aec0', border: '1px solid rgba(160,174,192,0.3)', cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
      )}
      <CoordInputPanel agentMode={agentMode} />
      <span
        id="mx-agent-state"
        data-testid="mx-agent-state"
        data-page={String(currentPage)}
        data-current-page={String(currentPage)}
        data-total-pages={String(totalPages || 1)}
        data-tool={currentTool}
        data-active-tool={currentTool}
        data-project-id={projectId || ''}
        data-selected-classification={selectedClassificationId || ''}
        data-polygon-count={String(polygons.filter((p) => p.pageNumber === currentPage).length)}
        data-scale-px-per-unit={scale ? String(scale.pixelsPerUnit) : ''}
        data-scale={scale ? String(scale.pixelsPerUnit) : ''}
        data-scale-unit={scale?.unit || ''}
        data-canvas-width={String(pageBaseDimensions[currentPage]?.width || '')}
        data-canvas-height={String(pageBaseDimensions[currentPage]?.height || '')}
        data-is-dirty={String(!!isDirty)}
        data-sheet-name={sheetNames[currentPage] || ''}
        data-ai-loading={String(!!aiLoading)}
        data-classification-count={String(classifications.length)}
        style={{ display: 'none' }}
      />
      {/* Wave 11B: SSE status indicator — readable by agent via DOM snapshot or evaluate().
          data-connected: "true"|"false"
          data-ready-state: 0=CONNECTING, 1=OPEN, 2=CLOSED
          The agent can also call window.measurex.sseStatus() for a full object. */}
      <span
        id="mx-sse-status"
        data-testid="sse-status"
        style={{ display: 'none' }}
      />
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
