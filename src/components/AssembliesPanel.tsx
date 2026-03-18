'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { Assembly } from '@/lib/types';
import AssemblyEditor from './AssemblyEditor';

interface AssembliesPanelProps {
  onSwitchToQuantities: () => void;
}

export default function AssembliesPanel({ onSwitchToQuantities }: AssembliesPanelProps) {
  const projectId = useStore((s) => s.projectId);
  const assemblies = useStore((s) => s.assemblies);
  const classifications = useStore((s) => s.classifications);
  const addAssembly = useStore((s) => s.addAssembly);
  const setAssemblies = useStore((s) => s.setAssemblies);
  const updateAssembly = useStore((s) => s.updateAssembly);
  const deleteAssembly = useStore((s) => s.deleteAssembly);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showEditor, setShowEditor] = useState(false);
  const [editingAssembly, setEditingAssembly] = useState<Assembly | null>(null);

  // Fetch assemblies from API on mount / when projectId changes
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/assemblies`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.assemblies)) {
          setAssemblies(data.assemblies);
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

  function totalCost(assembly: Assembly): number {
    return assembly.materials.reduce((sum, m) => sum + m.unitCost, 0);
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
            quantityFormula: 'area',
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
            quantityFormula: 'area',
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

                <span className="text-[10px] px-1 py-0.5 rounded font-mono bg-[#0e1016] text-emerald-400">
                  ${totalCost(assembly).toFixed(2)}
                </span>

                <span className="text-[10px] px-1 py-0.5 rounded bg-[#0e1016] text-[#00d4ff] font-mono">
                  {assembly.materials.length}
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

              {isExpanded && assembly.materials.length > 0 && (
                <div className="ml-6 border-l border-[#00d4ff]/20 pl-2 mb-1">
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
