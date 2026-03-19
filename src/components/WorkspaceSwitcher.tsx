'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Plus } from 'lucide-react';
import {
  getWorkspaces,
  saveWorkspaces,
  getActiveWorkspace,
  setActiveWorkspace,
  DEFAULT_WORKSPACE,
  type Workspace,
} from '@/lib/workspace';

export default function WorkspaceSwitcher() {
  const router = useRouter();
  const [workspaces, setWorkspacesState] = useState<Workspace[]>([DEFAULT_WORKSPACE]);
  const [activeId, setActiveId] = useState(DEFAULT_WORKSPACE.id);

  useEffect(() => {
    setWorkspacesState(getWorkspaces());
    setActiveId(getActiveWorkspace().id);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value === '__new__') {
        const name = prompt('New workspace name:');
        if (!name?.trim()) return;
        const ws: Workspace = {
          id: crypto.randomUUID(),
          name: name.trim(),
          projectIds: [],
        };
        const updated = [...getWorkspaces(), ws];
        saveWorkspaces(updated);
        setWorkspacesState(updated);
        setActiveWorkspace(ws.id);
        setActiveId(ws.id);
        router.refresh();
        return;
      }
      setActiveWorkspace(value);
      setActiveId(value);
      router.refresh();
    },
    [router],
  );

  return (
    <div className="flex items-center gap-1.5">
      <Briefcase size={14} className="text-zinc-400 shrink-0" aria-hidden />
      <select
        aria-label="Active workspace"
        value={activeId}
        onChange={handleChange}
        className="bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg px-2 py-1 text-xs outline-none focus:border-blue-500 max-w-[140px] truncate"
      >
        {workspaces.map((ws) => (
          <option key={ws.id} value={ws.id}>
            {ws.name}
          </option>
        ))}
        <option value="__new__">+ New workspace</option>
      </select>
    </div>
  );
}
