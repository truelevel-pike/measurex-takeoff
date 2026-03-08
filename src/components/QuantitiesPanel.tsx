'use client';

import React, { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { Eye, EyeOff, Plus, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/lib/utils';

const TYPE_OPTIONS = [
  { value: 'area', label: 'Area (SF)' },
  { value: 'linear', label: 'Linear (LF)' },
  { value: 'count', label: 'Count (EA)' },
] as const;

export default function QuantitiesPanel() {
  const isMobile = useIsMobile();
  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const addClassification = useStore((s) => s.addClassification);
  const updateClassification = useStore((s) => s.updateClassification);
  const deleteClassification = useStore((s) => s.deleteClassification);
  const toggleClassification = useStore((s) => s.toggleClassification);
  const setSelectedClassification = useStore((s) => s.setSelectedClassification);
  const selectedClassification = useStore((s) => s.selectedClassification);
  const showQuantitiesDrawer = useStore((s) => (s as any).showQuantitiesDrawer ?? false);
  const setShowQuantitiesDrawer = useStore((s) => (s as any).setShowQuantitiesDrawer ?? (() => {}));

  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState<'area' | 'linear' | 'count'>('area');
  const [addColor, setAddColor] = useState('#3b82f6');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const ppu = scale?.pixelsPerUnit || 1;
  const unit = scale?.unit || 'ft';

  const filtered = useMemo(
    () => classifications.filter((c) => c.name.toLowerCase().includes(search.toLowerCase().trim())),
    [classifications, search]
  );

  function hexValid(v: string) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
  }

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    if (!hexValid(addColor)) return;
    const dup = classifications.some((c) => c.name.toLowerCase().trim() === name.toLowerCase());
    if (dup) return;
    addClassification({ name, type: addType, color: addColor, visible: true });
    setAddName('');
    setShowAdd(false);
  }

  function getTotalsFor(cId: string) {
    const items = polygons.filter((p) => p.classificationId === cId);
    const count = items.length;
    const areaPx = items.reduce((s, p) => s + p.area, 0);
    const areaReal = areaPx / (ppu * ppu);
    const lengthReal = items.reduce((s, p) => s + (p.linearFeet || 0), 0);
    return { count, areaReal, lengthReal };
  }

  const grand = useMemo(() => {
    const count = polygons.length;
    const areaReal = polygons.reduce((s, p) => s + p.area, 0) / (ppu * ppu);
    const lengthReal = polygons.reduce((s, p) => s + (p.linearFeet || 0), 0);
    return { count, areaReal, lengthReal };
  }, [polygons, ppu]);

  // Mobile: slide-up drawer
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
            {renderPanel({ filtered, grand, unit, search, setSearch, showAdd, setShowAdd, addName, setAddName, addType, setAddType, addColor, setAddColor, onAdd, expanded, setExpanded, renaming, setRenaming, newName, setNewName, getTotalsFor, classifications, polygons, ppu, selectedClassification, setSelectedClassification, toggleClassification, deleteClassification, updateClassification, dark: true })}
          </div>
        )}
      </div>
    );
  }

  // Tablet/Desktop sidebar
  return (
    <aside className="bg-[rgba(18,18,26,0.8)] md:w-[240px] lg:w-72 shrink-0 h-full flex flex-col border-l border-[#00d4ff]/20 text-[13px]" aria-label="Quantities panel">
      {renderPanel({ filtered, grand, unit, search, setSearch, showAdd, setShowAdd, addName, setAddName, addType, setAddType, addColor, setAddColor, onAdd, expanded, setExpanded, renaming, setRenaming, newName, setNewName, getTotalsFor, classifications, polygons, ppu, selectedClassification, setSelectedClassification, toggleClassification, deleteClassification, updateClassification, dark: true })}
    </aside>
  );
}

