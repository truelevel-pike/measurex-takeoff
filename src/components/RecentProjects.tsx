'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ProjectSummary {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

function formatDate(value?: string): string {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString();
}

export default function RecentProjects() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentProjects() {
      try {
        setLoading(true);
        const res = await fetch('/api/projects/recent');
        if (!res.ok) {
          throw new Error(`Failed to load recent projects (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) {
          setProjects(Array.isArray(data.projects) ? data.projects.slice(0, 5) : []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load recent projects');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRecentProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDuplicate = async (projectId: string) => {
    try {
      setDuplicatingId(projectId);
      const res = await fetch(`/api/projects/${projectId}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Failed to duplicate project (${res.status})`);
      }
      const data = await res.json();
      const newId = data?.project?.id;
      if (!newId) {
        throw new Error('Duplicate API did not return a project id');
      }
      router.push(`/?project=${newId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate project');
    } finally {
      setDuplicatingId(null);
    }
  };

  return (
    <section className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 mb-5">
      <h3 className="text-base font-semibold mb-3">Recent Projects</h3>
      {loading ? <p className="text-sm text-zinc-400">Loading...</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!loading && !error && projects.length === 0 ? (
        <p className="text-sm text-zinc-400">No recent projects yet.</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <article
            key={project.id}
            className="border border-zinc-700 bg-zinc-900/40 rounded-lg p-3 flex flex-col gap-2"
          >
            <div>
              <p className="font-medium text-sm text-zinc-100 truncate">{project.name}</p>
              <p className="text-xs text-zinc-400 mt-1">
                Updated {formatDate(project.updatedAt || project.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleDuplicate(project.id)}
              disabled={duplicatingId === project.id}
              className="mt-auto text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-600 disabled:text-zinc-300 text-white"
            >
              {duplicatingId === project.id ? 'Duplicating...' : 'Duplicate'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
