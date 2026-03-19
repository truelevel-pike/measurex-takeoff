'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Loader2,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isConfigured } from '@/lib/supabase';

interface LibraryItem {
  id: string;
  name: string;
  type: 'area' | 'linear' | 'count';
  color: string;
  unit_cost: number;
  is_org: boolean;
  created_by: string | null;
  created_at: string;
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  area: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  linear: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  count: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

const TYPE_LABELS: Record<string, string> = {
  area: 'Area (SF)',
  linear: 'Linear (LF)',
  count: 'Count (EA)',
};

export default function LibraryPage() {
  const router = useRouter();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New template form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'area' | 'linear' | 'count'>('area');
  const [formColor, setFormColor] = useState('#3B82F6');
  const [formUnitCost, setFormUnitCost] = useState('0');
  const [formSaving, setFormSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!isConfigured()) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }
    try {
      const { data, error: err } = await supabase
        .from('mx_classification_library')
        .select('*')
        .order('is_org', { ascending: false })
        .order('name');
      if (err) throw err;
      setItems((data as LibraryItem[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const orgItems = items.filter((i) => i.is_org);
  const myItems = items.filter((i) => !i.is_org);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = formName.trim();
    if (!name) return;
    setFormSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      const { error: err } = await supabase.from('mx_classification_library').insert({
        name,
        type: formType,
        color: formColor,
        unit_cost: parseFloat(formUnitCost) || 0,
        is_org: false,
        created_by: userId,
      });
      if (err) throw err;
      setFormName('');
      setFormType('area');
      setFormColor('#3B82F6');
      setFormUnitCost('0');
      setShowForm(false);
      await fetchItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create template');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error: err } = await supabase
        .from('mx_classification_library')
        .delete()
        .eq('id', id);
      if (err) throw err;
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete template');
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: '#0a0a0f',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: '#e0e0e0',
      }}
    >
      {/* Header */}
      <header
        className="w-full backdrop-blur-sm border-b"
        style={{
          height: 52,
          background: 'rgba(10,10,15,0.9)',
          borderColor: 'rgba(0,212,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          boxShadow: '0 0 20px rgba(0,212,255,0.15)',
        }}
      >
        <button
          onClick={() => router.push('/projects')}
          className="flex items-center gap-1 text-[#b0dff0] hover:text-[#e0faff] transition-colors"
          aria-label="Back to projects"
          style={{
            background: '#12121a',
            border: '1px solid rgba(0,212,255,0.15)',
            borderRadius: 8,
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Projects</span>
        </button>
        <div className="flex items-baseline gap-2 select-none">
          <span className="font-mono tracking-wider text-white text-sm">MEASUREX</span>
          <span className="font-mono tracking-wider text-[#00d4ff] text-[10px]">TAKEOFF ENGINE</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'rgba(0,212,255,0.2)' }} />
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-[#00d4ff]" />
          <span className="font-mono tracking-wider text-[#00d4ff] text-sm">CLASSIFICATION LIBRARY</span>
        </div>
      </header>
      <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, rgba(0,212,255,0) 0%, rgba(0,212,255,0.6) 50%, rgba(0,212,255,0) 100%)' }} />

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-[#00d4ff]" />
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">
              Dismiss
            </button>
          </div>
        )}

        {!loading && (
          <>
            {/* Organization Library */}
            <section className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={18} className="text-[#00d4ff]" />
                <h2 className="font-mono tracking-wider text-[#00d4ff] text-sm">ORGANIZATION LIBRARY</h2>
                <span className="text-xs text-[#8892a0]">({orgItems.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {orgItems.map((item) => (
                  <LibraryCard key={item.id} item={item} />
                ))}
                {orgItems.length === 0 && (
                  <p className="text-sm text-[#8892a0] col-span-full">No organization templates yet.</p>
                )}
              </div>
            </section>

            {/* My Templates */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <User size={18} className="text-[#00d4ff]" />
                  <h2 className="font-mono tracking-wider text-[#00d4ff] text-sm">MY TEMPLATES</h2>
                  <span className="text-xs text-[#8892a0]">({myItems.length})</span>
                </div>
                <button
                  onClick={() => setShowForm(!showForm)}
                  className="flex items-center gap-1 rounded border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: showForm ? 'rgba(0,212,255,0.15)' : '#12121a',
                    borderColor: 'rgba(0,212,255,0.3)',
                    color: '#e0faff',
                  }}
                >
                  {showForm ? <X size={13} /> : <Plus size={13} />}
                  {showForm ? 'Cancel' : 'Add Template'}
                </button>
              </div>

              {showForm && (
                <form
                  onSubmit={handleCreate}
                  className="mb-4 p-4 rounded-xl border"
                  style={{
                    background: '#12121a',
                    borderColor: 'rgba(0,212,255,0.2)',
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-[#8892a0] mb-1">Name</label>
                      <input
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="e.g. Metal Stud Wall"
                        className="w-full rounded border px-3 py-2 text-sm outline-none"
                        style={{
                          background: '#0a0a0f',
                          borderColor: 'rgba(0,212,255,0.2)',
                          color: '#e0e0e0',
                        }}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8892a0] mb-1">Type</label>
                      <select
                        value={formType}
                        onChange={(e) => setFormType(e.target.value as 'area' | 'linear' | 'count')}
                        className="w-full rounded border px-3 py-2 text-sm outline-none"
                        style={{
                          background: '#0a0a0f',
                          borderColor: 'rgba(0,212,255,0.2)',
                          color: '#e0e0e0',
                        }}
                      >
                        <option value="area">Area (SF)</option>
                        <option value="linear">Linear (LF)</option>
                        <option value="count">Count (EA)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#8892a0] mb-1">Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formColor}
                          onChange={(e) => setFormColor(e.target.value)}
                          className="h-8 w-10 rounded border cursor-pointer"
                          style={{ background: '#0a0a0f', borderColor: 'rgba(0,212,255,0.2)' }}
                        />
                        <input
                          value={formColor}
                          onChange={(e) => setFormColor(e.target.value)}
                          className="flex-1 rounded border px-3 py-2 text-sm font-mono outline-none"
                          style={{
                            background: '#0a0a0f',
                            borderColor: 'rgba(0,212,255,0.2)',
                            color: '#e0e0e0',
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-[#8892a0] mb-1">Unit Cost ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formUnitCost}
                        onChange={(e) => setFormUnitCost(e.target.value)}
                        className="w-full rounded border px-3 py-2 text-sm outline-none"
                        style={{
                          background: '#0a0a0f',
                          borderColor: 'rgba(0,212,255,0.2)',
                          color: '#e0e0e0',
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={formSaving || !formName.trim()}
                      className="flex items-center gap-1 rounded px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50"
                      style={{
                        background: '#00d4ff',
                        color: '#00131d',
                      }}
                    >
                      {formSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      {formSaving ? 'Creating…' : 'Create Template'}
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {myItems.map((item) => (
                  <LibraryCard key={item.id} item={item} onDelete={handleDelete} />
                ))}
                {myItems.length === 0 && !showForm && (
                  <p className="text-sm text-[#8892a0] col-span-full">
                    No personal templates yet. Click &quot;Add Template&quot; to create one.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function LibraryCard({
  item,
  onDelete,
}: {
  item: LibraryItem;
  onDelete?: (id: string) => void;
}) {
  return (
    <div
      className="rounded-xl border p-3 flex items-start gap-3 group transition-colors"
      style={{
        background: '#12121a',
        borderColor: 'rgba(0,212,255,0.15)',
      }}
    >
      {/* Color swatch */}
      <div
        className="w-8 h-8 rounded-lg flex-shrink-0 mt-0.5"
        style={{ backgroundColor: item.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{item.name}</span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${TYPE_BADGE_STYLES[item.type] ?? ''}`}
          >
            {item.type}
          </span>
        </div>
        <div className="text-xs text-[#8892a0] mt-1">
          ${item.unit_cost.toFixed(2)} / {TYPE_LABELS[item.type]?.split(' ')[1]?.replace('(', '').replace(')', '') ?? 'unit'}
        </div>
      </div>
      {onDelete && (
        <button
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity p-1"
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
