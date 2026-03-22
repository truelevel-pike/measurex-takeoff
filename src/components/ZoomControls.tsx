'use client';

import React from 'react';
import { useStore } from '@/lib/store';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const STEP = 0.25;

interface ZoomControlsProps {
  /** Called when the user clicks "Fit" — should invoke PDFViewer's fitToPage(). */
  onFitToPage?: () => void;
}

export default function ZoomControls({ onFitToPage }: ZoomControlsProps) {
  const zoomLevel = useStore((s) => s.zoomLevel);
  const setZoomLevel = useStore((s) => s.setZoomLevel);

  const handleZoomIn = () => {
    setZoomLevel(Math.min(MAX_ZOOM, zoomLevel + STEP));
  };

  const handleZoomOut = () => {
    setZoomLevel(Math.max(MIN_ZOOM, zoomLevel - STEP));
  };

  const handleFit = () => {
    if (onFitToPage) {
      // Delegate to the real PDFViewer fitToPage which computes the correct zoom
      // to fill the viewport. Without this, "Fit" just snapped to 100% regardless
      // of the actual page/viewport ratio.
      onFitToPage();
    } else {
      // Fallback: reset to 100% if no handler provided
      setZoomLevel(1);
    }
  };

  return (
    <div
      className="absolute bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-[#00d4ff]/40 bg-black/70 px-3 py-2 shadow-[0_0_24px_rgba(0,212,255,0.2)] backdrop-blur"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleZoomOut}
        className="h-8 w-8 rounded-md border border-[#00d4ff]/45 text-[#00d4ff] transition hover:bg-[#00d4ff]/15"
        aria-label="Zoom out"
        data-testid="zoom-out-btn"
      >
        -
      </button>
      <span className="min-w-[56px] text-center text-sm font-semibold text-[#00d4ff]">
        {Math.round(zoomLevel * 100)}%
      </span>
      <button
        type="button"
        onClick={handleZoomIn}
        className="h-8 w-8 rounded-md border border-[#00d4ff]/45 text-[#00d4ff] transition hover:bg-[#00d4ff]/15"
        aria-label="Zoom in"
        data-testid="zoom-in-btn"
      >
        +
      </button>
      <button
        type="button"
        onClick={handleFit}
        className="h-8 rounded-md border border-[#00d4ff]/45 px-3 text-xs font-semibold uppercase tracking-wide text-[#00d4ff] transition hover:bg-[#00d4ff]/15"
        aria-label="Fit to page"
      >
        Fit
      </button>
    </div>
  );
}
