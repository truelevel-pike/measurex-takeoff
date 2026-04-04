'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Download, Layers, X } from 'lucide-react';

import { useStore } from '@/lib/store';
import {
  CLASSIFICATION_PRESET_COLLECTIONS,
  type ClassificationPreset,
  type ClassificationPresetCategory,
} from '@/lib/classification-presets';
import { useToast } from './Toast';

interface ClassificationLibraryProps {
  open: boolean;
  onClose: () => void;
}

interface OrgLibraryItem {
  id: string;
  name: string;
  type: 'area' | 'linear' | 'count';
  color: string;
  tileWidth?: number;
  tileHeight?: number;
  slopeFactor?: number;
  formula?: string;
  // BUG-PIKE-029 fix: persist formulaUnit so org library round-trip preserves custom formula units
  formulaUnit?: string;
}

const ORG_LIBRARY_KEY = 'mx-org-classifications';

function loadOrgLibrary(): OrgLibraryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    // Support both keys for backward compat
    const raw = localStorage.getItem(ORG_LIBRARY_KEY) || localStorage.getItem('mx-org-library');
    return raw ? (JSON.parse(raw) as OrgLibraryItem[]) : [];
  } catch {
    return [];
  }
}

function saveOrgLibrary(items: OrgLibraryItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ORG_LIBRARY_KEY, JSON.stringify(items));
  } catch { /* non-fatal */ }
}

export function saveClassificationToOrgLibrary(item: Omit<OrgLibraryItem, 'id'>): void {
  const existing = loadOrgLibrary();
  if (existing.some((e) => e.name.toLowerCase() === item.name.toLowerCase())) return;
  saveOrgLibrary([...existing, { ...item, id: crypto.randomUUID() }]);
}

