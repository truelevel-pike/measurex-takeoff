'use client';
import React, { useState } from 'react';
import { X, Copy } from 'lucide-react';

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onDuplicated: (newId: string) => void;
}

export default function DuplicateProjectModal({ projectId, projectName, onClose, onDuplicated }: Props) {
  const [newName, setNewName] = useState(`${projectName} (Copy)`);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  const handleDuplicate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch source project data
      setProgress('Loading source project...');
      const srcRes = await fetch(`/api/projects/${projectId}`);
      if (!srcRes.ok) throw new Error('Failed to load source project');
      const srcData = await srcRes.json();
      const state = srcData.project?.state || {};
      const sourceClassifications: any[] = state.classifications || [];
      const sourcePolygons: any[] = state.polygons || [];
      const sourceScale = state.scale || null;

      // 2. Create new project
      setProgress('Creating new project...');
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!createRes.ok) throw new Error('Failed to create project');
      const createData = await createRes.json();
      const newProjectId: string = createData.project.id;

      // 3. Copy classifications (with id remapping)
      setProgress('Copying classifications...');
      const classIdMap = new Map<string, string>();
      for (const cls of sourceClassifications) {
        const newId = crypto.randomUUID();
        classIdMap.set(cls.id, newId);
        await fetch(`/api/projects/${newProjectId}/classifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...cls, id: newId }),
        });
      }

      // 4. Copy polygons (remapping classificationId)
      setProgress('Copying polygons...');
      for (const poly of sourcePolygons) {
        const newClassId = classIdMap.get(poly.classificationId) || poly.classificationId;
        await fetch(`/api/projects/${newProjectId}/polygons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...poly, id: crypto.randomUUID(), classificationId: newClassId }),
        });
      }

      // 5. Copy scale
      if (sourceScale) {
        setProgress('Copying scale...');
        await fetch(`/api/projects/${newProjectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: { scale: sourceScale } }),
        });
      }

      onDuplicated(newProjectId);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Duplication failed');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label="Duplicate project">
      <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Copy size={18} className="text-blue-400" />
            <h2 className="text-base font-semibold">Duplicate Project</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white p-1">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-zinc-400 mb-4">
          Creates a copy of <strong className="text-white">{projectName}</strong> with all classifications and polygons. The PDF file is not copied.
        </p>
        <label className="block text-sm text-zinc-300 mb-1">New Project Name</label>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          disabled={loading}
          className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 mb-4"
          onKeyDown={e => e.key === 'Enter' && handleDuplicate()}
          autoFocus
        />
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        {loading && progress && <p className="text-sm text-zinc-400 mb-3">{progress}</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleDuplicate} disabled={loading || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-600 disabled:text-zinc-400 text-white text-sm font-medium transition-colors">
            <Copy size={14} />
            {loading ? 'Duplicating...' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>
  );
}
