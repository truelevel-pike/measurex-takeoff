'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, AlertTriangle, Check, Sparkles, X } from 'lucide-react';
import { useFocusTrap } from '@/lib/use-focus-trap';

const AUTO_DISMISS_MS = 10_000;

interface AutoScalePopupProps {
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
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS);
  const startRef = useRef(0);
  useEffect(() => {
    startRef.current = Date.now();
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

  // Auto-dismiss countdown
  useEffect(() => {
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
  }, [onDismiss]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAccept();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleIgnore();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleAccept, handleIgnore]);

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

  const progressPct = (remaining / AUTO_DISMISS_MS) * 100;

  return (
    <div
      ref={focusTrapRef}
      role="dialog"
      aria-modal="true"
      aria-label="Scale auto-detected"
      className="fixed top-20 right-4 z-50 bg-gray-900 border border-gray-700 rounded-lg p-4 w-80 shadow-2xl text-gray-100 overflow-hidden"
    >
      {/* Countdown timer bar */}
      <div className="absolute top-0 left-0 h-1 bg-cyan-500/30 w-full">
        <div
          className="h-full bg-cyan-400 transition-[width] duration-100 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center gap-2 mb-3 mt-1">
        <Sparkles size={18} className="text-cyan-300" />
        <h3 className="text-sm font-semibold tracking-wide">Scale Auto-Detected</h3>
      </div>

      <div className="text-2xl font-bold leading-tight mb-2">{detectedScale}</div>
      <p className="text-sm text-gray-300 mb-3">Use this scale?</p>

      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium mb-3 ${confidenceMeta.className}`}>
        <Check size={12} />
        <span>{confidenceMeta.label}</span>
      </div>

      {confidence < 0.7 && (
        <div className="flex items-start gap-2 text-sm text-orange-300 mb-3 bg-orange-950/50 border border-orange-800 rounded-md p-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>Scale detection uncertain — please verify manually</p>
        </div>
      )}

      <div className="flex items-start gap-2 text-sm text-gray-300 mb-4">
        <AlertCircle size={16} className="mt-0.5 text-gray-400" />
        <p>Please verify this scale before proceeding with takeoff</p>
      </div>

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
          <span>Reject</span>
          <kbd className="ml-1 text-[10px] text-gray-400 bg-gray-800 px-1 rounded">Esc</kbd>
        </button>
        <button
          type="button"
          onClick={handleAccept}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-2 transition text-sm"
        >
          <Check size={14} />
          <span>Accept</span>
          <kbd className="ml-1 text-[10px] text-emerald-200 bg-emerald-700 px-1 rounded">↵</kbd>
        </button>
      </div>
    </div>
  );
}
