'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Check, Loader2, X } from 'lucide-react';
import { supabase, isConfigured } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { useToast } from './Toast';

interface LibraryItem {
  id: string;
  name: string;
  type: 'area' | 'linear' | 'count';
  color: string;
  unit_cost: number;
  is_org: boolean;
}

interface ImportFromLibraryModalProps {
  open: boolean;
  onClose: () => void;
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  area: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  linear: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  count: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

export default function ImportFromLibraryModal({ open, onClose }: ImportFromLibraryModalProps) {
  const { addToast } = useToast();
  const classifications = useStore((s) => s.classifications);
  const addClassification = useStore((s) => s.addClassification);

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    if (!isConfigured()) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('mx_classification_library')
        .select('id, name, type, color, unit_cost, is_org')
        .order('is_org', { ascending: false })
        .order('name');
      if (error) throw error;
      setItems((data as LibraryItem[]) ?? []);
    } catch {
      // silently fail — user will see empty list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setLoading(true);
      fetchItems();
    }
  }, [open, fetchItems]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const existingNames = new Set(classifications.map((c) => c.name.trim().toLowerCase()));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleImport() {
    const toImport = items.filter((i) => selected.has(i.id));
    let added = 0;
    let skipped = 0;

    for (const item of toImport) {
      if (existingNames.has(item.name.trim().toLowerCase())) {
        skipped++;
        continue;
      }
      addClassification({
        name: item.name,
        type: item.type,
        color: item.color,
        visible: true,
      });
      added++;
    }

    if (added > 0) addToast(`Imported ${added} classification${added === 1 ? '' : 's'}`, 'success');
    if (skipped > 0) addToast(`Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}`, 'info');

    onClose();
  }

  const orgItems = items.filter((i) => i.is_org);
  const userItems = items.filter((i) => !i.is_org);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg rounded-xl border shadow-2xl"
          style={{
            background: '#111827',
            borderColor: 'rgba(0,212,255,0.25)',
            color: '#e5e7eb',
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Import from library"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'rgba(0,212,255,0.2)' }}>
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-[#00d4ff]" />
              <h2 className="font-mono text-sm tracking-wider text-[#00d4ff]">IMPORT FROM LIBRARY</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded border p-1 text-[#b0dff0] hover:border-[#00d4ff]/60"
              style={{ borderColor: 'rgba(0,212,255,0.3)' }}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[52vh] overflow-y-auto px-4 py-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={22} className="animate-spin text-[#00d4ff]" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-[#8892a0] text-center py-8">
                No library items found. Add templates in the Classification Library.
              </p>
            ) : (
              <>
                {orgItems.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-wider text-[#8892a0] mb-2 font-mono">Organization</div>
                    <div className="flex flex-wrap gap-2">
                      {orgItems.map((item) => {
                        const exists = existingNames.has(item.name.trim().toLowerCase());
                        const isSelected = selected.has(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={exists}
                            onClick={() => toggle(item.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                              exists
                                ? 'cursor-not-allowed border-[#2f3a4d] bg-[#0f1725] text-[#64748b]'
                                : isSelected
                                  ? 'border-[#00d4ff]/70 bg-[#00d4ff]/15 text-[#d9f5ff]'
                                  : 'border-[#2f3a4d] bg-[#0b1220] text-[#d4dce6] hover:border-[#00d4ff]/40'
                            }`}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span>{item.name}</span>
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${TYPE_BADGE_STYLES[item.type] ?? ''}`}>
                              {item.type}
                            </span>
                            <span className="text-[10px] text-[#8892a0]">${item.unit_cost}</span>
                            {isSelected && !exists && <Check size={12} className="text-[#00d4ff]" />}
                            {exists && <span className="text-[10px] uppercase">Added</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {userItems.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#8892a0] mb-2 font-mono">My Templates</div>
                    <div className="flex flex-wrap gap-2">
                      {userItems.map((item) => {
                        const exists = existingNames.has(item.name.trim().toLowerCase());
                        const isSelected = selected.has(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={exists}
                            onClick={() => toggle(item.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                              exists
                                ? 'cursor-not-allowed border-[#2f3a4d] bg-[#0f1725] text-[#64748b]'
                                : isSelected
                                  ? 'border-[#00d4ff]/70 bg-[#00d4ff]/15 text-[#d9f5ff]'
                                  : 'border-[#2f3a4d] bg-[#0b1220] text-[#d4dce6] hover:border-[#00d4ff]/40'
                            }`}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span>{item.name}</span>
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${TYPE_BADGE_STYLES[item.type] ?? ''}`}>
                              {item.type}
                            </span>
                            <span className="text-[10px] text-[#8892a0]">${item.unit_cost}</span>
                            {isSelected && !exists && <Check size={12} className="text-[#00d4ff]" />}
                            {exists && <span className="text-[10px] uppercase">Added</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'rgba(0,212,255,0.2)' }}>
            <button
              onClick={onClose}
              className="rounded border px-3 py-1.5 text-xs text-[#b8e6f7] hover:bg-[#00d4ff]/10"
              style={{ borderColor: 'rgba(0,212,255,0.3)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0}
              className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 transition-colors"
              style={{
                background: selected.size > 0 ? '#00d4ff' : 'rgba(0,212,255,0.3)',
                color: '#00131d',
              }}
            >
              Import {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
