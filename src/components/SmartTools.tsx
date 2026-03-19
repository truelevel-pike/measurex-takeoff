'use client';

import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import type { LucideIcon } from 'lucide-react';
import {
  DoorOpen,
  Axis3D,
  ClipboardPaste,
  Repeat,
  Boxes,
} from 'lucide-react';

// Configurable standard widths (in feet)
const DEFAULT_DOOR_WIDTH = 3;
const DEFAULT_WINDOW_WIDTH = 3;

const toolBtnBase: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: '#12121a',
  color: '#b9bedc',
  border: '1px solid rgba(0,212,255,0.15)',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  fontSize: 12,
  textAlign: 'left',
};

const disabledStyle: React.CSSProperties = {
  opacity: 0.4,
  cursor: 'not-allowed',
};

interface SmartToolBtnProps {
  icon: LucideIcon;
  label: string;
  tooltip: string;
  disabled: boolean;
  onClick: () => void;
  shortcut?: string;
}

function SmartToolBtn({ icon: Icon, label, tooltip, disabled, onClick, shortcut }: SmartToolBtnProps) {
  return (
    <button
      title={tooltip}
      aria-label={tooltip}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{ ...toolBtnBase, ...(disabled ? disabledStyle : {}) }}
    >
      <Icon size={16} />
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 10, color: '#666', fontFamily: 'monospace' }}>{shortcut}</span>
      )}
    </button>
  );
}

