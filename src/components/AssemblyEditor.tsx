'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { Assembly, Material } from '@/lib/types';

interface AssemblyEditorProps {
  assembly?: Assembly;
  onClose: () => void;
  onSave: (assembly: Assembly) => void;
}

function emptyMaterial(): Material {
  return {
    id: crypto.randomUUID(),
    name: '',
    unitCost: 0,
    wasteFactor: 0,
    coverageRate: 0,
    unit: 'SF',
  };
}

export default function AssemblyEditor({ assembly, onClose, onSave }: AssemblyEditorProps) {
  const classifications = useStore((s) => s.classifications);

  const [name, setName] = useState(assembly?.name ?? '');
  const [classificationId, setClassificationId] = useState(assembly?.classificationId ?? '');
  const [isLibrary, setIsLibrary] = useState(assembly?.isLibrary ?? true);
  const [materials, setMaterials] = useState<Material[]>(
    assembly?.materials.length ? assembly.materials.map((m) => ({ ...m })) : [emptyMaterial()]
  );
  const [formula, setFormula] = useState('');

  // BUG-A6-5-005 fix: store onClose in a ref so the keydown handler never re-registers
  // due to an unstable onClose identity, which would briefly create duplicate listeners.
  const onCloseRef = React.useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function updateMaterial(index: number, patch: Partial<Material>) {
    setMaterials((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function removeMaterial(index: number) {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (!name.trim()) return;
    const saved: Assembly = {
      id: assembly?.id ?? crypto.randomUUID(),
      name: name.trim(),
      classificationId,
      // BUG-A6-5-006 fix: only apply global formula to materials that don't have
      // their own per-material formula. This preserves per-material values.
      materials: materials.map((m) => ({
        ...m,
        id: m.id || crypto.randomUUID(),
        formula: m.formula || formula || undefined,
      })),
      isLibrary,
    };
    onSave(saved);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[#12121a] border border-[#00d4ff]/20 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#00d4ff]/20">
          <h2 className="text-[#e5e7eb] font-semibold text-sm">
            {assembly ? 'Edit Assembly' : 'New Assembly'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#8892a0] hover:text-[#e5e7eb]">
            <X size={16} />
          </button>
        </div>

        {/* Fields */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[11px] text-[#8892a0] block mb-1">Assembly Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Interior Wall Type A"
              aria-label="Assembly name"
              className="w-full px-3 py-1.5 rounded border border-[#00d4ff]/20 bg-[#0a0a0f] text-[#e5e7eb] text-[13px] outline-none focus:border-[#00d4ff]/50"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] text-[#8892a0] block mb-1">Linked Classification</label>
            <select
              value={classificationId}
              onChange={(e) => setClassificationId(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-[#00d4ff]/20 bg-[#0a0a0f] text-[#e5e7eb] text-[13px] outline-none focus:border-[#00d4ff]/50"
            >
              <option value="">— None —</option>
              {classifications.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-[#8892a0] block mb-1">Scope</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsLibrary(true)}
                className={`flex-1 py-1.5 rounded text-xs font-medium ${
                  isLibrary
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#0a0a0f] text-[#8892a0] border border-[#00d4ff]/20'
                }`}
              >
                Library
              </button>
              <button
                type="button"
                onClick={() => setIsLibrary(false)}
                className={`flex-1 py-1.5 rounded text-xs font-medium ${
                  !isLibrary
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#0a0a0f] text-[#8892a0] border border-[#00d4ff]/20'
                }`}
              >
                Project-Specific
              </button>
            </div>
          </div>

          {/* Materials Table */}
          <div>
            <label className="text-[11px] text-[#8892a0] block mb-1">Materials</label>
            <div className="border border-[#00d4ff]/20 rounded overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[#0a0a0f] text-[#8892a0]">
                    <th className="text-left px-2 py-1.5 font-medium">Name</th>
                    <th className="text-left px-2 py-1.5 font-medium w-20">Cost ($)</th>
                    <th className="text-left px-2 py-1.5 font-medium w-16">Waste %</th>
                    <th className="text-left px-2 py-1.5 font-medium w-20">Coverage</th>
                    <th className="text-left px-2 py-1.5 font-medium w-14">Unit</th>
                    <th className="text-left px-2 py-1.5 font-medium w-24">Formula</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {materials.map((mat, i) => (
                    <tr key={mat.id} className="border-t border-[#00d4ff]/10">
                      <td className="px-1 py-1">
                        <input
                          value={mat.name}
                          onChange={(e) => updateMaterial(i, { name: e.target.value })}
                          className="w-full px-1 py-0.5 bg-transparent text-[#e5e7eb] outline-none border-b border-transparent focus:border-[#00d4ff]/30 text-[12px]"
                          placeholder="Material name"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          value={mat.unitCost}
                          onChange={(e) => updateMaterial(i, { unitCost: parseFloat(e.target.value) || 0 })}
                          className="w-full px-1 py-0.5 bg-transparent text-[#e5e7eb] outline-none border-b border-transparent focus:border-[#00d4ff]/30 text-[12px]"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          value={mat.wasteFactor}
                          onChange={(e) => updateMaterial(i, { wasteFactor: parseFloat(e.target.value) || 0 })}
                          className="w-full px-1 py-0.5 bg-transparent text-[#e5e7eb] outline-none border-b border-transparent focus:border-[#00d4ff]/30 text-[12px]"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          value={mat.coverageRate}
                          onChange={(e) => updateMaterial(i, { coverageRate: parseFloat(e.target.value) || 0 })}
                          className="w-full px-1 py-0.5 bg-transparent text-[#e5e7eb] outline-none border-b border-transparent focus:border-[#00d4ff]/30 text-[12px]"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={mat.unit}
                          onChange={(e) => updateMaterial(i, { unit: e.target.value })}
                          className="w-full px-1 py-0.5 bg-transparent text-[#e5e7eb] outline-none border-b border-transparent focus:border-[#00d4ff]/30 text-[12px]"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={mat.formula ?? ''}
                          onChange={(e) => updateMaterial(i, { formula: e.target.value })}
                          className="w-full px-1 py-0.5 bg-transparent text-[#e5e7eb] outline-none border-b border-transparent focus:border-[#00d4ff]/30 text-[12px]"
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeMaterial(i)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => setMaterials((prev) => [...prev, emptyMaterial()])}
              className="mt-2 text-[#00d4ff] text-[12px] flex items-center gap-1 hover:underline"
            >
              <Plus size={12} /> Add Material
            </button>
          </div>

          {/* Custom Formula */}
          <div>
            <label className="text-[11px] text-[#8892a0] block mb-1">Custom Formula</label>
            <input
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="=UnitCost*Quantity*(1+WasteFactor)"
              className="w-full px-3 py-1.5 rounded border border-[#00d4ff]/20 bg-[#0a0a0f] text-[#e5e7eb] text-[13px] outline-none focus:border-[#00d4ff]/50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-[#00d4ff]/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded border border-[#00d4ff]/20 text-[#8892a0] text-xs hover:text-[#e5e7eb]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-1.5 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
