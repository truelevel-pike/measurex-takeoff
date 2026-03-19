'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import ScalePanel from '@/components/ScalePanel';
import ManualCalibration from '@/components/ManualCalibration';
import { useToast } from '@/components/Toast';

const DPI = 72;

// Common architectural ratio scales where 1 inch = X feet → unit should be 'ft'
const ARCH_RATIOS_FT = new Set([5, 10, 20, 24, 48, 50, 60, 96, 100, 120, 125, 150, 200, 240, 250, 300, 480, 500]);

/**
 * Convert a preset label string into a pixelsPerUnit value at 72 DPI.
 */
function labelToPixelsPerUnit(label: string): number {
  // Ratio / Metric: "1 : 500"
  const ratioMatch = label.match(/^1\s*:\s*(\d+)$/);
  if (ratioMatch) {
    const ratio = parseInt(ratioMatch[1], 10);
    return DPI / ratio;
  }

  // Civil: "1" = X' 0""
  const civilMatch = label.match(/^1"\s*=\s*(\d+)'\s*0?"?$/);
  if (civilMatch) {
    const feet = parseInt(civilMatch[1], 10);
    return DPI / feet;
  }

  // Architectural: fraction or number + " = 1' 0""
  const archMatch = label.match(/^(.+?)"\s*=\s*1'\s*0?"?$/);
  if (archMatch) {
    const frac = parseFraction(archMatch[1].trim());
    return frac * DPI;
  }

  return DPI * 0.125; // fallback: 1/8" = 1'
}

/** Parse fraction strings like "3/64", "1 1/2", "1", "3" */
function parseFraction(s: string): number {
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    return parseInt(mixedMatch[1], 10) + parseInt(mixedMatch[2], 10) / parseInt(mixedMatch[3], 10);
  }
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return parseInt(fracMatch[1], 10) / parseInt(fracMatch[2], 10);
  }
  return parseFloat(s) || 0;
}

/**
 * Build a human-readable preview string for a given scale.
 * E.g. "1 inch = 8 feet" or "1 ft = 57.6 px"
 */
function buildScalePreview(label: string, ppu: number, unit: string): string {
  // Architectural: "1/8" = 1' 0"" → "1 inch on paper = 8 feet"
  const archMatch = label.match(/^(.+?)"\s*=\s*1'\s*0?"?$/);
  if (archMatch) {
    const frac = parseFraction(archMatch[1].trim());
    if (frac > 0) {
      const feetPerInch = 1 / frac;
      return `1 inch on paper = ${feetPerInch % 1 === 0 ? feetPerInch.toFixed(0) : feetPerInch.toFixed(1)} feet`;
    }
  }

  // Civil: "1" = X' 0"" → already readable
  const civilMatch = label.match(/^1"\s*=\s*(\d+)'\s*0?"?$/);
  if (civilMatch) {
    return `1 inch on paper = ${civilMatch[1]} feet`;
  }

  // Ratio: "1 : 500"
  const ratioMatch = label.match(/^1\s*:\s*(\d+)$/);
  if (ratioMatch) {
    return `1 unit on paper = ${ratioMatch[1]} units real`;
  }

  // Manual / fallback
  if (ppu > 0 && unit) {
    const unitsPerInch = DPI / ppu;
    return `1 inch on paper = ${unitsPerInch.toFixed(1)} ${unit}`;
  }

  return label;
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
  const { addToast } = useToast();

  const selectedLabel = scale?.label ?? null;
  const isAutoDetected = scale?.source === 'auto' || scale?.source === 'ai';

  // Compute scale preview string
  const scalePreview = useMemo(() => {
    if (!scale) return null;
    return buildScalePreview(scale.label, scale.pixelsPerUnit, scale.unit);
  }, [scale]);

  const handleClose = useCallback(() => {
    setTool('select');
    onClose?.();
  }, [setTool, onClose]);

  const handleSelectScale = useCallback(
    (label: string) => {
      const ppu = labelToPixelsPerUnit(label);
      const ratioMatch = label.match(/^1\s*:\s*(\d+)$/);
      let unit: 'ft' | 'in' | 'm' | 'mm' = 'ft';
      if (ratioMatch) {
        const ratio = parseInt(ratioMatch[1], 10);
        unit = ARCH_RATIOS_FT.has(ratio) ? 'ft' : 'm';
      }

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
      addToast(`Scale set to ${label}`, 'success', 3000);
      handleClose();
    },
    [currentPage, setScale, setScaleForPage, handleClose, addToast],
  );

  const handleOpenManual = useCallback(() => {
    setView('manual');
  }, []);

  const handleStartCalibrate = useCallback(() => {
    // Jump directly to manual mode with draw-line active
    setView('manual');
  }, []);

  const handleManualSave = useCallback(
    (label: string) => {
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
            scalePreview={scalePreview}
            onSelectScale={handleSelectScale}
            onOpenManual={handleOpenManual}
            onStartCalibrate={handleStartCalibrate}
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
