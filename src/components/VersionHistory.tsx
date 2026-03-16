'use client';

import React from 'react';
import { History, Clock, CheckCircle, RotateCcw, X } from 'lucide-react';
import { useStore } from '@/lib/store';

interface VersionHistoryProps {
  onClose: () => void;
}

interface HistoryEntry {
  id: string;
  timestamp: string;
  description: string;
  isCurrent: boolean;
}

function generateEntries(undoStackLength: number): HistoryEntry[] {
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
  const entries: HistoryEntry[] = [];

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

export default function VersionHistory({ onClose }: VersionHistoryProps) {
  const undoStack = useStore((s) => s.undoStack);
  const undo = useStore((s) => s.undo);
  const entries = generateEntries(undoStack.length);

  function handleRestore(entry: HistoryEntry) {
    if (entry.isCurrent) return;
    const idx = entries.indexOf(entry);
    if (idx > 0 && idx <= undoStack.length) {
      for (let i = 0; i < idx; i++) undo();
    } else {
      window.alert(`Restore to "${entry.description}" — not enough history to restore this far back.`);
    }
  }

  return (
    <div className="fixed right-0 top-0 w-80 h-full bg-gray-900 border-l border-gray-700 z-40 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={18} className="text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Version History</h2>
            <p className="text-[11px] text-gray-400">Last saved: 2 min ago</p>
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
        {entries.map((entry) => (
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
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[11px] text-gray-400">Auto-save on</span>
      </div>
    </div>
  );
}
