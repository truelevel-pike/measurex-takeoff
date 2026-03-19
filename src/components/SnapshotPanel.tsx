'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Camera, RotateCcw, Trash2, Loader2, Plus } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface SnapshotMeta {
  id: string;
  createdAt: string;
  description: string;
  polygonCount: number;
  classificationCount: number;
  assemblyCount: number;
  pageCount: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SnapshotPanel({ projectId }: { projectId: string }) {
  const { addToast } = useToast();
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: `Snapshot ${new Date().toLocaleString()}` }),
      });
      if (res.ok) {
        addToast('Snapshot created', 'success');
        await fetchSnapshots();
      } else {
        addToast('Failed to create snapshot', 'error');
      }
    } catch {
      addToast('Failed to create snapshot', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(id: string) {
    if (confirmRestoreId !== id) {
      setConfirmRestoreId(id);
      return;
    }
    setConfirmRestoreId(null);
    setRestoringId(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      if (res.ok) {
        const data = await res.json();
        addToast(`Restored: ${data.polygonCount} polygons, ${data.classificationCount} classifications`, 'success');
      } else {
        addToast('Failed to restore snapshot', 'error');
      }
    } catch {
      addToast('Failed to restore snapshot', 'error');
    } finally {
      setRestoringId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('Snapshot deleted', 'success');
        setSnapshots((prev) => prev.filter((s) => s.id !== id));
      } else {
        addToast('Failed to delete snapshot', 'error');
      }
    } catch {
      addToast('Failed to delete snapshot', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Create button */}
      <div className="px-4 py-3 border-b border-gray-700">
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-100 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {creating ? 'Creating…' : 'Create Snapshot'}
        </button>
      </div>

      {/* Snapshot list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="text-gray-500 animate-spin" />
            <span className="ml-2 text-xs text-gray-500">Loading snapshots…</span>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Camera size={18} className="text-gray-600 mb-2" />
            <p className="text-sm font-medium text-gray-300">No snapshots yet</p>
            <p className="text-xs text-gray-500 mt-1">Create a snapshot to save the current project state.</p>
          </div>
        ) : (
          snapshots.map((snap) => (
            <div
              key={snap.id}
              className="group px-3 py-2.5 rounded-lg hover:bg-gray-800/60 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-200 truncate">{snap.description}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{timeAgo(snap.createdAt)}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] text-gray-400">{snap.polygonCount} polygons</span>
                    <span className="text-[10px] text-gray-400">{snap.classificationCount} classifications</span>
                    {snap.assemblyCount > 0 && (
                      <span className="text-[10px] text-gray-400">{snap.assemblyCount} assemblies</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestore(snap.id)}
                    disabled={restoringId === snap.id}
                    className={`inline-flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      confirmRestoreId === snap.id
                        ? 'text-amber-400 border-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20'
                        : 'text-gray-400 border-gray-600 hover:text-gray-200 hover:border-gray-500'
                    }`}
                  >
                    {restoringId === snap.id ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <RotateCcw size={10} />
                    )}
                    {confirmRestoreId === snap.id ? 'Confirm?' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(snap.id)}
                    disabled={deletingId === snap.id}
                    className="inline-flex items-center text-[10px] text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-400/50 rounded px-1 py-0.5 transition-colors disabled:opacity-60"
                  >
                    {deletingId === snap.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
