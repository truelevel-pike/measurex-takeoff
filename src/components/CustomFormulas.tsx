'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Check, AlertCircle, Plus } from 'lucide-react';
import type { Classification } from '@/lib/types';
import { useStore } from '@/lib/store';
import { tokenizeFormula, evaluateFormula } from '@/lib/formula-eval';

export interface CustomFormulasProps {
  classification?: Classification;
  onSave: (formula: string, unit: string, saveToLibrary: boolean) => void;
  onClose: () => void;
}

const EXAMPLE_CHIPS = [
  { label: '(Quantity 1 * 1.1) + 10', formula: '=(Quantity 1 * 1.1) + 10' },
  { label: 'Area / 32 (sheets of plywood)', formula: '=Area / 32' },
  { label: 'Linear * 0.083 (linear to sq ft)', formula: '=Linear * 0.083' },
];

export default function CustomFormulas({ classification, onSave, onClose }: CustomFormulasProps) {
  const [formula, setFormula] = useState(classification?.formula || '=');
  const [unit, setUnit] = useState(classification?.formulaUnit || '');
  const [saveToLibrary, setSaveToLibrary] = useState(classification?.formulaSavedToLibrary || false);

  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);

  // Build quantities map: classification name -> total quantity value
  const quantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of classifications) {
      const classPolygons = polygons.filter((p) => p.classificationId === c.id);
      let total = 0;
      for (const p of classPolygons) {
        if (c.type === 'area') {
          total += scale ? p.area / (scale.pixelsPerUnit * scale.pixelsPerUnit) : p.area;
        } else if (c.type === 'linear') {
          // BUG-A6-5-017 fix: p.linearFeet is already stored in real-world units (feet).
          // Do NOT divide by pixelsPerUnit — that would produce a double-conversion.
          total += p.linearFeet;
        } else {
          total += 1; // count
        }
      }
      map[c.name.toLowerCase()] = total;
    }
    return map;
  }, [classifications, polygons, scale]);

  // Validate and compute result
  const validation = useMemo(() => {
    const raw = formula.startsWith('=') ? formula.slice(1).trim() : formula.trim();
    if (!raw) return { valid: false, error: 'Enter a formula starting with "="', result: null };

    try {
      const names = classifications.map((c) => c.name);
      const tokens = tokenizeFormula(raw, names);
      if (tokens.length === 0) return { valid: false, error: 'Empty formula', result: null };
      const result = evaluateFormula(tokens, quantities);
      if (!isFinite(result)) return { valid: false, error: 'Result is not a finite number', result: null };
      return { valid: true, error: null, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid formula';
      if (message.includes('parenthes')) return { valid: false, error: 'Invalid formula — check parentheses', result: null };
      if (message.includes('Unexpected character')) return { valid: false, error: `Invalid formula — ${message}`, result: null };
      if (message.includes('Unknown reference')) return { valid: false, error: message, result: null };
      return { valid: false, error: `Invalid formula — ${message}`, result: null };
    }
  }, [formula, classifications, quantities]);

  const handleInsertRef = useCallback((name: string) => {
    setFormula((prev) => {
      const trimmed = prev.trimEnd();
      // If ends with operator or open paren or is just "=", just append name
      if (/[+\-*/^(=]$/.test(trimmed) || trimmed === '=') {
        return trimmed + name;
      }
      return trimmed + ' * ' + name;
    });
  }, []);

  const handleChipClick = useCallback((chipFormula: string) => {
    setFormula(chipFormula);
  }, []);

  const handleApply = useCallback(() => {
    if (!validation.valid) return;
    const raw = formula.startsWith('=') ? formula : '=' + formula;
    onSave(raw, unit, saveToLibrary);
  }, [formula, unit, saveToLibrary, validation.valid, onSave]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Custom Formula"
        className="bg-[#1e1e2e] border border-white/10 rounded-xl shadow-2xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Custom Formula</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Formula Input */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Formula</label>
            <div className="relative">
              <input
                type="text"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="=Flooring * 1.1 + 5"
                className="w-full bg-[#12121e] border border-white/10 rounded-lg px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-blue-500 pr-10"
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {validation.valid ? (
                  <Check size={16} className="text-emerald-400" />
                ) : formula.length > 1 ? (
                  <AlertCircle size={16} className="text-red-400" />
                ) : null}
              </div>
            </div>
            {validation.error && formula.length > 1 && (
              <p className="text-xs text-red-400 mt-1">{validation.error}</p>
            )}
            {validation.valid && validation.result !== null && (
              <p className="text-xs text-emerald-400 mt-1">
                Result: {validation.result.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                {unit ? ` ${unit}` : ''}
              </p>
            )}
          </div>

          {/* Example Chips */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Examples</label>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_CHIPS.map((chip) => (
                <button
                  key={chip.formula}
                  onClick={() => handleChipClick(chip.formula)}
                  className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1.5 text-neutral-300 hover:text-white transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference Picker */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Insert Reference</label>
            <div className="max-h-36 overflow-y-auto bg-[#12121e] border border-white/10 rounded-lg divide-y divide-white/5">
              {classifications.length === 0 ? (
                <div className="px-3 py-2 text-xs text-neutral-500">No classifications yet</div>
              ) : (
                classifications.map((c) => {
                  const qty = quantities[c.name.toLowerCase()] ?? 0;
                  const unitLabel = c.type === 'area' ? 'sq ft' : c.type === 'linear' ? 'LF' : 'EA';
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleInsertRef(c.name)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="text-sm text-white">{c.name}</span>
                      </span>
                      <span className="text-xs text-neutral-400">
                        {qty.toLocaleString(undefined, { maximumFractionDigits: 1 })} {unitLabel}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Custom Unit */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Unit of Measurement</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder='e.g. "sq ft", "LF", "EA", "bags"'
              className="w-full bg-[#12121e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Save to Library */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={saveToLibrary}
              onChange={(e) => setSaveToLibrary(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-[#12121e] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-neutral-300">Save to Library (reuse across projects)</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!validation.valid}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg transition-colors"
          >
            <Plus size={14} />
            Apply Formula
          </button>
        </div>
      </div>
    </div>
  );
}
