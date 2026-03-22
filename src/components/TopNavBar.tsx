'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile, useIsTablet } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import {
  BookOpen,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  MessageSquare,
  List,
  Grid3X3,
  GitCompare,
  Download,
  FileSpreadsheet,
  Layers,
  Layers3,
  Search,
  Save as SaveIcon,
  Loader2,
  Menu,
  PanelRightOpen,
  Settings,
  Share2,
  Printer,
} from 'lucide-react';
import { useToast } from './Toast';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { useViewerPresence } from '@/hooks/useViewerPresence';

interface TopNavBarProps {
  sheetName?: string;
  pageIndex?: number;
  totalPages?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onAITakeoff?: () => void | Promise<void>;
  aiLoading?: boolean;
  hasScale?: boolean;
  hasRunTakeoff?: boolean;
  onExportExcel?: () => void;
  onExportJson?: () => void;
  onExportPanel?: () => void;
  onSave?: () => void;
  saving?: boolean;
  projectName?: string;
  projectId?: string;
  onProjectNameSaved?: (name: string) => void;
  onChat?: () => void;
  onToggleImageSearch?: () => void;
  onCompare?: () => void;
  aiAllPagesMode?: boolean;
  onAiAllPagesModeChange?: (v: boolean) => void;
  aiAllPagesProgress?: { current: number; total: number } | null;
  onAITakeoffAllPages?: () => void | Promise<void>;
  onSettings?: () => void;
  onToggleTakeoffSearch?: () => void;
  isTakeoffSearchOpen?: boolean;
  onToggleTextSearch?: () => void;
  isTextSearchOpen?: boolean;
  onGoToPage?: (page: number) => void;
  aiModel?: string;
  onAiModelChange?: (model: string) => void;
  onPrintBlueprint?: () => void;
  currentPagePolygonCount?: number;
}

