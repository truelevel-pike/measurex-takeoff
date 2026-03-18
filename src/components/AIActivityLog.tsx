'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { subscribeToActivity } from '@/lib/ws-client';

interface LogEntry {
  id: string;
  message: string;
  timestamp: Date;
  icon: string;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function eventToLogEntry(event: string, data: Record<string, unknown>): LogEntry | null {
  const id = crypto.randomUUID();
  const timestamp = new Date();

  switch (event) {
    case 'ai-takeoff:started':
      return { id, timestamp, icon: '\u{1F680}', message: `AI takeoff started on page ${data.page ?? '?'}` };
    case 'ai-takeoff:complete':
      return { id, timestamp, icon: '\u2705', message: 'AI takeoff complete' };
    case 'polygon:created':
      return { id, timestamp, icon: '\u{1F916}', message: `Polygon created: ${(data as { label?: string }).label || (data as { id?: string }).id?.slice(0, 8) || 'unknown'}` };
    case 'polygon:updated':
      return { id, timestamp, icon: '\u270F\uFE0F', message: `Polygon updated: ${(data as { id?: string }).id?.slice(0, 8) || 'unknown'}` };
    case 'polygon:deleted':
      return { id, timestamp, icon: '\u{1F5D1}\uFE0F', message: `Polygon deleted: ${(data as { id?: string }).id?.slice(0, 8) || 'unknown'}` };
    case 'classification:created':
      return { id, timestamp, icon: '\u{1F3F7}\uFE0F', message: `Classification created: ${(data as { name?: string }).name || 'unknown'}` };
    case 'classification:updated':
      return { id, timestamp, icon: '\u{1F3F7}\uFE0F', message: `Classification updated: ${(data as { name?: string }).name || 'unknown'}` };
    case 'scale:updated':
      return { id, timestamp, icon: '\u{1F4CF}', message: `Scale updated: ${(data as { label?: string }).label || 'unknown'}` };
    default:
      return null;
  }
}

const MAX_ENTRIES = 50;

export default function AIActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addEntry = useCallback((entry: LogEntry) => {
    setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
  }, []);

  // Listen to SSE-derived activity events via the ws-client pub-sub bus.
  // subscribeToActivity returns an unsubscribe function, so cleanup is clean
  // even when the EventSource reconnects (no stale listener references).
  useEffect(() => {
    const unsubscribe = subscribeToActivity((event, data) => {
      const entry = eventToLogEntry(event, data);
      if (entry) addEntry(entry);
    });
    return unsubscribe;
  }, [addEntry]);

  // Auto-scroll to top (newest first)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries]);

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(0,212,255,0.15)] rounded-lg overflow-hidden w-72">
      {/* Header */}
      <button
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-[rgba(0,212,255,0.05)] transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span>AI Activity Log</span>
        <div className="flex items-center gap-1">
          {entries.length > 0 && (
            <button
              className="text-neutral-500 hover:text-red-400 p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                setEntries([]);
              }}
              title="Clear log"
            >
              <Trash2 size={12} />
            </button>
          )}
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
      </button>

      {/* Body */}
      {!collapsed && (
        <div ref={scrollRef} className="max-h-60 overflow-y-auto px-2 pb-2">
          {entries.length === 0 ? (
            <div className="text-neutral-500 text-[11px] text-center py-4">
              No activity yet
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 py-1.5 border-b border-[rgba(255,255,255,0.04)] last:border-0"
              >
                <span className="text-sm leading-none mt-0.5">{entry.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-neutral-300 leading-tight truncate">
                    {entry.message}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {formatTime(entry.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