export default function SmartTools() {
  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const addClassification = useStore((s) => s.addClassification);
  const addPolygon = useStore((s) => s.addPolygon);
  const updatePolygon = useStore((s) => s.updatePolygon);
  const updateClassification = useStore((s) => s.updateClassification);
  const currentPage = useStore((s) => s.currentPage);

  const [doorWidth, setDoorWidth] = useState(DEFAULT_DOOR_WIDTH);
  const [windowWidth, setWindowWidth] = useState(DEFAULT_WINDOW_WIDTH);
  const [statusMsg, setStatusMsg] = useState<string>('');

  // Track last action for Repeat via refs
  const lastActionRef = useRef<(() => void) | null>(null);
  const lastActionLabelRef = useRef<string>('');
  const [hasLastAction, setHasLastAction] = useState(false);

  // Stable impl refs — updated via useLayoutEffect after each render
  const backoutRef = useRef<(() => void) | null>(null);
  const wallCenterlineRef = useRef<(() => void) | null>(null);
  const smartPasteRef = useRef<(() => Promise<void>) | null>(null);

  const recordAction = useCallback((label: string, fn: () => void) => {
    lastActionRef.current = fn;
    lastActionLabelRef.current = label;
    setHasLastAction(true);
  }, []);

  const showStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 3000);
  }, []);

  // --- Derived state ---
  const wallClassifications = classifications.filter(
    (c) => c.type === 'linear' && /wall/i.test(c.name)
  );
  const hasWalls = wallClassifications.length > 0;

  const doorClassifications = classifications.filter(
    (c) => c.type === 'count' && /door/i.test(c.name)
  );
  const windowClassifications = classifications.filter(
    (c) => c.type === 'count' && /window/i.test(c.name)
  );

  // --- Tool: Backout Doors/Windows ---
  const handleBackout = useCallback(() => {
    let doorCount = 0;
    let windowCount = 0;
    for (const p of polygons) {
      if (p.pageNumber !== currentPage) continue;
      if (doorClassifications.some((c) => c.id === p.classificationId)) doorCount++;
      if (windowClassifications.some((c) => c.id === p.classificationId)) windowCount++;
    }

    const totalDeduction = doorCount * doorWidth + windowCount * windowWidth;
    if (totalDeduction === 0) {
      showStatus('No doors or windows found on this page to back out');
      return;
    }

    const parts: string[] = [];
    if (doorCount > 0) parts.push(`Doors: ${doorCount}x${doorWidth}ft`);
    if (windowCount > 0) parts.push(`Windows: ${windowCount}x${windowWidth}ft`);
    const deductionLabel = `Door/Window Backout (${parts.join(', ')})`;

    let updated = 0;
    for (const wc of wallClassifications) {
      const hasPolygonsOnPage = polygons.some(
        (p) => p.classificationId === wc.id && p.pageNumber === currentPage
      );
      if (!hasPolygonsOnPage) continue;
      const existing = (wc.deductions ?? []).filter(
        (d) => !d.label.startsWith('Door/Window Backout')
      );
      updateClassification(wc.id, {
        deductions: [...existing, { label: deductionLabel, quantity: totalDeduction }],
      });
      updated++;
    }

    showStatus(`Backed out ${doorCount} doors, ${windowCount} windows (-${totalDeduction.toFixed(1)} ft) from ${updated} wall classifications`);
    recordAction('Backout Doors/Windows', () => { backoutRef.current?.(); });
  }, [polygons, wallClassifications, doorClassifications, windowClassifications, doorWidth, windowWidth, currentPage, updateClassification, showStatus, recordAction]);

  useLayoutEffect(() => { backoutRef.current = handleBackout; }, [handleBackout]);

  // --- Tool: Auto-classify Wall Centerline ---
  const handleWallCenterline = useCallback(() => {
    const wallPolys = polygons.filter(
      (p) => p.pageNumber === currentPage && wallClassifications.some((wc) => wc.id === p.classificationId)
    );

    if (wallPolys.length === 0) {
      showStatus('No wall polygons found on this page');
      return;
    }

    const clsId = addClassification({
      name: 'Wall Centerline',
      color: '#f59e0b',
      type: 'linear',
    });

    let totalLf = 0;
    for (const wp of wallPolys) {
      updatePolygon(wp.id, { classificationId: clsId });
      totalLf += wp.linearFeet;
    }

    showStatus(`Wall Centerline: ${wallPolys.length} segments, ${totalLf.toFixed(1)} LF total`);
    recordAction('Auto-classify Wall Centerline', () => { wallCenterlineRef.current?.(); });
  }, [polygons, wallClassifications, currentPage, addClassification, updatePolygon, showStatus, recordAction]);

  useLayoutEffect(() => { wallCenterlineRef.current = handleWallCenterline; }, [handleWallCenterline]);

  // --- Tool: Smart Paste ---
  const handleSmartPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        showStatus('Clipboard does not contain valid classification data');
        return;
      }

      let pasted = 0;
      for (const item of data) {
        if (item.points && item.classificationId) {
          const offsetPoints = item.points.map((p: { x: number; y: number }) => ({
            x: p.x + 10,
            y: p.y + 10,
          }));
          addPolygon({
            points: offsetPoints,
            classificationId: item.classificationId,
            pageNumber: currentPage,
            area: item.area ?? 0,
            linearFeet: item.linearFeet ?? 0,
            label: item.label,
          });
          pasted++;
        }
      }

      showStatus(`Smart Paste: ${pasted} classification(s) pasted to page ${currentPage}`);
      recordAction('Smart Paste', () => { void smartPasteRef.current?.(); });
    } catch {
      showStatus('Smart Paste: no valid data in clipboard');
    }
  }, [currentPage, addPolygon, showStatus, recordAction]);

  useLayoutEffect(() => { smartPasteRef.current = handleSmartPaste; }, [handleSmartPaste]);

  // --- Tool: Repeat Last Action ---
  const handleRepeat = useCallback(() => {
    if (lastActionRef.current) {
      lastActionRef.current();
      showStatus(`Repeated: ${lastActionLabelRef.current}`);
    }
  }, [showStatus]);

  // Keyboard shortcut: Shift+R for repeat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'R' && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        handleRepeat();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleRepeat]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SmartToolBtn
        icon={DoorOpen}
        label="Backout Doors/Windows"
        tooltip="Subtract door/window widths from wall linear footage"
        disabled={!hasWalls}
        onClick={handleBackout}
      />

      {hasWalls && (
        <div style={{ display: 'flex', gap: 4, padding: '0 4px', fontSize: 10, color: '#888' }}>
          <label>
            Door:{' '}
            <input
              type="number"
              value={doorWidth}
              onChange={(e) => setDoorWidth(Number(e.target.value) || 0)}
              style={{ width: 36, background: '#1a1a2e', color: '#b9bedc', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 4, padding: '1px 3px', fontSize: 10 }}
            />{' '}
            ft
          </label>
          <label>
            Win:{' '}
            <input
              type="number"
              value={windowWidth}
              onChange={(e) => setWindowWidth(Number(e.target.value) || 0)}
              style={{ width: 36, background: '#1a1a2e', color: '#b9bedc', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 4, padding: '1px 3px', fontSize: 10 }}
            />{' '}
            ft
          </label>
        </div>
      )}

      <SmartToolBtn
        icon={Axis3D}
        label="Wall Centerline"
        tooltip="Auto-classify all wall segments as Wall Centerline"
        disabled={!hasWalls}
        onClick={handleWallCenterline}
      />

      <SmartToolBtn
        icon={ClipboardPaste}
        label="Smart Paste"
        tooltip="Paste classifications from clipboard, auto-adjusting to current page"
        disabled={false}
        onClick={handleSmartPaste}
      />

      <SmartToolBtn
        icon={Boxes}
        label="Pattern Search"
        tooltip="Find all instances of a symbol using AI vision"
        disabled={false}
        onClick={() => window.dispatchEvent(new CustomEvent('open-pattern-search'))}
        shortcut="Shift+P"
      />

      <SmartToolBtn
        icon={Repeat}
        label="Repeat Last"
        tooltip="Repeat the last smart tool action"
        disabled={!hasLastAction}
        onClick={handleRepeat}
        shortcut="Shift+R"
      />

      {statusMsg && (
        <div style={{ fontSize: 10, color: '#00d4ff', padding: '4px 6px', background: 'rgba(0,212,255,0.08)', borderRadius: 6 }}>
          {statusMsg}
        </div>
      )}
    </div>
  );
}
