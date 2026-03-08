'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/lib/utils';
import { useStore } from '@/lib/store';
import {
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  MessageSquare,
  List,
  Grid3X3,
  GitCompare,
  Download,
  Layers,
  Save as SaveIcon,
  Loader2,
  Ellipsis,
} from 'lucide-react';

interface TopNavBarProps {
  sheetName?: string;
  pageIndex?: number;
  totalPages?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onAITakeoff?: () => void;
  aiLoading?: boolean;
  onExport?: () => void;
  onSave?: () => void;
  saving?: boolean;
  projectName?: string;
  onChat?: () => void;
}

export default function TopNavBar({
  sheetName = 'Sheet 1',
  pageIndex,
  totalPages,
  onPrev,
  onNext,
  onZoomIn,
  onZoomOut,
  onAITakeoff,
  onChat,
  aiLoading,
  onExport,
  onSave,
  saving,
  projectName,
}: TopNavBarProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const showMobileMenu = useStore((s) => (s as any).showMobileMenu ?? false);
  const setShowMobileMenu = useStore((s) => (s as any).setShowMobileMenu ?? (() => {}));

  const badge = typeof pageIndex === 'number' && typeof totalPages === 'number'
    ? isMobile
      ? `${pageIndex + 1}/${totalPages}`
      : `Page ${pageIndex + 1} of ${totalPages}`
    : sheetName;

  return (
    <div className="w-full relative">
      <header
        className="w-full backdrop-blur-sm border-b"
        style={{
          height: 52,
          background: 'rgba(10,10,15,0.9)',
          borderColor: 'rgba(0,212,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          color: '#e0e0e0',
          fontSize: 13,
          flexShrink: 0,
          boxShadow: '0 0 20px rgba(0,212,255,0.15)',
        }}
        aria-label="Top navigation bar"
      >
        {/* Left section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NavIconButton
            ariaLabel="Open projects"
            icon={<LayoutGrid size={18} />}
            tooltip="Projects"
            onClick={() => router.push('/projects')}
          />

          {/* Brand */}
          <div className="hidden md:flex items-baseline gap-2 select-none">
            <span className="font-mono tracking-wider text-white text-sm">MEASUREX</span>
            <span className="font-mono tracking-wider text-[#00d4ff] text-[10px]">TAKEOFF ENGINE</span>
          </div>

          {!isMobile && onSave && (
            <button
              aria-label={saving ? 'Saving project' : 'Save project'}
              onClick={onSave}
              disabled={saving}
              className="ml-2"
              style={{
                background: saving ? 'rgba(136,146,160,0.3)' : '#12121a',
                color: saving ? '#8892a0' : '#e0e0e0',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)')}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <SaveIcon size={14} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {projectName && !isMobile && (
            <span style={{ color: '#8892a0', fontSize: 11, marginLeft: 6 }}>{projectName}</span>
          )}
          <div style={{ width: 1, height: 24, background: 'rgba(0,212,255,0.2)', margin: '0 6px' }} />
          <NavIconButton ariaLabel="Previous sheet" icon={<ChevronLeft size={16} />} tooltip="Previous Sheet" onClick={onPrev} />
          <NavIconButton ariaLabel="Next sheet" icon={<ChevronRight size={16} />} tooltip="Next Sheet" onClick={onNext} />
          <div
            aria-label="Sheet badge"
            style={{
              background: 'rgba(0,212,255,0.1)',
              border: '1px solid rgba(0,212,255,0.35)',
              color: '#e0faff',
              padding: '4px 10px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: 0.3,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 0 12px rgba(0,212,255,0.15) inset',
            }}
          >
            <Layers size={13} />
            {badge}
          </div>
        </div>

        {/* Right section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isMobile && (
            <>
              <button
                aria-label="Run AI Takeoff"
                onClick={onAITakeoff}
                disabled={aiLoading}
                style={{
                  background: aiLoading ? 'rgba(136,146,160,0.3)' : '#12121a',
                  color: aiLoading ? '#8892a0' : '#e0faff',
                  border: '1px solid rgba(0,212,255,0.3)',
                  borderRadius: 8,
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: aiLoading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 150ms ease',
                  boxShadow: '0 0 10px rgba(0,212,255,0.12) inset',
                }}
                onMouseEnter={(e) => !aiLoading && (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)')}
              >
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {aiLoading ? 'Analyzing…' : 'AI Takeoff'}
              </button>
              <button
                aria-label="Open MX Chat"
                onClick={onChat}
                style={{
                  background: '#12121a',
                  color: '#e0e0e0',
                  border: '1px solid rgba(0,212,255,0.2)',
                  borderRadius: 8,
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)')}
              >
                <MessageSquare size={14} />
                MX Chat
              </button>
              <div style={{ width: 1, height: 24, background: 'rgba(0,212,255,0.2)', margin: '0 6px' }} />
              <NavIconButton ariaLabel="Show quantities" icon={<List size={17} />} tooltip="Quantities" />
              <NavIconButton ariaLabel="Grid view" icon={<Grid3X3 size={17} />} tooltip="Grid View" />
              <NavIconButton ariaLabel="Compare" icon={<GitCompare size={17} />} tooltip="Compare" />
              <NavIconButton ariaLabel="Export to Excel" icon={<Download size={17} />} tooltip="Export to Excel" onClick={onExport} />
            </>
          )}
          {isMobile && (
            <>
              {onSave && (
                <NavIconButton ariaLabel={saving ? 'Saving' : 'Save'} icon={saving ? <Loader2 size={16} className="animate-spin" /> : <SaveIcon size={16} />} tooltip="Save" onClick={onSave} />
              )}
              <NavIconButton ariaLabel="More" icon={<Ellipsis size={18} />} tooltip="More" onClick={() => setShowMobileMenu(!showMobileMenu)} />
            </>
          )}
        </div>
      </header>
      {/* Scanline bar */}
      <div className="scanline" style={{ height: 2, background: 'linear-gradient(90deg, rgba(0,212,255,0) 0%, rgba(0,212,255,0.6) 50%, rgba(0,212,255,0) 100%)', position: 'relative' }} />
    </div>
  );
}

function NavIconButton({ icon, tooltip, onClick, ariaLabel }: { icon: React.ReactNode; tooltip: string; onClick?: () => void; ariaLabel: string }) {
  return (
    <button
      aria-label={ariaLabel}
      title={tooltip}
      onClick={onClick}
      style={{
        background: '#12121a',
        border: '1px solid rgba(0,212,255,0.15)',
        color: '#b0dff0',
        cursor: 'pointer',
        padding: 6,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)';
        e.currentTarget.style.color = '#e0faff';
        e.currentTarget.style.boxShadow = '0 0 10px rgba(0,212,255,0.2) inset';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(0,212,255,0.15)';
        e.currentTarget.style.color = '#b0dff0';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {icon}
    </button>
  );
}
