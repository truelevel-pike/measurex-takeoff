'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Settings, Trash2, X } from 'lucide-react';

import { useStore } from '@/lib/store';
import type { ScaleCalibration } from '@/lib/types';
import { useToast } from './Toast';

interface ProjectSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  projectName?: string | null;
  onProjectNameSaved?: (name: string) => void;
  onProjectDeleted?: () => void;
}

type UnitOption = 'sqft' | 'sqm';

function toUnitOption(unit: ScaleCalibration['unit'] | null | undefined): UnitOption {
  return unit === 'm' ? 'sqm' : 'sqft';
}

function fromUnitOption(unit: UnitOption): ScaleCalibration['unit'] {
  return unit === 'sqm' ? 'm' : 'ft';
}

export default function ProjectSettingsPanel({
  open,
  onClose,
  projectName,
  onProjectNameSaved,
  onProjectDeleted,
}: ProjectSettingsPanelProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const projectId = useStore((s) => s.projectId);
  const scale = useStore((s) => s.scale);
  const currentPage = useStore((s) => s.currentPage);
  const setScale = useStore((s) => s.setScale);
  const setScaleForPage = useStore((s) => s.setScaleForPage);
  const setProjectId = useStore((s) => s.setProjectId);

  const [nameDraft, setNameDraft] = useState(projectName ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = useMemo<UnitOption>(() => toUnitOption(scale?.unit), [scale?.unit]);

  useEffect(() => {
    if (open) {
      setNameDraft(projectName ?? '');
      setError(null);
      setShowDeleteConfirm(false);
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
      addToast('Project name updated', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rename failed';
      setError(message);
      addToast('Failed to update name', 'error');
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
          label: next === 'sqm' ? 'meters' : 'feet',
          source: 'manual',
        };

    setScale(nextScale);
    setScaleForPage(currentPage, nextScale);
    addToast(`Default units set to ${next === 'sqm' ? 'sq m' : 'sq ft'}`, 'success');
  };

  const handleDelete = async () => {
    if (!projectId) return;

    setDeleteLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);

      localStorage.removeItem('measurex_project_id');
      setProjectId(null);
      onProjectDeleted?.();
      addToast('Project deleted', 'success');
      router.push('/projects');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      setError(message);
      addToast('Failed to delete project', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Use conditional render instead of CSS transform — backdrop-blur creates a new
  // stacking context that overrides translate-x-full, so the panel shows even when
  // "closed". Unmounting on !open eliminates the CSS override issue entirely.
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        onClick={() => { setShowDeleteConfirm(false); onClose(); }}
      />

      {/* Panel */}
      <aside
        data-testid="project-settings-panel"
        className="fixed top-0 right-0 bottom-0 z-[70] w-[340px] max-w-[90vw] bg-[rgba(15,18,32,0.98)] backdrop-blur-md border-l border-[#00d4ff]/20 flex flex-col"
        aria-label="Project settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#00d4ff]/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-[#00d4ff]" />
            <span className="font-mono tracking-wider text-sm text-[#00d4ff]">PROJECT SETTINGS</span>
          </div>
          <button
            onClick={() => { setShowDeleteConfirm(false); onClose(); }}
            aria-label="Close settings"
            className="rounded-md border border-[rgba(0,212,255,0.25)] bg-[#12121a] p-1.5 text-[#b0dff0] hover:border-[rgba(0,212,255,0.5)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-6">
          {/* Project Name */}
          <section>
            <label className="block mb-1.5 text-xs uppercase tracking-wider text-[#8892a0] font-mono">
              Project Name
            </label>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              placeholder="Project name"
              className="w-full rounded-lg border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.5)] transition-colors"
            />
            {nameSaving && <p className="text-[11px] text-[#8892a0] mt-1">Saving…</p>}
          </section>

          {/* Default Units */}
          <section>
            <label className="block mb-1.5 text-xs uppercase tracking-wider text-[#8892a0] font-mono">
              Default Measurement Units
            </label>
            <select
              value={unit}
              onChange={(e) => handleUnitChange(e.target.value as UnitOption)}
              className="w-full rounded-lg border border-[rgba(0,212,255,0.2)] bg-[#12121a] px-3 py-2 text-sm text-white outline-none focus:border-[rgba(0,212,255,0.5)] transition-colors"
            >
              <option value="sqft">Square Feet (sq ft)</option>
              <option value="sqm">Square Meters (sq m)</option>
            </select>
          </section>

          {/* Danger Zone */}
          <section className="mt-auto pt-4 border-t border-red-500/20">
            <h3 className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-red-300 font-mono">
              <AlertTriangle size={13} />
              Danger Zone
            </h3>
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!projectId}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 size={14} />
                Delete Project
              </button>
            ) : (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-950/30" style={{ animation: 'fadeSlideIn 200ms ease-out' }}>
                <p className="text-xs text-gray-300 mb-3">
                  Are you sure? This will permanently delete &ldquo;{projectName || nameDraft || 'Untitled Project'}&rdquo; and all its data.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteLoading}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                  >
                    {deleteLoading ? 'Deleting…' : 'Yes, Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 text-xs hover:text-white hover:border-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      </aside>
    </>
  );
}
