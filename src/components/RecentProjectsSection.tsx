'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';

interface RecentEntry { id: string; name: string; accessedAt: number; }

interface ProjectData {
  id: string;
  updatedAt?: string;
  updated_at?: string;
}

interface RecentProjectsSectionProps {
  projects?: ProjectData[];
}

const PALETTE = ['#3B82F6','#8B5CF6','#EC4899','#F97316','#10B981','#06B6D4','#EAB308','#EF4444','#6366F1','#14B8A6'];
function nameHash(n: string) { let h=0; for(let i=0;i<n.length;i++) h=((h<<5)-h+n.charCodeAt(i))|0; return Math.abs(h); }
function thumbColor(n: string) { return PALETTE[nameHash(n) % PALETTE.length]; }
function thumbInitials(n: string) { const w=n.trim().split(/\s+/); return w.length>=2?(w[0][0]+w[1][0]).toUpperCase():n.slice(0,2).toUpperCase(); }
function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff/60000);
  if (min < 60) return min <= 1 ? 'Just now' : `${min}m ago`;
  const hr = Math.floor(min/60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr/24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

export function loadRecentProjects(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('mx-recent-projects') || '[]'); } catch { return []; }
}
export function saveRecentProject(id: string, name: string) {
  const entries = loadRecentProjects().filter(e => e.id !== id);
  entries.unshift({ id, name, accessedAt: Date.now() });
  localStorage.setItem('mx-recent-projects', JSON.stringify(entries.slice(0, 10)));
}

function relTimeFromISO(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return relTime(d.getTime());
}

export default function RecentProjectsSection({ projects = [] }: RecentProjectsSectionProps) {
  const router = useRouter();
  const [recents, setRecents] = React.useState<RecentEntry[]>([]);
  React.useEffect(() => { setRecents(loadRecentProjects().slice(0, 3)); }, []);

  // Build lookup for updatedAt from API data
  // NOTE: must be called unconditionally before any early return (Rules of Hooks)
  const updatedAtMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) {
      const ts = p.updatedAt || p.updated_at;
      if (ts) map[p.id] = ts;
    }
    return map;
  }, [projects]);

  if (recents.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Clock size={14} /> Recent
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {recents.map(r => (
          <button
            key={r.id}
            onClick={() => router.push(`/?project=${r.id}`)}
            className="flex items-center gap-3 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 hover:border-zinc-500 transition-colors min-w-[200px] text-left"
          >
            <span className="text-sm font-bold rounded-full w-9 h-9 flex items-center justify-center shrink-0 text-white"
              style={{ backgroundColor: thumbColor(r.name) }}>
              {thumbInitials(r.name)}
            </span>
            <div className="overflow-hidden">
              <div className="text-sm font-medium text-white truncate">{r.name}</div>
              <div className="text-xs text-zinc-400">
                {updatedAtMap[r.id]
                  ? `Updated ${relTimeFromISO(updatedAtMap[r.id])}`
                  : `Opened ${relTime(r.accessedAt)}`}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
