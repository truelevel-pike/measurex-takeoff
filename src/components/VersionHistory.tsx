'use client';

import React, { useState, useEffect } from 'react';
import { History, Camera, ChevronDown, ChevronRight, RotateCcw, X, Loader2, Plus, Pencil, Trash2, User, Zap } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import SnapshotPanel from '@/components/SnapshotPanel';

export interface TakeoffRun {
  id: string;
  timestamp: string;
  model: string;
  pageRange: string;
  polygonCount: number;
  projectId: string;
  isCurrent?: boolean;
}

interface VersionHistoryProps {
  onClose: () => void;
  onRestoreRun?: (run: TakeoffRun) => void;
  onRerunWithModel?: (run: TakeoffRun, model: string) => void;
}

interface ApiHistoryEntry {
  id: string;
  projectId: string;
  actionType: 'create' | 'update' | 'delete';
  entityType: 'polygon' | 'classification' | 'scale';
  entityId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
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

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

/** Generate a human-readable description from the history entry. */
function describeEntry(entry: ApiHistoryEntry): string {
  const entityLabel = entry.entityType.charAt(0).toUpperCase() + entry.entityType.slice(1);
  const nameFromData =
    (entry.afterData as Record<string, unknown>)?.name ??
    (entry.beforeData as Record<string, unknown>)?.name;
  const name = typeof nameFromData === 'string' ? ` "${nameFromData}"` : '';

  switch (entry.actionType) {
    case 'create':
      return `Created ${entityLabel.toLowerCase()}${name}`;
    case 'update': {
      if (entry.beforeData && entry.afterData) {
        const changed = getChangedKeys(entry.beforeData as Record<string, unknown>, entry.afterData as Record<string, unknown>);
        if (changed.length > 0) {
          return `Updated ${entityLabel.toLowerCase()}${name}: ${changed.join(', ')}`;
        }
      }
      return `Updated ${entityLabel.toLowerCase()}${name}`;
    }
    case 'delete':
      return `Deleted ${entityLabel.toLowerCase()}${name}`;
    default:
      return `${entry.actionType} ${entityLabel.toLowerCase()}`;
  }
}

/** Get the keys that changed between before and after data. */
function getChangedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (key === 'updated_at' || key === 'updatedAt' || key === 'created_at' || key === 'createdAt') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key.replace(/_/g, ' '));
    }
  }
  return changed;
}

