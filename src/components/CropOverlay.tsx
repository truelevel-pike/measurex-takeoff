'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropOverlayProps {
  onCropComplete: (cropRect: CropRect) => void;
  onCancel: () => void;
}

export default function CropOverlay({ onCropComplete, onCancel }: CropOverlayProps) {
  const baseDims = useStore((s) => s.pageBaseDimensions[s.currentPage] ?? { width: 1, height: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const toBaseCoords = useCallback(
    (e: React.MouseEvent): { x: number; y: number } => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
        y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
      };
    },
    [baseDims],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const pt = toBaseCoords(e);
      setStartPoint(pt);
      setCurrentPoint(pt);
      setIsDragging(true);
    },
    [toBaseCoords],
  );

  // BUG-A7-2-012: Attach mousemove/mouseup to window during drag so the user
  // cannot escape the crop selection by dragging outside the overlay div bounds.
  const startPointRef = useRef(startPoint);
  useEffect(() => { startPointRef.current = startPoint; }, [startPoint]);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCurrentPoint({
        x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
        y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
      });
    };

    const onUp = (e: MouseEvent) => {
      const sp = startPointRef.current;
      setIsDragging(false);
      if (!sp) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cp = {
        x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
        y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
      };
      const x = Math.min(sp.x, cp.x);
      const y = Math.min(sp.y, cp.y);
      const width = Math.abs(cp.x - sp.x);
      const height = Math.abs(cp.y - sp.y);
      if (width < 10 || height < 10) {
        setStartPoint(null);
        setCurrentPoint(null);
        return;
      }
      onCropComplete({ x, y, width, height });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, baseDims, onCropComplete]);

  // Compute the rect for rendering
  const cropRect =
    startPoint && currentPoint
      ? {
          x: Math.min(startPoint.x, currentPoint.x),
          y: Math.min(startPoint.y, currentPoint.y),
          width: Math.abs(currentPoint.x - startPoint.x),
          height: Math.abs(currentPoint.y - startPoint.y),
        }
      : null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 25,
        cursor: 'crosshair',
      }}
    >
      <svg
        viewBox={`0 0 ${baseDims.width} ${baseDims.height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      >
        {/* Dim the whole canvas */}
        <rect x="0" y="0" width={baseDims.width} height={baseDims.height} fill="rgba(0,0,0,0.3)" />

        {/* Cut out the selection area */}
        {cropRect && (
          <>
            <rect
              x={cropRect.x}
              y={cropRect.y}
              width={cropRect.width}
              height={cropRect.height}
              fill="rgba(0,0,0,0.3)"
              stroke="#00d4ff"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            {/* Clear the selected region to show the underlying canvas */}
            <rect
              x={cropRect.x}
              y={cropRect.y}
              width={cropRect.width}
              height={cropRect.height}
              fill="rgba(0,212,255,0.08)"
              stroke="#00d4ff"
              strokeWidth={2}
              strokeDasharray="8 4"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {/* Instruction text */}
      {!isDragging && !cropRect && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.8)',
            color: '#00d4ff',
            padding: '12px 20px',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'monospace',
            pointerEvents: 'none',
            border: '1px solid rgba(0,212,255,0.3)',
          }}
        >
          Click and drag to select a region &middot; ESC to cancel
        </div>
      )}
    </div>
  );
}
