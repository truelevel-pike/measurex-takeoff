'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Folder, Plus, Trash2, Clock, FileSpreadsheet } from 'lucide-react';
import type { ProjectState } from '@/lib/types';

interface ProjectRow { id: string; name: string; created_at: string; updated_at: string; state?: ProjectState }

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error(`Failed to load projects (${res.status})`);
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          state: {
            classifications: [],
            polygons: [],
            scale: null,
            scales: {},
            currentPage: 1,
            totalPages: 1,
          } as ProjectState,
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const data = await res.json();
      setProjects(prev => [data.project, ...prev]);
      setShowCreate(false);
      setNewName('');
    } catch (err: any) {
      setError(err.message || 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    }
  };

  const handleOpen = (id: string) => router.push(`/?project=${id}`);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="bg-[#1a1a2e] text-white px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet size={24} className="text-blue-400" aria-hidden />
          <span className="text-xl font-bold">MeasureX</span>
          <span className="text-neutral-400 text-sm ml-2">Projects</span>
        </div>
        <button aria-label="New Project"
          onClick={() => setShowCreate(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors">
          <Plus size={16} aria-hidden /> New Project
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError(null)} className="float-right font-bold">×</button>
          </div>
        )}

        {showCreate && (
          <div className="bg-white border rounded-xl p-6 mb-6 shadow-sm">
            <h3 className="font-semibold text-lg mb-3">Create New Project</h3>
            <div className="flex gap-3">
              <input aria-label="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Project name (e.g., 123 Main St Addition)"
                className="flex-1 border rounded-lg px-4 py-2 outline-none focus:border-blue-400"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
              <button aria-label="Create project" onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button aria-label="Cancel create"
                onClick={() => { setShowCreate(false); setNewName(''); }}
                className="text-neutral-500 hover:text-neutral-700 px-3">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-neutral-400 py-16">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <Folder size={48} className="text-neutral-300 mx-auto mb-4" aria-hidden />
            <div className="text-lg text-neutral-500 mb-2">No projects yet</div>
            <div className="text-sm text-neutral-400">Click "New Project" to get started</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => {
              const polyCount = p.state?.polygons?.length || 0;
              const clsCount = p.state?.classifications?.length || 0;
              return (
                <div key={p.id}
                  className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => handleOpen(p.id)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Folder size={20} className="text-blue-400" aria-hidden />
                      <span className="font-semibold text-neutral-800">{p.name}</span>
                    </div>
                    <button aria-label={`Delete ${p.name}`}
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity p-1">
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-neutral-400">
                    <span className="flex items-center gap-1"><Clock size={12} aria-hidden />{new Date(p.updated_at || p.created_at).toLocaleDateString()}</span>
                    {polyCount > 0 && <span>{polyCount} polygons</span>}
                    {clsCount > 0 && <span>{clsCount} classifications</span>}
                  </div>
                  <button aria-label={`Open ${p.name}`}
                    className="mt-4 w-full bg-blue-50 hover:bg-blue-100 text-blue-600 py-2 rounded-lg text-sm font-medium transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleOpen(p.id); }}>
                    Open Project
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
