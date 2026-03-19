'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { useStore, type Tool } from '@/lib/store';
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
  Wand2,
  ChevronUp,
} from 'lucide-react';
import SmartTools from './SmartTools';

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
  const [smartOpen, setSmartOpen] = React.useState(false);

  const smartPanelRef = useRef<HTMLDivElement>(null);
  const smartTriggerRef = useRef<HTMLButtonElement>(null);

  // Focus first interactive element in Smart Tools panel when opened
  useEffect(() => {
    if (smartOpen && smartPanelRef.current) {
      const firstFocusable = smartPanelRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, [smartOpen]);

  // Return focus to trigger on close
  const closeSmartTools = useCallback(() => {
    setSmartOpen(false);
    smartTriggerRef.current?.focus();
  }, []);

  // Escape handler for Smart Tools panel
  const handleSmartPanelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSmartTools();
      }
    },
    [closeSmartTools]
  );

  function onClick(btn: (typeof GROUPS)[number][number]) {
    if ('action' in btn) return btn.action === 'undo' ? undo() : redo();
    setTool((btn as { tool: Tool }).tool);
  }

  // Mobile: horizontal bottom toolbar with sword.army dark theme
  if (isMobile) {
    return (
      <nav
        aria-label="Tool bar"
        style={{
          background: '#0a0a0f',
          padding: '8px 8px 10px',
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {GROUPS.flat().map((b) => {
          const active = 'tool' in b && currentTool === (b as { tool: string }).tool;
          const mobileLabel = b.label === 'Draw Area' ? 'Draw' : b.label;
          return (
            <button
              key={b.label}
              aria-label={`${b.label} (${b.shortcut})`}
              aria-pressed={'tool' in b ? active : undefined}
              title={`${b.label} (${b.shortcut})`}
              onClick={() => onClick(b as (typeof GROUPS)[number][number])}
              style={{
                minWidth: 62,
                height: 54,
                background: active ? 'rgba(0,212,255,0.14)' : '#12121a',
                color: active ? '#4ce6ff' : '#b9bedc',
                border: `1px solid ${active ? 'rgba(0,212,255,0.6)' : 'rgba(0,212,255,0.15)'}`,
                borderRadius: 11,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                flex: '0 0 auto',
                boxShadow: active ? '0 0 12px rgba(0,212,255,0.32) inset, 0 0 10px rgba(0,212,255,0.2)' : 'none',
                touchAction: 'manipulation',
              }}
            >
              <b.icon size={18} aria-hidden="true" />
              <span
                style={{
                  fontSize: 10,
                  lineHeight: '10px',
                  fontWeight: 600,
                  color: active ? '#7defff' : '#9ea6c7',
                  whiteSpace: 'nowrap',
                }}
              >
                {mobileLabel}
              </span>
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
          {gi > 0 && <div style={{ width: 34, height: 1, background: 'rgba(0,212,255,0.15)', margin: '10px 0' }} aria-hidden="true" />}
          {grp.map((b) => {
            const active = 'tool' in b && currentTool === (b as { tool: string }).tool;
            return (
              <button
                key={b.label}
                aria-label={`${b.label} (${b.shortcut})`}
                aria-pressed={'tool' in b ? active : undefined}
                title={`${b.label} (${b.shortcut})`}
                onClick={() => onClick(b as (typeof GROUPS)[number][number])}
                style={{
                  width: 36,
                  height: 36,
                  margin: '6px 0',
                  background: active ? '#2563eb' : '#12121a',
                  color: active ? '#ffffff' : '#b9bedc',
                  border: `1px solid ${active ? '#3b82f6' : 'rgba(0,212,255,0.15)'}`,
                  borderLeft: active ? '3px solid #60a5fa' : '1px solid rgba(0,212,255,0.15)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: active ? '0 0 12px rgba(59,130,246,0.5), 0 0 4px rgba(59,130,246,0.3) inset' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <b.icon size={20} aria-hidden="true" />
                <span className="sr-only">{b.label}</span>
              </button>
            );
          })}
        </React.Fragment>
      ))}
      {/* Smart Tools section */}
      <div style={{ width: 34, height: 1, background: 'rgba(0,212,255,0.15)', margin: '10px 0' }} aria-hidden="true" />
      <button
        ref={smartTriggerRef}
        aria-label="Smart Tools"
        aria-expanded={smartOpen}
        title="Smart Tools"
        onClick={() => setSmartOpen((o) => !o)}
        style={{
          width: 36,
          height: 36,
          margin: '6px 0',
          background: smartOpen ? 'rgba(0,212,255,0.12)' : '#12121a',
          color: smartOpen ? '#00d4ff' : '#b9bedc',
          border: `1px solid ${smartOpen ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.15)'}`,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: smartOpen ? '0 0 10px rgba(0,212,255,0.22) inset' : 'none',
        }}
      >
        <Wand2 size={20} aria-hidden="true" />
        <span className="sr-only">Smart Tools</span>
      </button>
      {smartOpen && (
        <div
          ref={smartPanelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="smart-tools-heading"
          onKeyDown={handleSmartPanelKeyDown}
          style={{
            position: 'absolute',
            left: 58,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 220,
            background: '#0a0a0f',
            border: '1px solid rgba(0,212,255,0.25)',
            borderRadius: 10,
            padding: 10,
            zIndex: 50,
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span id="smart-tools-heading" style={{ fontSize: 12, fontWeight: 600, color: '#00d4ff' }}>Smart Tools</span>
            <button
              onClick={closeSmartTools}
              aria-label="Close Smart Tools"
              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}
            >
              <ChevronUp size={14} aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          <SmartTools />
        </div>
      )}

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
        <MessageCircle size={20} aria-hidden="true" />
        <span className="sr-only">Open chat</span>
      </button>
    </aside>
  );
}
