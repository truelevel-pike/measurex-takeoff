'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { Edit, Trash, Copy, Info } from 'lucide-react';

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

  if (!polygonId) return null;
  const polygon = polygons.find((p) => p.id === polygonId);

  const handleDelete = () => {
    deletePolygon(polygonId);
    onClose();
  };

  const handleCopy = () => {
    if (!polygon) return;
    addPolygon({
      points: polygon.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })),
      classificationId: polygon.classificationId,
      pageNumber: polygon.pageNumber,
      area: polygon.area,
      linearFeet: polygon.linearFeet,
      isComplete: polygon.isComplete,
      label: polygon.label,
    });
    onClose();
  };

  const handleReclassify = (classId: string) => {
    const cls = classifications.find((c) => c.id === classId);
    if (cls) updatePolygon(polygonId, { classificationId: classId });
    onClose();
  };

  const handleOpenProperties = () => {
    setSelectedPolygon(polygonId);
    onOpenProperties?.(polygonId);
    onClose();
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: y,
        left: x,
        zIndex: 50,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        padding: 4,
        minWidth: 180,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-xs text-neutral-400 px-3 py-1">Actions</div>
      {classifications.length > 0 && (
        <>
          <div className="text-xs text-neutral-400 px-3 py-1 mt-1">Reclassify</div>
          {classifications.map((cls) => (
            <button
              key={cls.id}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-neutral-100 rounded text-left"
              onClick={() => handleReclassify(cls.id)}
            >
              <span className="w-3 h-3 rounded-full" style={{ background: cls.color }} />
              {cls.name}
            </button>
          ))}
        </>
      )}

      <button
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-neutral-100 rounded"
        onClick={handleOpenProperties}
      >
        <Info size={14} /> Properties
      </button>

      <button
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-neutral-100 rounded"
        onClick={() => {
          setSelectedPolygon(polygonId);
          onClose();
        }}
      >
        <Edit size={14} /> Edit Points
      </button>

      <button className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-neutral-100 rounded" onClick={handleCopy}>
        <Copy size={14} /> Duplicate
      </button>

      <button className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-red-50 text-red-600 rounded" onClick={handleDelete}>
        <Trash size={14} /> Delete
      </button>

      <div className="border-top mt-1 pt-1">
        <button className="w-full px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-100 rounded text-left" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
