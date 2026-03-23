'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';

interface ReTogalProps {
  currentPage: number;
  hasScale: boolean;
  hasRunTakeoff: boolean;
  onRunTakeoff: () => void | Promise<void>;
  agentMode?: boolean;
}

export default function ReTogal({ currentPage, hasScale, hasRunTakeoff, onRunTakeoff, agentMode }: ReTogalProps) {
  const projectId = useStore((s) => s.projectId);
  const [open, setOpen] = useState(false);
  const [preserveManual, setPreserveManual] = useState(true);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // GAP-012: Re-Takeoff handler.
  // 1. Clears existing polygons on the current page (all, or only AI-generated ones
  //    when "preserve manual reclassifications" is checked).
  // 2. Delegates to onRunTakeoff which calls the AI takeoff endpoint with the
  //    current page's classifications as context (see handleAITakeoff in page.tsx).
  // 3. The AI pipeline reads existing classifications from the store, so they are
  //    automatically passed as context for the re-run.
  const handleConfirm = useCallback(async () => {
    setOpen(false);
    setRunning(true);

    // Clear existing polygons for this page before re-running AI.
    // When preserveManual is true, only remove polygons whose classification
    // was auto-generated (name starts with "AI "); keep user-reclassified ones.
    const state = useStore.getState();
    const toRemove = state.polygons.filter((p) => {
      if (p.pageNumber !== currentPage) return false;
      if (preserveManual) {
        const cls = state.classifications.find((c) => c.id === p.classificationId);
        // Only remove AI-generated classifications (convention: name starts with "AI ")
        return cls?.name?.startsWith('AI ') ?? true;
      }
      return true;
    });

    for (const p of toRemove) {
      useStore.getState().deletePolygon(p.id);
    }

    // Delete polygons for this page on the server to avoid duplicate key errors on re-insert.
    const projectId = useStore.getState().projectId;
    if (projectId) {
      try {
        await fetch(`/api/projects/${projectId}/polygons?page=${currentPage}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Re-Togal: failed to clear server polygons:', err);
      }
    }

    // In agent mode, POST a webhook event to the external agent webhook URL (if configured)
    // and also notify the internal webhook endpoint.
    if (agentMode) {
      const pid = useStore.getState().projectId;
      const externalUrl = typeof window !== 'undefined' ? localStorage.getItem('mx-agent-webhook-url') : null;
      const payload = JSON.stringify({ event: 'agent_takeoff_requested', page: currentPage, source: 'togal_button', projectId: pid });
      try {
        const requests: Promise<unknown>[] = [];
        if (externalUrl) {
          requests.push(fetch(externalUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }));
        }
        if (pid) {
          requests.push(fetch(`/api/projects/${pid}/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }));
        }
        await Promise.allSettled(requests);
      } catch (err) {
        console.error('Re-Togal: agent webhook failed:', err);
      }
      setRunning(false);
      setToast('Agent takeoff triggered — watching for results...');
      return;
    }

    // Delegate to the real AI takeoff handler which captures the current page,
    // sends it to the AI endpoint, and loads results into the store.
    try {
      await onRunTakeoff();
    } catch (err) {
      console.error('Re-Togal AI takeoff failed:', err);
    }

    setRunning(false);
    const newCount = useStore.getState().polygons.filter((p) => p.pageNumber === currentPage).length;
    setToast(`Re-Togal complete — ${newCount} items on page`);
  }, [currentPage, preserveManual, onRunTakeoff, agentMode]);

  // Agent-mode handler for the initial (pre-takeoff) button paths.
  const handleAgentWebhook = useCallback(async () => {
    const pid = useStore.getState().projectId;
    const externalUrl = typeof window !== 'undefined' ? localStorage.getItem('mx-agent-webhook-url') : null;
    const payload = JSON.stringify({ event: 'agent_takeoff_requested', page: currentPage, source: 'togal_button', projectId: pid });
    try {
      const requests: Promise<unknown>[] = [];
      if (externalUrl) {
        requests.push(fetch(externalUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }));
      }
      if (pid) {
        requests.push(fetch(`/api/projects/${pid}/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }));
      }
      await Promise.allSettled(requests);
    } catch (err) {
      console.error('ReTogal: agent webhook failed:', err);
    }
    setToast('Agent takeoff triggered — watching for results...');
  }, [currentPage]);

  // Determine button mode
  if (!hasScale) {
    return (
      <button
        aria-label="Set scale"
        data-testid="retogal-btn"
        onClick={agentMode ? handleAgentWebhook : onRunTakeoff}
        className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all"
        style={{
          background: '#059669',
          color: '#fff',
          border: '1px solid rgba(16,185,129,0.5)',
          cursor: 'pointer',
        }}
      >
        Set scale
      </button>
    );
  }

  if (!hasRunTakeoff) {
    return (
      <button
        aria-label="Run Togal AI"
        data-testid="retogal-btn"
        onClick={agentMode ? handleAgentWebhook : onRunTakeoff}
        className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all"
        style={{
          background: '#059669',
          color: '#fff',
          border: '1px solid rgba(16,185,129,0.5)',
          cursor: 'pointer',
        }}
      >
        <Sparkles size={14} />
        Togal
      </button>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Re-Togal button */}
      <button
        aria-label={running ? 'Re-Togal running' : 'Re-Togal'}
        data-testid="retogal-btn"
        onClick={() => !running && setOpen((v) => !v)}
        disabled={running}
        className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all"
        style={{
          background: running ? 'rgba(5,150,105,0.4)' : '#059669',
          color: '#fff',
          border: '1px solid rgba(16,185,129,0.5)',
          cursor: running ? 'default' : 'pointer',
        }}
      >
        {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {running ? 'Running...' : 'Re-Togal'}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 rounded-xl shadow-2xl"
          style={{
            width: 320,
            background: '#1a1a2e',
            border: '1px solid rgba(0,212,255,0.25)',
            padding: 20,
          }}
        >
          <h3 className="text-sm font-semibold text-white mb-3">Re-run AI Takeoff</h3>

          <div
            className="flex items-start gap-2 rounded-lg p-3 mb-4 text-xs"
            style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }}
          >
            <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
            <span className="text-yellow-200/90 leading-relaxed">
              This will re-run Togal AI on this page. Your manual reclassifications will be preserved.
            </span>
          </div>

          <label className="flex items-center gap-2.5 mb-5 cursor-pointer select-none text-xs text-gray-300">
            <input
              type="checkbox"
              checked={preserveManual}
              onChange={(e) => setPreserveManual(e.target.checked)}
              className="accent-emerald-500 w-4 h-4 rounded"
            />
            Preserve manual reclassifications
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: 'transparent',
                color: '#a0aec0',
                border: '1px solid rgba(160,174,192,0.3)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: '#059669',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Re-Togal
            </button>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 rounded-lg shadow-lg px-6 py-3 text-sm font-medium"
          style={{ background: '#059669', color: '#fff' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
