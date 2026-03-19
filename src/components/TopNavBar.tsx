'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile, useIsTablet } from '@/lib/utils';
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
  Search,
  Save as SaveIcon,
  Loader2,
  Ellipsis,
  Menu,
  PanelRightOpen,
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
  onToggleImageSearch?: () => void;
  onCompare?: () => void;
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
  onToggleImageSearch,
  onCompare,
  aiLoading,
  onExport,
  onSave,
  saving,
  projectName,
}: TopNavBarProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const showMobileMenu = useStore((s) => (s as { showMobileMenu?: boolean }).showMobileMenu ?? false);
  const setShowMobileMenu = useStore((s) => (s as { setShowMobileMenu?: (v: boolean) => void }).setShowMobileMenu ?? (() => {}));
  const showQuantitiesDrawer = useStore((s) => s.showQuantitiesDrawer);
  const setShowQuantitiesDrawer = useStore((s) => s.setShowQuantitiesDrawer);

  // Prefer the auto-detected sheet name (e.g. "A1.00 — FLOOR PLAN") over generic "Page X of Y"
  const hasRealSheetName = sheetName && !sheetName.startsWith('Page ') && sheetName !== 'Sheet 1';
  const badge = typeof pageIndex === 'number' && typeof totalPages === 'number'
    ? hasRealSheetName
      ? isMobile
        ? `${sheetName} (${pageIndex + 1}/${totalPages})`
        : `${sheetName} · ${pageIndex + 1}/${totalPages}`
      : isMobile
        ? `${pageIndex + 1}/${totalPages}`
        : `Page ${pageIndex + 1} of ${totalPages}`
    : sheetName;

  // Close mobile menu on Escape
  function handleHeaderKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape' && showMobileMenu) {
      setShowMobileMenu(false);
    }
  }

  return (
    <div className="w-full relative">
      <header
        className="w-full backdrop-blur-sm border-b"
        role="banner"
        onKeyDown={handleHeaderKeyDown}
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
            icon={<LayoutGrid size={18} aria-hidden="true" />}
            srLabel="Open projects"
            tooltip="Projects"
            onClick={() => router.push('/projects')}
          />

          {/* Brand */}
          <div className="hidden md:flex items-baseline gap-2 select-none" aria-label="MeasureX Takeoff Engine">
            <span className="font-mono tracking-wider text-white text-sm">MEASUREX</span>
            <span className="font-mono tracking-wider text-[#00d4ff] text-[10px]">TAKEOFF ENGINE</span>
          </div>

          {!isMobile && onSave && (
            <button
              aria-label={saving ? 'Saving project, please wait' : 'Save project'}
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
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <SaveIcon size={14} aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {projectName && !isMobile && (
            <span style={{ color: '#8892a0', fontSize: 11, marginLeft: 6 }} aria-label={`Project: ${projectName}`}>{projectName}</span>
          )}
          <div style={{ width: 1, height: 24, background: 'rgba(0,212,255,0.2)', margin: '0 6px' }} role="separator" aria-hidden="true" />
          <NavIconButton ariaLabel="Previous sheet" srLabel="Previous sheet" icon={<ChevronLeft size={16} aria-hidden="true" />} tooltip="Previous Sheet" onClick={onPrev} />
          <NavIconButton ariaLabel="Next sheet" srLabel="Next sheet" icon={<ChevronRight size={16} aria-hidden="true" />} tooltip="Next Sheet" onClick={onNext} />
          <div
            aria-label={`Current sheet: ${badge}`}
            role="status"
            aria-live="polite"
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
            <Layers size={13} aria-hidden="true" />
            {badge}
          </div>
        </div>

        {/* Right section */}
        <nav aria-label="Actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isMobile && (
            <>
              <button
                aria-label={aiLoading ? 'AI Takeoff running, please wait' : 'Run AI Takeoff'}
                aria-busy={aiLoading}
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
                {aiLoading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
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
                <MessageSquare size={14} aria-hidden="true" />
                MX Chat
              </button>
              <button
                aria-label="Toggle AI Image Search"
                onClick={onToggleImageSearch}
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
                <Search size={14} aria-hidden="true" />
                Image Search
              </button>
              <div style={{ width: 1, height: 24, background: 'rgba(0,212,255,0.2)', margin: '0 6px' }} role="separator" aria-hidden="true" />
              <NavIconButton ariaLabel="Show quantities" srLabel="Show quantities" icon={<List size={17} aria-hidden="true" />} tooltip="Quantities" />
              <NavIconButton ariaLabel="Grid view" srLabel="Grid view" icon={<Grid3X3 size={17} aria-hidden="true" />} tooltip="Grid View" />
              <NavIconButton ariaLabel="Compare" srLabel="Compare" icon={<GitCompare size={17} aria-hidden="true" />} tooltip="Compare" onClick={onCompare} />
              <NavIconButton ariaLabel="Export to Excel" srLabel="Export to Excel" icon={<Download size={17} aria-hidden="true" />} tooltip="Export to Excel" onClick={onExport} />
            </>
          )}
          {isTablet && (
            <NavIconButton
              ariaLabel={showQuantitiesDrawer ? 'Hide quantities panel' : 'Show quantities panel'}
              srLabel={showQuantitiesDrawer ? 'Hide quantities panel' : 'Show quantities panel'}
              icon={<PanelRightOpen size={17} aria-hidden="true" />}
              tooltip="Toggle Quantities"
              onClick={() => setShowQuantitiesDrawer(!showQuantitiesDrawer)}
              ariaExpanded={showQuantitiesDrawer}
            />
          )}
          {isMobile && (
            <>
              {onSave && (
                <NavIconButton
                  ariaLabel={saving ? 'Saving' : 'Save'}
                  srLabel={saving ? 'Saving project' : 'Save project'}
                  icon={saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <SaveIcon size={16} aria-hidden="true" />}
                  tooltip="Save"
                  onClick={onSave}
                />
              )}
              <NavIconButton
                ariaLabel={showMobileMenu ? 'Close menu' : 'Open menu'}
                srLabel={showMobileMenu ? 'Close menu' : 'Open menu'}
                icon={<Menu size={18} aria-hidden="true" />}
                tooltip="Menu"
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                ariaExpanded={showMobileMenu}
              />
            </>
          )}
        </nav>
      </header>
      {/* Scanline bar */}
      <div className="scanline" aria-hidden="true" style={{ height: 2, background: 'linear-gradient(90deg, rgba(0,212,255,0) 0%, rgba(0,212,255,0.6) 50%, rgba(0,212,255,0) 100%)', position: 'relative' }} />

      {/* Mobile dropdown menu */}
      {isMobile && showMobileMenu && (
        <div
          className="absolute top-[54px] left-0 right-0 z-50 bg-[#0a0a0f] border-b border-[rgba(0,212,255,0.2)] p-3 flex flex-col gap-2 max-h-[90vh] overflow-y-auto"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
        >
          <button
            onClick={() => { onAITakeoff?.(); setShowMobileMenu(false); }}
            disabled={aiLoading}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0faff] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {aiLoading ? 'Analyzing...' : 'AI Takeoff'}
          </button>
          <button
            onClick={() => { onChat?.(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <MessageSquare size={16} /> MX Chat
          </button>
          <button
            onClick={() => { onToggleImageSearch?.(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <Search size={16} /> Image Search
          </button>
          <button
            onClick={() => { onExport?.(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <Download size={16} /> Export
          </button>
          <button
            onClick={() => { setShowQuantitiesDrawer(!showQuantitiesDrawer); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <List size={16} /> Quantities
          </button>
        </div>
      )}
    </div>
  );
}

interface NavIconButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick?: () => void;
  ariaLabel: string;
  srLabel: string;
  ariaExpanded?: boolean;
  ariaPressed?: boolean;
}

function NavIconButton({ icon, tooltip, onClick, ariaLabel, srLabel, ariaExpanded, ariaPressed }: NavIconButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      title={tooltip}
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-pressed={ariaPressed}
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
        minWidth: 36,
        minHeight: 36,
        touchAction: 'manipulation',
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
      <span className="sr-only">{srLabel}</span>
    </button>
  );
}
