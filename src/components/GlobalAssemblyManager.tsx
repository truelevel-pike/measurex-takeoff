'use client';

/**
 * P3-01 + P3-02: Global Assembly Manager + Material Library Panel
 *
 * Accessible from the main page. Shows:
 *  - Assemblies list with material line items
 *  - New assembly form
 *  - Material library browser ("Browse Library" button)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, BookOpen, Link2, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';

// ── Types (mirrors assembly-store.ts) ─────────────────────────────────────

interface AssemblyMaterial {
  id: string;
  assemblyId: string;
  name: string;
  unit: string;
  quantityPerUnit: number;
  unitCost: number;
}

interface GlobalAssembly {
  id: string;
  name: string;
  classificationId?: string;
  materials: AssemblyMaterial[];
  createdAt: string;
  updatedAt: string;
}

interface MaterialLibraryItem {
  id: string;
  name: string;
  unit: string;
  defaultUnitCost: number;
  category: string;
}

// ── Empty row helpers ───────────────────────────────────────────────────────

function emptyMatRow() {
  return { name: '', unit: 'SF', quantityPerUnit: 1, unitCost: 0 };
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function GlobalAssemblyManager({ onClose }: Props) {
  const classifications = useStore((s) => s.classifications);

  // ── Assembly list state ────────────────────────────────────────────────────
  const [assemblies, setAssemblies] = useState<GlobalAssembly[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── New assembly form ──────────────────────────────────────────────────────
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClassId, setNewClassId] = useState('');
  const [newMats, setNewMats] = useState([emptyMatRow()]);
  const [saving, setSaving] = useState(false);

  // ── Material library panel ─────────────────────────────────────────────────
  const [showLibrary, setShowLibrary] = useState(false);
  const [library, setLibrary] = useState<MaterialLibraryItem[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libCategory, setLibCategory] = useState('');
  const [libSearch, setLibSearch] = useState('');
  const [newMatName, setNewMatName] = useState('');
  const [newMatUnit, setNewMatUnit] = useState('SF');
  const [newMatCost, setNewMatCost] = useState('');
  const [newMatCat, setNewMatCat] = useState('');
  const [libSaving, setLibSaving] = useState(false);

  // ── Load assemblies ────────────────────────────────────────────────────────
  const loadAssemblies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/assemblies');
      const data = await res.json();
      setAssemblies(data.assemblies ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAssemblies(); }, [loadAssemblies]);

  // ── Load material library ──────────────────────────────────────────────────
  const loadLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      const url = '/api/materials' + (libCategory ? `?category=${encodeURIComponent(libCategory)}` : '');
      const res = await fetch(url);
      const data = await res.json();
      setLibrary(data.materials ?? []);
    } catch {
      // ignore
    } finally {
      setLibLoading(false);
    }
  }, [libCategory]);

  useEffect(() => { if (showLibrary) loadLibrary(); }, [showLibrary, loadLibrary]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSaveAssembly = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/assemblies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          classificationId: newClassId || undefined,
          materials: newMats.filter((m) => m.name.trim()),
        }),
      });
      setShowNewForm(false);
      setNewName(''); setNewClassId(''); setNewMats([emptyMatRow()]);
      await loadAssemblies();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssembly = async (id: string) => {
    await fetch(`/api/assemblies/${id}`, { method: 'DELETE' });
    await loadAssemblies();
  };

  const handleSaveMaterial = async () => {
    const name = newMatName.trim();
    if (!name || !newMatCost) return;
    setLibSaving(true);
    try {
      await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          unit: newMatUnit,
          defaultUnitCost: parseFloat(newMatCost) || 0,
          category: newMatCat.trim() || 'Other',
        }),
      });
      setNewMatName(''); setNewMatUnit('SF'); setNewMatCost(''); setNewMatCat('');
      await loadLibrary();
    } finally {
      setLibSaving(false);
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    await fetch(`/api/materials/${id}`, { method: 'DELETE' });
    await loadLibrary();
  };

  const addLibMatToNewForm = (mat: MaterialLibraryItem) => {
    setNewMats((prev) => [...prev, { name: mat.name, unit: mat.unit, quantityPerUnit: 1, unitCost: mat.defaultUnitCost }]);
    setShowLibrary(false);
    setShowNewForm(true);
  };

  const categories = Array.from(new Set(library.map((m) => m.category))).sort();
  const filteredLib = library.filter((m) => {
    const q = libSearch.toLowerCase();
    return (!q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div
        data-testid="assemblies-panel"
        className="relative bg-[#12121a] border border-[#00d4ff]/25 rounded-xl shadow-2xl flex flex-col"
        style={{ width: 720, maxHeight: '88vh', overflow: 'hidden' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#00d4ff]/20">
          <span className="font-semibold text-[#e5e7eb] text-sm">Assembly Manager</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLibrary((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1 rounded border border-[#00d4ff]/30 text-[#00d4ff] text-xs hover:bg-[#00d4ff]/10 transition-colors"
            >
              <BookOpen size={12} />
              Browse Library
            </button>
            <button
              data-testid="new-assembly-btn"
              onClick={() => { setShowNewForm((v) => !v); setShowLibrary(false); }}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-500 transition-colors"
            >
              <Plus size={12} />
              New Assembly
            </button>
            <button onClick={onClose} className="text-[#8892a0] hover:text-white ml-1">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main panel */}
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* New assembly form */}
            {showNewForm && (
              <div className="m-4 p-4 rounded-lg border border-[#00d4ff]/20 bg-[#0a0a0f]">
                <h3 className="text-sm font-semibold text-[#e5e7eb] mb-3">New Assembly</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-[11px] text-[#8892a0] block mb-1">Name *</label>
                    <input
                      data-testid="assembly-name-input"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Framed Interior Wall"
                      className="w-full px-2 py-1.5 rounded border border-[#00d4ff]/20 bg-[#12121a] text-[#e5e7eb] text-sm outline-none focus:border-[#00d4ff]/50"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8892a0] block mb-1">Link to Classification</label>
                    <select
                      value={newClassId}
                      onChange={(e) => setNewClassId(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-[#00d4ff]/20 bg-[#12121a] text-[#e5e7eb] text-sm outline-none"
                    >
                      <option value="">— None —</option>
                      {classifications.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Materials table */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-[#8892a0]">Materials</label>
                    <button
                      data-testid="add-material-btn"
                      onClick={() => setNewMats((p) => [...p, emptyMatRow()])}
                      className="text-[#00d4ff] text-[11px] flex items-center gap-0.5 hover:underline"
                    >
                      <Plus size={10} /> Add row
                    </button>
                  </div>
                  <div className="rounded border border-[#00d4ff]/15 overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-[#0e1016] text-[#8892a0]">
                          <th className="text-left px-2 py-1 font-medium">Name</th>
                          <th className="text-left px-2 py-1 font-medium w-14">Unit</th>
                          <th className="text-left px-2 py-1 font-medium w-20">Qty/Unit</th>
                          <th className="text-left px-2 py-1 font-medium w-20">Unit Cost</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {newMats.map((m, i) => (
                          <tr key={i} className="border-t border-[#00d4ff]/10">
                            <td className="px-1 py-1">
                              <input value={m.name} onChange={(e) => setNewMats((p) => p.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                                className="w-full px-1 py-0.5 bg-transparent text-[#e5e7eb] outline-none border-b border-transparent focus:border-[#00d4ff]/30 text-[12px]" placeholder="Material" />
                            </td>
                            <td className="px-1 py-1">
                              <input value={m.unit} onChange={(e) => setNewMats((p) => p.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))}
                                className="w-full px-1 py-0.5 bg-transparent text-[#e5e7eb] outline-none border-b border-transparent focus:border-[#00d4ff]/30 text-[12px]" />
                            </td>
                            <td className="px-1 py-1">
                              <input type="number" value={m.quantityPerUnit} onChange={(e) => setNewMats((p) => p.map((r, j) => j === i ? { ...r, quantityPerUnit: parseFloat(e.target.value) || 0 } : r))}
                                className="w-full px-1 py-0.5 bg-transparent text-[#e5e7eb] outline-none border-b border-transparent focus:border-[#00d4ff]/30 text-[12px]" />
                            </td>
                            <td className="px-1 py-1">
                              <input type="number" value={m.unitCost} onChange={(e) => setNewMats((p) => p.map((r, j) => j === i ? { ...r, unitCost: parseFloat(e.target.value) || 0 } : r))}
                                className="w-full px-1 py-0.5 bg-transparent text-[#e5e7eb] outline-none border-b border-transparent focus:border-[#00d4ff]/30 text-[12px]" />
                            </td>
                            <td className="px-1 py-1 text-center">
                              <button onClick={() => setNewMats((p) => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X size={12} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    data-testid="save-assembly-btn"
                    onClick={handleSaveAssembly}
                    disabled={!newName.trim() || saving}
                    className="px-4 py-1.5 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-40 flex items-center gap-1"
                  >
                    {saving && <Loader2 size={11} className="animate-spin" />}
                    Save Assembly
                  </button>
                  <button onClick={() => setShowNewForm(false)} className="px-4 py-1.5 rounded border border-[#00d4ff]/20 text-[#8892a0] text-xs hover:text-white">Cancel</button>
                </div>
              </div>
            )}

            {/* Assemblies list */}
            <div className="flex-1 px-4 pb-4">
              {loading && <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-[#00d4ff]" /></div>}
              {!loading && assemblies.length === 0 && (
                <div className="text-center py-12 text-[#8892a0] text-sm">
                  No assemblies yet. Click <strong>New Assembly</strong> to create one.
                </div>
              )}
              {assemblies.map((asm) => {
                const cls = classifications.find((c) => c.id === asm.classificationId);
                const isExp = expanded.has(asm.id);
                const totalCost = asm.materials.reduce((s, m) => s + m.unitCost * m.quantityPerUnit, 0);
                return (
                  <div key={asm.id} data-testid="assembly-item" className="mb-2 rounded-lg border border-[#00d4ff]/15 overflow-hidden">
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#0e1016] transition-colors group"
                      onClick={() => setExpanded((p) => { const n = new Set(p); n.has(asm.id) ? n.delete(asm.id) : n.add(asm.id); return n; })}
                    >
                      {isExp ? <ChevronDown size={13} className="text-[#8892a0]" /> : <ChevronRight size={13} className="text-[#8892a0]" />}
                      <span className="flex-1 font-medium text-[13px] text-[#e5e7eb]">{asm.name}</span>
                      {cls && (
                        <span className="flex items-center gap-1 text-[10px] text-[#8892a0] border border-[#8892a0]/25 rounded px-1.5 py-0.5">
                          <Link2 size={9} /> {cls.name}
                        </span>
                      )}
                      <span className="text-[11px] text-[#8892a0] font-mono">{asm.materials.length} mat{asm.materials.length !== 1 ? 's' : ''}</span>
                      <span data-testid="assembly-total-cost" className="text-[11px] font-mono text-emerald-400 font-semibold">
                        ${totalCost.toFixed(2)}/unit
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteAssembly(asm.id); }}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                        aria-label="Delete assembly"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {isExp && (
                      <div className="border-t border-[#00d4ff]/10 px-3 py-2 bg-[#0a0a0f]">
                        {asm.materials.length === 0 ? (
                          <p className="text-[11px] text-[#8892a0] italic">No materials.</p>
                        ) : (
                          <table className="w-full text-[11px] mb-1">
                            <thead>
                              <tr className="text-[#8892a0]">
                                <th className="text-left pb-1 font-medium">Material</th>
                                <th className="text-left pb-1 font-medium w-14">Unit</th>
                                <th className="text-right pb-1 font-medium w-20">Qty/Unit</th>
                                <th className="text-right pb-1 font-medium w-20">Unit Cost</th>
                                <th className="text-right pb-1 font-medium w-20">Line Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#00d4ff]/08">
                              {asm.materials.map((m) => (
                                <tr key={m.id}>
                                  <td className="py-0.5 text-[#e5e7eb]">{m.name}</td>
                                  <td className="py-0.5 text-[#8892a0]">{m.unit}</td>
                                  <td className="py-0.5 text-right font-mono text-[#e5e7eb]">{m.quantityPerUnit}</td>
                                  <td className="py-0.5 text-right font-mono text-[#e5e7eb]">${m.unitCost.toFixed(2)}</td>
                                  <td className="py-0.5 text-right font-mono text-emerald-400">${(m.quantityPerUnit * m.unitCost).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <div className="text-right text-[11px] font-mono text-emerald-400 font-semibold border-t border-[#00d4ff]/10 pt-1">
                          Total: ${totalCost.toFixed(2)} per unit of takeoff
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Material Library side-panel */}
          {showLibrary && (
            <div
              data-testid="material-library-panel"
              className="w-72 border-l border-[#00d4ff]/20 flex flex-col bg-[#0a0a0f] overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-[#00d4ff]/15 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#00d4ff]">Material Library</span>
                <button onClick={() => setShowLibrary(false)} className="text-[#8892a0] hover:text-white"><X size={13} /></button>
              </div>
              {/* Search + filter */}
              <div className="px-2 py-2 space-y-1">
                <input
                  type="text"
                  placeholder="Search…"
                  value={libSearch}
                  onChange={(e) => setLibSearch(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-[#00d4ff]/15 bg-[#12121a] text-[#e5e7eb] text-[11px] outline-none"
                />
                <select
                  value={libCategory}
                  onChange={(e) => setLibCategory(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-[#00d4ff]/15 bg-[#12121a] text-[#e5e7eb] text-[11px] outline-none"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {/* Items */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                {libLoading && <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-[#00d4ff]" /></div>}
                {filteredLib.map((m) => (
                  <div key={m.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[#12121a] group">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-[#e5e7eb] truncate">{m.name}</p>
                      <p className="text-[9px] text-[#8892a0]">{m.category} · {m.unit} · ${m.defaultUnitCost.toFixed(2)}</p>
                    </div>
                    <button
                      data-testid={`add-to-assembly-${m.id}`}
                      onClick={() => addLibMatToNewForm(m)}
                      className="opacity-0 group-hover:opacity-100 text-[#00d4ff] text-[10px] flex items-center gap-0.5 hover:underline transition-opacity"
                    >
                      <Plus size={10} /> Add
                    </button>
                    <button
                      onClick={() => handleDeleteMaterial(m.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
              {/* New material form */}
              <div
                data-testid="new-material-form"
                className="border-t border-[#00d4ff]/15 px-2 py-2 space-y-1.5"
              >
                <p className="text-[10px] text-[#8892a0] uppercase tracking-wider mb-1">New Material</p>
                <input
                  data-testid="material-name-input"
                  type="text"
                  placeholder="Name"
                  value={newMatName}
                  onChange={(e) => setNewMatName(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-[#00d4ff]/15 bg-[#12121a] text-[#e5e7eb] text-[11px] outline-none"
                />
                <div className="flex gap-1">
                  <input
                    data-testid="material-unit-input"
                    type="text"
                    placeholder="Unit"
                    value={newMatUnit}
                    onChange={(e) => setNewMatUnit(e.target.value)}
                    className="w-16 px-2 py-1 rounded border border-[#00d4ff]/15 bg-[#12121a] text-[#e5e7eb] text-[11px] outline-none"
                  />
                  <input
                    data-testid="material-cost-input"
                    type="number"
                    placeholder="Cost"
                    value={newMatCost}
                    onChange={(e) => setNewMatCost(e.target.value)}
                    className="flex-1 px-2 py-1 rounded border border-[#00d4ff]/15 bg-[#12121a] text-[#e5e7eb] text-[11px] outline-none"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Category"
                  value={newMatCat}
                  onChange={(e) => setNewMatCat(e.target.value)}
                  list="global-mat-categories"
                  className="w-full px-2 py-1 rounded border border-[#00d4ff]/15 bg-[#12121a] text-[#e5e7eb] text-[11px] outline-none"
                />
                <datalist id="global-mat-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
                <button
                  data-testid="save-material-btn"
                  onClick={handleSaveMaterial}
                  disabled={!newMatName.trim() || !newMatCost || libSaving}
                  className="w-full py-1 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-500 disabled:opacity-40 flex items-center justify-center gap-1"
                >
                  {libSaving && <Loader2 size={10} className="animate-spin" />}
                  Save Material
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
