'use client';

import React from 'react';
import { useStore, type Tool } from '@/lib/store';
import {
  MousePointer2,
  Hand,
  PenTool,
  Ruler,
  Sparkles,
} from 'lucide-react';

const MOBILE_TOOLS: { icon: typeof MousePointer2; label: string; tool: Tool }[] = [
  { icon: MousePointer2, label: 'Select', tool: 'select' },
  { icon: Hand, label: 'Pan', tool: 'pan' },
  { icon: PenTool, label: 'Draw', tool: 'draw' },
  { icon: Ruler, label: 'Measure', tool: 'measure' },
  { icon: Sparkles, label: 'AI Takeoff', tool: 'ai' },
];

export default function MobileToolbar() {
  const currentTool = useStore((s) => s.currentTool);
  const setTool = useStore((s) => s.setTool);

  return (
    <nav
      aria-label="Mobile toolbar"
      data-testid="mobile-toolbar"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40"
      style={{
        background: 'rgba(10, 10, 15, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(0,212,255,0.2)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '6px 8px 8px',
          gap: 4,
        }}
      >
        {MOBILE_TOOLS.map((b) => {
          const active = currentTool === b.tool;
          return (
            <button
              key={b.tool}
              aria-label={b.label}
              aria-pressed={active}
              onClick={() => setTool(b.tool)}
              style={{
                minWidth: 56,
                minHeight: 44,
                height: 52,
                flex: '1 1 0',
                maxWidth: 80,
                background: active ? 'rgba(0,212,255,0.14)' : 'transparent',
                color: active ? '#4ce6ff' : '#b9bedc',
                border: active ? '1px solid rgba(0,212,255,0.6)' : '1px solid transparent',
                borderRadius: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                boxShadow: active ? '0 0 12px rgba(0,212,255,0.32) inset, 0 0 10px rgba(0,212,255,0.2)' : 'none',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <b.icon size={20} aria-hidden="true" />
              <span
                style={{
                  fontSize: 10,
                  lineHeight: '12px',
                  fontWeight: 600,
                  color: active ? '#7defff' : '#9ea6c7',
                  whiteSpace: 'nowrap',
                }}
              >
                {b.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
