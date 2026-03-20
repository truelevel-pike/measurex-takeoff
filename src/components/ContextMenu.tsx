'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { Camera, ChevronRight, Copy, Info, Tag, Trash } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  polygonId: string;
  onClose: () => void;
  onOpenProperties?: (polygonId: string) => void;
}

export default function ContextMenu({ x, y, polygonId, onClose, onOpenProperties }: ContextMenuProps) {
  const deletePolygon = useStore((s) => s.deletePolygon);
  const addPolygon = useStore((s) => s.addPolygon);
  const polygons = useStore((s) => s.polygons);
  const classifications = useStore((s) => s.classifications);
  const updatePolygon = useStore((s) => s.updatePolygon);
  const setSelectedPolygon = useStore((s) => s.setSelectedPolygon);
  const projectId = useStore((s) => s.projectId);
  const setSelectedClassification = useStore((s) => s.setSelectedClassification);

  const menuRef = useRef<HTMLDivElement>(null);
  // BUG-A6-5-013 fix: track the snapshot close timer so it can be cancelled on unmount
  const snapshotCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (snapshotCloseTimerRef.current) clearTimeout(snapshotCloseTimerRef.current);
    };
  }, []);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showClassifications, setShowClassifications] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<'idle' | 'saving' | 'done'>('idle');

  const polygon = polygons.find((p) => p.id === polygonId);

  // Menu items list for keyboard navigation (stable reference)
  const menuItems = useMemo(() => ['properties', 'duplicate', 'reclassify', 'gotoclass', 'delete', 'snapshot'], []);

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deletePolygon(polygonId);
    if (projectId) {
      fetch(`/api/projects/${projectId}/polygons/${polygonId}`, { method: 'DELETE' }).catch((err) =>
        console.error('API deletePolygon failed:', err)
      );
    }
    onClose();
  }, [confirmDelete, deletePolygon, polygonId, projectId, onClose]);

  const handleCopy = useCallback(() => {
    if (!polygon) return;
    // BUG-A6-5-014 fix: offset duplicate polygon in base-coordinate space (proportional),
    // not hardcoded 20 screen pixels which produces zoom-dependent visual offsets.
    const baseDimsRaw = useStore.getState().pageBaseDimensions[polygon.pageNumber];
    const offsetX = (baseDimsRaw?.width ?? 1000) * 0.01;
    const offsetY = (baseDimsRaw?.height ?? 1000) * 0.01;
    addPolygon({
      points: polygon.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })),
      classificationId: polygon.classificationId,
      pageNumber: polygon.pageNumber,
      area: polygon.area,
      linearFeet: polygon.linearFeet,
      isComplete: polygon.isComplete,
      label: polygon.label,
    });
    onClose();
  }, [polygon, addPolygon, onClose]);

  const handleReclassify = useCallback((classId: string) => {
    updatePolygon(polygonId, { classificationId: classId });
    onClose();
  }, [updatePolygon, polygonId, onClose]);

  const handleOpenProperties = useCallback(() => {
    setSelectedPolygon(polygonId);
    onOpenProperties?.(polygonId);
    onClose();
  }, [setSelectedPolygon, polygonId, onOpenProperties, onClose]);

  const handleGoToClassification = useCallback(() => {
    if (!polygon) return;
    setSelectedClassification(polygon.classificationId);
    onClose();
  }, [polygon, setSelectedClassification, onClose]);

  const handleSnapshot = useCallback(async () => {
    if (!projectId || snapshotStatus !== 'idle') return;
    setSnapshotStatus('saving');
    try {
      await fetch(`/api/projects/${projectId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: `Quick snapshot` }),
      });
      setSnapshotStatus('done');
      // BUG-A6-5-013 fix: store timer ref so it is cancelled if component unmounts
      snapshotCloseTimerRef.current = setTimeout(onClose, 600);
    } catch {
      setSnapshotStatus('idle');
    }
  }, [projectId, snapshotStatus, onClose]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((i) => (i + 1) % menuItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = menuItems[focusIndex];
        if (item === 'properties') handleOpenProperties();
        else if (item === 'duplicate') handleCopy();
        else if (item === 'reclassify') setShowClassifications((v) => !v);
        else if (item === 'gotoclass') handleGoToClassification();
        else if (item === 'delete') handleDelete();
        else if (item === 'snapshot') void handleSnapshot();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusIndex, menuItems, handleOpenProperties, handleCopy, handleGoToClassification, handleDelete, handleSnapshot, onClose]);

  // Scroll to close
  useEffect(() => {
    const onScroll = () => onClose();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [onClose]);

  // Focus the menu on mount
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  if (!polygonId) return null;

  const itemClass = (idx: number, extra?: string) =>
    `flex items-center gap-2 w-full px-3 py-1.5 text-[13px] rounded text-left transition-colors ${
      focusIndex === idx ? 'bg-white/10' : 'hover:bg-white/[0.07]'
    } ${extra ?? ''}`;

  return (
    <div
      ref={menuRef}
      tabIndex={-1}
      role="menu"
      aria-label="Polygon context menu"
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 9999,
      }}
      className="min-w-[200px] rounded-lg border border-slate-700/60 bg-[#111827]/[0.97] shadow-2xl backdrop-blur-sm p-1 text-slate-200 outline-none"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Properties */}
      <button
        role="menuitem"
        className={itemClass(0)}
        onMouseEnter={() => setFocusIndex(0)}
        onClick={handleOpenProperties}
      >
        <Info size={14} className="text-slate-400" /> Properties
      </button>

      {/* Duplicate */}
      <button
        role="menuitem"
        className={itemClass(1)}
        onMouseEnter={() => setFocusIndex(1)}
        onClick={handleCopy}
      >
        <Copy size={14} className="text-slate-400" /> Duplicate
      </button>

      {/* Change Classification */}
      <button
        role="menuitem"
        className={itemClass(2)}
        onMouseEnter={() => setFocusIndex(2)}
        onClick={() => setShowClassifications((v) => !v)}
      >
        <ChevronRight
          size={14}
          className={`text-slate-400 transition-transform ${showClassifications ? 'rotate-90' : ''}`}
        />
        Change Classification
      </button>
      {showClassifications && classifications.length > 0 && (
        <div className="ml-4 mr-1 my-0.5 max-h-[160px] overflow-y-auto">
          {classifications.map((cls) => (
            <button
              key={cls.id}
              role="menuitem"
              className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-white/[0.07] text-slate-300"
              onClick={() => handleReclassify(cls.id)}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cls.color }} />
              {cls.name}
            </button>
          ))}
        </div>
      )}

      {/* Go to Classification */}
      <button
        role="menuitem"
        className={itemClass(3)}
        onMouseEnter={() => setFocusIndex(3)}
        onClick={handleGoToClassification}
      >
        <Tag size={14} className="text-slate-400" /> Jump to Classification
      </button>

      <div className="my-1 border-t border-slate-700/50" />

      {/* Delete */}
      <button
        role="menuitem"
        className={itemClass(4, confirmDelete ? 'text-red-400 bg-red-500/10' : 'text-red-400')}
        onMouseEnter={() => setFocusIndex(4)}
        onClick={handleDelete}
      >
        <Trash size={14} /> {confirmDelete ? 'Click again to confirm' : 'Delete'}
      </button>

      {/* Add to snapshot */}
      <button
        role="menuitem"
        className={itemClass(5, 'text-slate-400')}
        onMouseEnter={() => setFocusIndex(5)}
        onClick={() => void handleSnapshot()}
        disabled={snapshotStatus !== 'idle'}
      >
        <Camera size={14} />
        {snapshotStatus === 'saving' ? 'Saving...' : snapshotStatus === 'done' ? 'Saved!' : 'Add to snapshot'}
      </button>
    </div>
  );
}
