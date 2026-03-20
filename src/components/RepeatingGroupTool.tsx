'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';

export default function RepeatingGroupTool() {
  const baseDims = useStore((s) => s.pageBaseDimensions[s.currentPage] ?? { width: 1, height: 1 });
  const currentPage = useStore((s) => s.currentPage);
  const addRepeatingGroup = useStore((s) => s.addRepeatingGroup);
  const setIsDefiningGroup = useStore((s) => s.setIsDefiningGroup);

  const containerRef = useRef<HTMLDivElement>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // After drawing, show the config popover
  const [boundingBox, setBoundingBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [groupName, setGroupName] = useState('');
  const [repeatCount, setRepeatCount] = useState(2);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDefiningGroup(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setIsDefiningGroup]);

  useEffect(() => {
    if (boundingBox && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [boundingBox]);

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
      if (e.button !== 0 || boundingBox) return;
      const pt = toBaseCoords(e);
      setStartPoint(pt);
      setCurrentPoint(pt);
      setIsDragging(true);
    },
    [toBaseCoords, boundingBox],
  );

  // BUG-A6-5-022 fix: mirror CropOverlay — attach mousemove/mouseup to window while dragging
  // so the drag doesn't get stuck when the pointer leaves the overlay div.
  useEffect(() => {
    if (!isDragging) return;
    const onWindowMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCurrentPoint({
        x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
        y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
      });
    };
    const onWindowMouseUp = (e: MouseEvent) => {
      setIsDragging(false);
      if (!startPoint) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pt = {
        x: ((e.clientX - rect.left) / rect.width) * baseDims.width,
        y: ((e.clientY - rect.top) / rect.height) * baseDims.height,
      };
      const x = Math.min(startPoint.x, pt.x);
      const y = Math.min(startPoint.y, pt.y);
      const width = Math.abs(pt.x - startPoint.x);
      const height = Math.abs(pt.y - startPoint.y);
      // BUG-A7-5-051 fix: proportional min size based on base dims
      const minSize = Math.max(10, Math.min(baseDims.width, baseDims.height) * 0.01);
      if (width < minSize || height < minSize) {
        setStartPoint(null);
        setCurrentPoint(null);
        return;
      }
      setBoundingBox({ x, y, width, height });
    };
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [isDragging, startPoint, baseDims]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Now handled by window listener while dragging; local handler is a no-op safety net
      if (!isDragging) return;
      setCurrentPoint(toBaseCoords(e));
    },
    [isDragging, toBaseCoords],
  );

  const handleMouseUp = useCallback(() => {
    // Now handled by window listener to survive pointer leaving the overlay
    if (!isDragging || !startPoint || !currentPoint) return;
    setIsDragging(false);

    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);

    if (width < 10 || height < 10) {
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    setBoundingBox({ x, y, width, height });
  }, [isDragging, startPoint, currentPoint]);

  const handleConfirm = useCallback(() => {
    if (!boundingBox || !groupName.trim()) return;
    addRepeatingGroup({
      name: groupName.trim(),
      pageNumber: currentPage,
      boundingBox,
      repeatCount: Math.max(1, repeatCount),
      classificationIds: [],
    });
    setIsDefiningGroup(false);
  }, [boundingBox, groupName, repeatCount, currentPage, addRepeatingGroup, setIsDefiningGroup]);

  const handleCancel = useCallback(() => {
    setIsDefiningGroup(false);
  }, [setIsDefiningGroup]);

  const cropRect =
    startPoint && currentPoint && !boundingBox
      ? {
          x: Math.min(startPoint.x, currentPoint.x),
          y: Math.min(startPoint.y, currentPoint.y),
          width: Math.abs(currentPoint.x - startPoint.x),
          height: Math.abs(currentPoint.y - startPoint.y),
        }
      : boundingBox;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 25,
        cursor: boundingBox ? 'default' : 'crosshair',
      }}
    >
      <svg
        viewBox={`0 0 ${baseDims.width} ${baseDims.height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      >
        <rect x="0" y="0" width={baseDims.width} height={baseDims.height} fill="rgba(0,0,0,0.3)" />

        {cropRect && (
          <>
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

      {/* Instruction text when not yet drawing */}
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
          Draw a box around the repeating unit &middot; ESC to cancel
        </div>
      )}

      {/* Config popover after drawing */}
      {boundingBox && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 30,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="bg-[#0a0a0f] border border-[#00d4ff]/40 rounded-lg p-4 shadow-2xl w-72">
            <h3 className="text-sm font-mono text-[#00d4ff] tracking-wider mb-3">REPEATING GROUP</h3>

            <label className="block text-[11px] text-gray-400 mb-1 font-mono">Group Name</label>
            <input
              ref={nameInputRef}
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Unit A, Hotel Room"
              className="w-full px-2 py-1.5 mb-3 rounded bg-[#12121a] border border-[#00d4ff]/20 text-[#e5e7eb] text-sm outline-none focus:border-[#00d4ff]/60"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') handleCancel();
              }}
            />

            <label className="block text-[11px] text-gray-400 mb-1 font-mono">How many units repeat?</label>
            <input
              type="number"
              min={1}
              value={repeatCount}
              onChange={(e) => {
                // BUG-A7-5-050 fix: clamp repeatCount between 1 and 999
                const val = parseInt(e.target.value, 10) || 1;
                setRepeatCount(Math.max(1, Math.min(999, val)));
              }}
              className="w-full px-2 py-1.5 mb-4 rounded bg-[#12121a] border border-[#00d4ff]/20 text-[#e5e7eb] text-sm outline-none focus:border-[#00d4ff]/60"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') handleCancel();
              }}
            />

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!groupName.trim()}
                className="px-3 py-1.5 text-xs font-medium rounded bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/40 hover:bg-[#00d4ff]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
