'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Download, Eye, EyeOff, History, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { Classification, Polygon } from '@/lib/types';
import { PRESET_COUNT_CLASSIFICATIONS } from '@/lib/classification-presets';
import { useIsMobile, useIsTablet } from '@/lib/utils';
import VersionHistory from './VersionHistory';
import AssembliesPanel from './AssembliesPanel';

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

type ClassTotals = {
  count: number;
  areaReal: number;
  lengthReal: number;
};

function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function normalizeHexInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
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

export default function QuantitiesPanel() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [activeTab, setActiveTab] = useState<'quantities' | 'assemblies'>('quantities');

  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const selectedClassification = useStore((s) => s.selectedClassification);

  const addClassification = useStore((s) => s.addClassification);
  const updateClassification = useStore((s) => s.updateClassification);
  const deleteClassification = useStore((s) => s.deleteClassification);
  const setSelectedClassification = useStore((s) => s.setSelectedClassification);
  const toggleClassification = useStore((s) => s.toggleClassification);

  const showQuantitiesDrawer = useStore((s) => s.showQuantitiesDrawer);
  const setShowQuantitiesDrawer = useStore((s) => s.setShowQuantitiesDrawer);

  const [search, setSearch] = useState('');
  const [showNewClassification, setShowNewClassification] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
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

  const drawerRef = useRef<HTMLDivElement>(null);
  const newClassNameRef = useRef<HTMLInputElement>(null);

  const ppu = scale?.pixelsPerUnit || 1;

  // Get projectId from URL or localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const pid = params.get('project') || localStorage.getItem('measurex_project_id');
      setProjectId(pid);
    }
  }, []);

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

  const filtered = useMemo(
    () => classifications.filter((c) => c.name.toLowerCase().includes(search.toLowerCase().trim())),
    [classifications, search]
  );

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
      totals.set(c.id, {
        count: items.length,
        areaReal: items.reduce((sum, polygon) => sum + polygon.area, 0) / (ppu * ppu),
        lengthReal: items.reduce((sum, polygon) => sum + (polygon.linearFeet || 0), 0),
      });
    }
    return totals;
  }, [classifications, polygonsByClassification, ppu]);

  function formatClassificationTotal(classification: Classification, totals: ClassTotals): string {
    if (classification.type === 'area') return `${totals.areaReal.toFixed(1)} sq ft`;
    if (classification.type === 'linear') return `${totals.lengthReal.toFixed(1)} ft`;
    return `${totals.count} EA`;
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
  }

  function handleClassificationRowKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    classificationId: string,
    isSelected: boolean
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateClassification(classificationId, isSelected);
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

    rows[nextIndex]?.focus();
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

  const panel = (
    <>
      {/* Assemblies tab — conditionally renders in JSX to avoid hooks-of-rules violation */}
      {activeTab === 'assemblies' ? (
        <AssembliesPanel onSwitchToQuantities={() => setActiveTab('quantities')} />
      ) : (
      <>
      {/* Tab bar */}
      <div className="flex border-b border-[#00d4ff]/20 bg-[rgba(10,10,15,0.6)]">
        <button
          type="button"
          className="flex-1 px-3 py-2 text-xs font-mono tracking-wider text-[#00d4ff] border-b-2 border-[#00d4ff]"
        >
          Quantities
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('assemblies')}
          className="flex-1 px-3 py-2 text-xs font-mono tracking-wider text-[#8892a0] hover:text-[#e5e7eb]"
        >
          Assemblies
        </button>
      </div>

      <div className="px-3 py-2 border-b border-[#00d4ff]/20 font-semibold text-[#e5e7eb] text-sm flex items-center justify-between bg-[rgba(10,10,15,0.6)]">
        <span className="font-mono tracking-wider">QUANTITIES</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-300 font-normal">
            {activeClassificationCount} {activeClassificationCount === 1 ? 'item' : 'items'}
          </span>
          {projectId && (
            <button
              type="button"
              onClick={() => window.open(`/api/projects/${projectId}/export/json`, '_blank')}
              className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Export JSON"
              title="Export JSON"
            >
              <Download size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Toggle version history"
            title="Version History"
          >
            <History size={14} />
          </button>
        </div>
      </div>
      {showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}

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
          onClick={() => {
            setShowNewClassification((prev) => !prev);
            setNewClassificationError(null);
          }}
          className="w-full border border-[#00d4ff]/30 rounded px-2 py-1.5 text-xs text-[#00d4ff] hover:bg-[#00d4ff]/10 flex items-center justify-center gap-1"
          aria-label="New Classification"
        >
          <Plus size={13} />
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
              onClick={() => {
                setShowNewClassification(false);
                setNewClassificationError(null);
              }}
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

      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={() => setShowPresets((prev) => !prev)}
          className="w-full border border-purple-500/30 rounded px-2 py-1.5 text-xs text-purple-300 hover:bg-purple-500/10 flex items-center justify-center gap-1"
          aria-label="Preset Classifications"
        >
          <Plus size={13} />
          Presets (Count)
        </button>
      </div>

      {showPresets && (
        <div className="mx-2 mb-2 p-2 bg-[#0e1016] border border-purple-500/20 rounded-lg">
          <div className="text-[11px] text-gray-400 mb-2 font-mono">Quick-add count classifications:</div>
          <div className="flex flex-wrap gap-1">
            {PRESET_COUNT_CLASSIFICATIONS.map((preset) => {
              const exists = classifications.some((c) => c.name.toLowerCase() === preset.name.toLowerCase());
              return (
                <button
                  key={preset.name}
                  type="button"
                  disabled={exists}
                  onClick={() => {
                    addClassification({ name: preset.name, color: preset.color, type: preset.type, visible: true });
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border ${
                    exists
                      ? 'border-gray-700 text-gray-600 cursor-not-allowed'
                      : 'border-purple-500/30 text-gray-200 hover:bg-purple-500/10 cursor-pointer'
                  }`}
                >
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: preset.color }} />
                  {preset.name}
                  {exists && <span className="text-[9px] text-gray-500 ml-0.5">(added)</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-1" data-classification-list>
        {filtered.map((classification) => {
          const totals = totalsByClassification.get(classification.id) ?? { count: 0, areaReal: 0, lengthReal: 0 };
          const polygonsForClassification = polygonsByClassification.get(classification.id) ?? [];
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
                      <X size={12} />
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
                    isSelected ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/40' : 'hover:bg-[#0e1016]'
                  }`}
                  onClick={() => activateClassification(classification.id, isSelected)}
                  onKeyDown={(event) => handleClassificationRowKeyDown(event, classification.id, isSelected)}
                  tabIndex={0}
                  data-classification-row
                >
                  {totals.count > 0 || classification.type === 'count' ? (
                    isExpanded ? (
                      <ChevronDown size={12} className="text-gray-300" />
                    ) : (
                      <ChevronRight size={12} className="text-gray-300" />
                    )
                  ) : (
                    <div className="w-3" />
                  )}

                  <div
                    className={`w-3 h-3 rounded-sm border border-[#00d4ff]/30 flex-shrink-0${classification.type === 'count' && totals.count === 0 ? ' opacity-40' : ''}`}
                    style={{ backgroundColor: classification.color, boxShadow: `0 0 6px ${classification.color}55` }}
                  />

                  <span className={`flex-1 font-medium truncate text-[12px] ${classification.type === 'count' && totals.count === 0 ? 'text-gray-500' : 'text-[#e5e7eb]'}`}>{classification.name}</span>

                  {classification.type === 'count' ? (
                    <span className={`text-[14px] font-bold font-mono px-1.5 py-0.5 rounded ${totals.count === 0 ? 'text-gray-500 bg-[#0e1016]/50' : 'text-[#00d4ff] bg-[#0e1016]'}`}>
                      {totals.count} EA
                    </span>
                  ) : (
                    <>
                      <span className="text-[10px] font-mono text-[#8892a0] flex-shrink-0">
                        {classification.type === 'area' ? 'SF' : 'FT'}
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
                    {isHidden ? <EyeOff size={13} className="text-gray-300" /> : <Eye size={13} className="text-[#00d4ff]" />}
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
                    <Pencil size={13} />
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
                    <Trash2 size={13} />
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
                              <div key={page} className="text-[11px] py-0.5 flex items-center justify-between text-gray-300 gap-2">
                                <span>Page {page}</span>
                                <span className="font-mono text-[#e5e7eb]">{count}</span>
                              </div>
                            ))}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] py-0.5 text-gray-300 font-mono">
                        Total: {totals.count} items - {totals.areaReal.toFixed(1)} sq ft - {totals.lengthReal.toFixed(1)} ft
                      </div>
                      {polygonsForClassification.map((polygon, index) => {
                        const areaReal = polygon.area / (ppu * ppu);
                        const lengthReal = polygon.linearFeet || 0;

                        return (
                          <div key={polygon.id} className="text-[11px] py-0.5 flex items-center justify-between text-gray-300 gap-2">
                            <span className="truncate">
                              {classification.name} #{index + 1}
                            </span>
                            <span className="font-mono text-[#e5e7eb] whitespace-nowrap">
                              A {areaReal.toFixed(1)} sq ft | L {lengthReal.toFixed(1)} ft
                            </span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center text-xs py-8 text-gray-300">
            {search ? 'No matches' : 'No classifications yet. Click New Classification to add one.'}
          </div>
        )}
      </div>
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
          <div className="fixed inset-0 z-40" onClick={() => setShowQuantitiesDrawer(false)}>
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
