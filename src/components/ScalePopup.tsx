'use client';

// Togal-style scale auto-detect confirmation modal
import React, { useEffect } from 'react';
import { useFocusTrap } from '@/lib/use-focus-trap';

interface Props {
  detectedScaleText: string;
  onAccept: () => void;
  onManual: () => void;
}

const ScalePopup: React.FC<Props> = ({ detectedScaleText, onAccept, onManual }) => {
  const focusTrapRef = useFocusTrap(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onManual();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onManual]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scale-popup-heading"
        className="bg-white rounded-lg shadow-xl p-8 min-w-[320px] flex flex-col gap-4 border border-zinc-200"
      >
        <h2 id="scale-popup-heading" className="text-lg font-bold text-zinc-800 mb-1">Scale Detected</h2>
        <p className="mb-2 text-zinc-600">We've auto-detected the scale for this sheet:</p>
        <div className="text-green-700 font-mono text-xl px-2 py-1 bg-green-50 rounded-md inline-block mb-4 text-center">
          {detectedScaleText}
        </div>
        <div className="flex gap-3 mt-2">
          <button className="flex-1 bg-green-600 text-white rounded px-4 py-2 font-medium hover:bg-green-700 focus:outline-none" onClick={onAccept}>
            OK
          </button>
          <button className="flex-1 border border-zinc-300 rounded px-4 py-2 font-medium hover:bg-zinc-50 focus:outline-none" onClick={onManual}>
            Set Manually
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScalePopup;
