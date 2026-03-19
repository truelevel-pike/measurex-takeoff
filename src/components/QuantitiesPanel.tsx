'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, Check, ChevronDown, ChevronRight, Crosshair, Download, Eye, EyeOff, GitMerge, Hash, History, Info, Layers, Minus, Pencil, Plus, Printer, Search, Settings, SlidersHorizontal, Square, Trash2, Wand2, X } from 'lucide-react';
import { assignTradeGroup, TRADE_GROUP_ORDER, TRADE_GROUP_LABELS, type TradeGroup } from '@/lib/trade-groups';
import { useStore } from '@/lib/store';
import type { Classification, Polygon } from '@/lib/types';
import { useIsMobile, useIsTablet } from '@/lib/utils';
import { useMeasurementSettings } from '@/lib/use-measurement-settings';
import { formatArea, formatLinear, formatCount, AREA_UNIT_LABELS, LINEAR_UNIT_LABELS } from '@/lib/measurement-settings';
import { calculateLinearFeet } from '@/lib/polygon-utils';
import VersionHistory from './VersionHistory';
import AssembliesPanel from './AssembliesPanel';
import EstimatesTab from './EstimatesTab';
import MeasurementSettingsPanel from './MeasurementSettings';
import ClassificationLibrary from './ClassificationLibrary';
import ImportFromLibraryModal from './ImportFromLibraryModal';
import UserPreferencesPanel from './UserPreferencesPanel';
import { computeDeductions, aggregateDeductions } from '@/server/geometry-engine';
import type { AutoDeduction } from '@/server/geometry-engine';

const TYPE_OPTIONS = [
  { value: 'area', label: 'Area (SF)' },
  { value: 'linear', label: 'Linear (LF)' },
  { value: 'count', label: 'Count (EA)' },
] as const;

const CLASSIFICATION_COLOR_PRESETS = [
  '#dc2626', '#ef4444', '#f87171', '#b91c1c',
  '#ea580c', '#f97316', '#fb923c', '#c2410c',
  '#ca8a04', '#eab308', '#facc15', '#a16207',
  '#16a34a', '#22c55e', '#4ade80', '#15803d',
  '#2563eb', '#3b82f6', '#60a5fa', '#1d4ed8',
] as const;

type ClassificationType = Classification['type'];

/**
 * Groups a list of classifications by trade.
 * Prefers the stored `tradeGroup` metadata on the classification; falls back to
 * keyword-based assignment via `assignTradeGroup` for legacy/ungrouped items.
 */
function groupClassificationsByTrade(items: Classification[]): Record<TradeGroup, Classification[]> {
  const result = {} as Record<TradeGroup, Classification[]>;
  for (const trade of TRADE_GROUP_ORDER) {
    result[trade] = [];
  }
  for (const cls of items) {
    const trade: TradeGroup = cls.tradeGroup ?? assignTradeGroup(cls.name);
    result[trade].push(cls);
  }
  return result;
}

export interface TakeoffSearchResult {
  id: string;
  classificationId: string;
  classificationName: string;
  pageNumber: number;
  polygonCount: number;
  polygonId: string;
}

type ClassTotals = {
  count: number;
  areaReal: number;
  lengthReal: number;
};
type ClassificationDeduction = { label: string; quantity: number };

function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function normalizeHexInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

interface MergeSuggestion {
  survivor: Classification;
  duplicates: Classification[];
  reason: string;
}

function suggestMerges(classifications: Classification[]): MergeSuggestion[] {
  const suggestions: MergeSuggestion[] = [];
  const visited = new Set<string>();

  function normalize(name: string): string {
    return name.trim().toLowerCase().replace(/[\/\-]+/g, ' ').replace(/\s+/g, ' ');
  }

  function splitWords(name: string): string[] {
    return normalize(name).split(' ').filter((w) => w.length > 2);
  }

  function isSimilar(a: string, b: string): boolean {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return true;
    if (na.includes(nb) || nb.includes(na)) return true;
    const wa = splitWords(a);
    const wb = splitWords(b);
    if (wa.length === 0 || wb.length === 0) return false;
    const overlap = wa.filter((w) => wb.includes(w));
    return overlap.length >= Math.min(wa.length, wb.length);
  }

  for (let i = 0; i < classifications.length; i++) {
    const cls = classifications[i];
    if (visited.has(cls.id)) continue;

    const group: Classification[] = [cls];
    for (let j = i + 1; j < classifications.length; j++) {
      const other = classifications[j];
      if (visited.has(other.id)) continue;
      if (isSimilar(cls.name, other.name)) {
        group.push(other);
      }
    }

    if (group.length > 1) {
      const survivor = group.reduce((a, b) => a.name.length <= b.name.length ? a : b);
      const duplicates = group.filter((c) => c.id !== survivor.id);
      group.forEach((c) => visited.add(c.id));
      suggestions.push({
        survivor,
        duplicates,
        reason: `Similar names: ${group.map((c) => c.name).join(', ')}`,
      });
    }
  }

  return suggestions;
}

function ColorPickerField({
  colorValue,
  onColorChange,
  swatchLabel,
}: {
  colorValue: string;
  onColorChange: (value: string) => void;
  swatchLabel: string;
}) {
  const normalized = normalizeHexInput(colorValue);
  const preview = isHexColor(normalized) ? normalized : '#3b82f6';

  return (
    <div className="mb-2">
      <div className="grid grid-cols-10 gap-1.5 mb-2">
        {CLASSIFICATION_COLOR_PRESETS.map((preset) => {
          const isSelected = normalized.toLowerCase() === preset.toLowerCase();
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onColorChange(preset)}
              className={`w-5 h-5 rounded border ${isSelected ? 'border-white ring-1 ring-[#00d4ff]/80' : 'border-[#00d4ff]/30'}`}
              style={{ backgroundColor: preset }}
              aria-label={`Use preset ${preset}`}
              title={preset}
            />
          );
        })}
      </div>

      <div className="flex gap-2 items-center">
        <div
          className="w-6 h-6 rounded border border-[#00d4ff]/30 flex-shrink-0"
          style={{ backgroundColor: preview, boxShadow: `0 0 6px ${preview}55` }}
          aria-label={swatchLabel}
          title={preview}
        />
        <input
          type="text"
          value={colorValue}
          onChange={(event) => onColorChange(event.target.value)}
          className="flex-1 px-2 py-1 border rounded text-[12px] outline-none bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
          placeholder="#3b82f6"
          aria-label="Custom hex color"
        />
      </div>
    </div>
  );
}

/** Small SVG shape indicator to distinguish classifications without relying on color alone. */
const SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
function ClassificationShape({ index, color, size = 10 }: { index: number; color: string; size?: number }) {
  const shape = SHAPES[index % SHAPES.length];
  const half = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="flex-shrink-0">
      {shape === 'circle' && <circle cx={half} cy={half} r={half - 1} fill={color} />}
      {shape === 'square' && <rect x={1} y={1} width={size - 2} height={size - 2} fill={color} />}
      {shape === 'triangle' && <polygon points={`${half},1 ${size - 1},${size - 1} 1,${size - 1}`} fill={color} />}
      {shape === 'diamond' && <polygon points={`${half},0 ${size},${half} ${half},${size} 0,${half}`} fill={color} />}
    </svg>
  );
}

interface QuantitiesPanelProps {
  showTakeoffSearch?: boolean;
  onTakeoffSearchSelect?: (result: TakeoffSearchResult) => void;
  isLoading?: boolean;
  onClassificationZoom?: (classificationId: string) => void;
}