function renderPanel(ctx: any) {
  const { filtered, grand, unit, search, setSearch, showAdd, setShowAdd, addName, setAddName, addType, setAddType, addColor, setAddColor, onAdd, expanded, setExpanded, renaming, setRenaming, newName, setNewName, getTotalsFor, classifications, polygons, ppu, selectedClassification, setSelectedClassification, toggleClassification, deleteClassification, updateClassification, dark } = ctx;

  const headerCls = dark ? 'px-3 py-2 border-b border-[#00d4ff]/20 font-semibold text-[#e5e7eb] text-sm flex items-center justify-between bg-[rgba(10,10,15,0.6)]' : 'px-3 py-2 border-b border-zinc-200 font-semibold text-zinc-700 text-sm flex items-center justify-between';
  const subCls = dark ? 'text-xs text-[#8892a0] font-normal' : 'text-xs text-zinc-400 font-normal';
  const inputWrap = dark ? 'flex items-center gap-2' : 'flex items-center gap-2';
  const inputIcon = dark ? 'text-[#8892a0]' : 'text-zinc-400';
  const inputCls = dark ? 'flex-1 border px-2 py-1 rounded bg-[#0e1016] text-[#e5e7eb] text-[13px] outline-none focus:border-[#00d4ff]/40' : 'flex-1 border px-2 py-1 rounded bg-white text-[13px] outline-none focus:border-blue-300';
  const rowActions = dark ? 'p-1 text-[#8892a0] hover:text-[#e5e7eb] flex items-center gap-1' : 'p-1 text-zinc-500 hover:text-zinc-800 flex items-center gap-1';
  const addBtn = dark ? 'p-1 text-[#00d4ff] hover:bg-[#00d4ff]/10 rounded flex items-center gap-1' : 'p-1 text-green-600 hover:bg-green-50 rounded flex items-center gap-1';
  const addForm = dark ? 'mx-2 mb-2 p-2 bg-[#0e1016] border border-[#00d4ff]/20 rounded-lg' : 'mx-2 mb-2 p-2 bg-white border rounded-lg';
  const addCancel = dark ? 'text-[#8892a0] text-xs' : 'text-zinc-500 text-xs';
  const addConfirm = dark ? 'text-[#00d4ff] font-medium text-xs' : 'text-green-600 font-medium text-xs';
  const listWrap = dark ? 'flex-1 overflow-y-auto px-1' : 'flex-1 overflow-y-auto px-1';

  return (
    <>
      <div className={headerCls}>
        <span className="font-mono tracking-wider">QUANTITIES</span>
        <span className={subCls}>
          {grand.count} items · {grand.areaReal.toFixed(1)} sq {unit} · {grand.lengthReal.toFixed(1)} {unit}
        </span>
      </div>

      <div className="px-2 pt-2 pb-1">
        <div className={inputWrap}>
          <Search size={14} className={inputIcon} />
          <input
            placeholder="Search by name eg: 'Net area'"
            className={inputCls}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search classifications"
          />
        </div>
      </div>

      <div className="px-2 pb-1 flex items-center justify-between gap-2 text-[11px]">
        <button onClick={() => classifications.forEach((c: any) => toggleClassification(c.id))} className={rowActions} aria-label="Toggle all">
          <Eye size={12} /> Toggle
        </button>
        <button onClick={() => setShowAdd(true)} className={addBtn} aria-label="Add classification">
          <Plus size={14} /> Add
        </button>
      </div>

      {showAdd && (
        <form className={addForm} onSubmit={onAdd}>
          <input
            placeholder="Classification name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            className={dark ? 'w-full px-2 py-1 border rounded text-[13px] mb-1 outline-none bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40' : 'w-full px-2 py-1 border rounded text-[13px] mb-1 outline-none focus:border-blue-300'}
            autoFocus
          />
          <div className="flex gap-2 items-center mb-1">
            <select value={addType} onChange={(e) => setAddType(e.target.value as any)} className={dark ? 'flex-1 border rounded px-1 py-0.5 text-[12px] bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40' : 'flex-1 border rounded px-1 py-0.5 text-[12px]'}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input type="color" value={addColor} onChange={(e) => setAddColor(e.target.value)} className="w-7 h-7 border rounded cursor-pointer" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAdd(false)} className={addCancel}>Cancel</button>
            <button type="submit" className={addConfirm} aria-label="Confirm add">Add</button>
          </div>
        </form>
      )}

      <div className={listWrap}>
        {filtered.map((c: any) => {
          const stats = getTotalsFor(c.id);
          const isExpanded = expanded.has(c.id);
          const isSelected = selectedClassification === c.id;
          const clsPolygons = polygons.filter((p: any) => p.classificationId === c.id);

          return (
            <div key={c.id}>
              <div
                className={`group flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer ${
                  isSelected ? (dark ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/40' : 'bg-blue-50 border border-blue-200') : (dark ? 'hover:bg-[#0e1016]' : 'hover:bg-zinc-100')
                }`}
                onClick={() => {
                  setSelectedClassification(isSelected ? null : c.id);
                  setExpanded((prev: Set<string>) => {
                    const next = new Set(prev);
                    if (next.has(c.id)) next.delete(c.id);
                    else next.add(c.id);
                    return next;
                  });
                }}
              >
                {stats.count > 0 ? (
                  isExpanded ? <ChevronDown size={12} className={dark ? 'text-[#8892a0]' : 'text-zinc-400'} /> : <ChevronRight size={12} className={dark ? 'text-[#8892a0]' : 'text-zinc-400'} />
                ) : (
                  <div className="w-3" />
                )}

                <div className={`w-3 h-3 rounded-sm border ${dark ? 'border-[#00d4ff]/30' : 'border-zinc-300'} flex-shrink-0`} style={{ backgroundColor: c.color, boxShadow: dark ? `0 0 6px ${c.color}55` : 'none' }} />

                {renaming === c.id ? (
                  <input
                    value={newName}
                    autoFocus
                    className={dark ? 'flex-1 px-1 py-0.5 border rounded text-[13px] bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40' : 'flex-1 px-1 py-0.5 border rounded text-[13px]'}
                    onChange={(e) => setNewName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => { updateClassification(c.id, { name: newName.trim() }); setRenaming(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { updateClassification(c.id, { name: newName.trim() }); setRenaming(null); } }}
                  />
                ) : (
                  <span
                    className={`flex-1 font-medium truncate text-[12px] ${dark ? 'text-[#e5e7eb]' : ''}`}
                    onDoubleClick={(e) => { e.stopPropagation(); setRenaming(c.id); setNewName(c.name); }}
                  >
                    {c.name}
                  </span>
                )}

                <span className={`text-[10px] px-1 py-0.5 rounded font-mono ${dark ? 'bg-[#0e1016] text-[#00d4ff]' : 'bg-zinc-200 text-zinc-600'}`}>
                  {c.type === 'area' ? `${stats.areaReal.toFixed(1)} SF` : c.type === 'linear' ? `${stats.lengthReal.toFixed(1)} ${unit}` : `${stats.count} EA`}
                </span>

                <button onClick={(e) => { e.stopPropagation(); toggleClassification(c.id); }} className="focus:outline-none" aria-label={c.visible ? 'Hide' : 'Show'}>
                  {c.visible ? <Eye size={13} className={dark ? 'text-[#00d4ff]' : 'text-green-600'} /> : <EyeOff size={13} className={dark ? 'text-[#8892a0]' : 'text-zinc-400'} />}
                </button>

                <button onClick={(e) => { e.stopPropagation(); deleteClassification(c.id); }} className={`hidden group-hover:inline-flex ${dark ? 'text-red-400 hover:text-red-500' : 'text-red-400 hover:text-red-600'}`} aria-label="Delete classification">
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {isExpanded && stats.count > 0 && (
                <div className={`ml-6 border-l pl-2 mb-1 ${dark ? 'border-[#00d4ff]/20' : 'border-zinc-200'}`}>
                  {clsPolygons.map((p: any, i: number) => {
                    const areaReal = p.area / (ppu * ppu);
                    return (
                      <div key={p.id} className={`text-[11px] py-0.5 flex justify-between ${dark ? 'text-[#8892a0]' : 'text-zinc-500'}`}>
                        <span>{c.name} #{i + 1}</span>
                        <span className={`font-mono ${dark ? 'text-[#e5e7eb]' : ''}`}>
                          {c.type === 'area' ? `${areaReal.toFixed(1)} sq ${unit}` : c.type === 'linear' ? `${(p.linearFeet || 0).toFixed(1)} ${unit}` : '1 EA'}
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
          <div className={`text-center text-xs py-8 ${dark ? 'text-[#8892a0]' : 'text-zinc-400'}`}>
            {search ? 'No matches' : 'No classifications yet. Click + to add.'}
          </div>
        )}
      </div>
    </>
  );
}