export default function TopNavBar({
  sheetName = 'Sheet 1',
  pageIndex,
  totalPages,
  onPrev,
  onNext,
  onAITakeoff,
  onChat,
  onToggleImageSearch,
  onCompare,
  aiLoading,
  hasScale,
  hasRunTakeoff,
  onExportExcel,
  onExportJson,
  onExportPanel,
  onSave,
  saving,
  projectName,
  aiAllPagesMode,
  onAiAllPagesModeChange,
  aiAllPagesProgress,
  onAITakeoffAllPages,
  onSettings,
  onToggleTakeoffSearch,
  isTakeoffSearchOpen,
  onToggleTextSearch,
  isTextSearchOpen,
  projectId,
  onProjectNameSaved,
  onGoToPage,
  aiModel,
  onAiModelChange,
  onPrintBlueprint,
  currentPagePolygonCount,
}: TopNavBarProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const showMobileMenu = useStore((s) => (s as { showMobileMenu?: boolean }).showMobileMenu ?? false);
  const setShowMobileMenu = useStore((s) => (s as { setShowMobileMenu?: (v: boolean) => void }).setShowMobileMenu ?? (() => {}));
  const showQuantitiesDrawer = useStore((s) => s.showQuantitiesDrawer);
  const setShowQuantitiesDrawer = useStore((s) => s.setShowQuantitiesDrawer);
  const show3D = useStore((s) => s.show3D);
  const toggleShow3D = useStore((s) => s.toggleShow3D);
  const is3DEnabled = useFeatureFlag('3d-view');
  const { addToast } = useToast();

  const [shareLoading, setShareLoading] = React.useState(false);
  // BUG-A6-5-035 fix: max-wait timeout so share button never stays loading indefinitely
  const shareLoadingTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    return () => {
      if (shareLoadingTimeoutRef.current) clearTimeout(shareLoadingTimeoutRef.current);
    };
  }, []);
  const [isShared, setIsShared] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  // BUG-A6-5-024: useViewerPresence likely sets up a WebSocket/polling interval.
  // Cleanup depends on the hook's internal implementation — verify it unsubscribes
  // on unmount or when TopNavBar is conditionally removed (e.g. print mode).
  const { viewerCount } = useViewerPresence(projectId, isShared);
  const [isEditingPage, setIsEditingPage] = React.useState(false);
  const [pageInputValue, setPageInputValue] = React.useState('');
  const pageInputRef = React.useRef<HTMLInputElement>(null);

  const [isEditingName, setIsEditingName] = React.useState(false);
  const [nameInputValue, setNameInputValue] = React.useState('');
  const [nameSaving, setNameSaving] = React.useState(false);
  const nameInputRef = React.useRef<HTMLInputElement>(null);

  // BUG-A6-5-034 fix: extract commitRename helper used by both onKeyDown and onBlur
  // to avoid duplicated PATCH logic and risk of divergence between the two paths.
  const commitRename = React.useCallback(async (trimmed: string) => {
    if (!trimmed || trimmed === projectName || !projectId) {
      setIsEditingName(false);
      return;
    }
    setNameSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error(`Rename failed (${res.status})`);
      onProjectNameSaved?.(trimmed);
      addToast('Project name updated', 'success');
    } catch {
      addToast('Failed to rename project', 'error');
    } finally {
      setNameSaving(false);
      setIsEditingName(false);
    }
  }, [projectId, projectName, onProjectNameSaved, addToast]);

  // Check if project already has a share token on mount
  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/share`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data?.token) setIsShared(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const handleCopyLink = React.useCallback(async () => {
    try {
      const url = new URL(window.location.href);
      const pid = url.searchParams.get('project') || localStorage.getItem('measurex_project_id');
      if (!pid) {
        addToast('No project loaded', 'error');
        return;
      }

      setShareLoading(true);
      // BUG-A6-5-035 fix: safety timeout to unstick the loading state after 15s
      if (shareLoadingTimeoutRef.current) clearTimeout(shareLoadingTimeoutRef.current);
      shareLoadingTimeoutRef.current = setTimeout(() => setShareLoading(false), 15000);
      // Generate (or retrieve) a share token via the API
      const res = await fetch(`/api/projects/${pid}/share`, { method: 'POST' });
      if (!res.ok) {
        // Gracefully handle missing share_token column (migration 012 not applied)
        if (res.status === 500) {
          const body = await res.json().catch(() => ({}));
          const msg = body?.error ?? '';
          if (msg.includes('share_token') || msg.includes('column') || msg.includes('relation')) {
            addToast('Schema not ready, try again shortly.', 'error');
            return;
          }
        }
        throw new Error('Failed to generate share link');
      }
      const { token } = await res.json();

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const generatedShareUrl = `${origin}/share/${token}`;
      // BUG-MX-002: store URL in state so users can manually copy if clipboard fails
      setShareUrl(generatedShareUrl);

      // Attempt clipboard copy with fallback to execCommand for non-secure / permission-denied contexts
      let clipboardSuccess = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(generatedShareUrl);
          clipboardSuccess = true;
        } catch {
          // Fall through to textarea fallback
        }
      }
      if (!clipboardSuccess) {
        try {
          const ta = document.createElement('textarea');
          ta.value = generatedShareUrl;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          const copied = document.execCommand('copy');
          document.body.removeChild(ta);
          clipboardSuccess = copied;
        } catch {
          // clipboard completely unavailable — URL is visible in the input below
        }
      }
      setIsShared(true);
      addToast(clipboardSuccess ? 'Copied! Share link is ready to paste.' : 'Share link ready — copy it below.', 'success');
    } catch (error) {
      console.error('Failed to copy share link:', error);
      addToast('Failed to copy share link', 'error');
    } finally {
      if (shareLoadingTimeoutRef.current) clearTimeout(shareLoadingTimeoutRef.current);
      setShareLoading(false);
    }
  }, [addToast]);

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
          <NavIconButton
            ariaLabel="Classification Library"
            icon={<BookOpen size={18} aria-hidden="true" />}
            srLabel="Classification Library"
            tooltip="Library"
            onClick={() => router.push('/library')}
          />

          {/* Brand */}
          <div className="hidden md:flex items-baseline gap-2 select-none" aria-label="MeasureX Takeoff Engine">
            <span className="font-mono tracking-wider text-white text-sm">MEASUREX</span>
            <span className="font-mono tracking-wider text-[#00d4ff] text-[10px]">TAKEOFF ENGINE</span>
          </div>
          <div className="hidden md:block">
            <WorkspaceSwitcher />
          </div>

          {!isMobile && onSave && (
            <button
              aria-label={saving ? 'Saving project, please wait' : 'Save project'}
              data-testid="save-project-btn"
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
            isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={nameInputValue}
                onChange={(e) => setNameInputValue(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // BUG-A6-5-034 fix: delegate to shared commitRename helper
                    await commitRename(nameInputValue.trim());
                  } else if (e.key === 'Escape') {
                    setIsEditingName(false);
                  }
                }}
                onBlur={async () => {
                  // BUG-A6-5-034 fix: delegate to shared commitRename helper
                  await commitRename(nameInputValue.trim());
                }}
                disabled={nameSaving}
                style={{
                  color: '#e0e0e0',
                  fontSize: 11,
                  marginLeft: 6,
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(0,212,255,0.5)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  minWidth: 80,
                }}
              />
            ) : (
              <span
                onClick={() => {
                  setIsEditingName(true);
                  setNameInputValue(projectName);
                  setTimeout(() => nameInputRef.current?.select(), 0);
                }}
                style={{ color: '#8892a0', fontSize: 11, marginLeft: 6, cursor: 'pointer', textDecoration: 'underline dotted rgba(136,146,160,0.4)', textUnderlineOffset: 3 }}
                aria-label={`Project: ${projectName} (click to edit)`}
                title="Click to rename project"
              >
                {projectName}
              </span>
            )
          )}
          {isShared && !isMobile && (
            viewerCount >= 1 ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10, padding: '2px 7px' }}>
                <style>{`@keyframes pulse-live{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'pulse-live 2s ease-in-out infinite' }} />
                Live
                {viewerCount >= 2 && (
                  <span style={{ display: 'flex', alignItems: 'center', marginLeft: 2 }}>
                    {Array.from({ length: Math.min(viewerCount - 1, 2) }).map((_, i) => {
                      const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff'];
                      return (
                        <span key={`viewer-${i}`} style={{ width: 18, height: 18, borderRadius: '50%', background: colors[i % colors.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#000', marginLeft: i > 0 ? -4 : 0, border: '1.5px solid rgba(10,10,15,0.9)' }}>
                          {String.fromCharCode(65 + i)}
                        </span>
                      );
                    })}
                    {viewerCount > 3 && (
                      <span style={{ fontSize: 9, color: '#4ade80', marginLeft: 2 }}>+{viewerCount - 3}</span>
                    )}
                  </span>
                )}
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10, padding: '2px 7px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                Shared
              </span>
            )
          )}
          {/* BUG-MX-002: fallback URL input — visible when clipboard copy may have failed or user wants to manually copy */}
          {isShared && shareUrl && !isMobile && (
            <input
              readOnly
              value={shareUrl}
              aria-label="Share link URL"
              title="Share link — click to select all"
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{
                fontSize: 10,
                color: '#a1a1aa',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                padding: '2px 6px',
                width: 160,
                outline: 'none',
                cursor: 'text',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            />
          )}
          <div style={{ width: 1, height: 24, background: 'rgba(0,212,255,0.2)', margin: '0 6px' }} role="separator" aria-hidden="true" />
          <NavIconButton ariaLabel="Previous sheet" srLabel="Previous sheet" icon={<ChevronLeft size={16} aria-hidden="true" />} tooltip="Previous Sheet" onClick={onPrev} testId="page-prev-btn" />
          <NavIconButton ariaLabel="Next sheet" srLabel="Next sheet" icon={<ChevronRight size={16} aria-hidden="true" />} tooltip="Next Sheet" onClick={onNext} testId="page-next-btn" />
          <div
            data-testid="page-number-display"
            aria-label={`Current sheet: ${badge}`}
            role="status"
            aria-live="polite"
            title="Click to jump to page"
            onClick={() => {
              if (onGoToPage && typeof pageIndex === 'number' && typeof totalPages === 'number') {
                setIsEditingPage(true);
                setPageInputValue(String(pageIndex + 1));
                setTimeout(() => pageInputRef.current?.select(), 0);
              }
            }}
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
              cursor: onGoToPage ? 'pointer' : 'default',
            }}
          >
            <Layers size={13} aria-hidden="true" />
            {isEditingPage && typeof totalPages === 'number' ? (
              <input
                ref={pageInputRef}
                type="number"
                min={1}
                max={totalPages}
                value={pageInputValue}
                onChange={(e) => setPageInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = Math.max(1, Math.min(totalPages, parseInt(pageInputValue, 10) || 1));
                    onGoToPage?.(val - 1);
                    setIsEditingPage(false);
                  } else if (e.key === 'Escape') {
                    setIsEditingPage(false);
                  }
                }}
                onBlur={() => {
                  if (isEditingPage) {
                    const val = Math.max(1, Math.min(totalPages, parseInt(pageInputValue, 10) || 1));
                    onGoToPage?.(val - 1);
                    setIsEditingPage(false);
                  }
                }}
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  color: '#00d4ff',
                  border: '1px solid rgba(0,212,255,0.5)',
                  borderRadius: 4,
                  width: 42,
                  padding: '1px 4px',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            ) : (
              <span style={{ textDecoration: onGoToPage ? 'underline dotted rgba(0,212,255,0.4)' : 'none', textUnderlineOffset: 3 }}>{badge}</span>
            )}
          </div>
        </div>

        {/* Right section */}
        <nav aria-label="Actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isMobile && (
            <>
              {/* All Pages toggle + AI Takeoff button */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: aiAllPagesMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                  border: aiAllPagesMode ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  transition: 'all 150ms ease',
                  fontSize: 12,
                  fontWeight: 600,
                  color: aiAllPagesMode ? '#4ade80' : '#8892a0',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={aiAllPagesMode ?? false}
                  onChange={(e) => onAiAllPagesModeChange?.(e.target.checked)}
                  style={{ accentColor: '#22c55e', width: 14, height: 14 }}
                />
                Run Full Takeoff
              </label>
              <button
                aria-label={aiLoading ? 'AI Takeoff running…' : aiAllPagesMode ? `Run Full Takeoff (all ${totalPages ?? '?'} pages)` : 'Run AI Takeoff on current page'}
                data-testid="ai-takeoff-btn"
                aria-busy={aiLoading}
                onClick={aiAllPagesMode ? onAITakeoffAllPages : onAITakeoff}
                disabled={aiLoading}
                style={{
                  background: aiLoading ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
                  color: '#fff',
                  border: '1px solid rgba(34,197,94,0.5)',
                  borderRadius: 8,
                  padding: aiAllPagesMode ? '6px 20px' : '6px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: aiLoading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  letterSpacing: 0.2,
                  boxShadow: aiLoading ? 'none' : aiAllPagesMode ? '0 0 16px rgba(34,197,94,0.4)' : '0 0 12px rgba(34,197,94,0.25)',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => { if (!aiLoading) e.currentTarget.style.boxShadow = '0 0 20px rgba(34,197,94,0.5)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = aiLoading ? 'none' : aiAllPagesMode ? '0 0 16px rgba(34,197,94,0.4)' : '0 0 12px rgba(34,197,94,0.25)'; }}
              >
                {aiLoading
                  ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Analyzing…</>
                  : aiAllPagesMode
                    ? <><Sparkles size={14} aria-hidden="true" /> Run Full Takeoff (all {totalPages ?? '?'} pages)</>
                    : <><Sparkles size={14} aria-hidden="true" /> {(currentPagePolygonCount ?? 0) > 0 ? 'Re-Takeoff' : 'Run AI Takeoff'}</>
                }
              </button>
              <select
                value={aiModel ?? "gpt-5.4"}
                onChange={(e) => onAiModelChange?.(e.target.value)}
                aria-label="AI Model"
                style={{
                  background: '#12121a',
                  color: '#e0faff',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 12,
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              >
                <option value="gpt-5.4">GPT-5.4</option>
                <option value="google/gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                <option value="anthropic/claude-opus-4.6">Claude Opus 4.6</option>
                <option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6</option>
              </select>
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
              <button
                aria-label={shareLoading ? 'Generating share link…' : 'Share project link'}
                onClick={handleCopyLink}
                disabled={shareLoading}
                style={{
                  background: '#12121a',
                  color: shareLoading ? '#8892a0' : '#a1a1aa',
                  border: '1px solid rgba(0,212,255,0.2)',
                  borderRadius: 8,
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: shareLoading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onMouseEnter={(e) => {
                  if (!shareLoading) {
                    e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)';
                  e.currentTarget.style.color = shareLoading ? '#8892a0' : '#a1a1aa';
                }}
              >
                {shareLoading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Share2 size={14} aria-hidden="true" />}
                {shareLoading ? 'Sharing…' : 'Share'}
              </button>
              <NavIconButton
                ariaLabel={isTakeoffSearchOpen ? 'Hide takeoff search' : 'Show takeoff search'}
                srLabel={isTakeoffSearchOpen ? 'Hide takeoff search' : 'Show takeoff search'}
                icon={<Search size={17} aria-hidden="true" />}
                tooltip="Search Takeoff"
                onClick={onToggleTakeoffSearch}
                ariaPressed={isTakeoffSearchOpen}
              />
              <NavIconButton
                ariaLabel={isTextSearchOpen ? 'Hide text search' : 'Search pages & labels'}
                srLabel={isTextSearchOpen ? 'Hide text search' : 'Search pages & labels'}
                icon={<Search size={17} aria-hidden="true" />}
                tooltip="Text Search (Ctrl+F)"
                onClick={onToggleTextSearch}
                ariaPressed={isTextSearchOpen}
              />
              <NavIconButton
                ariaLabel="Project settings"
                srLabel="Project settings"
                icon={<Settings size={17} aria-hidden="true" />}
                tooltip="Settings"
                onClick={onSettings}
              />
              <div style={{ width: 1, height: 24, background: 'rgba(0,212,255,0.2)', margin: '0 6px' }} role="separator" aria-hidden="true" />
              {is3DEnabled && (
              <NavIconButton
                ariaLabel={show3D ? 'Switch to 2D view' : 'Switch to 3D view'}
                srLabel={show3D ? 'Switch to 2D view' : 'Switch to 3D view'}
                icon={<Layers3 size={17} aria-hidden="true" />}
                tooltip={show3D ? '2D View (3)' : '3D View (3)'}
                onClick={toggleShow3D}
                ariaPressed={show3D}
              />
              )}
              <NavIconButton ariaLabel="Show quantities" srLabel="Show quantities" icon={<List size={17} aria-hidden="true" />} tooltip="Quantities" testId="tab-quantities" />
              <NavIconButton ariaLabel="Grid view" srLabel="Grid view" icon={<Grid3X3 size={17} aria-hidden="true" />} tooltip="Grid View" />
              <NavIconButton ariaLabel="Compare" srLabel="Compare" icon={<GitCompare size={17} aria-hidden="true" />} tooltip="Compare" onClick={onCompare} />
              <NavIconButton ariaLabel="Print Blueprint" srLabel="Print Blueprint" icon={<Printer size={17} aria-hidden="true" />} tooltip="Print Blueprint" onClick={onPrintBlueprint} />
              <NavIconButton ariaLabel="Export" srLabel="Export" icon={<FileSpreadsheet size={17} aria-hidden="true" />} tooltip="Export" onClick={onExportPanel} testId="export-btn" />
              <NavIconButton ariaLabel="Quick Export Excel" srLabel="Quick Export Excel" icon={<Download size={17} aria-hidden="true" />} tooltip="Quick Export Excel" onClick={onExportExcel} />
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
          {isShared && viewerCount >= 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', fontSize: 11, color: '#4ade80' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'pulse-live 2s ease-in-out infinite' }} />
              Live · {viewerCount} {viewerCount === 1 ? 'viewer' : 'viewers'}
            </div>
          )}
          <button
            onClick={() => { onAITakeoff?.(); setShowMobileMenu(false); }}
            disabled={aiLoading}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-white min-h-[44px]"
            style={{
              touchAction: 'manipulation',
              background: aiLoading ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
              border: '1px solid rgba(34,197,94,0.5)',
              fontWeight: 700,
            }}
          >
            {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {aiLoading ? 'Analyzing…' : (currentPagePolygonCount ?? 0) > 0 ? 'Re-Takeoff' : 'Run AI Takeoff'}
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
            onClick={() => { void handleCopyLink(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-white bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <Share2 size={16} /> Share
          </button>
          <button
            onClick={() => { onToggleTakeoffSearch?.(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <Search size={16} /> {isTakeoffSearchOpen ? 'Hide Search' : 'Search Takeoff'}
          </button>
          <button
            onClick={() => { onToggleTextSearch?.(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <Search size={16} /> {isTextSearchOpen ? 'Hide Text Search' : 'Text Search'}
          </button>
          <button
            onClick={() => { onSettings?.(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <Settings size={16} /> Settings
          </button>
          <button
            onClick={() => { onPrintBlueprint?.(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <Printer size={16} /> Print Blueprint
          </button>
          <button
            onClick={() => { onExportPanel?.(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <FileSpreadsheet size={16} /> Export
          </button>
          <button
            onClick={() => { onExportExcel?.(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <Download size={16} /> Quick Export Excel
          </button>
          {is3DEnabled && (
          <button
            onClick={() => { toggleShow3D(); setShowMobileMenu(false); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#e0e0e0] bg-[#12121a] border border-[rgba(0,212,255,0.2)] min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <Layers3 size={16} /> {show3D ? '2D View' : '3D View'}
          </button>
          )}
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
  testId?: string;
}

function NavIconButton({ icon, tooltip, onClick, ariaLabel, srLabel, ariaExpanded, ariaPressed, testId }: NavIconButtonProps) {
  const isActive = ariaPressed === true;
  return (
    <button
      aria-label={ariaLabel}
      title={tooltip}
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-pressed={ariaPressed}
      data-testid={testId}
      style={{
        background: isActive ? 'rgba(0,212,255,0.15)' : '#12121a',
        border: isActive ? '1px solid rgba(0,212,255,0.5)' : '1px solid rgba(0,212,255,0.15)',
        color: isActive ? '#00d4ff' : '#b0dff0',
        cursor: 'pointer',
        padding: 6,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 150ms ease',
        minWidth: 44,
        minHeight: 44,
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
