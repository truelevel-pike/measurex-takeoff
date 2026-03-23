'use client';

import React from 'react';
import type { Tool } from '@/lib/store';
import type { LucideIcon } from 'lucide-react';
import {
  Combine,
  Copy,
  Trash2,
  GitMerge,
  Grid3x3,
  Magnet,
  X,
  Undo2,
  CornerDownLeft,
} from 'lucide-react';

export interface ContextToolbarProps {
  selectedPolygonIds: string[];
  currentTool: Tool;
  snappingEnabled: boolean;
  gridEnabled: boolean;
  onCombine: () => void;
  onMergeLines: () => void;
  onDeleteSelected: () => void;
  onToggleSnapping: () => void;
  onToggleGrid: () => void;
  onCloseShape?: () => void;
  onUndoLastPoint?: () => void;
  onClearDraw?: () => void;
  onClearMeasurement?: () => void;
  onDuplicate?: () => void;
  hasPolygons?: boolean;
}

function PillButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  active,
  danger,
  'data-testid': dataTestId,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  'data-testid'?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={dataTestId}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap"
      style={{
        background: active
          ? 'rgba(0,212,255,0.15)'
          : danger
            ? 'rgba(239,68,68,0.12)'
            : 'rgba(255,255,255,0.06)',
        color: active ? '#00d4ff' : danger ? '#f87171' : '#d1d5db',
        border: `1px solid ${
          active
            ? 'rgba(0,212,255,0.4)'
            : danger
              ? 'rgba(239,68,68,0.3)'
              : 'rgba(255,255,255,0.1)'
        }`,
      }}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
      {shortcut && (
        <span
          className="text-[10px] opacity-50 ml-0.5"
          style={{ fontFamily: 'monospace' }}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}

export default function ContextToolbar({
  selectedPolygonIds,
  currentTool,
  snappingEnabled,
  gridEnabled,
  onCombine,
  onMergeLines,
  onDeleteSelected,
  onToggleSnapping,
  onToggleGrid,
  onCloseShape,
  onUndoLastPoint,
  onClearDraw,
  onClearMeasurement,
  onDuplicate,
  hasPolygons = false,
}: ContextToolbarProps) {
  const selCount = selectedPolygonIds.length;
  const showSelection = selCount > 0;
  const showDraw = currentTool === 'draw';
  const showMeasure = currentTool === 'measure';
  const showAlways = hasPolygons || selCount > 0;

  // Hide if nothing to show
  if (!showSelection && !showDraw && !showMeasure && !showAlways) return null;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 overflow-x-auto"
      style={{
        background: '#1a1a2e',
        borderTop: '1px solid rgba(0,212,255,0.15)',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.3)',
      }}
      aria-label="Context toolbar"
    >
      {/* Selection: 1 polygon */}
      {selCount === 1 && (
        <>
          <PillButton icon={Combine} label="Combine" shortcut="⌘B" onClick={onCombine} />
          {onDuplicate && (
            <PillButton icon={Copy} label="Duplicate" shortcut="⌘D" onClick={onDuplicate} />
          )}
          <PillButton icon={Trash2} label="Delete" shortcut="Del" onClick={onDeleteSelected} danger />
        </>
      )}

      {/* Selection: 2+ polygons */}
      {selCount >= 2 && (
        <>
          <PillButton icon={Combine} label="Combine" shortcut="⌘B" onClick={onCombine} />
          <PillButton icon={GitMerge} label="Merge Lines" shortcut="⌘X" onClick={onMergeLines} />
          <PillButton
            icon={Trash2}
            label={`Delete ${selCount}`}
            shortcut="Del"
            onClick={onDeleteSelected}
            danger
          />
        </>
      )}

      {/* Draw tool active */}
      {showDraw && (
        <>
          {selCount > 0 && (
            <div className="w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} />
          )}
          {onCloseShape && (
            <PillButton icon={CornerDownLeft} label="Close Shape" shortcut="Enter" onClick={onCloseShape} />
          )}
          {onUndoLastPoint && (
            <PillButton icon={Undo2} label="Undo Point" shortcut="⌘Z" onClick={onUndoLastPoint} />
          )}
          {onClearDraw && (
            <PillButton icon={X} label="Clear" shortcut="Esc" onClick={onClearDraw} />
          )}
        </>
      )}

      {/* Measure tool active */}
      {showMeasure && onClearMeasurement && (
        <>
          {selCount > 0 && (
            <div className="w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} />
          )}
          <PillButton icon={X} label="Clear Measurement" onClick={onClearMeasurement} />
        </>
      )}

      {/* Always visible when polygons exist */}
      {showAlways && (
        <>
          <div className="flex-1" />
          <PillButton
            icon={Grid3x3}
            label="Grid"
            onClick={onToggleGrid}
            active={gridEnabled}
          />
          <PillButton
            icon={Magnet}
            label="Snap"
            onClick={onToggleSnapping}
            active={snappingEnabled}
            data-testid="snapping-toggle"
          />
        </>
      )}
    </div>
  );
}
