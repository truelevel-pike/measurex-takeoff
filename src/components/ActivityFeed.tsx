'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { subscribeToActivity } from '@/lib/ws-client';
import { Clock, Layers, Box, Ruler, Bot, Download, Filter } from 'lucide-react';

interface ActivityEvent {
  id: string;
  type: 'polygon' | 'classification' | 'scale' | 'ai' | 'system';
  event: string;
  message: string;
  timestamp: number;
}

type FilterType = 'all' | 'polygon' | 'classification' | 'scale' | 'ai';

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function categorize(event: string): ActivityEvent['type'] {
  if (event.startsWith('polygon:')) return 'polygon';
  if (event.startsWith('classification:')) return 'classification';
  if (event.startsWith('scale:')) return 'scale';
  if (event.startsWith('ai-takeoff:') || event.startsWith('ai:')) return 'ai';
  return 'system';
}

function formatMessage(event: string, data: Record<string, unknown>): string {
  switch (event) {
    case 'polygon:created': return `Polygon added — ${(data.area as number)?.toFixed(1) ?? '?'} sq ft`;
    case 'polygon:updated': return `Polygon updated`;
    case 'polygon:deleted': return `Polygon removed`;
    case 'classification:created': return `Classification created: ${data.name ?? 'Unknown'}`;
    case 'classification:updated': return `Classification updated: ${data.name ?? 'Unknown'}`;
    case 'classification:deleted': return `Classification removed`;
    case 'scale:updated': return `Scale calibrated: ${data.pixelsPerUnit ?? '?'} px/${data.unit ?? 'ft'}`;
    case 'ai-takeoff:started': return `AI Takeoff started on page ${data.page ?? '?'}`;
    case 'ai-takeoff:complete': return `AI Takeoff complete`;
    default: return event;
  }
}

const TYPE_ICONS: Record<ActivityEvent['type'], React.ReactNode> = {
  polygon: <Box className="w-3 h-3" />,
  classification: <Layers className="w-3 h-3" />,
  scale: <Ruler className="w-3 h-3" />,
  ai: <Bot className="w-3 h-3" />,
  system: <Clock className="w-3 h-3" />,
};

const TYPE_COLORS: Record<ActivityEvent['type'], string> = {
  polygon: 'text-blue-400',
  classification: 'text-purple-400',
  scale: 'text-yellow-400',
  ai: 'text-green-400',
  system: 'text-gray-400',
};

const MAX_EVENTS = 50;

export default function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    const unsub = subscribeToActivity((event, data) => {
      const entry: ActivityEvent = {
        id: `${Date.now()}-${Math.random()}`,
        type: categorize(event),
        event,
        message: formatMessage(event, data),
        timestamp: Date.now(),
      };
      setEvents((prev) => [entry, ...prev].slice(0, MAX_EVENTS));
    });
    return unsub;
  }, []);

  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-${Date.now()}.json`;
    a.click();
    // BUG-A6-5-001 fix: defer revokeObjectURL — click() is async on some browsers
    // and revoking synchronously can race the download initiation, producing a broken file.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [events]);

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'polygon', label: 'Polygons' },
    { key: 'classification', label: 'Classes' },
    { key: 'ai', label: 'AI' },
    { key: 'scale', label: 'Scale' },
  ];

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Filter bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-700 flex-wrap">
        <Filter className="w-3 h-3 text-gray-500 mr-0.5" />
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            aria-label={`Filter by ${label}`}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={exportJson}
          className="ml-auto text-gray-500 hover:text-gray-300 transition-colors"
          title="Export activity as JSON"
          aria-label="Export activity as JSON"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <Clock className="w-6 h-6" />
            <span className="text-xs">No activity yet</span>
          </div>
        ) : (
          <ul className="divide-y divide-gray-800">
            {filtered.map((ev) => (
              <li key={ev.id} className="flex items-start gap-2 px-3 py-2 hover:bg-gray-800/40">
                <span className={`mt-0.5 shrink-0 ${TYPE_COLORS[ev.type]}`}>
                  {TYPE_ICONS[ev.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 text-xs leading-tight truncate">{ev.message}</p>
                </div>
                <span className="text-gray-600 text-xs shrink-0 tabular-nums">
                  {timeAgo(ev.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
