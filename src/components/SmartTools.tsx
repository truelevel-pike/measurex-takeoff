'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import type { LucideIcon } from 'lucide-react';
import {
  DoorOpen,
  Axis3D,
  ClipboardPaste,
  Repeat,
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
  const scale = useStore((s) => s.scale);
  const addClassification = useStore((s) => s.addClassification);
  const addPolygon = useStore((s) => s.addPolygon);
  const updatePolygon = useStore((s) => s.updatePolygon);
  const currentPage = useStore((s) => s.currentPage);

  const [doorWidth, setDoorWidth] = useState(DEFAULT_DOOR_WIDTH);
  const [windowWidth, setWindowWidth] = useState(DEFAULT_WINDOW_WIDTH);
  const [lastAction, setLastAction] = useState<(() => void) | null>(null);
  const [lastActionLabel, setLastActionLabel] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string>('');

  // Track last action for Repeat
  const recordAction = useCallback((label: string, fn: () => void) => {
    setLastAction(() => fn);
    setLastActionLabel(label);
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
    const ppu = scale?.pixelsPerUnit ?? 1;

    // Count doors and windows from count-type polygons on current page
    let doorCount = 0;
    let windowCount = 0;
    for (const p of polygons) {
      if (p.pageNumber !== currentPage) continue;
      const cls = doorClassifications.find((c) => c.id === p.classificationId);
      if (cls) doorCount++;
      const wcls = windowClassifications.find((c) => c.id === p.classificationId);
      if (wcls) windowCount++;
    }

    const totalDeduction = doorCount * doorWidth + windowCount * windowWidth;

    // Update each wall polygon's linearFeet
    let updated = 0;
    for (const wp of polygons) {
      if (wp.pageNumber !== currentPage) continue;
      const cls = wallClassifications.find((c) => c.id === wp.classificationId);
      if (!cls) continue;
      // Proportionally deduct from each wall segment
      const wallPolygons = polygons.filter(
        (p) => p.pageNumber === currentPage && wallClassifications.some((wc) => wc.id === p.classificationId)
      );
      const share = wallPolygons.length > 0 ? totalDeduction / wallPolygons.length : 0;
      const newLf = Math.max(0, wp.linearFeet - share);
      updatePolygon(wp.id, { linearFeet: newLf });
      updated++;
    }

    showStatus(`Backed out ${doorCount} doors, ${windowCount} windows (−${totalDeduction.toFixed(1)} ft) from ${updated} wall segments`);
    recordAction('Backout Doors/Windows', handleBackout);
  }, [polygons, wallClassifications, doorClassifications, windowClassifications, doorWidth, windowWidth, currentPage, scale, updatePolygon, showStatus, recordAction]);

  // --- Tool: Auto-classify Wall Centerline ---
  const handleWallCenterline = useCallback(() => {
    const wallPolys = polygons.filter(
      (p) => p.pageNumber === currentPage && wallClassifications.some((wc) => wc.id === p.classificationId)
    );

    if (wallPolys.length === 0) {
      showStatus('No wall polygons found on this page');
      return;
    }

    // Create or find "Wall Centerline" classification
    const clsId = addClassification({
      name: 'Wall Centerline',
      color: '#f59e0b',
      type: 'linear',
    });

    // Re-assign wall polygons to the Wall Centerline classification
    let totalLf = 0;
    for (const wp of wallPolys) {
      updatePolygon(wp.id, { classificationId: clsId });
      totalLf += wp.linearFeet;
    }

    showStatus(`Wall Centerline: ${wallPolys.length} segments, ${totalLf.toFixed(1)} LF total`);
    recordAction('Auto-classify Wall Centerline', handleWallCenterline);
  }, [polygons, wallClassifications, currentPage, addClassification, updatePolygon, showStatus, recordAction]);

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
          // Offset points to current page context (simple 10px nudge to avoid overlap)
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
      recordAction('Smart Paste', handleSmartPaste);
    } catch {
      showStatus('Smart Paste: no valid data in clipboard');
    }
  }, [currentPage, addPolygon, showStatus, recordAction]);

  // --- Tool: Repeat Last Action ---
  const handleRepeat = useCallback(() => {
    if (lastAction) {
      lastAction();
      showStatus(`Repeated: ${lastActionLabel}`);
    }
  }, [lastAction, lastActionLabel, showStatus]);

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
            Door: <input
              type="number"
              value={doorWidth}
              onChange={(e) => setDoorWidth(Number(e.target.value) || 0)}
              style={{ width: 36, background: '#1a1a2e', color: '#b9bedc', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 4, padding: '1px 3px', fontSize: 10 }}
            /> ft
          </label>
          <label>
            Win: <input
              type="number"
              value={windowWidth}
              onChange={(e) => setWindowWidth(Number(e.target.value) || 0)}
              style={{ width: 36, background: '#1a1a2e', color: '#b9bedc', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 4, padding: '1px 3px', fontSize: 10 }}
            /> ft
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
        icon={Repeat}
        label="Repeat Last"
        tooltip="Repeat the last smart tool action"
        disabled={!lastAction}
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
