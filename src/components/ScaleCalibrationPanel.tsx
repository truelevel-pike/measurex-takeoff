'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { X, Ruler, CheckCircle } from 'lucide-react';

type Step = 'intro' | 'drawing' | 'dimension' | 'done';

interface ScaleCalibrationPanelProps {
  onClose: () => void;
  onCalibrated?: () => void;
}

export default function ScaleCalibrationPanel({ onClose, onCalibrated }: ScaleCalibrationPanelProps) {
  const [step, setStep] = useState<Step>('intro');
  const [lineLengthPx, setLineLengthPx] = useState<number | null>(null);
  const [realDimension, setRealDimension] = useState('');
  const [unit, setUnit] = useState<'ft' | 'm' | 'in'>('ft');
  const setScale = useStore((s) => s.setScale);
  const setScaleForPage = useStore((s) => s.setScaleForPage);
  const currentPage = useStore((s) => s.currentPage);
  const setTool = useStore((s) => s.setTool);

  const startCalibrationDraw = useCallback(() => {
    setTool('calibrate');
    setStep('drawing');
  }, [setTool]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ lengthPx: number }>;
      setLineLengthPx(ce.detail.lengthPx);
      setStep('dimension');
      setTool('select');
    };
    window.addEventListener('calibration-line-complete', handler);
    return () => window.removeEventListener('calibration-line-complete', handler);
  }, [setTool]);

  const handleApply = useCallback(() => {
    const dim = parseFloat(realDimension);
    if (!lineLengthPx || !dim || dim <= 0) return;
    const pixelsPerUnit = lineLengthPx / dim;
    const label = `${realDimension} ${unit} (measured)`;
    const cal = { pixelsPerUnit, unit, label, source: 'manual' as const };
    setScale(cal);
    setScaleForPage(currentPage, cal);
    setStep('done');
    setTimeout(() => { onCalibrated?.(); onClose(); }, 1200);
  }, [lineLengthPx, realDimension, unit, currentPage, setScale, setScaleForPage, onCalibrated, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="relative flex flex-col gap-4 rounded-xl p-6 w-full max-w-md shadow-2xl" style={{ background: '#13141a', border: '1px solid rgba(0,212,255,0.25)' }}>
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white" aria-label="Close">
          <X size={18} />
        </button>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Ruler size={18} className="text-cyan-400" /> Scale Calibration
        </h2>

        {step === 'intro' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-300">Draw a line across a known dimension on the plan, then enter the real-world measurement to set the scale.</p>
            <ol className="text-sm text-gray-400 list-decimal list-inside space-y-1">
              <li>Click <strong>Start Drawing</strong> — cursor becomes calibration tool</li>
              <li>Click two points spanning a known distance on the plan</li>
              <li>Enter the real-world measurement</li>
              <li>Scale is calculated automatically</li>
            </ol>
            <button onClick={startCalibrationDraw} className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.4)' }}>
              Start Drawing on Plan
            </button>
          </div>
        )}

        {step === 'drawing' && (
          <div className="flex flex-col gap-3 items-center text-center">
            <p className="text-sm text-cyan-300 font-medium animate-pulse">Calibration mode active — click two points on the canvas spanning a known distance</p>
            <p className="text-xs text-gray-400">A line will be drawn between your two clicks.</p>
            <button onClick={() => { setTool('select'); setStep('intro'); }} className="px-3 py-1.5 rounded text-xs text-gray-300 border border-gray-600 hover:border-gray-400">Cancel</button>
          </div>
        )}

        {step === 'dimension' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-300">Line: <strong className="text-white">{Math.round(lineLengthPx ?? 0)} px</strong>. Enter the real-world distance this line represents.</p>
            <div className="flex gap-2">
              <input type="number" min="0.01" step="0.01" value={realDimension} onChange={(e) => setRealDimension(e.target.value)} placeholder="e.g. 10" className="flex-1 rounded px-3 py-2 text-sm text-white" style={{ background: '#1e2030', border: '1px solid rgba(0,212,255,0.3)' }} autoFocus />
              <select value={unit} onChange={(e) => setUnit(e.target.value as 'ft' | 'm' | 'in')} className="rounded px-2 py-2 text-sm text-white" style={{ background: '#1e2030', border: '1px solid rgba(0,212,255,0.3)' }}>
                <option value="ft">ft</option>
                <option value="m">m</option>
                <option value="in">in</option>
              </select>
            </div>
            <button onClick={handleApply} disabled={!realDimension || parseFloat(realDimension) <= 0} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)' }}>
              Apply Scale
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col gap-2 items-center text-center">
            <CheckCircle size={32} className="text-green-400" />
            <p className="text-sm text-green-300 font-medium">Scale calibrated!</p>
          </div>
        )}
      </div>
    </div>
  );
}
