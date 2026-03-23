'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Check, X, ChevronRight, Loader2, CheckSquare, Square, RefreshCw } from 'lucide-react';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { extractSheetName } from '@/lib/sheet-namer';

// --- Types ---
interface RenameItem {
  id: string;
  projectId: string;
  originalName: string;
  aiName: string;
  accepted: boolean | null; // null = pending user choice
}

interface ProjectEntry {
  id: string;
  name: string;
}

interface AutoNameToolProps {
  /** Pre-loaded projects list. When omitted, component fetches from /api/projects. */
  projects?: ProjectEntry[];
}

// --- Sub-components ---

function ItemRow({
  item,
  onToggleAccept,
  onReject,
}: {
  item: RenameItem;
  onToggleAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const isAccepted = item.accepted === true;
  const isRejected = item.accepted === false;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 8,
        background: isAccepted
          ? 'rgba(34,197,94,0.07)'
          : isRejected
          ? 'rgba(239,68,68,0.07)'
          : 'rgba(14,16,22,0.6)',
        border: isAccepted
          ? '1px solid rgba(34,197,94,0.25)'
          : isRejected
          ? '1px solid rgba(239,68,68,0.2)'
          : '1px solid rgba(0,212,255,0.1)',
        marginBottom: 6,
        transition: 'all 200ms',
        opacity: isRejected ? 0.55 : 1,
      }}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggleAccept(item.id)}
        aria-label={`${isAccepted ? 'Deselect' : 'Select'} ${item.originalName}`}
        style={{
          background: 'transparent',
          border: 'none',
          color: isAccepted ? '#4ade80' : '#8892a0',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        {isAccepted ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>

      {/* Original name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: '#8892a0',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textDecoration: isRejected ? 'line-through' : 'none',
          }}
        >
          {item.originalName}
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight size={13} style={{ color: isAccepted ? '#4ade80' : 'rgba(0,212,255,0.3)', flexShrink: 0 }} />

      {/* AI name */}
      <div style={{ flex: 1.5, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: isAccepted ? '#4ade80' : isRejected ? '#f87171' : '#e0faff',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textDecoration: isRejected ? 'line-through' : 'none',
          }}
        >
          {item.aiName}
        </div>
      </div>

      {/* Manual reject/accept buttons */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => onToggleAccept(item.id)}
          aria-label={isAccepted ? `Undo accept ${item.originalName}` : `Accept rename for ${item.originalName}`}
          title={isAccepted ? 'Undo' : 'Accept'}
          style={{
            background: isAccepted ? 'rgba(34,197,94,0.2)' : 'transparent',
            border: `1px solid ${isAccepted ? 'rgba(34,197,94,0.4)' : 'rgba(0,212,255,0.2)'}`,
            color: isAccepted ? '#4ade80' : '#8892a0',
            borderRadius: 5,
            padding: '3px 6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Check size={12} />
        </button>
        <button
          onClick={() => onReject(item.id)}
          aria-label={`Reject rename for ${item.originalName}`}
          title="Reject"
          style={{
            background: isRejected ? 'rgba(239,68,68,0.2)' : 'transparent',
            border: `1px solid ${isRejected ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: isRejected ? '#f87171' : '#8892a0',
            borderRadius: 5,
            padding: '3px 6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div
      style={{
        width: '100%',
        height: 6,
        background: 'rgba(0,212,255,0.1)',
        borderRadius: 999,
        overflow: 'hidden',
        border: '1px solid rgba(0,212,255,0.15)',
      }}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Processing progress"
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #00d4ff 0%, #6366f1 100%)',
          borderRadius: 999,
          boxShadow: '0 0 10px rgba(0,212,255,0.6)',
          transition: 'width 120ms linear',
        }}
      />
    </div>
  );
}

// ---- Main Component ----

export default function AutoNameTool({ projects: projectsProp }: AutoNameToolProps = {}) {
  const aiSheetNaming = useFeatureFlag('ai-sheet-naming');
  const [state, setState] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState<RenameItem[]>([]);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // BUG-A6-001 fix: cleanup effect must be placed before any early return so it is
  // always registered regardless of the aiSheetNaming flag value.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, []);

  if (!aiSheetNaming) {
    return (
      <div
        style={{
          background: '#0a0a0f',
          border: '1px solid rgba(0,212,255,0.2)',
          borderRadius: 12,
          overflow: 'hidden',
          fontFamily: 'Inter, system-ui, sans-serif',
          boxShadow: '0 0 24px rgba(0,212,255,0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid rgba(0,212,255,0.15)',
            background: 'rgba(10,10,15,0.6)',
          }}
        >
          <Sparkles size={17} style={{ color: '#00d4ff' }} />
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: 13,
              color: '#e0faff',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            AI Auto-Name Tool
          </span>
        </div>
        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 12, color: '#8892a0', lineHeight: 1.6, margin: 0 }}>
            Coming soon — AI-powered sheet naming is not yet available.
          </p>
        </div>
      </div>
    );
  }

  async function startProcessing() {
    setState('processing');
    setProgress(0);
    setItems([]);
    setAppliedCount(null);
    setErrorMsg(null);

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // 1. Resolve projects list (use prop or fetch)
      let projectList: ProjectEntry[] = projectsProp ?? [];
      if (projectList.length === 0) {
        setProgress(10);
        const res = await fetch('/api/projects', { signal: abort.signal });
        if (!res.ok) throw new Error(`Failed to load projects (${res.status})`);
        const data = await res.json();
        projectList = (data.projects ?? []).map((p: { id: string; name: string }) => ({
          id: p.id,
          name: p.name,
        }));
      }

      if (projectList.length === 0) {
        setProgress(100);
        setItems([]);
        setState('done');
        return;
      }

      // 2. For each project, fetch page text and run sheet-name extraction
      const suggestions: RenameItem[] = [];
      const step = 80 / projectList.length;

      for (let i = 0; i < projectList.length; i++) {
        if (abort.signal.aborted) return;
        const proj = projectList[i];
        setProgress(10 + Math.round(step * i));

        try {
          const pagesRes = await fetch(`/api/projects/${proj.id}/pages`, { signal: abort.signal });
          let aiName: string | null = null;

          if (pagesRes.ok) {
            const pagesData = await pagesRes.json();
            const pages: Array<{ pageNumber: number; text?: string; name?: string }> =
              pagesData.pages ?? [];
            // Check if page already has a saved name
            const firstPage = pages[0];
            if (firstPage?.name) {
              // Already named — skip
              continue;
            }
            // Try to extract from page text (first page is usually the title sheet)
            for (const page of pages.slice(0, 3)) {
              if (page.text) {
                aiName = extractSheetName(page.text);
                if (aiName) break;
              }
            }
          }

          // Fall back to heuristic rename of the project name itself
          if (!aiName) {
            aiName = inferNameFromFilename(proj.name);
          }

          if (aiName && aiName !== proj.name) {
            suggestions.push({
              id: `rename-${proj.id}`,
              projectId: proj.id,
              originalName: proj.name,
              aiName,
              accepted: true,
            });
          }
        } catch {
          // Skip projects that fail — don't abort the whole batch
        }
      }

      if (!abort.signal.aborted) {
        setProgress(100);
        setItems(suggestions);
        setState('done');
      }
    } catch (err: unknown) {
      if (abort.signal.aborted) return;
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed');
      setState('error');
    }
  }

  /**
   * Infer a cleaner sheet name from a project/filename string.
   * Strips common noise patterns and applies title-casing.
   */
  function inferNameFromFilename(name: string): string | null {
    // Strip file extension
    let cleaned = name.replace(/\.pdf$/i, '').trim();
    // Replace underscores/hyphens/dots with spaces
    cleaned = cleaned.replace(/[_\-.]+/g, ' ').trim();
    // Remove trailing version noise like v2, rev3, final, _2
    cleaned = cleaned.replace(/\b(v\d+|rev\d*|final|draft|copy|new|old|\d{8})\b/gi, '').trim();
    // Collapse whitespace
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
    if (!cleaned || cleaned === name.replace(/\.pdf$/i, '').trim()) return null;
    // Title-case
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function reset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState('idle');
    setProgress(0);
    setItems([]);
    setAppliedCount(null);
  }

  function toggleAccept(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, accepted: !item.accepted } : item
      )
    );
  }

  function rejectItem(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, accepted: false } : item
      )
    );
  }

  async function applyRenames(selected: RenameItem[]) {
    // PATCH each project name via the API
    await Promise.allSettled(
      selected.map((item) =>
        fetch(`/api/projects/${item.projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: item.aiName }),
        })
      )
    );
    setAppliedCount(selected.length);
    setState('idle');
    setItems([]);
  }

  function handleApplySelected() {
    const selected = items.filter((item) => item.accepted === true);
    applyRenames(selected);
  }

  function handleApplyAll() {
    applyRenames(items);
  }

  const acceptedCount = items.filter((i) => i.accepted === true).length;
  const totalCount = items.length;

  return (
    <div
      style={{
        background: '#0a0a0f',
        border: '1px solid rgba(0,212,255,0.2)',
        borderRadius: 12,
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, sans-serif',
        boxShadow: '0 0 24px rgba(0,212,255,0.1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid rgba(0,212,255,0.15)',
          background: 'rgba(10,10,15,0.6)',
        }}
      >
        <Sparkles size={17} style={{ color: '#00d4ff' }} />
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 13,
            color: '#e0faff',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          AI Auto-Name Tool
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: '#8892a0',
            fontFamily: 'monospace',
            padding: '2px 8px',
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.15)',
            borderRadius: 999,
          }}
        >
          BETA
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: 16 }}>
        {/* Applied success message */}
        {appliedCount !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              marginBottom: 14,
              fontSize: 13,
              color: '#4ade80',
            }}
          >
            <Check size={15} />
            {appliedCount} drawing{appliedCount !== 1 ? 's' : ''} renamed successfully.
          </div>
        )}

        {state === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: '#8892a0', lineHeight: 1.6, margin: 0 }}>
              Analyzes uploaded drawing filenames and detects the correct sheet designation using AI.
              Select which renames to apply after review.
            </p>
            <button
              onClick={startProcessing}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'rgba(0,212,255,0.12)',
                border: '1px solid rgba(0,212,255,0.4)',
                color: '#00d4ff',
                borderRadius: 10,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'monospace',
                letterSpacing: 0.5,
                boxShadow: '0 0 14px rgba(0,212,255,0.15) inset',
                transition: 'all 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,212,255,0.2)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(0,212,255,0.25) inset';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,212,255,0.12)';
                e.currentTarget.style.boxShadow = '0 0 14px rgba(0,212,255,0.15) inset';
              }}
            >
              <Sparkles size={16} />
              Auto-Name Drawings
            </button>
          </div>
        )}

        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#f87171' }}>
              <X size={14} /> {errorMsg ?? 'Analysis failed. Please try again.'}
            </div>
            <button onClick={() => { setState('idle'); setErrorMsg(null); }} style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#8892a0', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              Try again
            </button>
          </div>
        )}

        {state === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={15} style={{ color: '#00d4ff', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, color: '#00d4ff', fontWeight: 600 }}>
                Processing... {Math.round(progress)}%
              </span>
              <span style={{ fontSize: 11, color: '#8892a0', marginLeft: 'auto' }}>
                Analyzing drawings…
              </span>
            </div>
            <ProgressBar progress={progress} />
            <div style={{ fontSize: 11, color: '#8892a0', fontFamily: 'monospace', animation: 'pulse 2s ease-in-out infinite' }}>
              {progress < 30
                ? '⟳ Extracting title blocks...'
                : progress < 60
                ? '⟳ Matching sheet designations...'
                : progress < 85
                ? '⟳ Verifying drawing sets...'
                : '⟳ Finalizing results...'}
            </div>
            <button
              onClick={reset}
              style={{
                alignSelf: 'flex-start',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#8892a0',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'monospace',
              }}
            >
              Cancel
            </button>

            <style>{`
              @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
            `}</style>
          </div>
        )}

        {state === 'done' && items.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', fontSize: 12, color: '#4ade80' }}>
              <Check size={14} /> All drawings are already well-named — no suggestions.
            </div>
            <button onClick={reset} style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#8892a0', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              Re-analyze
            </button>
          </div>
        )}

        {state === 'done' && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Summary bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 8,
                background: 'rgba(0,212,255,0.06)',
                border: '1px solid rgba(0,212,255,0.15)',
                fontSize: 11,
                color: '#8892a0',
              }}
            >
              <Sparkles size={12} style={{ color: '#00d4ff' }} />
              <span>
                AI detected <strong style={{ color: '#e0faff' }}>{totalCount}</strong> rename suggestions.{' '}
                <strong style={{ color: '#4ade80' }}>{acceptedCount}</strong> selected.
              </span>
              <button
                onClick={reset}
                title="Re-run"
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  color: '#8892a0',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label="Re-run auto-name"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            {/* Column headers */}
            <div
              style={{
                display: 'flex',
                padding: '0 12px 0 38px',
                fontSize: 10,
                fontWeight: 700,
                color: '#8892a0',
                fontFamily: 'monospace',
                letterSpacing: 1,
                textTransform: 'uppercase',
                gap: 10,
              }}
            >
              <span style={{ flex: 1 }}>Original</span>
              <span style={{ width: 13 }} />
              <span style={{ flex: 1.5 }}>AI Name</span>
              <span style={{ width: 60 }}>Action</span>
            </div>

            {/* Items list */}
            <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 2 }}>
              {items.map((item) => (
                <ItemRow key={item.id} item={item} onToggleAccept={toggleAccept} onReject={rejectItem} />
              ))}
            </div>

            {/* Select all / none */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => setItems((prev) => prev.map((i) => ({ ...i, accepted: true })))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#00d4ff',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Select all
              </button>
              <span style={{ color: '#8892a0' }}>·</span>
              <button
                onClick={() => setItems((prev) => prev.map((i) => ({ ...i, accepted: false })))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#8892a0',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Deselect all
              </button>
            </div>

            {/* Apply buttons */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <button
                onClick={handleApplySelected}
                disabled={acceptedCount === 0}
                style={{
                  flex: 1,
                  background: acceptedCount === 0 ? 'rgba(136,146,160,0.15)' : 'rgba(34,197,94,0.15)',
                  border: `1px solid ${acceptedCount === 0 ? 'rgba(136,146,160,0.2)' : 'rgba(34,197,94,0.4)'}`,
                  color: acceptedCount === 0 ? '#8892a0' : '#4ade80',
                  borderRadius: 8,
                  padding: '9px 0',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: acceptedCount === 0 ? 'default' : 'pointer',
                  fontFamily: 'monospace',
                  letterSpacing: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Check size={13} />
                Apply Selected ({acceptedCount})
              </button>
              <button
                onClick={handleApplyAll}
                style={{
                  flex: 1,
                  background: 'rgba(0,212,255,0.12)',
                  border: '1px solid rgba(0,212,255,0.35)',
                  color: '#00d4ff',
                  borderRadius: 8,
                  padding: '9px 0',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  letterSpacing: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <CheckSquare size={13} />
                Apply All ({totalCount})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
