'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Settings, Trash2, X } from 'lucide-react';

import { useStore } from '@/lib/store';
import type { ScaleCalibration } from '@/lib/types';

interface ProjectSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  projectName?: string | null;
  onProjectNameSaved?: (name: string) => void;
  onProjectDeleted?: () => void;
}

type UnitOption = 'feet' | 'meters';

function toUnitOption(unit: ScaleCalibration['unit'] | null | undefined): UnitOption {
  return unit === 'm' ? 'meters' : 'feet';
}

function fromUnitOption(unit: UnitOption): ScaleCalibration['unit'] {
  return unit === 'meters' ? 'm' : 'ft';
}

export default function ProjectSettingsPanel({
  open,
  onClose,
  projectName,
  onProjectNameSaved,
  onProjectDeleted,
}: ProjectSettingsPanelProps) {
  const router = useRouter();

  const projectId = useStore((s) => s.projectId);
  const scale = useStore((s) => s.scale);
  const currentPage = useStore((s) => s.currentPage);
  const setScale = useStore((s) => s.setScale);
  const setScaleForPage = useStore((s) => s.setScaleForPage);
  const setProjectId = useStore((s) => s.setProjectId);

  const [nameDraft, setNameDraft] = useState(projectName ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = useMemo<UnitOption>(() => toUnitOption(scale?.unit), [scale?.unit]);

  useEffect(() => {
    if (open) {
      setNameDraft(projectName ?? '');
      setError(null);
    }
  }, [open, projectName]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleRename = async () => {
    if (!projectId) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setError('Project name is required.');
      return;
    }

    setNameSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) throw new Error(`Rename failed (${res.status})`);

      onProjectNameSaved?.(trimmed);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rename failed';
      setError(message);
    } finally {
      setNameSaving(false);
    }
  };

  const handleUnitChange = (next: UnitOption) => {
    const mapped = fromUnitOption(next);
    const nextScale: ScaleCalibration = scale
      ? { ...scale, unit: mapped }
      : {
          pixelsPerUnit: 1,
          unit: mapped,
          label: next === 'meters' ? 'meters' : 'feet',
          source: 'manual',
        };

    setScale(nextScale);
    setScaleForPage(currentPage, nextScale);
  };

  const handleDelete = async () => {
    if (!projectId) return;

    const confirmed = window.confirm(
      `Delete project "${projectName || nameDraft || 'Untitled Project'}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleteLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);

      localStorage.removeItem('measurex_project_id');
      setProjectId(null);
      onProjectDeleted?.();
      router.push('/projects');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      setError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-lg rounded-xl border border-[rgba(0,212,255,0.25)] bg-[#0f1220] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[rgba(0,212,255,0.2)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-[#00d4ff]" />
            <h2 className="text-sm font-semibold tracking-wide">Project Settings</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md border border-[rgba(0,212,255,0.25)] bg-[#12121a] p-1.5 text-[#b0dff0] hover:border-[rgba(0,212,255,0.5)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-[#8892a0]">Rename Project</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Project name"
                className="flex-1 rounded-md border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.5)]"
              />
              <button
                onClick={handleRename}
                disabled={nameSaving || !projectId}
                className="rounded-md border border-[rgba(0,212,255,0.35)] bg-[rgba(0,212,255,0.15)] px-4 py-2 text-sm font-medium text-[#e0faff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {nameSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-[#8892a0]">Units</h3>
            <select
              value={unit}
              onChange={(e) => handleUnitChange(e.target.value as UnitOption)}
              className="w-full rounded-md border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.5)]"
            >
              <option value="feet">feet</option>
              <option value="meters">meters</option>
            </select>
          </section>

          <section className="rounded-lg border border-red-500/30 bg-red-950/20 p-3">
            <h3 className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-red-300">
              <AlertTriangle size={14} />
              Danger Zone
            </h3>
            <button
              onClick={handleDelete}
              disabled={deleteLoading || !projectId}
              className="inline-flex items-center gap-2 rounded-md border border-red-400/40 bg-red-500/20 px-3 py-2 text-sm font-medium text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={14} />
              {deleteLoading ? 'Deleting...' : 'Delete Project'}
            </button>
          </section>

          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