/** Render a before/after diff for a history entry. */
function ChangeDetail({ entry }: { entry: ApiHistoryEntry }) {
  const before = entry.beforeData as Record<string, unknown> | null;
  const after = entry.afterData as Record<string, unknown> | null;

  if (!before && !after) {
    return <p className="text-[10px] text-gray-500 italic">No detail available</p>;
  }

  if (entry.actionType === 'create' && after) {
    return (
      <div className="space-y-0.5">
        {Object.entries(after).map(([key, value]) => {
          if (key === 'id' || key === 'project_id' || key === 'projectId') return null;
          if (key.endsWith('_at') || key.endsWith('At')) return null;
          return (
            <div key={key} className="flex gap-2 text-[10px]">
              <span className="text-gray-500 min-w-[60px]">{key.replace(/_/g, ' ')}</span>
              <span className="text-emerald-400 truncate">{formatValue(value)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (entry.actionType === 'delete' && before) {
    return (
      <div className="space-y-0.5">
        {Object.entries(before).map(([key, value]) => {
          if (key === 'id' || key === 'project_id' || key === 'projectId') return null;
          if (key.endsWith('_at') || key.endsWith('At')) return null;
          return (
            <div key={key} className="flex gap-2 text-[10px]">
              <span className="text-gray-500 min-w-[60px]">{key.replace(/_/g, ' ')}</span>
              <span className="text-red-400 line-through truncate">{formatValue(value)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (entry.actionType === 'update' && before && after) {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changedEntries: [string, unknown, unknown][] = [];
    for (const key of allKeys) {
      if (key === 'id' || key === 'project_id' || key === 'projectId') continue;
      if (key.endsWith('_at') || key.endsWith('At')) continue;
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changedEntries.push([key, before[key], after[key]]);
      }
    }
    if (changedEntries.length === 0) {
      return <p className="text-[10px] text-gray-500 italic">No visible changes</p>;
    }
    return (
      <div className="space-y-1">
        {changedEntries.map(([key, oldVal, newVal]) => (
          <div key={key} className="text-[10px]">
            <span className="text-gray-500">{key.replace(/_/g, ' ')}</span>
            <div className="flex gap-1 ml-2">
              <span className="text-red-400 line-through truncate">{formatValue(oldVal)}</span>
              <span className="text-gray-600">→</span>
              <span className="text-emerald-400 truncate">{formatValue(newVal)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <p className="text-[10px] text-gray-500 italic">No detail available</p>;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.length > 50 ? value.slice(0, 50) + '…' : value;
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 50) + '…';
  return String(value);
}

const RUNS_STORAGE_KEY = 'mx-takeoff-runs';

function getModelBadgeColor(model: string): string {
  if (model.includes('sonnet') || model.includes('claude') || model.includes('opus'))
    return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
  if (model.includes('gpt'))
    return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
  if (model.includes('gemini'))
    return 'text-purple-400 bg-purple-400/10 border-purple-400/30';
  return 'text-gray-400 bg-gray-400/10 border-gray-400/30';
}

function getModelLabel(model: string): string {
  const map: Record<string, string> = {
    'claude-sonnet-4-6': 'Sonnet 4.6',
    'anthropic/claude-sonnet-4-6': 'Sonnet 4.6',
    'claude-opus-4-6': 'Opus 4.6',
    'anthropic/claude-opus-4-6': 'Opus 4.6',
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.2-codex': 'GPT-5.2 Codex',
    'gemini-3.1': 'Gemini 3.1',
    'google/gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
    'google/gemini-3.1-flash-lite-preview': 'Gemini Flash',
  };
  return map[model] || model;
}

const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini Flash' },
];

function loadTakeoffRuns(): TakeoffRun[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RUNS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [];
}

export default function VersionHistory({ onClose, onRestoreRun, onRerunWithModel }: VersionHistoryProps) {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'history' | 'snapshots' | 'runs'>('history');
  const [runs] = useState<TakeoffRun[]>(() => loadTakeoffRuns());
  const [loading, setLoading] = useState(true);
  const [apiEntries, setApiEntries] = useState<ApiHistoryEntry[] | null>(null);
  const [restoringEntryId, setRestoringEntryId] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [rerunPickerRunId, setRerunPickerRunId] = useState<string | null>(null);

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

  async function handleApiRestore(entry: ApiHistoryEntry) {
    if (!projectId) {
      addToast('Restore is not available: missing project ID.', 'error');
      return;
    }

    setRestoringEntryId(entry.id);
    // BUG-A6-5-036 fix: guard the secondary history-reload fetch with a mounted flag
    // so setApiEntries doesn't fire on an unmounted component (e.g. user closes panel mid-restore).
    let mounted = true;
    try {
      const res = await fetch(`/api/projects/${projectId}/history/${entry.id}/restore`, {
        method: 'POST',
      });

      if (res.ok) {
        addToast('Version restored.', 'success');
        // Reload history after restore
        const refreshRes = await fetch(`/api/projects/${projectId}/history?limit=50`);
        if (refreshRes.ok && mounted) {
          const data = await refreshRes.json();
          if (data?.history) setApiEntries(data.history);
        }
      } else {
        const body = await res.json().catch(() => null);
        addToast(body?.error || 'Restore failed.', 'error');
      }
    } catch {
      addToast('Restore failed — network error.', 'error');
    } finally {
      if (mounted) setRestoringEntryId(null);
    }
    return () => { mounted = false; };
  }

  function toggleExpand(id: string) {
    setExpandedEntryId((prev) => (prev === id ? null : id));
  }

  const hasRealData = apiEntries !== null && apiEntries.length > 0;

  return (
    <div data-testid="version-history-panel" className="fixed right-0 top-0 w-80 h-full bg-gray-900 border-l border-gray-700 z-40 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={18} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-gray-100">Version History</h2>
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

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <History size={12} />
          History
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('snapshots')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'snapshots'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Camera size={12} />
          Snapshots
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('runs')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'runs'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Zap size={12} />
          Runs
        </button>
      </div>

      {/* Content */}
      {activeTab === 'runs' ? (
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Zap size={18} className="text-gray-600 mb-2" />
              <p className="text-sm font-medium text-gray-300">No AI runs yet</p>
              <p className="text-xs text-gray-500 mt-1">Start a takeoff to record history</p>
            </div>
          ) : (
            runs
              .slice()
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .map((run, idx) => (
                <div
                  key={run.id}
                  className="group relative flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/60 transition-colors"
                >
                  <div className="mt-0.5">
                    <Zap size={14} className={idx === 0 ? 'text-emerald-400' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${getModelBadgeColor(run.model)}`}>
                        {getModelLabel(run.model)}
                      </span>
                      {idx === 0 && (
                        <span className="text-[9px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded px-1 py-0">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-300 mt-0.5">
                      Pages {run.pageRange} · {run.polygonCount} polygons
                    </p>
                    <span className="text-[10px] text-gray-500">{timeAgo(run.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {idx !== 0 && onRestoreRun && (
                      <button
                        type="button"
                        onClick={() => onRestoreRun(run)}
                        className="hidden group-hover:inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 border border-gray-600 hover:border-gray-500 rounded px-1.5 py-0.5 transition-colors"
                      >
                        <RotateCcw size={10} />
                        Restore
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRerunPickerRunId(rerunPickerRunId === run.id ? null : run.id)}
                      className="hidden group-hover:inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 border border-gray-600 hover:border-gray-500 rounded px-1.5 py-0.5 transition-colors"
                    >
                      <RotateCcw size={10} />
                      Re-run ↻
                    </button>
                  </div>
                  {rerunPickerRunId === run.id && (
                    <div className="absolute right-2 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[180px]">
                      <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                        Re-run with model
                      </div>
                      {AVAILABLE_MODELS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            if (onRerunWithModel) {
                              onRerunWithModel(run, m.id);
                            }
                            addToast(`Re-running page ${run.pageRange} with ${m.label}…`, 'info');
                            setRerunPickerRunId(null);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-700/60 transition-colors flex items-center gap-2 ${
                            run.model === m.id ? 'text-emerald-400' : 'text-gray-300'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${run.model === m.id ? 'bg-emerald-400' : 'bg-transparent'}`} />
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      ) : activeTab === 'snapshots' && projectId ? (
        <SnapshotPanel projectId={projectId} />
      ) : activeTab === 'snapshots' ? (
        <div className="flex-1" />
      ) : (

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="text-gray-500 animate-spin" />
            <span className="ml-2 text-xs text-gray-500">Loading history…</span>
          </div>
        ) : hasRealData ? (
          apiEntries.map((entry, idx) => {
            const badge = ACTION_BADGE[entry.actionType];
            const isExpanded = expandedEntryId === entry.id;
            const isFirst = idx === 0;
            return (
              <div key={entry.id} data-testid="version-entry">
                <div
                  className={`group flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    isExpanded ? 'bg-gray-800/80' : 'hover:bg-gray-800/60'
                  }`}
                  onClick={() => toggleExpand(entry.id)}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={14} className="text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="text-[10px] text-gray-400">{entry.entityType}</span>
                      {isFirst && (
                        <span className="text-[9px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded px-1 py-0">
                          Latest
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-300 mt-0.5 truncate">
                      {describeEntry(entry)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                        <User size={9} />
                        Anonymous
                      </span>
                      <span className="text-[10px] text-gray-600">·</span>
                      <span className="text-[10px] text-gray-500" title={formatTimestamp(entry.createdAt)}>
                        {timeAgo(entry.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="hidden group-hover:flex flex-col gap-1 flex-shrink-0">
                    <button
                      type="button"
                      data-testid="version-preview-btn"
                      onClick={(e) => { e.stopPropagation(); toggleExpand(entry.id); }}
                      className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 border border-gray-600 hover:border-gray-500 rounded px-1.5 py-0.5 transition-colors"
                    >
                      <ChevronRight size={10} />
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApiRestore(entry);
                      }}
                      disabled={restoringEntryId === entry.id}
                      data-testid="version-restore-btn"
                      className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 border border-gray-600 hover:border-gray-500 rounded px-1.5 py-0.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {restoringEntryId === entry.id ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <RotateCcw size={10} />
                      )}
                      {restoringEntryId === entry.id ? '…' : 'Restore'}
                    </button>
                  </div>
                </div>

                {/* Expanded detail view showing what changed */}
                {isExpanded && (
                  <div className="ml-8 mr-2 mb-1 px-3 py-2 rounded-b-lg bg-gray-800/40 border-l-2 border-gray-700">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">
                      Changes
                    </div>
                    <ChangeDetail entry={entry} />
                    <div className="mt-1.5 pt-1.5 border-t border-gray-700/50 text-[10px] text-gray-600">
                      {formatTimestamp(entry.createdAt)} · ID: {truncateId(entry.entityId)}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <History size={18} className="text-gray-600 mb-2" />
            <p className="text-sm font-medium text-gray-300">No history yet</p>
            <p className="text-xs text-gray-500 mt-1">Changes will appear here after your first edit.</p>
          </div>
        )}
      </div>

      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[11px] text-gray-400">Auto-save on</span>
      </div>
    </div>
  );
}
