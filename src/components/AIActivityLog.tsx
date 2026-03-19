'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { subscribeToActivity } from '@/lib/ws-client';
import { useStore } from '@/lib/store';

interface LogEntry {
  id: string;
  message: string;
  timestamp: Date;
  icon: string;
  /** Hex color of the classification (for the color dot). */
  color?: string;
  /** Short detail like "area" / "linear" / "count". */
  detail?: string;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Look up classification color from the store by ID. */
function getClassificationColor(classificationId: string | undefined): string | undefined {
  if (!classificationId) return undefined;
  const cls = useStore.getState().classifications.find((c) => c.id === classificationId);
  return cls?.color;
}

/** Type label for the polygon detail. */
function typeLabel(type: unknown): string | undefined {
  if (type === 'area') return 'area';
  if (type === 'linear') return 'linear';
  if (type === 'count') return 'count';
  return undefined;
}

function eventToLogEntry(event: string, data: Record<string, unknown>): LogEntry | null {
  const id = crypto.randomUUID();
  const timestamp = new Date();

  switch (event) {
    case 'ai-takeoff:started':
      return { id, timestamp, icon: '\u{1F680}', message: `AI takeoff started on page ${data.page ?? '?'}` };
    case 'ai-takeoff:complete':
      return { id, timestamp, icon: '\u2705', message: 'AI takeoff complete' };
    case 'polygon:created': {
      const label = (data.label as string) || (data.id as string)?.slice(0, 8) || 'unknown';
      const color = getClassificationColor(data.classificationId as string);
      const detail = typeLabel(data.type);
      let message: string;
      if (data.type === 'area' && data.area != null) {
        message = `Room area measured: ${Math.round(data.area as number)} SF`;
      } else if (data.type === 'area') {
        message = `Area detected: ${label}`;
      } else if (data.type === 'linear') {
        message = `Linear item detected: ${label}`;
      } else if (data.type === 'count') {
        message = `Item detected: ${label}`;
      } else {
        message = `Shape detected: ${label}`;
      }
      return { id, timestamp, icon: '\u{1F916}', message, color, detail };
    }
    case 'polygon:updated': {
      const label = (data.label as string);
      return { id, timestamp, icon: '\u270F\uFE0F', message: label ? `Updated: ${label}` : 'Measurement updated' };
    }
    case 'polygon:deleted': {
      const label = (data.label as string);
      return { id, timestamp, icon: '\u{1F5D1}\uFE0F', message: label ? `Removed: ${label}` : 'Measurement removed' };
    }
    case 'classification:created':
      return { id, timestamp, icon: '\u{1F3F7}\uFE0F', message: `Classification added: ${(data as { name?: string }).name || 'unknown'}`, color: (data as { color?: string }).color };
    case 'classification:updated':
      return { id, timestamp, icon: '\u{1F3F7}\uFE0F', message: `Classification updated: ${(data as { name?: string }).name || 'unknown'}`, color: (data as { color?: string }).color };
    case 'scale:updated': {
      const scaleLabel = (data as { label?: string }).label || (data as { ratio?: string }).ratio;
      return { id, timestamp, icon: '\u{1F4CF}', message: scaleLabel ? `Scale set: ${scaleLabel}` : 'Scale updated' };
    }
    case 'page:changed':
      return { id, timestamp, icon: '\u{1F4C4}', message: `Switched to page ${data.page ?? '?'}` };
    case 'ai-detection:started':
      return { id, timestamp, icon: '\u{1F50D}', message: `AI scanning page ${data.page ?? '?'}...` };
    case 'ai-detection:complete': {
      const count = (data.count as number) ?? 0;
      return { id, timestamp, icon: '\u2728', message: `AI found ${count} ${count === 1 ? 'item' : 'items'}` };
    }
    default:
      return null;
  }
}

const MAX_ENTRIES = 50;

// Module-level persistent store so entries survive component unmount/remount cycles.
let persistedEntries: LogEntry[] = [];
let persistedListeners: Set<() => void> = new Set();
let sseSubscribed = false;

function addPersistentEntry(entry: LogEntry) {
  persistedEntries = [entry, ...persistedEntries].slice(0, MAX_ENTRIES);
  persistedListeners.forEach((fn) => fn());
}

function clearPersistentEntries() {
  persistedEntries = [];
  persistedListeners.forEach((fn) => fn());
}

// Subscribe to SSE once at module level so events are captured even when the component is unmounted.
function ensureSSESubscription() {
  if (sseSubscribed) return;
  sseSubscribed = true;
  subscribeToActivity((event, data) => {
    const entry = eventToLogEntry(event, data);
    if (entry) addPersistentEntry(entry);
  });
}

export default function AIActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>(persistedEntries);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start the module-level SSE listener and sync persistent entries into component state.
  useEffect(() => {
    ensureSSESubscription();
    const sync = () => setEntries([...persistedEntries]);
    persistedListeners.add(sync);
    // Sync on mount in case entries were added while unmounted.
    sync();
    return () => { persistedListeners.delete(sync); };
  }, []);

  // Auto-scroll to top (newest first)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries]);

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(0,212,255,0.15)] rounded-lg overflow-hidden w-72">
      {/* Header */}
      <div
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-[rgba(0,212,255,0.05)] transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed((v) => !v); } }}
      >
        <span>AI Activity Log</span>
        <div className="flex items-center gap-1">
          {entries.length > 0 && (
            <button
              className="text-neutral-500 hover:text-red-400 p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                clearPersistentEntries();
              }}
              title="Clear log"
            >
              <Trash2 size={12} />
            </button>
          )}
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
      </div>

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
                {entry.color ? (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: entry.color }}
                    aria-hidden="true"
                  />
                ) : (
                  <span className="text-sm leading-none mt-0.5">{entry.icon}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-neutral-300 leading-tight truncate">
                    {entry.message}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {entry.detail && (
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{entry.detail}</span>
                    )}
                    <span className="text-[10px] text-neutral-500">
                      {formatTime(entry.timestamp)}
                    </span>
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
