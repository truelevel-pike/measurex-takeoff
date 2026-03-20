'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { CheckCircle2 } from 'lucide-react';

const DPI = 72;

type Mode = 'draw-line' | 'enter-number';

interface ManualCalibrationProps {
  currentPage: number;
  onSave: (scale: string) => void;
  onCancel: () => void;
}

export default function ManualCalibration({
  currentPage,
  onSave,
  onCancel,
}: ManualCalibrationProps) {
  const [mode, setMode] = useState<Mode>('draw-line');

  // Draw Line state
  const [drawFt, setDrawFt] = useState('');
  const [drawIn, setDrawIn] = useState('');

  // Enter Number state (ratio: [paperFt][paperIn] : [realFt][realIn])
  const [paperFt, setPaperFt] = useState('');
  const [paperIn, setPaperIn] = useState('');
  const [realFt, setRealFt] = useState('');
  const [realIn, setRealIn] = useState('');

  // Snapping toggles (Draw Line mode)
  const [autoSnap, setAutoSnap] = useState(true);
  const [snapEdges, setSnapEdges] = useState(false);

  // Store — calibration state
  const calibrationMode = useStore((s) => s.calibrationMode);
  const calibrationPoints = useStore((s) => s.calibrationPoints);
  const setCalibrationMode = useStore((s) => s.setCalibrationMode);
  const clearCalibrationPoints = useStore((s) => s.clearCalibrationPoints);
  const setScaleForPage = useStore((s) => s.setScaleForPage);
  const setScale = useStore((s) => s.setScale);

  // Auto-start calibration mode when component mounts in draw-line mode
  useEffect(() => {
    if (mode === 'draw-line' && !calibrationMode && calibrationPoints.length === 0) {
      setCalibrationMode(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up calibration mode on unmount or mode switch
  useEffect(() => {
    return () => {
      clearCalibrationPoints();
    };
  }, [clearCalibrationPoints]);

  useEffect(() => {
    if (mode !== 'draw-line' && calibrationMode) {
      clearCalibrationPoints();
    }
  }, [mode, calibrationMode, clearCalibrationPoints]);

  // Computed pixel distance between calibration points
  const pixelDistance = useMemo(() => {
    if (calibrationPoints.length < 2) return 0;
    const [p1, p2] = calibrationPoints;
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  }, [calibrationPoints]);

  const hasBothPoints = calibrationPoints.length >= 2;

  // Computed real-world distance for draw-line
  const drawRealFeet = useMemo(() => {
    const ft = parseFloat(drawFt) || 0;
    const inches = parseFloat(drawIn) || 0;
    return ft + inches / 12;
  }, [drawFt, drawIn]);

  // Live scale preview for draw-line mode
  const drawLinePreview = useMemo(() => {
    if (!hasBothPoints || pixelDistance <= 0 || drawRealFeet <= 0) return null;
    const ppu = pixelDistance / drawRealFeet;
    const feetPerInch = DPI / ppu;
    return `1 inch on paper = ${feetPerInch.toFixed(1)} feet`;
  }, [hasBothPoints, pixelDistance, drawRealFeet]);

  // Live scale preview for enter-number mode
  const enterNumberPreview = useMemo(() => {
    const pTotal = (parseFloat(paperFt) || 0) * 12 + (parseFloat(paperIn) || 0);
    const rTotal = (parseFloat(realFt) || 0) + (parseFloat(realIn) || 0) / 12;
    if (pTotal <= 0 || rTotal <= 0) return null;
    const feetPerInch = rTotal / pTotal;
    return `1 inch on paper = ${feetPerInch.toFixed(1)} feet`;
  }, [paperFt, paperIn, realFt, realIn]);

  // Validation
  const isDrawLineValid = hasBothPoints && pixelDistance > 0 && drawRealFeet > 0;

  const isEnterNumberValid = (() => {
    const pTotal = (parseFloat(paperFt) || 0) * 12 + (parseFloat(paperIn) || 0);
    const rTotal = (parseFloat(realFt) || 0) + (parseFloat(realIn) || 0) / 12;
    return pTotal > 0 && rTotal > 0;
  })();

  const canSave = mode === 'draw-line' ? isDrawLineValid : isEnterNumberValid;

  const handleSave = () => {
    if (!canSave) return;

    if (mode === 'draw-line') {
      const pixelsPerUnit = pixelDistance / drawRealFeet;
      const cal = {
        pixelsPerUnit,
        unit: 'ft' as const,
        label: 'Manual (Draw Line)',
        source: 'manual' as const,
      };
      setScale(cal);
      if (currentPage >= 1) {
        setScaleForPage(currentPage, cal);
      }
      clearCalibrationPoints();
      onSave(`${drawRealFeet.toFixed(2)} ft (drawn)`);
    } else {
      const pft = parseFloat(paperFt) || 0;
      const pin = parseFloat(paperIn) || 0;
      const rft = parseFloat(realFt) || 0;
      const rin = parseFloat(realIn) || 0;
      const paperTotal = pft * 12 + pin; // paper inches
      const realTotal = rft + rin / 12;  // real feet
      // BUG-A7-2-018: compute scale and persist it — previously only the label
      // string was passed to onSave without actually calibrating the store.
      // 72 DPI: 1 paper inch = 72 base pixels → pixelsPerFoot = (72 * paperTotal) / realTotal
      const pixelsPerFoot = (72 * paperTotal) / realTotal;
      const cal = {
        pixelsPerUnit: pixelsPerFoot,
        unit: 'ft' as const,
        label: `${paperTotal}" = ${realTotal.toFixed(1)}'`,
        source: 'manual' as const,
      };
      setScale(cal);
      if (currentPage >= 1) {
        setScaleForPage(currentPage, cal);
      }
      clearCalibrationPoints();
      onSave(`${paperTotal}" = ${realTotal.toFixed(1)}'`);
    }
  };

  const handleCancel = () => {
    clearCalibrationPoints();
    onCancel();
  };

  const handleStartDrawing = () => {
    setCalibrationMode(true);
  };

  const handleResetPoints = () => {
    clearCalibrationPoints();
    setCalibrationMode(true);
  };

  // Status text for draw line mode
  const drawLineStatus = () => {
    if (!calibrationMode && !hasBothPoints) return null;
    if (calibrationMode && calibrationPoints.length === 0)
      return { text: 'Click point 1 on the drawing', color: 'text-amber-600', icon: '1' };
    if (calibrationMode && calibrationPoints.length === 1)
      return { text: 'Click point 2 on the drawing', color: 'text-amber-600', icon: '2' };
    if (hasBothPoints)
      return { text: `Line drawn — ${pixelDistance.toFixed(1)} px`, color: 'text-green-600', icon: null };
    return null;
  };

  const activePreview = mode === 'draw-line' ? drawLinePreview : enterNumberPreview;

  const inputClass =
    'w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white';

  return (
    <div className="bg-white rounded-xl shadow-2xl w-[420px] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-200">
        <h2 className="text-base font-bold text-zinc-800">Set Scale Manually</h2>
      </div>

      {/* Mode tabs — segmented control */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex rounded-lg border border-zinc-200 overflow-hidden">
          <button
            onClick={() => setMode('draw-line')}
            className={`flex-1 py-2 text-sm font-medium transition ${
              mode === 'draw-line'
                ? 'bg-green-600 text-white'
                : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            Draw Line
          </button>
          <button
            onClick={() => setMode('enter-number')}
            className={`flex-1 py-2 text-sm font-medium transition border-l border-zinc-200 ${
              mode === 'enter-number'
                ? 'bg-green-600 text-white'
                : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            Enter Number
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4 flex-1">
        {mode === 'draw-line' ? (
          <>
            {/* Instruction + Start Drawing button */}
            <p className="text-sm text-zinc-600">
              Click two points on the drawing along a known distance, then enter the real measurement.
            </p>

            {!calibrationMode && !hasBothPoints && (
              <button
                onClick={handleStartDrawing}
                className="w-full py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
              >
                Start Drawing
              </button>
            )}

            {/* Live status */}
            {(() => {
              const status = drawLineStatus();
              if (!status) return null;
              return (
                <div className={`text-sm font-medium ${status.color} bg-zinc-50 rounded-lg px-3 py-2 flex items-center gap-2`}>
                  {status.icon && (
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {status.icon}
                    </span>
                  )}
                  {status.text}
                </div>
              );
            })()}

            {/* Reset button when points are placed */}
            {hasBothPoints && (
              <button
                onClick={handleResetPoints}
                className="text-xs text-zinc-500 hover:text-zinc-700 underline"
              >
                Reset points
              </button>
            )}

            {/* Value inputs — shown after both points captured */}
            {hasBothPoints && (
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-2 block">
                  Enter value of known linear
                </label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={drawFt}
                        onChange={(e) => setDrawFt(e.target.value)}
                        placeholder="0"
                        className={inputClass}
                        autoFocus
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                        ft
                      </span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={drawIn}
                        onChange={(e) => setDrawIn(e.target.value)}
                        placeholder="0"
                        className={inputClass}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                        in
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Snapping toggles */}
            <div className="flex gap-2">
              <button
                onClick={() => setAutoSnap(!autoSnap)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition ${
                  autoSnap
                    ? 'bg-green-50 border-green-300 text-green-700'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'
                }`}
              >
                Automatic snapping
              </button>
              <button
                onClick={() => setSnapEdges(!snapEdges)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition ${
                  snapEdges
                    ? 'bg-green-50 border-green-300 text-green-700'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'
                }`}
              >
                Snap to closed edges
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Ratio label */}
            <label className="text-sm font-medium text-zinc-600 block">Ratio</label>

            {/* Four inputs in ratio layout */}
            <div className="flex items-center gap-2">
              {/* Left side — drawing measurement */}
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={paperFt}
                    onChange={(e) => setPaperFt(e.target.value)}
                    placeholder="0"
                    className={inputClass}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                    ft
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={paperIn}
                    onChange={(e) => setPaperIn(e.target.value)}
                    placeholder="0"
                    className={inputClass}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                    in
                  </span>
                </div>
              </div>

              {/* Colon separator */}
              <span className="text-lg font-bold text-zinc-400 px-1">:</span>

              {/* Right side — real-world measurement */}
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={realFt}
                    onChange={(e) => setRealFt(e.target.value)}
                    placeholder="0"
                    className={inputClass}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                    ft
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={realIn}
                    onChange={(e) => setRealIn(e.target.value)}
                    placeholder="0"
                    className={inputClass}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                    in
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Live scale preview — shown when inputs are valid */}
        {activePreview && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 rounded-lg border border-green-100">
            <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-800 font-medium">{activePreview}</span>
          </div>
        )}
      </div>

      {/* Footer — Save / Cancel */}
      <div className="flex gap-3 px-5 py-4 border-t border-zinc-200">
        <button
          onClick={handleCancel}
          className="flex-1 py-2 text-sm font-medium text-zinc-600 border border-zinc-300 rounded-lg hover:bg-zinc-50 transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
            canSave
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
          }`}
        >
          Save
        </button>
      </div>
    </div>
  );
}
