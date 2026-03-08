'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { X, Crosshair, Hash } from 'lucide-react';

type Mode = 'draw-line' | 'enter-number';

interface ManualCalibrationProps {
  currentPage: number;
  onClose: () => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export default function ManualCalibration({
  currentPage,
  onClose,
  containerRef,
}: ManualCalibrationProps) {
  const [mode, setMode] = useState<Mode>('draw-line');

  // Draw Line state
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [distanceFt, setDistanceFt] = useState('');
  const [distanceIn, setDistanceIn] = useState('');

  // Enter Number state
  const [paperFt, setPaperFt] = useState('');
  const [paperIn, setPaperIn] = useState('1');
  const [realFt, setRealFt] = useState('');
  const [realIn, setRealIn] = useState('');

  const [error, setError] = useState<string | null>(null);

  const setScale = useStore((s) => s.setScale);
  const setScaleForPage = useStore((s) => s.setScaleForPage);

  const listenerRef = useRef<((e: MouseEvent) => void) | null>(null);

  // Pixel distance between two drawn points
  const pixelDistance =
    points.length === 2
      ? Math.sqrt(
          Math.pow(points[1].x - points[0].x, 2) +
            Math.pow(points[1].y - points[0].y, 2)
        )
      : 0;

  // Start drawing mode
  const startDrawing = useCallback(() => {
    setPoints([]);
    setIsDrawing(true);
    setError(null);

    const el = containerRef?.current;
    if (!el) {
      setError('Canvas container not found');
      return;
    }

    const handler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setPoints((prev) => {
        if (prev.length >= 2) return prev;
        const next = [...prev, { x, y }];
        if (next.length === 2) {
          setIsDrawing(false);
          el.removeEventListener('click', handler);
        }
        return next;
      });
    };

    listenerRef.current = handler;
    el.addEventListener('click', handler);
  }, [containerRef]);

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current && containerRef?.current) {
        containerRef.current.removeEventListener('click', listenerRef.current);
      }
    };
  }, [containerRef]);

  // Save draw-line calibration
  const saveDrawLine = () => {
    if (points.length !== 2) {
      setError('Draw a line first by clicking two points on the plan');
      return;
    }

    const ft = parseFloat(distanceFt) || 0;
    const inches = parseFloat(distanceIn) || 0;
    const totalFeet = ft + inches / 12;

    if (totalFeet <= 0) {
      setError('Enter a valid distance greater than 0');
      return;
    }

    const ppu = pixelDistance / totalFeet;
    const cal = {
      pixelsPerUnit: ppu,
      unit: 'ft' as const,
      label: `${totalFeet.toFixed(1)} ft (drawn)`,
      source: 'manual' as const,
    };

    setScale(cal);
    if (currentPage >= 1) setScaleForPage(currentPage, cal);
    onClose();
  };

  // Save enter-number calibration
  const saveEnterNumber = () => {
    const pft = parseFloat(paperFt) || 0;
    const pin = parseFloat(paperIn) || 0;
    const rft = parseFloat(realFt) || 0;
    const rin = parseFloat(realIn) || 0;

    const paperTotal = pft * 12 + pin; // in inches
    const realTotal = rft + rin / 12; // in feet

    if (paperTotal <= 0 || realTotal <= 0) {
      setError('Enter valid paper and real-world measurements');
      return;
    }

    // At 72 DPI, paperTotal inches = paperTotal * 72 pixels
    const pixelsOnPaper = paperTotal * 72;
    const ppu = pixelsOnPaper / realTotal;

    const cal = {
      pixelsPerUnit: ppu,
      unit: 'ft' as const,
      label: `${paperTotal}" = ${realTotal.toFixed(1)}'`,
      source: 'manual' as const,
    };

    setScale(cal);
    if (currentPage >= 1) setScaleForPage(currentPage, cal);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[440px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-800">Manual Calibration</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-zinc-200">
          <button
            onClick={() => { setMode('draw-line'); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition ${
              mode === 'draw-line'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Crosshair size={15} /> Draw Line
          </button>
          <button
            onClick={() => { setMode('enter-number'); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition ${
              mode === 'enter-number'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Hash size={15} /> Enter Number
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {mode === 'draw-line' ? (
            <>
              <p className="text-sm text-zinc-500">
                Click two points on a known dimension, then enter the real distance.
              </p>

              {points.length < 2 ? (
                <button
                  onClick={startDrawing}
                  disabled={isDrawing}
                  className={`w-full py-2.5 text-sm font-medium rounded-lg transition ${
                    isDrawing
                      ? 'bg-amber-50 text-amber-600 border border-amber-200'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  {isDrawing
                    ? `Click point ${points.length + 1} of 2 on the drawing...`
                    : 'Click to Start Drawing'}
                </button>
              ) : (
                <div className="bg-green-50 rounded-lg px-3 py-2 text-sm text-green-700 flex items-center justify-between">
                  <span>Line drawn: {pixelDistance.toFixed(1)} px</span>
                  <button
                    onClick={startDrawing}
                    className="text-xs text-green-600 underline"
                  >
                    Redraw
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-zinc-500 mb-1 block">Feet</label>
                  <input
                    type="number"
                    min="0"
                    value={distanceFt}
                    onChange={(e) => setDistanceFt(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-zinc-500 mb-1 block">Inches</label>
                  <input
                    type="number"
                    min="0"
                    max="11"
                    value={distanceIn}
                    onChange={(e) => setDistanceIn(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-500">
                Enter the paper measurement and the real-world distance it represents.
              </p>

              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1.5 block">
                  Paper Measurement
                </label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-zinc-400 mb-1 block">Feet</label>
                    <input
                      type="number"
                      min="0"
                      value={paperFt}
                      onChange={(e) => setPaperFt(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-zinc-400 mb-1 block">Inches</label>
                    <input
                      type="number"
                      min="0"
                      value={paperIn}
                      onChange={(e) => setPaperIn(e.target.value)}
                      placeholder="1"
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1.5 block">
                  Real-World Distance
                </label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-zinc-400 mb-1 block">Feet</label>
                    <input
                      type="number"
                      min="0"
                      value={realFt}
                      onChange={(e) => setRealFt(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-zinc-400 mb-1 block">Inches</label>
                    <input
                      type="number"
                      min="0"
                      value={realIn}
                      onChange={(e) => setRealIn(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-zinc-200">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm font-medium text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={mode === 'draw-line' ? saveDrawLine : saveEnterNumber}
            className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            Apply Scale
          </button>
        </div>
      </div>
    </div>
  );
}
