'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Layers, X } from 'lucide-react';

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

export default function ClassificationLibrary({ open, onClose }: ClassificationLibraryProps) {
  const { addToast } = useToast();
  const classifications = useStore((s) => s.classifications);
  const addClassification = useStore((s) => s.addClassification);

  const [activeTab, setActiveTab] = useState<ClassificationPresetCategory>('RESIDENTIAL');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setActiveTab('RESIDENTIAL');
      setSelectedKeys(new Set());
    }
  }

  const byId = useMemo(
    () => new Map(CLASSIFICATION_PRESET_COLLECTIONS.map((collection) => [collection.id, collection])),
    []
  );
  const currentCollection = byId.get(activeTab) ?? CLASSIFICATION_PRESET_COLLECTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

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

          <div className="flex items-center justify-end gap-2 border-t border-[#00d4ff]/20 px-4 py-3">
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
    </>
  );
}
