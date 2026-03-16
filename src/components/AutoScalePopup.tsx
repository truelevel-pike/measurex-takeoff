'use client';

import React, { useState } from 'react';
import { AlertCircle, Check, Sparkles } from 'lucide-react';

interface AutoScalePopupProps {
  detectedScale: string;
  confidence: number;
  onDismiss: () => void;
  onDontShowAgain: () => void;
}

export default function AutoScalePopup({
  detectedScale,
  confidence,
  onDismiss,
  onDontShowAgain,
}: AutoScalePopupProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

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

  const handleOk = () => {
    if (dontShowAgain) {
      onDontShowAgain();
    }
    onDismiss();
  };

  return (
    <div className="fixed top-20 right-4 z-50 bg-gray-900 border border-gray-700 rounded-lg p-4 w-80 shadow-2xl text-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={18} className="text-cyan-300" />
        <h3 className="text-sm font-semibold tracking-wide">Scale Auto-Detected</h3>
      </div>

      <div className="text-2xl font-bold leading-tight mb-3">{detectedScale}</div>

      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium mb-3 ${confidenceMeta.className}`}>
        <Check size={12} />
        <span>{confidenceMeta.label}</span>
      </div>

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
        <span>Don't show this again</span>
      </label>

      <button
        type="button"
        onClick={handleOk}
        className="w-full rounded-md bg-green-600 hover:bg-green-500 text-white font-semibold px-3 py-2 transition"
      >
        OK
      </button>
    </div>
  );
}
