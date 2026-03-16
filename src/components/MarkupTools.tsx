'use client';

import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Type,
  ArrowUpRight,
  MessageSquare,
  Ruler,
  Square,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { useStore } from '@/lib/store';

interface MarkupToolsProps {
  onClose: () => void;
}

type MarkupToolType = 'text' | 'arrow' | 'cloud' | 'dimension' | 'highlight' | 'freehand';

const TOOLS: { type: MarkupToolType; icon: LucideIcon; label: string }[] = [
  { type: 'text', icon: Type, label: 'Text' },
  { type: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
  { type: 'cloud', icon: MessageSquare, label: 'Cloud' },
  { type: 'dimension', icon: Ruler, label: 'Dimension' },
  { type: 'highlight', icon: Square, label: 'Highlight' },
  { type: 'freehand', icon: Pencil, label: 'Freehand' },
];

const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#a855f7', // purple
];

const STROKE_WIDTHS = [
  { value: 1, label: 'Thin' },
  { value: 3, label: 'Medium' },
  { value: 6, label: 'Thick' },
];

export default function MarkupTools({ onClose }: MarkupToolsProps) {
  const showMarkups = useStore((s) => s.showMarkups);
  const toggleShowMarkups = useStore((s) => s.toggleShowMarkups);
  const clearMarkups = useStore((s) => s.clearMarkups);

  const [activeTool, setActiveTool] = useState<MarkupToolType>('text');
  const [activeColor, setActiveColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(3);

  function handleClearAll() {
    if (window.confirm('Clear all markups on every page?')) {
      clearMarkups();
    }
  }

  return (
    <div className="fixed bottom-16 left-16 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-40 p-3 w-72">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-200 tracking-wide">MARKUP TOOLS</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 p-0.5 rounded hover:bg-gray-800"
          aria-label="Close markup tools"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tool buttons */}
      <div className="flex gap-1.5 mb-3">
        {TOOLS.map(({ type, icon: Icon, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => setActiveTool(type)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${
              activeTool === type
                ? 'bg-gray-800 border border-emerald-500 text-emerald-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'
            }`}
            title={label}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Color picker */}
      <div className="mb-3">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Color</span>
        <div className="flex gap-2">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setActiveColor(color)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${
                activeColor === color ? 'border-white scale-110' : 'border-gray-600 hover:border-gray-400'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Color ${color}`}
            />
          ))}
        </div>
      </div>

      {/* Stroke width */}
      <div className="mb-3">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Stroke</span>
        <div className="flex gap-2">
          {STROKE_WIDTHS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStrokeWidth(value)}
              className={`flex-1 text-[11px] py-1 rounded transition-colors ${
                strokeWidth === value
                  ? 'bg-gray-700 text-gray-100 border border-emerald-500'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleShowMarkups}
          className="flex-1 flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
        >
          {showMarkups ? <Eye size={13} /> : <EyeOff size={13} />}
          {showMarkups ? 'Hide' : 'Show'} Annotations
        </button>
        <button
          type="button"
          onClick={handleClearAll}
          className="flex items-center justify-center gap-1.5 text-[11px] py-1.5 px-3 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 size={13} />
          Clear All
        </button>
      </div>
    </div>
  );
}
