'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { useIsMobile } from '@/lib/utils';
import {
  MousePointer2,
  Hand,
  PenTool,
  Combine,
  Scissors,
  Minus,
  Ruler,
  Sparkles,
  Undo2,
  Redo2,
  MessageCircle,
} from 'lucide-react';

const GROUPS = [
  [
    { icon: MousePointer2, label: 'Select', shortcut: 'V', tool: 'select' },
    { icon: Hand, label: 'Pan', shortcut: 'H', tool: 'pan' },
  ],
  [
    { icon: PenTool, label: 'Draw Area', shortcut: 'D', tool: 'draw' },
    { icon: Combine, label: 'Merge', shortcut: 'G', tool: 'merge' },
    { icon: Scissors, label: 'Split', shortcut: 'S', tool: 'split' },
    { icon: Minus, label: 'Cut', shortcut: 'C', tool: 'cut' },
  ],
  [
    { icon: Ruler, label: 'Measure', shortcut: 'M', tool: 'measure' },
    { icon: Sparkles, label: 'AI Takeoff', shortcut: 'A', tool: 'ai' },
  ],
  [
    { icon: Undo2, label: 'Undo', shortcut: 'Ctrl+Z', action: 'undo' },
    { icon: Redo2, label: 'Redo', shortcut: 'Ctrl+Y', action: 'redo' },
  ],
] as const;

export default function LeftToolbar() {
  const isMobile = useIsMobile();
  const currentTool = useStore((s) => s.currentTool);
  const setTool = useStore((s) => s.setTool);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  function onClick(btn: (typeof GROUPS)[number][number]) {
    if ('action' in btn) return btn.action === 'undo' ? undo() : redo();
    setTool((btn as any).tool);
  }

  // Mobile: horizontal bottom toolbar with sword.army dark theme
  if (isMobile) {
    return (
      <nav
        aria-label="Tool bar"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 40, // above bottom status bar (~32px)
          background: '#0a0a0f',
          borderTop: '1px solid rgba(0,212,255,0.2)',
          padding: '6px 8px',
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          zIndex: 40,
          boxShadow: '0 0 20px rgba(0,212,255,0.15)',
        }}
      >
        {GROUPS.flat().map((b) => {
          const active = 'tool' in b && currentTool === (b as any).tool;
          return (
            <button
              key={b.label}
              aria-label={`${b.label} (${b.shortcut})`}
              title={`${b.label} (${b.shortcut})`}
              onClick={() => onClick(b as any)}
              style={{
                minWidth: 44,
                height: 44,
                background: '#12121a',
                color: active ? '#00d4ff' : '#b9bedc',
                border: `1px solid ${active ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.15)'}`,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 auto',
                boxShadow: active ? '0 0 10px rgba(0,212,255,0.25) inset' : 'none',
              }}
            >
              <b.icon size={20} />
            </button>
          );
        })}
      </nav>
    );
  }

  // Desktop/Tablet: vertical sidebar, sword.army dark theme
  return (
    <aside
      aria-label="Tool sidebar"
      style={{
        width: 54,
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        borderRight: '1px solid rgba(0,212,255,0.2)',
        boxShadow: '0 0 20px rgba(0,212,255,0.12)',
      }}
    >
      {GROUPS.map((grp, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div style={{ width: 34, height: 1, background: 'rgba(0,212,255,0.15)', margin: '10px 0' }} />}
          {grp.map((b) => {
            const active = 'tool' in b && currentTool === (b as any).tool;
            return (
              <button
                key={b.label}
                aria-label={`${b.label} (${b.shortcut})`}
                title={`${b.label} (${b.shortcut})`}
                onClick={() => onClick(b as any)}
                style={{
                  width: 36,
                  height: 36,
                  margin: '6px 0',
                  background: '#12121a',
                  color: active ? '#00d4ff' : '#b9bedc',
                  border: `1px solid ${active ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.15)'}`,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: active ? '0 0 10px rgba(0,212,255,0.22) inset' : 'none',
                }}
              >
                <b.icon size={20} />
              </button>
            );
          })}
        </React.Fragment>
      ))}
      <div style={{ flexGrow: 1 }} />
      <button
        aria-label="Open chat"
        title="Chat"
        style={{
          width: 36,
          height: 36,
          margin: '10px 0',
          background: '#12121a',
          color: '#b9bedc',
          border: '1px solid rgba(0,212,255,0.15)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MessageCircle size={20} />
      </button>
    </aside>
  );
}