export default function ClassificationLibrary({ open, onClose }: ClassificationLibraryProps) {
  const { addToast } = useToast();
  const classifications = useStore((s) => s.classifications);
  const addClassification = useStore((s) => s.addClassification);
  const updateClassification = useStore((s) => s.updateClassification);

  const [activeTab, setActiveTab] = useState<ClassificationPresetCategory>('RESIDENTIAL');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [orgLibrary, setOrgLibrary] = useState<OrgLibraryItem[]>([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgManageMode, setOrgManageMode] = useState(false);
  const [selectedOrgKeys, setSelectedOrgKeys] = useState<Set<string>>(new Set());

  // BUG-A6-037 fix: capture onClose in a ref so the Escape handler never triggers
  // re-registration when the parent passes a new function identity.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // BUG-A6-002 fix: replace the render-body setState pattern (getDerivedStateFromProps
  // anti-pattern) with a useEffect that resets state when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setActiveTab('RESIDENTIAL');
    setSelectedKeys(new Set());
  }, [open]);

  const byId = useMemo(
    () => new Map(CLASSIFICATION_PRESET_COLLECTIONS.map((collection) => [collection.id, collection])),
    []
  );
  const currentCollection = byId.get(activeTab) ?? CLASSIFICATION_PRESET_COLLECTIONS[0];

  // BUG-A6-037 fix: use onCloseRef.current inside the handler to avoid dep churn
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Wave 10: load org library from localStorage when dialog opens
  useEffect(() => {
    if (open) setOrgLibrary(loadOrgLibrary());
  }, [open]);

  if (!open) return null;

  const existingNames = new Set(classifications.map((classification) => classification.name.trim().toLowerCase()));

  function buildKey(category: ClassificationPresetCategory, presetName: string): string {
    return `${category}:${presetName}`;
  }

  function isExistingPreset(preset: ClassificationPreset): boolean {
    return existingNames.has(preset.name.toLowerCase());
  }

  function togglePreset(category: ClassificationPresetCategory, presetName: string) {
    const key = buildKey(category, presetName);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function addPresets(presets: ClassificationPreset[]) {
    let added = 0;
    let skipped = 0;
    const seenNames = new Set(existingNames);

    for (const preset of presets) {
      if (seenNames.has(preset.name.toLowerCase())) {
        skipped++;
        continue;
      }
      addClassification({
        name: preset.name,
        type: preset.type,
        color: preset.color,
        visible: true,
      });
      seenNames.add(preset.name.toLowerCase());
      added++;
    }

    if (added > 0) {
      addToast(`Added ${added} classification${added === 1 ? '' : 's'}.`, 'success');
    }
    if (skipped > 0) {
      addToast(`Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.`, 'info');
    }

    return added > 0;
  }

  function handleAddSelected() {
    const selectedPresets: ClassificationPreset[] = [];
    for (const collection of CLASSIFICATION_PRESET_COLLECTIONS) {
      for (const preset of collection.presets) {
        const key = buildKey(collection.id, preset.name);
        if (selectedKeys.has(key)) {
          selectedPresets.push(preset);
        }
      }
    }

    if (selectedPresets.length === 0) {
      addToast('Select at least one template first.', 'warning');
      return;
    }

    const hasAdded = addPresets(selectedPresets);
    if (hasAdded) {
      setSelectedKeys(new Set());
      onClose();
    }
  }

  function handleLoadTemplate() {
    const hasAdded = addPresets(currentCollection.presets);
    if (hasAdded) {
      onClose();
    }
  }

  function handleExportLibrary() {
    const exportData = classifications.map((c) => ({
      name: c.name,
      type: c.type,
      color: c.color,
      visible: c.visible,
    }));
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `classification-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`Exported ${exportData.length} classifications`, 'success');
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />

      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-xl border border-[#00d4ff]/25 bg-[#111827] text-[#e5e7eb] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#00d4ff]/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-[#00d4ff]" />
              <h2 className="font-mono text-sm tracking-wider text-[#00d4ff]">CLASSIFICATION TEMPLATES</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#00d4ff]/30 p-1 text-[#b0dff0] hover:border-[#00d4ff]/60"
              aria-label="Close templates library"
            >
              <X size={14} />
            </button>
          </div>

          <div className="border-b border-[#00d4ff]/20 px-3 pt-3">
            <div className="flex flex-wrap gap-2">
              {CLASSIFICATION_PRESET_COLLECTIONS.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => setActiveTab(collection.id)}
                  className={`rounded px-3 py-1.5 text-xs font-mono transition-colors ${
                    activeTab === collection.id
                      ? 'border border-[#00d4ff]/60 bg-[#00d4ff]/15 text-[#00d4ff]'
                      : 'border border-[#2f3a4d] bg-[#0b1220] text-[#b0bfcd] hover:border-[#00d4ff]/40'
                  }`}
                >
                  {collection.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[52vh] overflow-y-auto px-4 py-4">
            <div className="flex flex-wrap gap-2">
              {currentCollection.presets.map((preset) => {
                const key = buildKey(currentCollection.id, preset.name);
                const selected = selectedKeys.has(key);
                const exists = isExistingPreset(preset);

                return (
                  <button
                    key={preset.name}
                    type="button"
                    disabled={exists}
                    onClick={() => togglePreset(currentCollection.id, preset.name)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      exists
                        ? 'cursor-not-allowed border-[#2f3a4d] bg-[#0f1725] text-[#64748b]'
                        : selected
                          ? 'border-[#00d4ff]/70 bg-[#00d4ff]/15 text-[#d9f5ff]'
                          : 'border-[#2f3a4d] bg-[#0b1220] text-[#d4dce6] hover:border-[#00d4ff]/40'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preset.color }} />
                    <span>{preset.name}</span>
                    <span className="rounded bg-[#0b1220] px-1.5 py-0.5 text-[10px] uppercase text-[#8aa0b6]">
                      {preset.type}
                    </span>
                    {selected && !exists && <Check size={12} className="text-[#00d4ff]" />}
                    {exists && <span className="text-[10px] uppercase">Added</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* P4-03: Org Library section */}
          <div
            data-testid="org-library-section"
            className="border-t border-[#00d4ff]/15 px-4 py-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen size={13} className="text-amber-400" />
                <span className="text-[11px] font-mono text-amber-300 uppercase tracking-wider">
                  Org Library ({orgLibrary.length})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedOrgKeys.size > 0 && (
                  <button
                    type="button"
                    data-testid="org-library-import-btn"
                    onClick={() => {
                      let imported = 0;
                      for (const id of selectedOrgKeys) {
                        const item = orgLibrary.find((x) => x.id === id);
                        if (!item) continue;
                        if (classifications.some((c) => c.name.toLowerCase() === item.name.toLowerCase())) continue;
                        // BUG-PIKE-029 fix: add then patch extended fields (formula, formulaUnit, tile dims, slope)
                        const newId = addClassification({ name: item.name, type: item.type, color: item.color, visible: true });
                        if (item.formula || item.formulaUnit || item.tileWidth || item.tileHeight || item.slopeFactor) {
                          updateClassification(newId, { formula: item.formula, formulaUnit: item.formulaUnit, tileWidth: item.tileWidth, tileHeight: item.tileHeight, slopeFactor: item.slopeFactor });
                        }
                        imported++;
                      }
                      setSelectedOrgKeys(new Set());
                      if (imported > 0) addToast(`Imported ${imported} from org library`, 'success');
                    }}
                    className="text-[10px] px-2 py-0.5 rounded border border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                  >
                    Import {selectedOrgKeys.size}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="org-library-manage-btn"
                  onClick={() => setOrgManageMode((v) => !v)}
                  className="text-[10px] px-2 py-0.5 rounded border border-[#00d4ff]/25 text-[#7aebff] hover:bg-[#00d4ff]/10"
                >
                  {orgManageMode ? 'Done' : 'Manage'}
                </button>
              </div>
            </div>

            {orgLibrary.length > 0 && (
              <input
                data-testid="org-library-search"
                type="text"
                placeholder="Search org library…"
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                className="w-full mb-2 rounded border border-[#00d4ff]/20 bg-[#0b1220] px-2 py-1 text-[11px] text-[#e5e7eb] placeholder-[#4a5568] outline-none focus:border-[#00d4ff]/50"
              />
            )}

            {orgLibrary.length === 0 ? (
              <p className="text-[11px] text-[#4a5568] italic">No org library items yet. Save classifications from your project to build your library.</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {orgLibrary
                  .filter((item) => !orgSearch || item.name.toLowerCase().includes(orgSearch.toLowerCase()))
                  .map((item) => {
                    const alreadyExists = classifications.some((c) => c.name.toLowerCase() === item.name.toLowerCase());
                    const isSelected = selectedOrgKeys.has(item.id);
                    if (orgManageMode) {
                      return (
                        <div
                          key={item.id}
                          data-testid="org-library-item"
                          className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/8 px-3 py-1.5 text-xs text-amber-200"
                        >
                          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                          <span>{item.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = orgLibrary.filter((x) => x.id !== item.id);
                              saveOrgLibrary(updated);
                              setOrgLibrary(updated);
                              addToast(`Removed "${item.name}" from org library`, 'info');
                            }}
                            className="ml-1 text-red-400 hover:text-red-300 text-[10px]"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid="org-library-item"
                        onClick={() => {
                          if (alreadyExists) return;
                          setSelectedOrgKeys((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          });
                        }}
                        title={alreadyExists ? 'Already in project' : `Click to select · double-click to import "${item.name}"`}
                        onDoubleClick={() => {
                          if (alreadyExists) return;
                          // BUG-PIKE-029 fix: add then patch extended fields (formula, formulaUnit, tile dims, slope)
                          const newId = addClassification({ name: item.name, type: item.type, color: item.color, visible: true });
                          if (item.formula || item.formulaUnit || item.tileWidth || item.tileHeight || item.slopeFactor) {
                            updateClassification(newId, { formula: item.formula, formulaUnit: item.formulaUnit, tileWidth: item.tileWidth, tileHeight: item.tileHeight, slopeFactor: item.slopeFactor });
                          }
                          addToast(`Imported "${item.name}" from org library`, 'success');
                        }}
                        disabled={alreadyExists}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          alreadyExists
                            ? 'cursor-not-allowed border-[#2f3a4d] bg-[#0f1725] text-[#64748b]'
                            : isSelected
                              ? 'border-amber-400/70 bg-amber-400/20 text-amber-100'
                              : 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:border-amber-400/60'
                        }`}
                      >
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                        <span>{item.name}</span>
                        <span className="rounded bg-[#0b1220] px-1.5 py-0.5 text-[10px] uppercase text-[#8aa0b6]">{item.type}</span>
                        {alreadyExists && <span className="text-[10px] uppercase">Added</span>}
                        {isSelected && !alreadyExists && <Check size={10} className="text-amber-300" />}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[#00d4ff]/20 px-4 py-3">
            <button
              type="button"
              data-testid="export-library-btn"
              onClick={handleExportLibrary}
              disabled={classifications.length === 0}
              title={classifications.length === 0 ? 'No classifications to export' : `Export ${classifications.length} classifications as JSON`}
              className="flex items-center gap-1.5 rounded border border-[#00d4ff]/30 px-3 py-1.5 text-xs text-[#b8e6f7] hover:bg-[#00d4ff]/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={12} aria-hidden="true" />
              Export JSON
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadTemplate}
                className="rounded border border-[#00d4ff]/30 px-3 py-1.5 text-xs text-[#b8e6f7] hover:bg-[#00d4ff]/10"
              >
                Load Template
              </button>
              <button
                type="button"
                onClick={handleAddSelected}
                className="rounded bg-[#00d4ff] px-3 py-1.5 text-xs font-medium text-[#00131d] hover:bg-[#00bce0]"
              >
                Add Selected
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
