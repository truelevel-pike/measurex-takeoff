'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  Download,
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

interface Project {
  id: string;
  name: string;
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  area: 'border border-[#00d4ff]/40 text-[#00d4ff]/80',
  linear: 'border border-[#00d4ff]/40 text-[#00d4ff]/80',
  count: 'border border-[#00d4ff]/40 text-[#00d4ff]/80',
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

  // Import to project
  const [projects, setProjects] = useState<Project[]>([]);
  const [importItem, setImportItem] = useState<LibraryItem | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

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

  // BUG-A8-4-009 fix: cache projects list — show cached immediately, refresh in background
  const projectsCacheRef = React.useRef<Project[] | null>(null);
  const fetchProjects = useCallback(async () => {
    // Show cached data immediately if available
    if (projectsCacheRef.current && projectsCacheRef.current.length > 0) {
      setProjects(projectsCacheRef.current);
      if (!selectedProjectId) setSelectedProjectId(projectsCacheRef.current[0].id);
    }
    setProjectsLoading(!projectsCacheRef.current);
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) {
        throw new Error(`Failed to load projects (HTTP ${res.status})`);
      }
      const data = await res.json() as { projects?: Project[] };
      const list = data.projects ?? [];
      projectsCacheRef.current = list;
      setProjects(list);
      if (list.length > 0 && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }
    } catch (e) {
      if (!projectsCacheRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load projects');
        setProjects([]);
      }
    } finally {
      setProjectsLoading(false);
    }
  }, [selectedProjectId]);

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

  // BUG-A8-4-008 fix: perform delete first, only remove from UI on success.
  // On failure, keep the item and show error toast.
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

  async function handleImportOpen(item: LibraryItem) {
    setImportItem(item);
    setImportSuccess(null);
    await fetchProjects();
  }

  async function handleImportConfirm() {
    if (!importItem || !selectedProjectId) return;
    setImportingId(importItem.id);
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/classifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: importItem.name,
          type: importItem.type,
          color: importItem.color,
          visible: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Import failed');
      }
      setImportSuccess(importItem.id);
      setTimeout(() => {
        setImportItem(null);
        setImportSuccess(null);
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import');
      setImportItem(null);
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div
      className="min-h-screen"
      data-testid="library-page"
      style={{
        background: '#000',
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
            {/* Wave 17B Bug 3: combined empty state when library has no items at all */}
            {orgItems.length === 0 && myItems.length === 0 && (
              <div
                data-testid="library-empty-state"
                className="flex flex-col items-center justify-center py-24 gap-4 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.15)] flex items-center justify-center mb-2">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#00d4ff]/40" aria-hidden="true">
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-[#e0faff]">No saved classifications yet</h3>
                <p className="text-sm text-[#8892a0] max-w-sm leading-relaxed">
                  Create a classification in any project and save it to the library to reuse it across projects.
                </p>
                <a
                  href="/projects"
                  className="mt-2 px-4 py-2 text-sm font-medium rounded-lg bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.3)] text-[#00d4ff] hover:bg-[rgba(0,212,255,0.18)] transition-colors"
                >
                  Go to Projects →
                </a>
              </div>
            )}

            {/* Organization Library */}
            <section className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={18} className="text-[#00d4ff]" />
                <h2 className="font-mono tracking-wider text-[#00d4ff] text-sm">[ ORGANIZATION LIBRARY ]</h2>
                <span className="text-xs text-[#8892a0]">({orgItems.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {orgItems.map((item) => (
                  <LibraryCard
                    key={item.id}
                    item={item}
                    onImport={handleImportOpen}
                    importingId={importingId}
                    importSuccess={importSuccess}
                  />
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
                  <h2 className="font-mono tracking-wider text-[#00d4ff] text-sm">[ MY TEMPLATES ]</h2>
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
                  <LibraryCard
                    key={item.id}
                    item={item}
                    onDelete={handleDelete}
                    onImport={handleImportOpen}
                    importingId={importingId}
                    importSuccess={importSuccess}
                  />
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

      {/* Import to Project Modal */}
      {importItem && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setImportItem(null)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="w-full max-w-sm rounded-xl border shadow-2xl"
              style={{ background: '#111827', borderColor: 'rgba(0,212,255,0.25)', color: '#e5e7eb' }}
              role="dialog"
              aria-modal="true"
              aria-label="Import to project"
            >
              <div
                className="flex items-center justify-between border-b px-4 py-3"
                style={{ borderColor: 'rgba(0,212,255,0.2)' }}
              >
                <div className="flex items-center gap-2">
                  <Download size={15} className="text-[#00d4ff]" />
                  <h2 className="font-mono text-sm tracking-wider text-[#00d4ff]">IMPORT TO PROJECT</h2>
                </div>
                <button
                  onClick={() => setImportItem(null)}
                  className="rounded border p-1 text-[#b0dff0] hover:border-[#00d4ff]/60"
                  style={{ borderColor: 'rgba(0,212,255,0.3)' }}
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="px-4 py-4">
                {/* Template preview */}
                <div
                  className="flex items-center gap-3 p-3 rounded-lg border mb-4"
                  style={{ background: '#0a0a0f', borderColor: 'rgba(0,212,255,0.15)' }}
                >
                  <div className="w-7 h-7 rounded-md flex-shrink-0" style={{ backgroundColor: importItem.color }} />
                  <div>
                    <div className="text-sm font-medium text-white">{importItem.name}</div>
                    <div className="text-xs text-[#8892a0]">
                      {TYPE_LABELS[importItem.type]} · ${importItem.unit_cost.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Project selector */}
                <label className="block text-xs text-[#8892a0] mb-1.5">Select Project</label>
                {projectsLoading ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-[#8892a0]">
                    <Loader2 size={14} className="animate-spin" /> Loading projects…
                  </div>
                ) : projects.length === 0 ? (
                  <p className="text-sm text-[#8892a0]">No projects found.</p>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="w-full appearance-none rounded border px-3 py-2 text-sm outline-none pr-8"
                      style={{
                        background: '#0a0a0f',
                        borderColor: 'rgba(0,212,255,0.2)',
                        color: '#e0e0e0',
                      }}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8892a0] pointer-events-none"
                    />
                  </div>
                )}
              </div>

              <div
                className="flex items-center justify-end gap-2 border-t px-4 py-3"
                style={{ borderColor: 'rgba(0,212,255,0.2)' }}
              >
                <button
                  onClick={() => setImportItem(null)}
                  className="rounded border px-3 py-1.5 text-xs text-[#b8e6f7] hover:bg-[#00d4ff]/10"
                  style={{ borderColor: 'rgba(0,212,255,0.3)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportConfirm}
                  disabled={!selectedProjectId || importingId === importItem.id || importSuccess === importItem.id}
                  className="flex items-center gap-1.5 rounded px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ background: '#00d4ff', color: '#00131d' }}
                >
                  {importSuccess === importItem.id ? (
                    <><Check size={13} /> Imported!</>
                  ) : importingId === importItem.id ? (
                    <><Loader2 size={13} className="animate-spin" /> Importing…</>
                  ) : (
                    <><Download size={13} /> Import</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LibraryCard({
  item,
  onDelete,
  onImport,
  importingId,
  importSuccess,
}: {
  item: LibraryItem;
  onDelete?: (id: string) => void;
  onImport: (item: LibraryItem) => void;
  importingId: string | null;
  importSuccess: string | null;
}) {
  return (
    <div
      className="rounded-xl bg-[#0a0a0f] border border-[#00d4ff]/20 p-3 flex items-start gap-3 group transition-all hover:border-[#00d4ff]/60 hover:shadow-[0_0_12px_rgba(0,212,255,0.1)]"
      data-testid="library-classification-item"
    >
      {/* Color dot indicator */}
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ backgroundColor: item.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#00d4ff] truncate">{item.name}</span>
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs uppercase tracking-wider ${TYPE_BADGE_STYLES[item.type] ?? ''}`}
          >
            {item.type}
          </span>
        </div>
        <div className="text-sm text-zinc-400 mt-1">
          ${item.unit_cost.toFixed(2)} / {TYPE_LABELS[item.type]?.split(' ')[1]?.replace('(', '').replace(')', '') ?? 'unit'}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => onImport(item)}
            disabled={importingId === item.id}
            className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition-all disabled:opacity-50 ${
              importSuccess === item.id
                ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10'
                : 'border-[#00d4ff]/60 text-[#00d4ff] bg-transparent hover:bg-[#00d4ff]/10'
            }`}
            aria-label={`Import ${item.name} to project`}
          >
            {importSuccess === item.id ? (
              <><Check size={10} /> Imported</>
            ) : importingId === item.id ? (
              <><Loader2 size={10} className="animate-spin" /> Importing…</>
            ) : (
              <><Download size={10} /> Import</>
            )}
          </button>
          {/* BUG-A8-007 fix: hide delete button for org-owned items.
              The RLS policy (created_by = auth.uid()) will reject deletes
              for seeded org templates (created_by = null), so showing the
              button would create a silent-failure UX with optimistic UI. */}
          {onDelete && !item.is_org && (
            <button
              onClick={() => onDelete(item.id)}
              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity p-1"
              aria-label={`Delete ${item.name}`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
