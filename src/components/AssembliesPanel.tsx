'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { Assembly } from '@/lib/types';
import AssemblyEditor from './AssemblyEditor';
import { calculatePolygonArea } from '@/lib/polygon-utils';

interface AssembliesPanelProps {
  onSwitchToQuantities: () => void;
}

/** Quantity totals per classification, computed from polygons + scale. */
interface ClassQuantity {
  count: number;
  areaReal: number;   // sq ft
  lengthReal: number;  // linear ft
}

export default function AssembliesPanel({ onSwitchToQuantities }: AssembliesPanelProps) {
  const projectId = useStore((s) => s.projectId);
  const assemblies = useStore((s) => s.assemblies);
  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const addAssembly = useStore((s) => s.addAssembly);
  const setAssemblies = useStore((s) => s.setAssemblies);
  const updateAssembly = useStore((s) => s.updateAssembly);
  const deleteAssembly = useStore((s) => s.deleteAssembly);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showEditor, setShowEditor] = useState(false);
  const [editingAssembly, setEditingAssembly] = useState<Assembly | null>(null);

  // Compute quantities per classification from polygons + scale (mirrors QuantitiesPanel logic)
  const quantitiesByClass = useMemo(() => {
    const ppu = scale?.pixelsPerUnit || 1;
    const map: Record<string, ClassQuantity> = {};
    for (const cls of classifications) {
      const classPolygons = polygons.filter((p) => p.classificationId === cls.id && p.isComplete);
      let areaReal = 0;
      let lengthReal = 0;
      for (const p of classPolygons) {
        if (cls.type === 'area') {
          const areaPixels = calculatePolygonArea(p.points);
          areaReal += areaPixels / (ppu * ppu);
        } else if (cls.type === 'linear') {
          let perimPixels = 0;
          for (let i = 1; i < p.points.length; i++) {
            const dx = p.points[i].x - p.points[i - 1].x;
            const dy = p.points[i].y - p.points[i - 1].y;
            perimPixels += Math.sqrt(dx * dx + dy * dy);
          }
          lengthReal += perimPixels / ppu;
        }
      }
      map[cls.id] = { count: classPolygons.length, areaReal, lengthReal };
    }
    return map;
  }, [classifications, polygons, scale]);

  // Fetch assemblies from API on mount / when projectId changes
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/assemblies`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.assemblies)) {
          // Map flat API rows (AssemblyRow) → Assembly type expected by store
          const mapped: Assembly[] = data.assemblies.map((row: any) => ({
            id: row.id,
            name: row.name,
            classificationId: row.classificationId ?? '',
            isLibrary: false,
            materials: row.materials ?? [
              {
                id: row.id,
                name: row.name,
                unitCost: row.unitCost ?? 0,
                wasteFactor: 0,
                coverageRate: 0,
                unit: row.unit ?? 'SF',
              },
            ],
          }));
          setAssemblies(mapped);
        }
      })
      .catch((err) => console.error('Failed to fetch assemblies:', err));
  }, [projectId, setAssemblies]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function classificationName(id: string): string {
    return classifications.find((c) => c.id === id)?.name ?? '—';
  }

  /** Unit cost = sum of all material unit costs. */
  function unitCost(assembly: Assembly): number {
    return assembly.materials.reduce((sum, m) => sum + m.unitCost, 0);
  }

  /** Get the quantity value for an assembly based on its classification type. */
  function quantity(assembly: Assembly): number {
    const cls = classifications.find((c) => c.id === assembly.classificationId);
    const q = quantitiesByClass[assembly.classificationId];
    if (!cls || !q) return 0;
    if (cls.type === 'area') return q.areaReal;
    if (cls.type === 'linear') return q.lengthReal;
    return q.count;
  }

  /** Total cost = unitCost × quantity. */
  function totalCost(assembly: Assembly): number {
    return unitCost(assembly) * quantity(assembly);
  }

  /** Display unit based on classification type. */
  function displayUnit(assembly: Assembly): string {
    const cls = classifications.find((c) => c.id === assembly.classificationId);
    if (!cls) return assembly.materials[0]?.unit ?? 'SF';
    if (cls.type === 'area') return 'SF';
    if (cls.type === 'linear') return 'FT';
    return 'EA';
  }

  function handleEdit(assembly: Assembly) {
    setEditingAssembly(assembly);
    setShowEditor(true);
  }

  function handleDelete(id: string) {
    if (window.confirm('Delete this assembly?')) {
      deleteAssembly(id);
      if (projectId) {
        fetch(`/api/projects/${projectId}/assemblies/${id}`, { method: 'DELETE' })
          .catch((err) => console.error('API deleteAssembly failed:', err));
      }
    }
  }

  function handleSave(assembly: Assembly) {
    const cls = classifications.find((c) => c.id === assembly.classificationId);
    const formulaType = cls?.type === 'linear' ? 'linear' : cls?.type === 'count' ? 'count' : 'area';

    if (editingAssembly) {
      updateAssembly(assembly.id, assembly);
      if (projectId) {
        fetch(`/api/projects/${projectId}/assemblies/${assembly.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classificationId: assembly.classificationId,
            name: assembly.name,
            unit: assembly.materials[0]?.unit || 'SF',
            unitCost: assembly.materials.reduce((sum, m) => sum + m.unitCost, 0),
            quantityFormula: formulaType,
          }),
        }).catch((err) => console.error('API updateAssembly failed:', err));
      }
    } else {
      addAssembly(assembly);
      if (projectId) {
        fetch(`/api/projects/${projectId}/assemblies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classificationId: assembly.classificationId,
            name: assembly.name,
            unit: assembly.materials[0]?.unit || 'SF',
            unitCost: assembly.materials.reduce((sum, m) => sum + m.unitCost, 0),
            quantityFormula: formulaType,
          }),
        }).catch((err) => console.error('API createAssembly failed:', err));
      }
    }
    setShowEditor(false);
    setEditingAssembly(null);
  }

  function handleCloseEditor() {
    setShowEditor(false);
    setEditingAssembly(null);
  }

  return (
    <aside
      className="bg-[rgba(18,18,26,0.8)] md:w-[240px] lg:w-72 shrink-0 h-full flex flex-col border-l border-[#00d4ff]/20 text-[13px]"
      aria-label="Assemblies panel"
    >
      {/* Tab bar */}
      <div className="flex border-b border-[#00d4ff]/20 bg-[rgba(10,10,15,0.6)]">
        <button
          type="button"
          onClick={onSwitchToQuantities}
          className="flex-1 px-3 py-2 text-xs font-mono tracking-wider text-[#8892a0] hover:text-[#e5e7eb]"
        >
          Quantities
        </button>
        <button
          type="button"
          className="flex-1 px-3 py-2 text-xs font-mono tracking-wider text-[#00d4ff] border-b-2 border-[#00d4ff]"
        >
          Assemblies
        </button>
      </div>

      {/* Add button */}
      <div className="px-2 py-2">
        <button
          type="button"
          onClick={() => {
            setEditingAssembly(null);
            setShowEditor(true);
          }}
          className="w-full border border-emerald-500/30 rounded px-2 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 flex items-center justify-center gap-1"
        >
          <Plus size={13} />
          Add Assembly
        </button>
      </div>

      {/* Assemblies list */}
      <div className="flex-1 overflow-y-auto px-1">
        {assemblies.map((assembly) => {
          const isExpanded = expanded.has(assembly.id);
          const uc = unitCost(assembly);
          const qty = quantity(assembly);
          const tc = totalCost(assembly);
          const unit = displayUnit(assembly);

          return (
            <div key={assembly.id}>
              <div
                className="group flex items-center gap-1.5 px-1.5 py-1.5 rounded cursor-pointer hover:bg-[#0e1016]"
                onClick={() => toggleExpanded(assembly.id)}
              >
                {assembly.materials.length > 0 ? (
                  isExpanded ? (
                    <ChevronDown size={12} className="text-[#8892a0]" />
                  ) : (
                    <ChevronRight size={12} className="text-[#8892a0]" />
                  )
                ) : (
                  <div className="w-3" />
                )}

                <span className="flex-1 font-medium truncate text-[12px] text-[#e5e7eb]">
                  {assembly.name}
                </span>

                <span className="text-[10px] px-1 py-0.5 rounded font-mono bg-[#0e1016] text-[#8892a0]">
                  {classificationName(assembly.classificationId)}
                </span>

                <span className="text-[10px] px-1 py-0.5 rounded font-mono bg-[#0e1016] text-[#8892a0]">
                  ${uc.toFixed(2)}/{unit}
                </span>

                <span className="text-[10px] px-1 py-0.5 rounded font-mono bg-[#0e1016] text-emerald-400">
                  ${tc.toFixed(2)}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(assembly);
                  }}
                  className="hidden group-hover:inline-flex text-[#8892a0] hover:text-[#00d4ff]"
                  aria-label="Edit assembly"
                >
                  <Pencil size={13} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(assembly.id);
                  }}
                  className="hidden group-hover:inline-flex text-red-400 hover:text-red-500"
                  aria-label="Delete assembly"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {isExpanded && (
                <div className="ml-6 border-l border-[#00d4ff]/20 pl-2 mb-1">
                  {/* Quantity + cost breakdown */}
                  <div className="text-[11px] py-0.5 flex items-center justify-between text-[#8892a0] gap-2">
                    <span>Quantity</span>
                    <span className="font-mono text-[#e5e7eb]">
                      {qty.toFixed(2)} {unit}
                    </span>
                  </div>
                  <div className="text-[11px] py-0.5 flex items-center justify-between text-[#8892a0] gap-2">
                    <span>Unit Cost</span>
                    <span className="font-mono text-[#e5e7eb]">${uc.toFixed(2)}</span>
                  </div>
                  <div className="text-[11px] py-0.5 flex items-center justify-between text-[#8892a0] gap-2">
                    <span className="font-semibold text-emerald-400">Total Cost</span>
                    <span className="font-mono text-emerald-400 font-semibold">${tc.toFixed(2)}</span>
                  </div>

                  {/* Materials */}
                  {assembly.materials.length > 0 && (
                    <>
                      <div className="text-[10px] text-[#8892a0] mt-1 mb-0.5 uppercase tracking-wider">Materials</div>
                      {assembly.materials.map((mat) => (
                        <div
                          key={mat.id}
                          className="text-[11px] py-0.5 flex items-center justify-between text-[#8892a0] gap-2"
                        >
                          <span className="truncate">{mat.name || 'Unnamed'}</span>
                          <span className="font-mono text-[#e5e7eb] whitespace-nowrap">
                            ${mat.unitCost.toFixed(2)} | {mat.wasteFactor}% | {mat.unit}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {assemblies.length === 0 && (
          <div className="text-center text-xs py-8 text-[#8892a0]">
            No assemblies yet. Click Add Assembly to create one.
          </div>
        )}
      </div>

      {/* Grand total */}
      {assemblies.length > 0 && (
        <div className="px-3 py-2 border-t border-[#00d4ff]/20 bg-[rgba(10,10,15,0.6)] flex items-center justify-between">
          <span className="text-xs text-[#8892a0] font-mono">TOTAL</span>
          <span className="text-sm font-mono text-emerald-400 font-semibold">
            ${assemblies.reduce((sum, a) => sum + totalCost(a), 0).toFixed(2)}
          </span>
        </div>
      )}

      {/* Editor modal */}
      {showEditor && (
        <AssemblyEditor
          assembly={editingAssembly ?? undefined}
          onClose={handleCloseEditor}
          onSave={handleSave}
        />
      )}
    </aside>
  );
}
