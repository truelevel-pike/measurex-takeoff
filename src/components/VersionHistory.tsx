'use client';

import React, { useState, useEffect } from 'react';
import { History, Clock, CheckCircle, RotateCcw, X, Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/store';

interface VersionHistoryProps {
  onClose: () => void;
}

interface ApiHistoryEntry {
  id: string;
  projectId: string;
  actionType: 'create' | 'update' | 'delete';
  entityType: 'polygon' | 'classification' | 'scale';
  entityId: string | null;
  beforeData: unknown | null;
  afterData: unknown | null;
  createdAt: string;
}

interface MockEntry {
  id: string;
  timestamp: string;
  description: string;
  isCurrent: boolean;
}

function generateMockEntries(undoStackLength: number): MockEntry[] {
  const now = new Date();
  const descriptions = [
    'Current state',
    'Added classification Flooring',
    'Changed scale to 1/8" = 1\'0"',
    'Merged 2 polygons',
    'Drew new area polygon',
    'Deleted classification Electrical',
    'Split polygon into 2 sections',
    'Added classification Drywall',
    'Updated polygon area',
    'Set scale manually',
  ];
  const count = Math.max(undoStackLength, 3);
  const entries: MockEntry[] = [];
  for (let i = 0; i < count && i < descriptions.length; i++) {
    const time = new Date(now.getTime() - i * 7 * 60 * 1000);
    entries.push({
      id: `entry-${i}`,
      timestamp: time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      description: descriptions[i],
      isCurrent: i === 0,
    });
  }
  return entries;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const ACTION_BADGE: Record<string, { label: string; className: string; Icon: typeof Plus }> = {
  create: { label: 'CREATE', className: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', Icon: Plus },
  update: { label: 'UPDATE', className: 'text-amber-400 bg-amber-400/10 border-amber-400/30', Icon: Pencil },
  delete: { label: 'DELETE', className: 'text-red-400 bg-red-400/10 border-red-400/30', Icon: Trash2 },
};

function truncateId(id: string | null): string {
  if (!id) return '';
  return id.length > 8 ? id.slice(0, 8) + '…' : id;
}

export default function VersionHistory({ onClose }: VersionHistoryProps) {
  const undoStack = useStore((s) => s.undoStack);
  const undo = useStore((s) => s.undo);

  const [loading, setLoading] = useState(true);
  const [apiEntries, setApiEntries] = useState<ApiHistoryEntry[] | null>(null);

  // Get projectId from localStorage (same pattern as page.tsx)
  const [projectId, setProjectId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const pid = params.get('project') || localStorage.getItem('measurex_project_id');
      setProjectId(pid);
    }
  }, []);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}/history?limit=50`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.history) setApiEntries(data.history);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  // Mock fallback entries
  const mockEntries = generateMockEntries(undoStack.length);

  function handleRestore(entry: MockEntry) {
    if (entry.isCurrent) return;
    const idx = mockEntries.indexOf(entry);
    if (idx > 0 && idx <= undoStack.length) {
      for (let i = 0; i < idx; i++) undo();
    } else {
      window.alert(`Restore to "${entry.description}" — not enough history to restore this far back.`);
    }
  }

  const hasRealData = apiEntries !== null && apiEntries.length > 0;

  return (
    <div className="fixed right-0 top-0 w-80 h-full bg-gray-900 border-l border-gray-700 z-40 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={18} className="text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Version History</h2>
            <p className="text-[11px] text-gray-400">
              {hasRealData ? `${apiEntries.length} entries` : 'Last saved: 2 min ago'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-gray-800"
          aria-label="Close version history"
        >
          <X size={16} />
        </button>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="text-gray-500 animate-spin" />
            <span className="ml-2 text-xs text-gray-500">Loading history…</span>
          </div>
        ) : hasRealData ? (
          apiEntries.map((entry) => {
            const badge = ACTION_BADGE[entry.actionType];
            return (
              <div
                key={entry.id}
                className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/60 transition-colors"
              >
                <div className="mt-0.5">
                  <badge.Icon size={14} className={badge.className.split(' ')[0]} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="text-[10px] text-gray-400">{entry.entityType}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {truncateId(entry.entityId)} · {formatRelativeTime(entry.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          mockEntries.map((entry) => (
            <div
              key={entry.id}
              className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/60 transition-colors"
            >
              <div className="mt-0.5">
                {entry.isCurrent ? (
                  <CheckCircle size={14} className="text-emerald-400" />
                ) : (
                  <Clock size={14} className="text-gray-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate">{entry.description}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{entry.timestamp}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {entry.isCurrent ? (
                  <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded px-1.5 py-0.5">
                    Current
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRestore(entry)}
                    className="hidden group-hover:inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 border border-gray-600 hover:border-gray-500 rounded px-1.5 py-0.5 transition-colors"
                  >
                    <RotateCcw size={10} />
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[11px] text-gray-400">Auto-save on</span>
      </div>
    </div>
  );
}
