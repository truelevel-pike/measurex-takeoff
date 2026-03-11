'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { Classification, Polygon } from '@/lib/types';
import { useIsMobile } from '@/lib/utils';

const TYPE_OPTIONS = [
  { value: 'area', label: 'Area (SF)' },
  { value: 'linear', label: 'Linear (LF)' },
  { value: 'count', label: 'Count (EA)' },
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

export default function QuantitiesPanel() {
  const isMobile = useIsMobile();

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
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ClassificationType>('area');
  const [newColorHex, setNewColorHex] = useState('#3b82f6');
  const [newClassificationError, setNewClassificationError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<ClassificationType>('area');
  const [editColorHex, setEditColorHex] = useState('#3b82f6');
  const [editError, setEditError] = useState<string | null>(null);

  const ppu = scale?.pixelsPerUnit || 1;
  const unit = scale?.unit || 'ft';

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

  const grand = useMemo(() => {
    return {
      count: polygons.length,
      areaReal: polygons.reduce((sum, polygon) => sum + polygon.area, 0) / (ppu * ppu),
      lengthReal: polygons.reduce((sum, polygon) => sum + (polygon.linearFeet || 0), 0),
    };
  }, [polygons, ppu]);

  function formatClassificationTotal(classification: Classification, totals: ClassTotals): string {
    if (classification.type === 'area') return `${totals.areaReal.toFixed(1)} sq ${unit}`;
    if (classification.type === 'linear') return `${totals.lengthReal.toFixed(1)} ${unit}`;
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
    const shouldDelete = window.confirm(`Delete "${classification.name}" and all its polygons?`);
    if (!shouldDelete) return;

    deleteClassification(classification.id);
    setExpanded((prev) => {
      if (!prev.has(classification.id)) return prev;
      const next = new Set(prev);
      next.delete(classification.id);
      return next;
    });
    if (editingId === classification.id) {
      setEditingId(null);
      setEditError(null);
    }
  }

  function startEditing(classification: Classification) {
    setEditingId(classification.id);
    setEditName(classification.name);
    setEditType(classification.type);
    setEditColorHex(classification.color);
    setEditError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditError(null);
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
      <div className="px-3 py-2 border-b border-[#00d4ff]/20 font-semibold text-[#e5e7eb] text-sm flex items-center justify-between bg-[rgba(10,10,15,0.6)]">
        <span className="font-mono tracking-wider">QUANTITIES</span>
        <span className="text-xs text-[#8892a0] font-normal">
          {grand.count} items - {grand.areaReal.toFixed(1)} sq {unit} - {grand.lengthReal.toFixed(1)} {unit}
        </span>
      </div>

      <div className="px-2 pt-2 pb-1">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-[#8892a0]" />
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
          <input
            placeholder="Classification name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="w-full px-2 py-1 border rounded text-[13px] mb-2 outline-none bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
            autoFocus
          />

          <div className="flex gap-2 items-center mb-2">
            <input
              type="color"
              value={isHexColor(newColorHex) ? newColorHex : '#3b82f6'}
              onChange={(event) => {
                setNewColorHex(event.target.value);
                setNewClassificationError(null);
              }}
              className="w-8 h-8 border rounded cursor-pointer bg-transparent"
              aria-label="Color picker"
            />
            <input
              type="text"
              value={newColorHex}
              onChange={(event) => {
                setNewColorHex(event.target.value);
                setNewClassificationError(null);
              }}
              className="flex-1 px-2 py-1 border rounded text-[12px] outline-none bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
              placeholder="#3b82f6"
              aria-label="Hex color"
            />
          </div>

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
              className="text-[#8892a0] text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="text-[#00d4ff] font-medium text-xs">
              Create
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-1">
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
                  <input
                    placeholder="Classification name"
                    value={editName}
                    onChange={(event) => {
                      setEditName(event.target.value);
                      setEditError(null);
                    }}
                    className="w-full px-2 py-1 border rounded text-[13px] mb-2 outline-none bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
                    autoFocus
                  />

                  <div className="flex gap-2 items-center mb-2">
                    <input
                      type="color"
                      value={isHexColor(editColorHex) ? editColorHex : '#3b82f6'}
                      onChange={(event) => {
                        setEditColorHex(event.target.value);
                        setEditError(null);
                      }}
                      className="w-8 h-8 border rounded cursor-pointer bg-transparent"
                      aria-label="Edit color picker"
                    />
                    <input
                      type="text"
                      value={editColorHex}
                      onChange={(event) => {
                        setEditColorHex(event.target.value);
                        setEditError(null);
                      }}
                      className="flex-1 px-2 py-1 border rounded text-[12px] outline-none bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
                      placeholder="#3b82f6"
                      aria-label="Edit hex color"
                    />
                  </div>

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
                    <button type="button" onClick={cancelEditing} className="text-[#8892a0] text-xs inline-flex items-center gap-1">
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
                  onClick={() => {
                    setSelectedClassification(isSelected ? null : classification.id);
                    toggleExpanded(classification.id);
                  }}
                >
                  {totals.count > 0 ? (
                    isExpanded ? (
                      <ChevronDown size={12} className="text-[#8892a0]" />
                    ) : (
                      <ChevronRight size={12} className="text-[#8892a0]" />
                    )
                  ) : (
                    <div className="w-3" />
                  )}

                  <div
                    className="w-3 h-3 rounded-sm border border-[#00d4ff]/30 flex-shrink-0"
                    style={{ backgroundColor: classification.color, boxShadow: `0 0 6px ${classification.color}55` }}
                  />

                  <span className="flex-1 font-medium truncate text-[12px] text-[#e5e7eb]">{classification.name}</span>

                  <span className="text-[10px] px-1 py-0.5 rounded font-mono bg-[#0e1016] text-[#00d4ff]">
                    {formatClassificationTotal(classification, totals)}
                  </span>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleClassification(classification.id);
                    }}
                    className="focus:outline-none"
                    aria-label={isHidden ? 'Show classification' : 'Hide classification'}
                  >
                    {isHidden ? <EyeOff size={13} className="text-[#8892a0]" /> : <Eye size={13} className="text-[#00d4ff]" />}
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      startEditing(classification);
                    }}
                    className="hidden group-hover:inline-flex text-[#8892a0] hover:text-[#00d4ff]"
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

              {isExpanded && totals.count > 0 && !isEditing && (
                <div className="ml-6 border-l border-[#00d4ff]/20 pl-2 mb-1">
                  <div className="text-[10px] py-0.5 text-[#8892a0] font-mono">
                    Total: {totals.count} items - {totals.areaReal.toFixed(1)} sq {unit} - {totals.lengthReal.toFixed(1)} {unit}
                  </div>
                  {polygonsForClassification.map((polygon, index) => {
                    const areaReal = polygon.area / (ppu * ppu);
                    const lengthReal = polygon.linearFeet || 0;

                    return (
                      <div key={polygon.id} className="text-[11px] py-0.5 flex items-center justify-between text-[#8892a0] gap-2">
                        <span className="truncate">
                          {classification.name} #{index + 1}
                        </span>
                        <span className="font-mono text-[#e5e7eb] whitespace-nowrap">
                          A {areaReal.toFixed(1)} sq {unit} | L {lengthReal.toFixed(1)} {unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center text-xs py-8 text-[#8892a0]">
            {search ? 'No matches' : 'No classifications yet. Click New Classification to add one.'}
          </div>
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div aria-label="Quantities drawer">
        <button
          onClick={() => setShowQuantitiesDrawer(!showQuantitiesDrawer)}
          className="mobile-only fixed left-1/2 -translate-x-1/2 bottom-[88px] bg-[rgba(18,18,26,0.8)] text-[#e5e7eb] border border-[#00d4ff]/20 rounded-t-lg px-4 py-1 text-xs z-30"
          aria-label={showQuantitiesDrawer ? 'Hide quantities' : 'Show quantities'}
        >
          {showQuantitiesDrawer ? 'Hide Quantities' : 'Show Quantities'}
        </button>
        {showQuantitiesDrawer && (
          <div className="fixed left-0 right-0 bottom-[88px] bg-[rgba(18,18,26,0.9)] backdrop-blur-md border-t border-[#00d4ff]/20 rounded-t-2xl p-3 max-h-[55vh] overflow-y-auto z-50">
            {panel}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      className="bg-[rgba(18,18,26,0.8)] md:w-[240px] lg:w-72 shrink-0 h-full flex flex-col border-l border-[#00d4ff]/20 text-[13px]"
      aria-label="Quantities panel"
    >
      {panel}
    </aside>
  );
}
