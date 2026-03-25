'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Check, Sparkles, X } from 'lucide-react';
import { useFocusTrap } from '@/lib/use-focus-trap';

const AUTO_DISMISS_MS = 10_000;

interface AutoScalePopupProps {
  projectId?: string | null;
  detectedScale: string;
  confidence: number;
  onDismiss: () => void;
  onDontShowAgain: () => void;
  onAccept: (scale: string) => void;
}

export default function AutoScalePopup({
  detectedScale,
  confidence,
  onDismiss,
  onDontShowAgain,
  onAccept,
}: AutoScalePopupProps) {
  // BUG-A7-5-038: TODO — dontShowAgain is currently global (applies to all projects).
  // It should be scoped per-project so disabling auto-scale for one project doesn't
  // suppress it for others. Requires storing the flag in project settings.
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS);
  const startRef = useRef(0);
  // BUG-A7-5-035 fix: track mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    startRef.current = Date.now();
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  const focusTrapRef = useFocusTrap(true);

  const handleIgnore = useCallback(() => {
    if (dontShowAgain) {
      onDontShowAgain();
    }
    onDismiss();
  }, [dontShowAgain, onDismiss, onDontShowAgain]);

  const handleAccept = useCallback(() => {
    if (dontShowAgain) {
      onDontShowAgain();
    }
    onAccept(detectedScale);
  }, [dontShowAgain, detectedScale, onAccept, onDontShowAgain]);

  // Auto-dismiss countdown — only enabled for high-confidence detections (≥0.9).
  // Medium/low confidence scales require explicit user action to avoid silently
  // applying a wrong scale that would corrupt all measurements.
  const autoDismissEnabled = confidence >= 0.9;
  useEffect(() => {
    if (!autoDismissEnabled) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const left = AUTO_DISMISS_MS - elapsed;
      if (left <= 0) {
        clearInterval(id);
        onDismiss();
      } else {
        setRemaining(left);
      }
    }, 50);
    return () => clearInterval(id);
  }, [autoDismissEnabled, onDismiss]);

  // BUG-A7-5-069 fix: keyboard shortcuts handled via onKeyDown on dialog div
  // instead of window listener (which steals events from other components)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAccept();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleIgnore();
      }
    },
    [handleAccept, handleIgnore]
  );

  const confidenceMeta =
    confidence >= 0.9
      ? {
          label: 'High Confidence',
          className: 'bg-emerald-950 text-emerald-300 border border-emerald-700',
        }
      : confidence >= 0.7
        ? {
            label: 'Medium Confidence',
            className: 'bg-yellow-950 text-yellow-300 border border-yellow-700',
          }
        : {
            label: 'Low Confidence',
            className: 'bg-orange-950 text-orange-300 border border-orange-700',
          };

  const progressPct = autoDismissEnabled ? (remaining / AUTO_DISMISS_MS) * 100 : 0;

  return (
    <div
      ref={focusTrapRef}
      role="dialog"
      aria-modal="true"
      aria-label="Scale auto-detected"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="fixed top-20 right-4 z-50 bg-gray-900 border border-gray-700 rounded-lg p-4 w-80 shadow-2xl text-gray-100 overflow-hidden outline-none"
    >
      {/* Countdown timer bar — only shown when auto-dismiss is active (high confidence) */}
      <div className="absolute top-0 left-0 h-1 bg-cyan-500/30 w-full">
        {autoDismissEnabled && (
          <div
            className="h-full bg-cyan-400 transition-[width] duration-100 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        )}
      </div>

      <div className="flex items-center gap-2 mb-3 mt-1">
        <Sparkles size={18} className="text-cyan-300" />
        <h3 className="text-sm font-semibold tracking-wide">Scale Auto-Detected</h3>
      </div>

      <div className="mb-3">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">Detected</span>
        <div className="text-2xl font-bold font-mono leading-tight text-white mt-0.5">{detectedScale}</div>
      </div>

      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium mb-3 ${confidenceMeta.className}`}>
        <Check size={12} />
        <span>{confidenceMeta.label}</span>
      </div>

      {confidence < 0.9 && (
        <div className={`flex items-start gap-2 text-sm mb-3 rounded-md p-2 ${
          confidence < 0.7
            ? 'text-orange-300 bg-orange-950/50 border border-orange-800'
            : 'text-yellow-300 bg-yellow-950/50 border border-yellow-800'
        }`}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            {confidence < 0.7
              ? 'Scale detection uncertain — please verify manually before accepting'
              : 'Please verify this scale is correct before accepting'}
          </p>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-300 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-cyan-400 focus:ring-cyan-500"
        />
        <span>Don&apos;t show this again</span>
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleIgnore}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium px-3 py-2 transition text-sm"
        >
          <X size={14} />
          <span>Set Manually</span>
          <kbd className="ml-1 text-[10px] text-gray-400 bg-gray-800 px-1 rounded">Esc</kbd>
        </button>
        <button
          type="button"
          onClick={handleAccept}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-2 transition text-sm"
        >
          <Check size={14} />
          <span>Accept Scale</span>
          <kbd className="ml-1 text-[10px] text-emerald-200 bg-emerald-700 px-1 rounded">↵</kbd>
        </button>
      </div>
    </div>
  );
}