export default function QuantitiesPanel({ showTakeoffSearch = false, onTakeoffSearchSelect, isLoading, onClassificationZoom }: QuantitiesPanelProps) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [activeTab, setActiveTab] = useState<'quantities' | 'assemblies' | 'estimate'>('quantities');

  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const scales = useStore((s) => s.scales);
  const selectedClassification = useStore((s) => s.selectedClassification);

  const addClassification = useStore((s) => s.addClassification);
  const updateClassification = useStore((s) => s.updateClassification);
  const deleteClassification = useStore((s) => s.deleteClassification);
  const setSelectedClassification = useStore((s) => s.setSelectedClassification);
  const toggleClassification = useStore((s) => s.toggleClassification);
  const mergeClassifications = useStore((s) => s.mergeClassifications);

  const showQuantitiesDrawer = useStore((s) => s.showQuantitiesDrawer);
  const setShowQuantitiesDrawer = useStore((s) => s.setShowQuantitiesDrawer);
  const focusPolygon = useStore((s) => s.focusPolygon);
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const setHoveredClassificationId = useStore((s) => s.setHoveredClassificationId);

  const groups = useStore((s) => s.groups);
  const addGroup = useStore((s) => s.addGroup);
  const updateGroup = useStore((s) => s.updateGroup);
  const deleteGroup = useStore((s) => s.deleteGroup);
  const moveClassificationToGroup = useStore((s) => s.moveClassificationToGroup);

  const [search, setSearch] = useState('');
  const [takeoffSearchQuery, setTakeoffSearchQuery] = useState('');
  const [showNewClassification, setShowNewClassification] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showImportFromLibrary, setShowImportFromLibrary] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setProjectId(params.get('project') || localStorage.getItem('measurex_project_id'));
  }, []);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ClassificationType>('area');
  const [newColorHex, setNewColorHex] = useState('#3b82f6');
  const [newClassificationError, setNewClassificationError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<ClassificationType>('area');
  const [editColorHex, setEditColorHex] = useState('#3b82f6');
  const [editOriginalColor, setEditOriginalColor] = useState('#3b82f6');
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selectedClassificationId, setSelectedClassificationId] = useState<string | null>(null);
  const [showMeasurementSettings, setShowMeasurementSettings] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState('#3b82f6');
  const [groupSelectedClassificationIds, setGroupSelectedClassificationIds] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupByTrade, setGroupByTrade] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('measurex_group_by_trade') === 'true';
  });
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>(() => {
    if (typeof window === 'undefined') return 'summary';
    const stored = localStorage.getItem('mx-quantities-view-mode');
    if (stored === 'detailed' || stored === 'summary') return stored;
    const hasInteracted = localStorage.getItem('mx-quantities-interacted');
    return hasInteracted ? 'detailed' : 'summary';
  });
  const [collapsedTrades, setCollapsedTrades] = useState<Set<TradeGroup>>(new Set());
  const [deductionsByClassification, setDeductionsByClassification] = useState<Record<string, ClassificationDeduction[]>>({});
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeSurvivorId, setMergeSurvivorId] = useState<string | null>(null);
  const [showCleanUpDialog, setShowCleanUpDialog] = useState(false);
  const [cleanUpSuggestions, setCleanUpSuggestions] = useState<MergeSuggestion[]>([]);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<number>>(new Set());
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [lastUpdatedTime] = useState(() => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  const { settings: measurementSettings, setSettings: setMeasurementSettings } = useMeasurementSettings();

  const drawerRef = useRef<HTMLDivElement>(null);
  const newClassNameRef = useRef<HTMLInputElement>(null);

  const getPixelsPerUnitForPage = useCallback((pageNumber: number) => {
    return scales[pageNumber]?.pixelsPerUnit || scale?.pixelsPerUnit || 1;
  }, [scales, scale]);


  // Close preferences panel whenever the project changes (prevents auto-open on load)
  useEffect(() => {
    setShowPreferences(false);
  }, [projectId]);

  // Focus first element in drawer when opened on mobile
  useEffect(() => {
    if (showQuantitiesDrawer && drawerRef.current) {
      const firstFocusable = drawerRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, [showQuantitiesDrawer]);

  // Focus new classification name input when form opens
  useEffect(() => {
    if (showNewClassification && newClassNameRef.current) {
      newClassNameRef.current.focus();
    }
  }, [showNewClassification]);

  // Escape to close drawer on mobile
  const handleDrawerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowQuantitiesDrawer(false);
      }
    },
    [setShowQuantitiesDrawer]
  );

  const searchLower = search.toLowerCase().trim();

  const filtered = useMemo(
    () => {
      if (!searchLower) return classifications;
      return classifications.filter((c) => c.name.toLowerCase().includes(searchLower));
    },
    [classifications, searchLower]
  );
  const tradeGrouped = useMemo(
    () => groupClassificationsByTrade(filtered),
    [filtered]
  );

  const handleToggleGroupByTrade = useCallback(() => {
    setGroupByTrade((prev) => {
      const next = !prev;
      localStorage.setItem('measurex_group_by_trade', String(next));
      return next;
    });
  }, []);

  const toggleTradeCollapse = useCallback((trade: TradeGroup) => {
    setCollapsedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(trade)) next.delete(trade);
      else next.add(trade);
      return next;
    });
  }, []);

  // Build a flat ordered list with trade headers interleaved when grouping is active
  type TradeHeader = { kind: 'header'; trade: TradeGroup; count: number };
  type ClassRow = { kind: 'row'; classification: Classification; classIndex: number };
  type ListItem = TradeHeader | ClassRow;

  const orderedListItems = useMemo<ListItem[]>(() => {
    if (!groupByTrade || filtered.length < 3) {
      return filtered.map((classification, classIndex) => ({ kind: 'row' as const, classification, classIndex }));
    }
    const items: ListItem[] = [];
    for (const trade of TRADE_GROUP_ORDER) {
      const tradeClassifications = tradeGrouped[trade] ?? [];
      if (tradeClassifications.length === 0) continue;
      items.push({ kind: 'header' as const, trade, count: tradeClassifications.length });
      if (!collapsedTrades.has(trade)) {
        for (const cls of tradeClassifications) {
          const classIndex = filtered.indexOf(cls);
          items.push({ kind: 'row' as const, classification: cls, classIndex });
        }
      }
    }
    return items;
  }, [groupByTrade, filtered, tradeGrouped, collapsedTrades]);

  // Load-more pagination for large lists (35+ items)
  const LOAD_STEP = 20;
  const [visibleCount, setVisibleCount] = useState(30);
  // Reset visible count when search changes
  useEffect(() => { setVisibleCount(30); }, [searchLower]);

  const classificationById = useMemo(() => {
    const byId = new Map<string, Classification>();
    for (const classification of classifications) {
      byId.set(classification.id, classification);
    }
    return byId;
  }, [classifications]);

  // Polygons matching search by label (shown as extra search results)
  const matchingPolygons = useMemo(() => {
    if (!searchLower) return [];
    return polygons.filter((p) => p.label && p.label.toLowerCase().includes(searchLower));
  }, [polygons, searchLower]);

  function handleFocusPolygon(polygon: Polygon) {
    setCurrentPage(polygon.pageNumber);
    focusPolygon(polygon.id);
  }

  const polygonsByClassification = useMemo(() => {
    const byClass = new Map<string, Polygon[]>();
    for (const polygon of polygons) {
      const items = byClass.get(polygon.classificationId);
      if (items) {
        items.push(polygon);
      } else {
        byClass.set(polygon.classificationId, [polygon]);
      }
    }
    return byClass;
  }, [polygons]);

  const polygonCountsByClassificationPage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const polygon of polygons) {
      const key = `${polygon.classificationId}:${polygon.pageNumber}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [polygons]);

  const takeoffSearchResults = useMemo(() => {
    const query = takeoffSearchQuery.trim().toLowerCase();
    if (!query) return [] as TakeoffSearchResult[];

    const byClassPage = new Map<string, TakeoffSearchResult>();
    for (const polygon of polygons) {
      const classification = classificationById.get(polygon.classificationId);
      if (!classification) continue;

      const classMatch = classification.name.toLowerCase().includes(query);
      const labelMatch = (polygon.label ?? '').toLowerCase().includes(query);
      if (!classMatch && !labelMatch) continue;

      const key = `${polygon.classificationId}:${polygon.pageNumber}`;
      if (!byClassPage.has(key)) {
        byClassPage.set(key, {
          id: key,
          classificationId: polygon.classificationId,
          classificationName: classification.name,
          pageNumber: polygon.pageNumber,
          polygonCount: polygonCountsByClassificationPage.get(key) ?? 1,
          polygonId: polygon.id,
        });
      }
    }

    return Array.from(byClassPage.values())
      .sort((a, b) => (a.pageNumber - b.pageNumber) || a.classificationName.localeCompare(b.classificationName))
      .slice(0, 30);
  }, [takeoffSearchQuery, polygons, classificationById, polygonCountsByClassificationPage]);

  // Count of classifications that have at least one polygon
  const activeClassificationCount = useMemo(
    () => classifications.filter((c) => polygonsByClassification.has(c.id)).length,
    [classifications, polygonsByClassification]
  );

  // For count classifications: group polygon counts by page number
  const countsByPage = useMemo(() => {
    const result = new Map<string, Map<number, number>>();
    for (const c of classifications) {
      if (c.type !== 'count') continue;
      const items = polygonsByClassification.get(c.id) ?? [];
      const pageMap = new Map<number, number>();
      for (const p of items) {
        pageMap.set(p.pageNumber, (pageMap.get(p.pageNumber) ?? 0) + 1);
      }
      result.set(c.id, pageMap);
    }
    return result;
  }, [classifications, polygonsByClassification]);

  const totalsByClassification = useMemo(() => {
    const totals = new Map<string, ClassTotals>();
    for (const c of classifications) {
      const items = polygonsByClassification.get(c.id) ?? [];
      let areaReal = 0;
      let lengthReal = 0;
      for (const polygon of items) {
        const ppu = getPixelsPerUnitForPage(polygon.pageNumber);
        areaReal += polygon.area / (ppu * ppu);
        lengthReal += calculateLinearFeet(polygon.points, ppu, false);
      }
      totals.set(c.id, {
        count: items.length,
        areaReal,
        lengthReal,
      });
    }
    return totals;
  }, [classifications, polygonsByClassification, getPixelsPerUnitForPage]);

  // Build a flat Record<classificationId, number> for EstimatesTab
  const estimateQuantities = useMemo(() => {
    const result: Record<string, number> = {};
    for (const c of classifications) {
      const t = totalsByClassification.get(c.id);
      if (!t) { result[c.id] = 0; continue; }
      if (c.type === 'area') result[c.id] = t.areaReal;
      else if (c.type === 'linear') result[c.id] = t.lengthReal;
      else result[c.id] = t.count;
    }
    return result;
  }, [classifications, totalsByClassification]);

  // Summary mode: top-10 classifications by primary metric
  const SUMMARY_LIMIT = 10;
  const summaryFilteredItems = useMemo<typeof orderedListItems>(() => {
    if (viewMode === 'detailed' || filtered.length <= SUMMARY_LIMIT) return orderedListItems;
    const ranked = [...filtered].sort((a, b) => {
      const ta = totalsByClassification.get(a.id);
      const tb = totalsByClassification.get(b.id);
      if (!ta || !tb) return 0;
      if (a.type === 'area') return tb.areaReal - ta.areaReal;
      if (a.type === 'linear') return tb.lengthReal - ta.lengthReal;
      return tb.count - ta.count;
    });
    const topIds = new Set(ranked.slice(0, SUMMARY_LIMIT).map((c) => c.id));
    return orderedListItems
      .filter((item) => item.kind !== 'row' || topIds.has(item.classification.id))
      .filter((item, idx, arr) => {
        if (item.kind !== 'header') return true;
        const next = arr[idx + 1];
        return next?.kind === 'row';
      });
  }, [viewMode, filtered, orderedListItems, totalsByClassification]);

  const summaryExcludedCount = viewMode === 'summary' && filtered.length > SUMMARY_LIMIT
    ? filtered.length - SUMMARY_LIMIT
    : 0;

  const visibleItems = useMemo(
    () => summaryFilteredItems.slice(0, visibleCount),
    [summaryFilteredItems, visibleCount]
  );

  function getDeductions(classification: Classification): ClassificationDeduction[] {
    return deductionsByClassification[classification.id] ?? classification.deductions ?? [];
  }

  function getDeductionTotal(classification: Classification): number {
    return getDeductions(classification).reduce((sum, deduction) => sum + (Number(deduction.quantity) || 0), 0);
  }

  // Auto-deductions: door/window openings subtracted from linear walls
  const autoDeductionsByClass = useMemo(() => {
    if (!scale?.pixelsPerUnit) return new Map<string, { total: number; items: AutoDeduction[] }>();
    const scaleConfig = {
      pixelsPerFoot: scale.pixelsPerUnit,
      unit: (scale.unit === 'ft' || scale.unit === 'in' ? 'imperial' : 'metric') as 'imperial' | 'metric',
    };
    const raw = computeDeductions(polygons, classifications, scaleConfig);
    return aggregateDeductions(raw);
  }, [polygons, classifications, scale]);

  function getAutoDeductionTotal(classificationId: string): number {
    return autoDeductionsByClass.get(classificationId)?.total ?? 0;
  }

  function getAutoDeductionItems(classificationId: string): AutoDeduction[] {
    return autoDeductionsByClass.get(classificationId)?.items ?? [];
  }

  function getTotalDeductions(classification: Classification): number {
    const manual = getDeductionTotal(classification);
    const auto = getAutoDeductionTotal(classification.id);
    return manual + auto;
  }

  function formatClassificationTotal(classification: Classification, totals: ClassTotals): string {
    if (classification.type === 'area') return formatArea(totals.areaReal, measurementSettings);
    if (classification.type === 'linear') return formatLinear(totals.lengthReal - getTotalDeductions(classification), measurementSettings);
    return formatCount(totals.count);
  }

  function toggleExpanded(classificationId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(classificationId)) {
        next.delete(classificationId);
      } else {
        next.add(classificationId);
      }
      return next;
    });
  }

  function activateClassification(classificationId: string, isSelected: boolean) {
    setSelectedClassification(isSelected ? null : classificationId);
    toggleExpanded(classificationId);
    if (!isSelected) {
      onClassificationZoom?.(classificationId);
    }
  }

  function handleClassificationRowKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    classificationId: string
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpanded(classificationId);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      const classification = filtered.find((c) => c.id === classificationId);
      if (classification) {
        handleDeleteClassification(classification);
      }
      return;
    }

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    const list = event.currentTarget.closest('[data-classification-list]');
    if (!list) return;

    const rows = Array.from(
      list.querySelectorAll<HTMLElement>('[data-classification-row][tabindex="0"]')
    );
    const currentIndex = rows.indexOf(event.currentTarget);
    if (currentIndex === -1) return;

    const nextIndex = event.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= rows.length) return;

    // Update keyboard selection to the target row
    const targetRow = rows[nextIndex];
    const targetId = targetRow?.getAttribute('data-classification-id');
    if (targetId) setSelectedClassificationId(targetId);
    targetRow?.focus();
  }

  function handleAddClassification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    const color = normalizeHexInput(newColorHex);

    if (!name) {
      setNewClassificationError('Name is required.');
      return;
    }

    if (!isHexColor(color)) {
      setNewClassificationError('Color must be a hex value like #3b82f6.');
      return;
    }

    const duplicate = classifications.some(
      (c) => c.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setNewClassificationError(`A classification named "${name}" already exists.`);
      return;
    }

    try {
      addClassification({ name, color, type: newType, visible: true });
      setNewName('');
      setNewType('area');
      setNewColorHex('#3b82f6');
      setShowNewClassification(false);
      setNewClassificationError(null);
    } catch (error) {
      setNewClassificationError(error instanceof Error ? error.message : 'Unable to add classification.');
    }
  }

  function handleDeleteClassification(classification: Classification) {
    setPendingDeleteId(classification.id);
  }

  function confirmDeleteClassification(classificationId: string) {
    deleteClassification(classificationId);
    setPendingDeleteId(null);
    setExpanded((prev) => {
      if (!prev.has(classificationId)) return prev;
      const next = new Set(prev);
      next.delete(classificationId);
      return next;
    });
    if (editingId === classificationId) {
      setEditingId(null);
      setEditError(null);
    }
  }

  function startEditing(classification: Classification) {
    setEditingId(classification.id);
    setEditName(classification.name);
    setEditType(classification.type);
    setEditColorHex(classification.color);
    setEditOriginalColor(classification.color);
    setEditError(null);
  }

  function cancelEditing() {
    if (editingId) {
      const original = normalizeHexInput(editOriginalColor);
      const current = normalizeHexInput(editColorHex);
      if (isHexColor(original) && isHexColor(current) && original.toLowerCase() !== current.toLowerCase()) {
        updateClassification(editingId, { color: original });
      }
    }
    setEditingId(null);
    setEditError(null);
  }

  function applyEditColor(classificationId: string, rawValue: string) {
    setEditColorHex(rawValue);
    setEditError(null);
    const normalized = normalizeHexInput(rawValue);
    if (isHexColor(normalized)) {
      updateClassification(classificationId, { color: normalized });
    }
  }

  function saveEditing(classification: Classification) {
    const name = editName.trim();
    const color = normalizeHexInput(editColorHex);

    if (!name) {
      setEditError('Name is required.');
      return;
    }

    if (!isHexColor(color)) {
      setEditError('Color must be a hex value like #3b82f6.');
      return;
    }

    const duplicate = classifications.some(
      (c) => c.id !== classification.id && c.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setEditError('A classification with that name already exists.');
      return;
    }

    updateClassification(classification.id, {
      name,
      color,
      type: editType,
    });

    setEditingId(null);
    setEditError(null);
  }

  function addDeduction(classification: Classification) {
    setDeductionsByClassification((prev) => {
      const current = prev[classification.id] ?? classification.deductions ?? [];
      return {
        ...prev,
        [classification.id]: [...current, { label: '', quantity: 0 }],
      };
    });
  }

  function updateDeduction(
    classification: Classification,
    deductionIndex: number,
    patch: Partial<ClassificationDeduction>
  ) {
    setDeductionsByClassification((prev) => {
      const current = prev[classification.id] ?? classification.deductions ?? [];
      const next = current.map((deduction, index) => (
        index === deductionIndex ? { ...deduction, ...patch } : deduction
      ));
      return {
        ...prev,
        [classification.id]: next,
      };
    });
  }

  function deleteDeduction(classification: Classification, deductionIndex: number) {
    setDeductionsByClassification((prev) => {
      const current = prev[classification.id] ?? classification.deductions ?? [];
      const next = current.filter((_, index) => index !== deductionIndex);
      return {
        ...prev,
        [classification.id]: next,
      };
    });
  }

  const handleSwitchToQuantities = useCallback(() => setActiveTab('quantities'), []);
  const handleSwitchToAssemblies = useCallback(() => setActiveTab('assemblies'), []);
  const handleSwitchToEstimate = useCallback(() => setActiveTab('estimate'), []);
  const handleToggleHistory = useCallback(() => setShowHistory((v) => !v), []);
  const handleToggleMeasurementSettings = useCallback(() => setShowMeasurementSettings((v) => !v), []);
  const handleCloseMeasurementSettings = useCallback(() => setShowMeasurementSettings(false), []);
  const handleOpenTemplateLibrary = useCallback(() => setShowTemplateLibrary(true), []);
  const handleCloseTemplateLibrary = useCallback(() => setShowTemplateLibrary(false), []);
  const handleToggleNewClassification = useCallback(() => {
    setShowNewClassification((prev) => {
      if (!prev) setShowPreferences(false); // mutual exclusion: close preferences when opening
      return !prev;
    });
    setNewClassificationError(null);
  }, []);
  const handleCancelNewClassification = useCallback(() => {
    setShowNewClassification(false);
    setNewClassificationError(null);
  }, []);
  const handleExportJson = useCallback(() => {
    if (!projectId) return;
    window.open(`/api/projects/${projectId}/export/json`, '_blank');
  }, [projectId]);

  const handleToggleMergeMode = useCallback(() => {
    setMergeMode((v) => {
      if (v) {
        setMergeSelected(new Set());
        setMergeSurvivorId(null);
      }
      return !v;
    });
  }, []);

  const handleToggleMergeSelect = useCallback((id: string) => {
    setMergeSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // If this was the survivor, clear it
        setMergeSurvivorId((sid) => (sid === id ? null : sid));
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExecuteMerge = useCallback(async () => {
    if (!mergeSurvivorId || mergeSelected.size < 2) return;
    const idsToMerge = Array.from(mergeSelected);

    // Client-side: reassign polygons + remove merged classifications
    mergeClassifications(mergeSurvivorId, idsToMerge);

    // Server-side: reassign polygons then delete merged classifications
    if (projectId) {
      const removedIds = idsToMerge.filter((id) => id !== mergeSurvivorId);
      for (const id of removedIds) {
        try {
          // Reassign polygons belonging to this classification to the survivor
          const polyRes = await fetch(`/api/projects/${projectId}/polygons`);
          if (polyRes.ok) {
            const polyData = await polyRes.json();
            const polys = Array.isArray(polyData.polygons) ? polyData.polygons : [];
            for (const p of polys) {
              if (p.classificationId === id) {
                await fetch(`/api/projects/${projectId}/polygons/${p.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ classificationId: mergeSurvivorId }),
                });
              }
            }
          }
          // Delete the merged classification
          await fetch(`/api/projects/${projectId}/classifications/${id}`, { method: 'DELETE' });
        } catch {
          // Best-effort — client state is already correct
        }
      }
    }

    setMergeMode(false);
    setMergeSelected(new Set());
    setMergeSurvivorId(null);
  }, [mergeSurvivorId, mergeSelected, mergeClassifications, projectId]);

  const handleOpenCleanUp = useCallback(() => {
    const suggestions = suggestMerges(classifications);
    if (suggestions.length === 0) return;
    setCleanUpSuggestions(suggestions);
    setAcceptedSuggestions(new Set(suggestions.map((_, i) => i)));
    setShowCleanUpDialog(true);
  }, [classifications]);

  const handleExecuteCleanUp = useCallback(async () => {
    const toExecute = cleanUpSuggestions.filter((_, i) => acceptedSuggestions.has(i));
    for (const suggestion of toExecute) {
      const allIds = [suggestion.survivor.id, ...suggestion.duplicates.map((d) => d.id)];
      mergeClassifications(suggestion.survivor.id, allIds);
      if (projectId) {
        const removedIds = suggestion.duplicates.map((d) => d.id);
        for (const id of removedIds) {
          try {
            const polyRes = await fetch(`/api/projects/${projectId}/polygons`);
            if (polyRes.ok) {
              const { polygons = [] } = await polyRes.json();
              for (const p of polygons) {
                if (p.classificationId === id) {
                  await fetch(`/api/projects/${projectId}/polygons/${p.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ classificationId: suggestion.survivor.id }),
                  });
                }
              }
            }
            await fetch(`/api/projects/${projectId}/classifications/${id}`, { method: 'DELETE' });
          } catch { /* best effort */ }
        }
      }
    }
    setShowCleanUpDialog(false);
    setCleanUpSuggestions([]);
    setAcceptedSuggestions(new Set());
  }, [cleanUpSuggestions, acceptedSuggestions, mergeClassifications, projectId]);

  const handleOpenGroupModal = useCallback((existingGroupId?: string) => {
    if (existingGroupId) {
      const group = groups.find((g) => g.id === existingGroupId);
      if (group) {
        setEditingGroupId(existingGroupId);
        setGroupName(group.name);
        setGroupColor(group.color);
        setGroupSelectedClassificationIds(new Set(group.classificationIds));
      }
    } else {
      setEditingGroupId(null);
      setGroupName('');
      setGroupColor('#3b82f6');
      setGroupSelectedClassificationIds(new Set());
    }
    setShowGroupModal(true);
  }, [groups]);

  const handleSaveGroup = useCallback(() => {
    const trimmedName = groupName.trim();
    if (!trimmedName) return;
    if (editingGroupId) {
      updateGroup(editingGroupId, {
        name: trimmedName,
        color: groupColor,
      });
      // Use moveClassificationToGroup so classifications are removed from other groups
      groupSelectedClassificationIds.forEach((cid) => {
        moveClassificationToGroup(cid, editingGroupId);
      });
      // Remove classifications that were unchecked
      const currentGroup = groups.find((g) => g.id === editingGroupId);
      if (currentGroup) {
        currentGroup.classificationIds.forEach((cid) => {
          if (!groupSelectedClassificationIds.has(cid)) {
            // Remove from this group by updating without it
            const updated = useStore.getState().groups.find((g) => g.id === editingGroupId);
            if (updated) {
              updateGroup(editingGroupId, {
                classificationIds: updated.classificationIds.filter((id) => id !== cid),
              });
            }
          }
        });
      }
    } else {
      addGroup(trimmedName, groupColor);
      // find the newly added group and assign classifications
      // moveClassificationToGroup handles one at a time
      // We'll assign after creation via a microtask
      setTimeout(() => {
        const latest = useStore.getState().groups;
        const created = latest.find((g) => g.name === trimmedName && !groups.some((og) => og.id === g.id));
        if (created) {
          groupSelectedClassificationIds.forEach((cid) => {
            useStore.getState().moveClassificationToGroup(cid, created.id);
          });
        }
      }, 0);
    }
    setShowGroupModal(false);
  }, [groupName, groupColor, groupSelectedClassificationIds, editingGroupId, addGroup, updateGroup, groups, moveClassificationToGroup]);

  const handleDeleteGroup = useCallback((groupId: string) => {
    deleteGroup(groupId);
  }, [deleteGroup]);

  const handleToggleGroupClassification = useCallback((classificationId: string) => {
    setGroupSelectedClassificationIds((prev) => {
      const next = new Set(prev);
      if (next.has(classificationId)) next.delete(classificationId);
      else next.add(classificationId);
      return next;
    });
  }, []);

  // Compute group totals
  const groupTotals = useMemo(() => {
    const result: Record<string, { classificationTotals: Record<string, ClassTotals>; combined: ClassTotals }> = {};
    for (const group of groups) {
      const classificationTotals: Record<string, ClassTotals> = {};
      const combined: ClassTotals = { count: 0, areaReal: 0, lengthReal: 0 };
      for (const cid of group.classificationIds) {
        const classPolygons = polygons.filter((p) => p.classificationId === cid);
        const totals: ClassTotals = { count: classPolygons.length, areaReal: 0, lengthReal: 0 };
        for (const p of classPolygons) {
          const ppu = getPixelsPerUnitForPage(p.pageNumber);
          totals.areaReal += p.area / (ppu * ppu);
          totals.lengthReal += calculateLinearFeet(p.points, ppu, false);
        }
        classificationTotals[cid] = totals;
        combined.count += totals.count;
        combined.areaReal += totals.areaReal;
        combined.lengthReal += totals.lengthReal;
      }
      result[group.id] = { classificationTotals, combined };
    }
    return result;
  }, [groups, polygons, getPixelsPerUnitForPage]);

  const panel = (
    <>
      {showCleanUpDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-[#13141a] border border-[#00d4ff]/25 rounded-xl p-5 w-full max-w-lg shadow-2xl flex flex-col gap-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Wand2 size={16} className="text-cyan-400" />
                Clean Up Classifications
              </h3>
              <button onClick={() => setShowCleanUpDialog(false)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Found {cleanUpSuggestions.length} group{cleanUpSuggestions.length !== 1 ? 's' : ''} of similar classifications.
              Accept suggestions to merge duplicates into a single name.
            </p>
            <div className="overflow-y-auto flex flex-col gap-3 flex-1">
              {cleanUpSuggestions.map((suggestion, i) => (
                <div key={i} className={`rounded-lg p-3 border ${acceptedSuggestions.has(i) ? 'border-cyan-500/40 bg-cyan-900/10' : 'border-gray-700 bg-gray-800/30 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-xs text-gray-400 mb-1">{suggestion.reason}</div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {suggestion.duplicates.map((d) => (
                          <span key={d.id} className="text-xs bg-red-900/30 border border-red-700/40 text-red-300 rounded px-1.5 py-0.5 line-through">
                            {d.name}
                          </span>
                        ))}
                        <span className="text-xs text-gray-400 mx-1">{'\u2192'}</span>
                        <span className="text-xs bg-green-900/30 border border-green-700/40 text-green-300 rounded px-1.5 py-0.5 font-semibold">
                          {suggestion.survivor.name}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setAcceptedSuggestions((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      })}
                      className={`text-xs px-2 py-1 rounded border ${acceptedSuggestions.has(i) ? 'border-cyan-500/40 text-cyan-300 bg-cyan-900/20' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}
                    >
                      {acceptedSuggestions.has(i) ? '\u2713 Accept' : 'Skip'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
              <span className="text-xs text-gray-400">{acceptedSuggestions.size} of {cleanUpSuggestions.length} accepted</span>
              <div className="flex gap-2">
                <button onClick={() => setShowCleanUpDialog(false)} className="px-3 py-1.5 text-xs text-gray-400 border border-gray-600 rounded hover:border-gray-400">
                  Cancel
                </button>
                <button
                  onClick={handleExecuteCleanUp}
                  disabled={acceptedSuggestions.size === 0}
                  className="px-3 py-1.5 text-xs text-white rounded border border-cyan-500/40 bg-cyan-900/20 hover:bg-cyan-900/40 disabled:opacity-40"
                >
                  Apply {acceptedSuggestions.size} Merge{acceptedSuggestions.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Assemblies / Estimate tabs — conditionally renders to avoid hooks-of-rules violation */}
      {activeTab === 'assemblies' ? (
        <AssembliesPanel onSwitchToQuantities={handleSwitchToQuantities} onSwitchToEstimate={handleSwitchToEstimate} />
      ) : activeTab === 'estimate' ? (
        <aside className="bg-[rgba(18,18,26,0.8)] flex flex-col h-full text-[13px]" aria-label="Estimate panel">
          <div className="flex border-b border-[#00d4ff]/20 bg-[rgba(10,10,15,0.6)]">
            <button type="button" onClick={handleSwitchToQuantities} className="flex-1 px-2 py-2 text-xs font-mono tracking-wider text-[#8892a0] hover:text-[#e5e7eb]">Quantities</button>
            <button type="button" onClick={handleSwitchToAssemblies} className="flex-1 px-2 py-2 text-xs font-mono tracking-wider text-[#8892a0] hover:text-[#e5e7eb]">Assemblies</button>
            <button type="button" className="flex-1 px-2 py-2 text-xs font-mono tracking-wider text-[#00d4ff] border-b-2 border-[#00d4ff]">Estimate</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {projectId ? (
              <EstimatesTab projectId={projectId} classifications={classifications} quantities={estimateQuantities} />
            ) : (
              <div className="text-center text-xs py-8 text-[#8892a0]">No project loaded.</div>
            )}
          </div>
        </aside>
      ) : (
      <>
      {/* Tab bar */}
      <div className="flex border-b border-[#00d4ff]/20 bg-[rgba(10,10,15,0.6)]">
        <button
          type="button"
          className="flex-1 px-2 py-2 text-xs font-mono tracking-wider text-[#00d4ff] border-b-2 border-[#00d4ff]"
        >
          Quantities
        </button>
        <button
          type="button"
          onClick={handleSwitchToAssemblies}
          className="flex-1 px-2 py-2 text-xs font-mono tracking-wider text-[#8892a0] hover:text-[#e5e7eb]"
        >
          Assemblies
        </button>
        <button
          type="button"
          onClick={handleSwitchToEstimate}
          className="flex-1 px-2 py-2 text-xs font-mono tracking-wider text-[#8892a0] hover:text-[#e5e7eb]"
        >
          Estimate
        </button>
      </div>

      <div className="px-3 py-2 border-b border-[#00d4ff]/20 font-semibold text-[#e5e7eb] text-sm flex items-center justify-between bg-[rgba(10,10,15,0.6)] relative">
        <span className="font-mono tracking-wider">QUANTITIES</span>
        <span
          className="relative ml-1"
          onMouseEnter={() => setShowInfoTooltip(true)}
          onMouseLeave={() => setShowInfoTooltip(false)}
        >
          <Info size={12} className="text-gray-400 hover:text-[#00d4ff] cursor-help transition-colors" />
          {showInfoTooltip && (
            <div className="absolute top-5 left-0 z-50 bg-[#12121a] border border-[#00d4ff]/30 rounded-lg p-2 text-[11px] text-[#e5e7eb] shadow-xl max-w-[240px] whitespace-normal">
              These measurements are from AI takeoff using Claude Sonnet 4.6. Last updated: {lastUpdatedTime}
            </div>
          )}
        </span>
        <div className="flex items-center gap-2" suppressHydrationWarning>
          <span className="text-xs text-gray-300 font-normal">
            {activeClassificationCount} {activeClassificationCount === 1 ? 'item' : 'items'}
          </span>
          {classifications.length >= 2 && (
            <button
              type="button"
              onClick={handleToggleMergeMode}
              className={`p-1 rounded hover:bg-gray-700/60 transition-colors ${mergeMode ? 'text-[#00d4ff]' : 'text-gray-400 hover:text-gray-200'}`}
              aria-label={mergeMode ? 'Cancel merge' : 'Merge classifications'}
              title={mergeMode ? 'Cancel Merge' : 'Merge Classifications'}
            >
              <GitMerge size={14} aria-hidden="true" />
            </button>
          )}
          {classifications.length >= 3 && (
            <button
              type="button"
              onClick={handleOpenCleanUp}
              className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-[#00d4ff] transition-colors"
              title="Clean Up — merge similar classifications"
              aria-label="Clean up similar classifications"
            >
              <Wand2 size={14} aria-hidden="true" />
            </button>
          )}
          {filtered.length >= 3 && (
            <button
              type="button"
              onClick={handleToggleGroupByTrade}
              className={`p-1 rounded hover:bg-gray-700/60 transition-colors ${groupByTrade ? 'text-[#00d4ff]' : 'text-gray-400 hover:text-gray-200'}`}
              aria-label={groupByTrade ? 'Disable trade grouping' : 'Group by trade'}
              title={groupByTrade ? 'Ungrouped view' : 'Group by Trade'}
            >
              <Layers size={14} aria-hidden="true" />
            </button>
          )}
          {filtered.length > SUMMARY_LIMIT && (
            <button
              type="button"
              onClick={() => {
                const next = viewMode === 'summary' ? 'detailed' : 'summary';
                setViewMode(next);
                localStorage.setItem('mx-quantities-view-mode', next);
                if (next === 'detailed') localStorage.setItem('mx-quantities-interacted', '1');
              }}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors font-mono tracking-wide ${viewMode === 'summary' ? 'border-[#00d4ff]/40 text-[#00d4ff]' : 'border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-400'}`}
              title={viewMode === 'summary' ? `Showing top ${SUMMARY_LIMIT} — click for all` : 'Showing all — click for top 10 summary'}
              aria-label={viewMode === 'summary' ? 'Switch to Detailed view' : 'Switch to Summary view'}
            >
              {viewMode === 'summary' ? 'Summary' : 'Detailed'}
            </button>
          )}
          {projectId && (
            <button
              type="button"
              onClick={handleExportJson}
              className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Export JSON"
              title="Export JSON"
            >
              <Download size={14} aria-hidden="true" />
            </button>
          )}
          {projectId && (
            <button
              type="button"
              onClick={() => window.open(`/api/projects/${projectId}/export/contractor`, '_blank')}
              className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Print Contractor Report"
              title="Print Contractor Report"
            >
              <Printer size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleHistory}
            className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Toggle version history"
            title="Version History"
          >
            <History size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleToggleMeasurementSettings}
            className={`p-1 rounded hover:bg-gray-700/60 transition-colors ${showMeasurementSettings ? 'text-[#00d4ff]' : 'text-gray-400 hover:text-gray-200'}`}
            aria-label="Measurement settings"
            title="Measurement Settings"
          >
            <Settings size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => { setShowNewClassification(false); setShowPreferences(true); }}
            className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="User preferences"
            title="User Preferences"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
          </button>
        </div>
        {showMeasurementSettings && (
          <MeasurementSettingsPanel
            settings={measurementSettings}
            onChange={setMeasurementSettings}
            onClose={handleCloseMeasurementSettings}
          />
        )}
      </div>
      {showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}

      {polygons.length > 0 && (() => {
        let totalAreaSF = 0;
        let totalLF = 0;
        let totalEA = 0;
        for (const c of classifications) {
          const t = totalsByClassification.get(c.id);
          if (!t) continue;
          if (c.type === 'area') totalAreaSF += t.areaReal;
          else if (c.type === 'linear') totalLF += t.lengthReal;
          else if (c.type === 'count') totalEA += t.count;
        }
        return (
          <div className="px-3 py-1 border-b border-[#00d4ff]/10 bg-[rgba(10,10,15,0.4)]">
            <span className="text-[10px] font-mono text-gray-400">
              {totalAreaSF > 0 && <>{formatArea(totalAreaSF, measurementSettings)}</>}
              {totalAreaSF > 0 && totalLF > 0 && ' · '}
              {totalLF > 0 && <>{formatLinear(totalLF, measurementSettings)}</>}
              {(totalAreaSF > 0 || totalLF > 0) && totalEA > 0 && ' · '}
              {totalEA > 0 && <>{totalEA.toLocaleString('en-US')} EA</>}
            </span>
          </div>
        );
      })()}

      {mergeMode && (
        <div className="px-3 py-2 border-b border-amber-500/30 bg-amber-500/10">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono text-amber-300 tracking-wider flex items-center gap-1">
              <GitMerge size={12} /> MERGE MODE
            </span>
            <button type="button" onClick={handleToggleMergeMode} className="text-gray-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <p className="text-[11px] text-gray-300 mb-2">
            Select 2+ classifications to merge, then pick the one to keep.
          </p>
          {mergeSelected.size >= 2 && (
            <div className="mb-2">
              <label className="text-[11px] text-gray-400 block mb-1">Keep as:</label>
              <div className="flex flex-col gap-1">
                {Array.from(mergeSelected).map((id) => {
                  const cls = classifications.find((c) => c.id === id);
                  if (!cls) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMergeSurvivorId(id)}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] text-left ${
                        mergeSurvivorId === id
                          ? 'bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/40'
                          : 'bg-[#0e1016] text-gray-300 border border-transparent hover:border-gray-600'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: cls.color }} />
                      {cls.name}
                      {mergeSurvivorId === id && <Check size={10} className="ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleExecuteMerge}
            disabled={!mergeSurvivorId || mergeSelected.size < 2}
            className="w-full rounded px-2 py-1.5 text-xs font-medium flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-500 text-white"
          >
            <GitMerge size={12} />
            Merge {mergeSelected.size} Classifications
          </button>
        </div>
      )}

      {showTakeoffSearch && (
        <div className="px-2 pt-2 pb-1 border-b border-[#00d4ff]/20 bg-[rgba(10,10,15,0.4)]">
          <div className="flex items-center gap-2">
            <Search size={14} className="text-[#00d4ff]" aria-hidden="true" />
            <input
              placeholder="Search takeoff (classification or polygon label)"
              className="flex-1 border px-2 py-1 rounded bg-[#0e1016] text-[#e5e7eb] text-[12px] outline-none focus:border-[#00d4ff]/40"
              value={takeoffSearchQuery}
              onChange={(event) => setTakeoffSearchQuery(event.target.value)}
              aria-label="Search within takeoff"
            />
          </div>
          {takeoffSearchQuery.trim() && (
            <div className="mt-2 max-h-44 overflow-y-auto border border-[#00d4ff]/20 rounded bg-[#0a0a0f]">
              {takeoffSearchResults.length > 0 ? (
                takeoffSearchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => onTakeoffSearchSelect?.(result)}
                    className="w-full text-left px-2 py-1.5 text-[12px] text-[#d1d5db] hover:bg-[#00d4ff]/10 border-b border-[#00d4ff]/10 last:border-b-0"
                  >
                    {result.classificationName} - Page {result.pageNumber}, {result.polygonCount} polygon{result.polygonCount === 1 ? '' : 's'}
                  </button>
                ))
              ) : (
                <div className="px-2 py-2 text-[11px] text-gray-400">No takeoff matches</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-2 pt-2 pb-1">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-gray-300" aria-hidden="true" />
          <input
            placeholder="Search classifications"
            className="flex-1 border px-2 py-1 rounded bg-[#0e1016] text-[#e5e7eb] text-[13px] outline-none focus:border-[#00d4ff]/40"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search classifications"
          />
        </div>
      </div>

      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={handleToggleNewClassification}
          className="w-full border border-[#00d4ff]/30 rounded px-2 py-1.5 text-xs text-[#00d4ff] hover:bg-[#00d4ff]/10 flex items-center justify-center gap-1"
          aria-label="New Classification"
        >
          <Plus size={13} aria-hidden="true" />
          New Classification
        </button>
      </div>

      {showNewClassification && (
        <form className="mx-2 mb-2 p-2 bg-[#0e1016] border border-[#00d4ff]/20 rounded-lg" onSubmit={handleAddClassification}>
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-4 h-4 rounded border border-[#00d4ff]/30 flex-shrink-0"
              style={{ backgroundColor: isHexColor(normalizeHexInput(newColorHex)) ? normalizeHexInput(newColorHex) : '#3b82f6' }}
              aria-label="New classification color preview"
            />
            <input
              placeholder="Classification name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="w-full px-2 py-1 border rounded text-[13px] outline-none bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
              autoFocus
              aria-label="Classification name"
            />
          </div>

          <ColorPickerField
            colorValue={newColorHex}
            onColorChange={(value) => {
              setNewColorHex(value);
              setNewClassificationError(null);
            }}
            swatchLabel="New classification color preview"
          />

          <select
            value={newType}
            onChange={(event) => setNewType(event.target.value as ClassificationType)}
            className="w-full border rounded px-2 py-1 text-[12px] mb-2 bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
            aria-label="Classification type"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {newClassificationError && <p className="text-[11px] text-red-400 mb-2">{newClassificationError}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleCancelNewClassification}
              className="text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="text-[#00d4ff] font-medium text-xs">
              Create
            </button>
          </div>
        </form>
      )}

      <div className="px-2 pb-2 flex gap-2">
        <button
          type="button"
          onClick={handleOpenTemplateLibrary}
          className="flex-1 border border-[#00d4ff]/30 rounded px-2 py-1.5 text-xs text-[#b8e6f7] hover:bg-[#00d4ff]/10 flex items-center justify-center gap-1"
          aria-label="Classification Templates"
        >
          <Layers size={13} aria-hidden="true" />
          Templates
        </button>
        <button
          type="button"
          onClick={() => setShowImportFromLibrary(true)}
          className="flex-1 border border-[#00d4ff]/30 rounded px-2 py-1.5 text-xs text-[#b8e6f7] hover:bg-[#00d4ff]/10 flex items-center justify-center gap-1"
          aria-label="Import from Library"
        >
          <BookOpen size={13} aria-hidden="true" />
          Import Library
        </button>
      </div>

      {searchLower && matchingPolygons.length > 0 && (
        <div className="mx-2 mb-2 p-2 bg-[#0e1016] border border-[#00d4ff]/20 rounded-lg">
          <div className="text-[11px] text-gray-400 mb-1 font-mono">Matching polygons:</div>
          {matchingPolygons.map((polygon) => {
            const cls = classificationById.get(polygon.classificationId);
            return (
              <div
                key={polygon.id}
                className="flex items-center justify-between gap-2 py-0.5 text-[11px] text-gray-300"
              >
                <span className="truncate flex items-center gap-1">
                  {cls && (
                    <span
                      className="w-2 h-2 rounded-sm flex-shrink-0 inline-block"
                      style={{ backgroundColor: cls.color }}
                    />
                  )}
                  {polygon.label || 'Unnamed'}
                  <span className="text-[9px] text-gray-500">p.{polygon.pageNumber}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleFocusPolygon(polygon)}
                  className="flex items-center gap-0.5 text-[#00d4ff] hover:text-[#00d4ff]/80 flex-shrink-0"
                  aria-label="Find on canvas"
                  title="Find on canvas"
                >
                  <Crosshair size={11} aria-hidden="true" />
                  <span className="text-[9px]">Find</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className={`flex-1 overflow-y-auto px-1${filtered.length > 20 ? ' max-h-[400px]' : ''}`} data-classification-list style={{ contain: 'layout style' }}>
        {isLoading && (
          <div className="py-2 px-1.5 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-2 rounded animate-pulse">
                <div className="w-3/4 h-3 bg-gray-700 rounded" />
                <div className="w-12 h-3 bg-gray-700 rounded" />
              </div>
            ))}
          </div>
        )}
        {!isLoading && orderedListItems.length === 0 && polygons.length === 0 && !search && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <Layers size={28} className="text-gray-600 mb-3" aria-hidden="true" />
            <p className="text-[13px] text-gray-400 leading-relaxed">
              Run AI Takeoff or draw manually to measure this page
            </p>
          </div>
        )}
        {visibleItems.map((item) => {
          if (item.kind === 'header') {
            const isTradeCollapsed = collapsedTrades.has(item.trade);
            const tradeTotalArea = (tradeGrouped[item.trade] ?? []).reduce((sum, cls) => {
              const t = totalsByClassification.get(cls.id);
              return sum + (t ? t.areaReal : 0);
            }, 0);
            return (
              <div key={`trade-${item.trade}`} className="mb-0.5 mt-1 first:mt-0">
                <div
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer hover:bg-[#0e1016] select-none"
                  onClick={() => toggleTradeCollapse(item.trade)}
                >
                  {isTradeCollapsed ? (
                    <ChevronRight size={12} className="text-gray-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown size={12} className="text-gray-400 shrink-0" aria-hidden="true" />
                  )}
                  <span className="font-mono text-[11px] text-[#8892a0] uppercase tracking-wider flex-1">{TRADE_GROUP_LABELS[item.trade]}</span>
                  <span className="text-[10px] font-mono text-[#00d4ff]/70">{item.count}</span>
                  {tradeTotalArea > 0 && (
                    <span className="text-[10px] font-mono text-gray-500">{formatArea(tradeTotalArea, measurementSettings)}</span>
                  )}
                </div>
              </div>
            );
          }

          const { classification, classIndex } = item;
          const totals = totalsByClassification.get(classification.id) ?? { count: 0, areaReal: 0, lengthReal: 0 };
          const polygonsForClassification = polygonsByClassification.get(classification.id) ?? [];
          const deductions = getDeductions(classification);
          const deductionTotal = getDeductionTotal(classification);
          const autoDeductions = getAutoDeductionItems(classification.id);
          const autoDeductTotal = getAutoDeductionTotal(classification.id);
          const netLinear = totals.lengthReal - deductionTotal - autoDeductTotal;
          const isExpanded = expanded.has(classification.id);
          const isSelected = selectedClassification === classification.id;
          const isEditing = editingId === classification.id;
          const isHidden = classification.visible === false;

          return (
            <div key={classification.id}>
              {isEditing ? (
                <div className="mx-1 my-1 p-2 bg-[#0e1016] border border-[#00d4ff]/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-4 h-4 rounded border border-[#00d4ff]/30 flex-shrink-0"
                      style={{ backgroundColor: classification.color, boxShadow: `0 0 6px ${classification.color}55` }}
                      aria-label="Edit classification color preview"
                    />
                    <input
                      placeholder="Classification name"
                      value={editName}
                      onChange={(event) => {
                        setEditName(event.target.value);
                        setEditError(null);
                      }}
                      className="w-full px-2 py-1 border rounded text-[13px] outline-none bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
                      autoFocus
                      aria-label="Classification name"
                    />
                  </div>

                  <ColorPickerField
                    colorValue={editColorHex}
                    onColorChange={(value) => applyEditColor(classification.id, value)}
                    swatchLabel="Edit classification color preview"
                  />

                  <select
                    value={editType}
                    onChange={(event) => {
                      setEditType(event.target.value as ClassificationType);
                      setEditError(null);
                    }}
                    className="w-full border rounded px-2 py-1 text-[12px] mb-2 bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
                    aria-label="Edit classification type"
                  >
                    {TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  {editError && <p className="text-[11px] text-red-400 mb-2">{editError}</p>}

                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={cancelEditing} className="text-gray-300 text-xs inline-flex items-center gap-1">
                      <X size={12} aria-hidden="true" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEditing(classification)}
                      className="text-[#00d4ff] font-medium text-xs"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`group flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer ${
                    isSelected ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/40'
                    : selectedClassificationId === classification.id ? 'bg-[#00d4ff]/5 border border-[#00d4ff]/20'
                    : 'hover:bg-[#0e1016]'
                  }`}
                  onClick={() => { setSelectedClassificationId(classification.id); activateClassification(classification.id, isSelected); }}
                  onKeyDown={(event) => handleClassificationRowKeyDown(event, classification.id)}
                  onFocus={() => setSelectedClassificationId(classification.id)}
                  onMouseEnter={() => setHoveredClassificationId(classification.id)}
                  onMouseLeave={() => setHoveredClassificationId(null)}
                  tabIndex={0}
                  data-classification-row
                  data-classification-id={classification.id}
                >
                  {mergeMode && (
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); handleToggleMergeSelect(classification.id); }}
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                        mergeSelected.has(classification.id)
                          ? 'bg-amber-500 border-amber-400'
                          : 'border-gray-500 hover:border-amber-400'
                      }`}
                      aria-label={mergeSelected.has(classification.id) ? 'Deselect for merge' : 'Select for merge'}
                    >
                      {mergeSelected.has(classification.id) && <Check size={10} className="text-white" />}
                    </button>
                  )}

                  {totals.count > 0 || classification.type === 'count' ? (
                    isExpanded ? (
                      <ChevronDown size={12} className="text-gray-300" aria-hidden="true" />
                    ) : (
                      <ChevronRight size={12} className="text-gray-300" aria-hidden="true" />
                    )
                  ) : (
                    <div className="w-3" />
                  )}

                  <div
                    className={`w-3 h-3 rounded-sm border border-[#00d4ff]/30 flex-shrink-0${classification.type === 'count' && totals.count === 0 ? ' opacity-40' : ''}`}
                    style={{ backgroundColor: classification.color, boxShadow: `0 0 6px ${classification.color}55` }}
                  />
                  <ClassificationShape index={classIndex} color={classification.color} />

                  <span className={`flex-1 font-medium truncate text-[12px] ${classification.type === 'count' && totals.count === 0 ? 'text-gray-500' : 'text-[#e5e7eb]'}`}>{classification.name}</span>
                  {(() => {
                    const clsPolygons = polygons.filter((p) => p.classificationId === classification.id && p.confidence !== undefined);
                    if (clsPolygons.length === 0) return null;
                    const avgConf = clsPolygons.reduce((sum, p) => sum + (p.confidence ?? 0), 0) / clsPolygons.length;
                    const confPct = Math.round(avgConf * 100);
                    const confColor = avgConf >= 0.85 ? 'rgba(34,197,94,0.25)' : avgConf >= 0.70 ? 'rgba(234,179,8,0.25)' : 'rgba(239,68,68,0.25)';
                    const confTextColor = avgConf >= 0.85 ? '#4ade80' : avgConf >= 0.70 ? '#facc15' : '#f87171';
                    const confLevel = avgConf >= 0.85 ? 'high' : avgConf >= 0.70 ? 'medium' : 'low';
                    return (
                      <span
                        className="text-[9px] px-1 rounded flex-shrink-0"
                        style={{ backgroundColor: confColor, color: confTextColor, opacity: 0.85 }}
                        title={`AI confidence: ${confPct}% (${confLevel})`}
                      >{confPct}%</span>
                    );
                  })()}

                  {classification.type === 'area' ? (
                    <Square size={14} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
                  ) : classification.type === 'linear' ? (
                    <Minus size={14} className="text-gray-400 flex-shrink-0 rotate-45" aria-hidden="true" />
                  ) : (
                    <Hash size={14} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
                  )}

                  {classification.type === 'count' ? (
                    <span className={`text-[14px] font-bold font-mono px-1.5 py-0.5 rounded ${totals.count === 0 ? 'text-gray-500 bg-[#0e1016]/50' : 'text-[#00d4ff] bg-[#0e1016]'}`}>
                      {totals.count} EA
                    </span>
                  ) : (
                    <>
                      <span className="text-[10px] font-mono text-[#8892a0] flex-shrink-0">
                        {classification.type === 'area' ? AREA_UNIT_LABELS[measurementSettings.areaUnit].toUpperCase() : LINEAR_UNIT_LABELS[measurementSettings.linearUnit].toUpperCase()}
                      </span>
                      <span className="text-[10px] px-1 py-0.5 rounded font-mono bg-[#0e1016] text-[#00d4ff]">
                        {formatClassificationTotal(classification, totals)}
                      </span>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleClassification(classification.id);
                    }}
                    className="focus:outline-none"
                    aria-label={isHidden ? 'Show classification' : 'Hide classification'}
                  >
                    {isHidden ? <EyeOff size={13} className="text-gray-300" aria-hidden="true" /> : <Eye size={13} className="text-[#00d4ff]" aria-hidden="true" />}
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      startEditing(classification);
                    }}
                    className="hidden group-hover:inline-flex text-gray-300 hover:text-[#00d4ff]"
                    aria-label="Edit classification"
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteClassification(classification);
                    }}
                    className="hidden group-hover:inline-flex text-red-400 hover:text-red-500"
                    aria-label="Delete classification"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              )}

              {pendingDeleteId === classification.id && !isEditing && (
                <div
                  style={{ animation: 'fadeSlideIn 200ms ease-out' }}
                  className="ml-6 flex items-center gap-2 px-2 py-1.5 rounded bg-[#0e1016] border border-red-500/30"
                >
                  <span className="text-[11px] text-gray-300 flex-1">
                    Delete &ldquo;{classification.name}&rdquo; and all its polygons?
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmDeleteClassification(classification.id);
                    }}
                    className="px-2 py-0.5 text-[11px] font-medium rounded bg-red-500 hover:bg-red-600 text-white transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(null);
                    }}
                    className="px-2 py-0.5 text-[11px] font-medium rounded border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {isExpanded && !isEditing && (classification.type === 'count' || totals.count > 0) && (
                <div className="ml-6 border-l border-[#00d4ff]/20 pl-2 mb-1">
                  {classification.type === 'count' ? (
                    <>
                      {totals.count === 0 ? (
                        <div className="text-[10px] py-0.5 text-gray-500 font-mono">No items placed</div>
                      ) : (
                        <>
                          {Array.from(countsByPage.get(classification.id) ?? [])
                            .sort(([a], [b]) => a - b)
                            .map(([page, count]) => (
                              <div key={page} className="text-[11px] py-0.5 flex items-center justify-between text-gray-300 gap-1">
                                <span className="flex-1">Page {page}</span>
                                <span className="font-mono text-[#e5e7eb]">{count} EA</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setCurrentPage(page); }}
                                  className="text-[9px] px-1.5 py-0.5 rounded border border-[#00d4ff]/25 text-[#00d4ff] hover:bg-[#00d4ff]/10 hover:border-[#00d4ff]/50 transition-colors whitespace-nowrap flex-shrink-0"
                                  aria-label={`Go to page ${page}`}
                                  title={`Jump to page ${page}`}
                                >
                                  Go to Page
                                </button>
                              </div>
                            ))}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] py-0.5 text-gray-300 font-mono">
                        {classification.type === 'linear'
                          ? `Total: ${totals.count} items - Raw ${formatLinear(totals.lengthReal, measurementSettings)} - Net ${formatLinear(netLinear, measurementSettings)}`
                          : `Total: ${totals.count} items - ${formatArea(totals.areaReal, measurementSettings)} - ${formatLinear(totals.lengthReal, measurementSettings)}`}
                      </div>
                      {polygonsForClassification.map((polygon, index) => {
                        const polygonPpu = getPixelsPerUnitForPage(polygon.pageNumber);
                        const areaReal = polygon.area / (polygonPpu * polygonPpu);
                        const lengthReal = calculateLinearFeet(polygon.points, polygonPpu, false);

                        return (
                          <div key={polygon.id} className="text-[11px] py-0.5 flex items-center justify-between text-gray-300 gap-1">
                            <span className="truncate flex-1">
                              {classification.name} #{index + 1}
                              <span className="text-[10px] text-gray-500 ml-1">p.{polygon.pageNumber}</span>
                            </span>
                            <span className="font-mono text-[#e5e7eb] whitespace-nowrap text-[10px]">
                              {classification.type === 'linear'
                                ? formatLinear(lengthReal, measurementSettings)
                                : formatArea(areaReal, measurementSettings)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleFocusPolygon(polygon); }}
                              className="text-[9px] px-1.5 py-0.5 rounded border border-[#00d4ff]/25 text-[#00d4ff] hover:bg-[#00d4ff]/10 hover:border-[#00d4ff]/50 transition-colors whitespace-nowrap flex-shrink-0"
                              aria-label={`Go to page ${polygon.pageNumber}`}
                              title={`Jump to page ${polygon.pageNumber}`}
                            >
                              Go to Page
                            </button>
                          </div>
                        );
                      })}
                      {classification.type === 'linear' && (
                        <div className="mt-1.5 border-t border-[#00d4ff]/10 pt-1.5">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] text-gray-300 font-mono uppercase">Deductions</span>
                            <button
                              type="button"
                              onClick={() => addDeduction(classification)}
                              className="text-[10px] text-[#00d4ff] hover:text-[#9eeeff]"
                            >
                              +Add Deduction
                            </button>
                          </div>
                          {deductions.length === 0 ? (
                            <div className="text-[10px] text-gray-500">No deductions added.</div>
                          ) : (
                            <div className="space-y-1">
                              {deductions.map((deduction, deductionIndex) => (
                                <div key={`${classification.id}-deduction-${deductionIndex}`} className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={deduction.label}
                                    onChange={(event) => updateDeduction(classification, deductionIndex, { label: event.target.value })}
                                    placeholder="Door 3ft"
                                    className="flex-1 border border-[#00d4ff]/20 rounded px-1.5 py-0.5 text-[10px] bg-[#0a0a0f] text-[#e5e7eb] outline-none focus:border-[#00d4ff]/40"
                                    aria-label="Deduction label"
                                  />
                                  <input
                                    type="number"
                                    value={deduction.quantity}
                                    onChange={(event) => {
                                      const parsed = Number.parseFloat(event.target.value);
                                      updateDeduction(classification, deductionIndex, { quantity: Number.isFinite(parsed) ? parsed : 0 });
                                    }}
                                    className="w-20 border border-[#00d4ff]/20 rounded px-1.5 py-0.5 text-[10px] bg-[#0a0a0f] text-[#e5e7eb] outline-none focus:border-[#00d4ff]/40"
                                    aria-label="Deduction quantity"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => deleteDeduction(classification, deductionIndex)}
                                    className="w-5 h-5 rounded border border-[#00d4ff]/20 text-[11px] text-gray-300 hover:text-white"
                                    aria-label="Delete deduction"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="mt-1.5 border-t border-[#00d4ff]/10 pt-1.5">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] text-gray-300 font-mono uppercase">Auto-Detected Openings</span>
                            </div>
                            {autoDeductions.length === 0 ? (
                              <div className="text-[10px] text-gray-500">No door/window overlaps detected.</div>
                            ) : (
                              <div className="space-y-0.5">
                                {autoDeductions.map((ad, idx) => (
                                  <div key={`auto-${idx}`} className="flex items-center justify-between gap-1 text-[10px] text-gray-300">
                                    <span className="truncate">{ad.openingClassificationName}</span>
                                    <span className="font-mono text-[#e5e7eb] whitespace-nowrap">-{formatLinear(ad.deductionValue, measurementSettings)}</span>
                                  </div>
                                ))}
                                <div className="mt-1 text-[10px] text-[#00d4ff] font-mono">
                                  Opening backout: -{formatLinear(autoDeductTotal, measurementSettings)}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-[#00d4ff] font-mono">
                            Net LF = {formatLinear(totals.lengthReal, measurementSettings)} - {formatLinear(deductionTotal, measurementSettings)} - {formatLinear(autoDeductTotal, measurementSettings)} = {formatLinear(netLinear, measurementSettings)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {visibleCount < summaryFilteredItems.length && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + LOAD_STEP)}
            className="w-full py-2 text-center text-[11px] text-[#00d4ff] hover:text-[#9eeeff] transition-colors"
          >
            Load more ({summaryFilteredItems.length - visibleCount} remaining)
          </button>
        )}

        {summaryExcludedCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setViewMode('detailed');
              localStorage.setItem('mx-quantities-view-mode', 'detailed');
              localStorage.setItem('mx-quantities-interacted', '1');
            }}
            className="w-full py-2 text-center text-[11px] text-gray-500 hover:text-[#00d4ff] transition-colors"
          >
            + {summaryExcludedCount} more classifications — switch to Detailed
          </button>
        )}

        {filtered.length === 0 && (
          <div className="text-center text-xs py-8 text-gray-300">
            {search ? 'No matches' : 'No classifications yet. Click New Classification to add one.'}
          </div>
        )}
      </div>
      {/* ── Groups Section ── */}
      <div className="border-t border-[#00d4ff]/20 px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono tracking-wider text-xs text-[#8892a0] uppercase">Groups</span>
          <button
            type="button"
            onClick={() => handleOpenGroupModal()}
            className="flex items-center gap-1 text-[11px] text-[#00d4ff] hover:text-[#9eeeff] transition-colors"
            title="Create group"
          >
            <Layers size={12} aria-hidden="true" />
            <span>Group</span>
          </button>
        </div>
        {groups.filter((g) => g.classificationIds.length > 0).length === 0 ? (
          <div className="text-[11px] text-gray-500 py-2">No groups with classifications. Click Group to create one.</div>
        ) : (
          <div className="space-y-1.5">
            {groups.filter((g) => g.classificationIds.length > 0).map((group) => {
              const totals = groupTotals[group.id];
              if (!totals) return null;
              return (
                <div key={group.id} className="rounded border border-[#00d4ff]/15 bg-[#0e1016] overflow-hidden">
                  <div
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
                    onClick={() => setCollapsedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })}
                  >
                    {collapsedGroups.has(group.id) ? <ChevronRight size={12} className="text-gray-400 shrink-0" /> : <ChevronDown size={12} className="text-gray-400 shrink-0" />}
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: group.color }} />
                    <span className="flex-1 text-[12px] text-white font-medium truncate">{group.name}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleOpenGroupModal(group.id); }}
                      className="text-gray-400 hover:text-[#00d4ff] transition-colors"
                      aria-label={`Edit group ${group.name}`}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                      className="text-gray-400 hover:text-red-400 transition-colors"
                      aria-label={`Delete group ${group.name}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  {!collapsedGroups.has(group.id) && (
                  <div className="border-t border-[#00d4ff]/10 px-2 py-1">
                    {group.classificationIds.map((cid) => {
                      const cls = classifications.find((c) => c.id === cid);
                      const ct = totals.classificationTotals[cid];
                      if (!cls || !ct) return null;
                      return (
                        <div key={cid} className="flex items-center justify-between text-[10px] py-0.5 text-gray-300">
                          <span className="truncate">{cls.name}</span>
                          <span className="font-mono text-[#e5e7eb] whitespace-nowrap">
                            {cls.type === 'count' ? formatCount(ct.count) : `${formatArea(ct.areaReal, measurementSettings)}`}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between text-[11px] pt-1 mt-1 border-t border-[#00d4ff]/10 text-[#00d4ff] font-medium">
                      <span>Total ({totals.combined.count} items)</span>
                      <span className="font-mono">{formatArea(totals.combined.areaReal, measurementSettings)}</span>
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ClassificationLibrary open={showTemplateLibrary} onClose={handleCloseTemplateLibrary} />
      <ImportFromLibraryModal open={showImportFromLibrary} onClose={() => setShowImportFromLibrary(false)} />
      <UserPreferencesPanel open={showPreferences} onClose={() => setShowPreferences(false)} />

      {/* ── Group Create/Edit Modal ── */}
      {showGroupModal && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowGroupModal(false)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="w-full max-w-md bg-[rgba(15,18,32,0.98)] border border-[#00d4ff]/20 rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#00d4ff]/20">
                <span className="font-mono tracking-wider text-sm text-[#00d4ff]">
                  {editingGroupId ? 'EDIT GROUP' : 'CREATE GROUP'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="text-gray-400 hover:text-white"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="px-4 py-4 space-y-4">
                <div>
                  <label className="block text-xs text-[#8892a0] uppercase tracking-wider mb-1 font-mono">Group Name</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-[rgba(0,212,255,0.2)] bg-[#0a0a0f] text-white text-sm outline-none focus:border-[#00d4ff]/50"
                    placeholder="e.g. Room Finishes"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8892a0] uppercase tracking-wider mb-1 font-mono">Color</label>
                  <div className="flex gap-1.5">
                    {(['#f59e0b', '#3b82f6', '#10b981', '#6366f1', '#ef4444', '#8b5cf6', '#14b8a6', '#d97706'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setGroupColor(c)}
                        className={`w-6 h-6 rounded border ${groupColor === c ? 'border-white ring-1 ring-[#00d4ff]/80' : 'border-[#00d4ff]/30'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#8892a0] uppercase tracking-wider mb-1 font-mono">
                    Classifications ({groupSelectedClassificationIds.size} selected)
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-[#00d4ff]/15 rounded bg-[#0a0a0f]">
                    {classifications.length === 0 ? (
                      <div className="text-[11px] text-gray-500 px-3 py-4 text-center">No classifications available</div>
                    ) : (
                      classifications.map((cls) => (
                        <label
                          key={cls.id}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#00d4ff]/5 cursor-pointer border-b border-[#00d4ff]/10 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={groupSelectedClassificationIds.has(cls.id)}
                            onChange={() => handleToggleGroupClassification(cls.id)}
                            className="accent-[#00d4ff]"
                          />
                          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: cls.color }} />
                          <span className="text-sm text-white truncate">{cls.name}</span>
                          <span className="text-[10px] text-gray-500 ml-auto">{cls.type}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#00d4ff]/20">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="px-3 py-1.5 text-sm rounded border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGroup}
                  disabled={!groupName.trim()}
                  className="px-3 py-1.5 text-sm rounded bg-[#00d4ff]/20 border border-[#00d4ff]/50 text-[#9eeeff] hover:bg-[#00d4ff]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {editingGroupId ? 'Update Group' : 'Create Group'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      </>
      )}
    </>
  );

  // Mobile: full-screen overlay when opened
  if (isMobile) {
    return (
      <>
        {showQuantitiesDrawer && (
          <div
            className="fixed inset-0 z-50 bg-[rgba(10,10,15,0.95)] backdrop-blur-md flex flex-col max-h-screen overflow-y-auto"
            aria-label="Quantities overlay"
            onKeyDown={handleDrawerKeyDown}
            tabIndex={-1}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#00d4ff]/20">
              <span className="font-mono tracking-wider text-sm text-[#00d4ff]">QUANTITIES</span>
              <button
                onClick={() => setShowQuantitiesDrawer(false)}
                className="text-gray-300 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close quantities"
                style={{ touchAction: 'manipulation' }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[90vh]">
              {panel}
            </div>
          </div>
        )}
      </>
    );
  }

  // Tablet: slide-over panel from right, hidden by default
  if (isTablet) {
    return (
      <>
        {showQuantitiesDrawer && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowQuantitiesDrawer(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setShowQuantitiesDrawer(false);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Close quantities drawer backdrop"
          >
            <div className="absolute inset-0 bg-black/30" />
          </div>
        )}
        <aside
          className={`fixed top-[54px] right-0 bottom-0 z-50 w-[280px] bg-[rgba(18,18,26,0.95)] backdrop-blur-md border-l border-[#00d4ff]/20 flex flex-col text-[13px] transition-transform duration-200 ease-in-out max-h-[calc(100vh-54px)] overflow-y-auto ${
            showQuantitiesDrawer ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-label="Quantities panel"
          onKeyDown={handleDrawerKeyDown}
          tabIndex={-1}
        >
          {panel}
        </aside>
      </>
    );
  }

  // Desktop (lg+): always visible sidebar
  return (
    <aside
      className="hidden lg:flex bg-[rgba(18,18,26,0.8)] w-72 shrink-0 h-full flex-col border-l border-[#00d4ff]/20 text-[13px]"
      aria-label="Quantities panel"
    >
      {panel}
    </aside>
  );
}
