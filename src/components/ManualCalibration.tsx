'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';

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

  // Validation
  const isDrawLineValid =
    hasBothPoints &&
    pixelDistance > 0 &&
    ((parseFloat(drawFt) || 0) > 0 || (parseFloat(drawIn) || 0) > 0);

  const isEnterNumberValid = (() => {
    const pTotal = (parseFloat(paperFt) || 0) * 12 + (parseFloat(paperIn) || 0);
    const rTotal = (parseFloat(realFt) || 0) * 12 + (parseFloat(realIn) || 0);
    return pTotal > 0 && rTotal > 0;
  })();

  const canSave = mode === 'draw-line' ? isDrawLineValid : isEnterNumberValid;

  const handleSave = () => {
    if (!canSave) return;

    if (mode === 'draw-line') {
      const ft = parseFloat(drawFt) || 0;
      const inches = parseFloat(drawIn) || 0;
      const realWorldFeet = ft + inches / 12;
      const pixelsPerUnit = pixelDistance / realWorldFeet;
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
      onSave(`${realWorldFeet.toFixed(2)} ft (drawn)`);
    } else {
      const pft = parseFloat(paperFt) || 0;
      const pin = parseFloat(paperIn) || 0;
      const rft = parseFloat(realFt) || 0;
      const rin = parseFloat(realIn) || 0;
      const paperTotal = pft * 12 + pin;
      const realTotal = rft + rin / 12;
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
      return { text: 'Click point 1 on the drawing', color: 'text-amber-600' };
    if (calibrationMode && calibrationPoints.length === 1)
      return { text: 'Click point 2 on the drawing', color: 'text-amber-600' };
    if (hasBothPoints)
      return { text: `Pixel distance: ${pixelDistance.toFixed(1)} px`, color: 'text-green-600' };
    return null;
  };

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
              Click on canvas to place two points defining a known distance.
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
                <div className={`text-sm font-medium ${status.color} bg-zinc-50 rounded-lg px-3 py-2`}>
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
