'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Check, X, ChevronRight, Loader2, CheckSquare, Square, RefreshCw } from 'lucide-react';
import { useFeatureFlag } from '@/hooks/use-feature-flag';

// --- Types ---
interface RenameItem {
  id: string;
  originalName: string;
  aiName: string;
  accepted: boolean | null; // null = pending user choice
}

// --- Sample stub data ---
const STUB_RENAMES: RenameItem[] = [
  { id: 'r1', originalName: 'scan001.pdf',         aiName: 'A1.1 - Floor Plan (Level 1)',       accepted: null },
  { id: 'r2', originalName: 'scan002.pdf',         aiName: 'A1.2 - Floor Plan (Level 2)',       accepted: null },
  { id: 'r3', originalName: 'drawing_final2.pdf',  aiName: 'A2.0 - Exterior Elevations',        accepted: null },
  { id: 'r4', originalName: 'photo0037.pdf',       aiName: 'A3.0 - Building Sections',          accepted: null },
  { id: 'r5', originalName: 'S-001.pdf',           aiName: 'S1.0 - Foundation Plan',            accepted: null },
  { id: 'r6', originalName: 'mech_new_v3.pdf',     aiName: 'M1.0 - HVAC Floor Plan',            accepted: null },
  { id: 'r7', originalName: 'electrical_rev2.pdf', aiName: 'E1.0 - Electrical Layout (L1)',     accepted: null },
  { id: 'r8', originalName: 'plumbing_draft.pdf',  aiName: 'P1.0 - Plumbing Floor Plan',        accepted: null },
];

const PROCESSING_DELAY_MS = 2800; // simulated AI processing time

// --- Sub-components ---

function ItemRow({
  item,
  onToggleAccept,
}: {
  item: RenameItem;
  onToggleAccept: (id: string) => void;
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
          onClick={() => {
            // Toggle to "rejected" state
            if (!isRejected) {
              // mark rejected: we reuse onToggleAccept but need a different state
              // For simplicity, we call onToggleAccept only when not already rejected
            }
          }}
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

export default function AutoNameTool() {
  const aiSheetNaming = useFeatureFlag('ai-sheet-naming');
  const [state, setState] = useState<'idle' | 'processing' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState<RenameItem[]>([]);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function startProcessing() {
    setState('processing');
    setProgress(0);
    setItems([]);
    setAppliedCount(null);

    const startTime = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / PROCESSING_DELAY_MS) * 100, 99);
      setProgress(pct);
      if (pct >= 99) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 50);

    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);
      // All items default to accepted = true after AI processing
      setItems(STUB_RENAMES.map((r) => ({ ...r, accepted: true })));
      setState('done');
    }, PROCESSING_DELAY_MS);
  }

  function reset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState('idle');
    setProgress(0);
    setItems([]);
    setAppliedCount(null);
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function toggleAccept(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, accepted: !item.accepted } : item
      )
    );
  }

  function handleApplySelected() {
    const selected = items.filter((item) => item.accepted === true);
    setAppliedCount(selected.length);
    // Stub: in a real app, rename files here
    setState('idle');
    setItems([]);
  }

  function handleApplyAll() {
    setAppliedCount(items.length);
    // Stub: in a real app, rename all files here
    setState('idle');
    setItems([]);
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

        {state === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={15} style={{ color: '#00d4ff', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, color: '#00d4ff', fontWeight: 600 }}>
                Processing... {Math.round(progress)}%
              </span>
              <span style={{ fontSize: 11, color: '#8892a0', marginLeft: 'auto' }}>
                Analyzing {STUB_RENAMES.length} drawings
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
                <ItemRow key={item.id} item={item} onToggleAccept={toggleAccept} />
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
