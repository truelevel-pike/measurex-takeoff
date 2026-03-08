'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/lib/utils';

interface BottomStatusBarProps {
  onScaleClick?: () => void;
  zoomPercent?: number;
  cursor?: { x: number; y: number } | null;
  activeToolName?: string;
}

const BottomStatusBar: React.FC<BottomStatusBarProps> = ({ onScaleClick, zoomPercent, cursor, activeToolName }) => {
  const scale = useStore((s) => s.scale);
  const currentPage = useStore((s) => s.currentPage);
  const totalPages = useStore((s) => (s as any).totalPages || 0);
  const isMobile = useIsMobile();

  const scaleText = scale ? scale.label : '';

  return (
    <div
      className="flex items-center h-8 px-3 border-t text-xs gap-4 shrink-0"
      style={{
        background: 'rgba(10,10,15,0.92)',
        color: '#8892a0',
        borderColor: 'rgba(0,212,255,0.2)',
        boxShadow: '0 0 20px rgba(0,212,255,0.12)',
        maxHeight: 32,
      }}
      aria-label="Bottom status bar"
    >
      <button
        onClick={onScaleClick}
        aria-label={scale ? 'Change scale' : 'Set scale'}
        className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 font-mono tracking-wider"
        style={{
          background: scaleText ? 'rgba(0,255,136,0.08)' : 'rgba(255,107,53,0.08)',
          border: `1px solid ${scaleText ? 'rgba(0,255,136,0.35)' : 'rgba(255,107,53,0.35)'}`,
          color: scaleText ? '#e3fff2' : '#ffd9cc',
          boxShadow: scaleText ? '0 0 10px rgba(0,255,136,0.18)' : '0 0 8px rgba(255,107,53,0.14)',
        }}
      >
        {scaleText ? (
          <span>Scale: {scaleText}</span>
        ) : (
          <>
            <AlertTriangle size={12} color="#ff6b35" /> <span>No scale — tap to set</span>
          </>
        )}
      </button>

      <div className="w-[1px] h-4" style={{ background: 'rgba(168,85,247,0.2)' }} />

      {typeof currentPage === 'number' && (
        <span className="font-mono tracking-wider" aria-label="Sheet indicator" style={{ color: '#e0e0e0' }}>
          Sheet {currentPage}{totalPages ? ` / ${totalPages}` : ''}
        </span>
      )}

      <div className="flex-1" />

      {/* Mobile: hide cursor coords */}
      {!isMobile && cursor && (
        <>
          <div className="w-[1px] h-4" style={{ background: 'rgba(168,85,247,0.2)' }} />
          <span className="font-mono" aria-label="Cursor coordinates" style={{ color: '#e0e0e0' }}>
            ({Math.round(cursor.x)}, {Math.round(cursor.y)})
          </span>
        </>
      )}

      {typeof zoomPercent === 'number' && (
        <>
          <div className="w-[1px] h-4" style={{ background: 'rgba(168,85,247,0.2)' }} />
          <span className="font-mono" aria-label="Zoom percent" style={{ color: '#e0e0e0' }}>{Math.round(zoomPercent)}%</span>
        </>
      )}

      {activeToolName && (
        <>
          <div className="w-[1px] h-4" style={{ background: 'rgba(168,85,247,0.2)' }} />
          <span className="font-mono" aria-label="Active tool" style={{ color: '#e0e0e0' }}>{activeToolName}</span>
        </>
      )}
    </div>
  );
};

export default BottomStatusBar;
