'use client';

import React, { useCallback, useState } from 'react';
import { useStore } from '@/lib/store';
import ScalePanel from '@/components/ScalePanel';
import ManualCalibration from '@/components/ManualCalibration';

const DPI = 72;

/**
 * Convert a preset label string into a pixelsPerUnit value at 72 DPI.
 */
function labelToPixelsPerUnit(label: string): number {
  // Ratio / Metric: "1 : 500"
  const ratioMatch = label.match(/^1\s*:\s*(\d+)$/);
  if (ratioMatch) {
    const ratio = parseInt(ratioMatch[1], 10);
    // 1:ratio means 1 unit on paper = ratio units real. At 72 DPI, 1 inch = 72 px.
    // pixelsPerUnit (inches): 72 / ratio  → but we store per-foot so multiply by 12?
    // Actually for ratio scales we treat "unit" as dimensionless; store as px per real-inch.
    return DPI / ratio;
  }

  // Civil: "1" = X' 0""
  const civilMatch = label.match(/^1"\s*=\s*(\d+)'\s*0?"?$/);
  if (civilMatch) {
    const feet = parseInt(civilMatch[1], 10);
    // 1 inch on paper = feet real feet → pixelsPerUnit (per foot) = DPI / feet
    return DPI / feet;
  }

  // Architectural: fraction or number + " = 1' 0""
  const archMatch = label.match(/^(.+?)"\s*=\s*1'\s*0?"?$/);
  if (archMatch) {
    const frac = parseFraction(archMatch[1].trim());
    // frac inches on paper = 1 foot real → pixelsPerUnit = frac * DPI per foot
    return frac * DPI;
  }

  return DPI * 0.125; // fallback: 1/8" = 1'
}

/** Parse fraction strings like "3/64", "1 1/2", "1", "3" */
function parseFraction(s: string): number {
  // "1 1/2" → mixed number
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    return parseInt(mixedMatch[1], 10) + parseInt(mixedMatch[2], 10) / parseInt(mixedMatch[3], 10);
  }
  // "3/64"
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return parseInt(fracMatch[1], 10) / parseInt(fracMatch[2], 10);
  }
  // whole number "1", "3"
  return parseFloat(s) || 0;
}

type View = 'presets' | 'manual';

interface ScaleCalibrationProps {
  onClose?: () => void;
}

export default function ScaleCalibration({ onClose }: ScaleCalibrationProps) {
  const [view, setView] = useState<View>('presets');

  const scale = useStore((s) => s.scale);
  const setScale = useStore((s) => s.setScale);
  const setScaleForPage = useStore((s) => s.setScaleForPage);
  const currentPage = useStore((s) => s.currentPage);
  const setTool = useStore((s) => s.setTool);

  const selectedLabel = scale?.label ?? null;
  const isAutoDetected = scale?.source === 'auto' || scale?.source === 'ai';

  const handleClose = useCallback(() => {
    setTool('select');
    onClose?.();
  }, [setTool, onClose]);

  const handleSelectScale = useCallback(
    (label: string) => {
      const ppu = labelToPixelsPerUnit(label);
      // Determine unit type based on label pattern
      const isRatio = /^1\s*:/.test(label);
      const unit: 'ft' | 'in' = isRatio ? 'in' : 'ft';

      const cal = {
        pixelsPerUnit: ppu,
        unit,
        label,
        source: 'manual' as const,
      };

      setScale(cal);
      if (currentPage >= 1) {
        setScaleForPage(currentPage, cal);
      }
      handleClose();
    },
    [currentPage, setScale, setScaleForPage, handleClose],
  );

  const handleOpenManual = useCallback(() => {
    setView('manual');
  }, []);

  const handleManualSave = useCallback(
    (label: string) => {
      // Parse the label to compute pixelsPerUnit
      const ppu = labelToPixelsPerUnit(label);
      const cal = {
        pixelsPerUnit: ppu,
        unit: 'ft' as const,
        label,
        source: 'manual' as const,
      };
      setScale(cal);
      if (currentPage >= 1) {
        setScaleForPage(currentPage, cal);
      }
      handleClose();
    },
    [currentPage, setScale, setScaleForPage, handleClose],
  );

  const handleManualCancel = useCallback(() => {
    setView('presets');
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-start p-4 bg-black/40"
      onClick={handleClose}
    >
      <div onClick={(e) => e.stopPropagation()}>
        {view === 'presets' ? (
          <ScalePanel
            currentPage={currentPage}
            selectedScale={selectedLabel}
            autoDetected={isAutoDetected}
            onSelectScale={handleSelectScale}
            onOpenManual={handleOpenManual}
            onClose={handleClose}
          />
        ) : (
          <ManualCalibration
            currentPage={currentPage}
            onSave={handleManualSave}
            onCancel={handleManualCancel}
          />
        )}
      </div>
    </div>
  );
}
