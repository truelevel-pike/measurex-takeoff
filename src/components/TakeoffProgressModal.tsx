'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2, Sparkles, BrainCircuit, Trophy, Clock, Layers, Eye } from 'lucide-react';

export interface PageStatus {
  page: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  polygonCount?: number;
  errorMsg?: string;
}

export interface TakeoffSummary {
  totalPolygons: number;
  totalPages: number;
  classifications: string[];
  elapsedMs: number;
  // Wave 19B: per-type breakdown for the summary display
  areaCount?: number;
  areaTotalSF?: number;
  linearCount?: number;
  linearTotalLF?: number;
  countItems?: number;
}

interface TakeoffProgressModalProps {
  open: boolean;
  pageStatuses: PageStatus[];
  total: number;
  currentPage: number;
  model: string;
  sheetNames?: Record<number, string>;
  onCancel?: () => void;
  // Summary mode
  summary?: TakeoffSummary | null;
  onDismissSummary?: () => void;
}

export default function TakeoffProgressModal({
  open,
  pageStatuses,
  total,
  currentPage,
  model,
  sheetNames,
  onCancel,
  summary,
  onDismissSummary,
}: TakeoffProgressModalProps) {
  const [cancelled, setCancelled] = useState(false);
  const [cancelledDoneCount, setCancelledDoneCount] = useState(0);

  // Reset cancelled state when modal opens fresh
  useEffect(() => {
    if (open) setCancelled(false);
  }, [open]);

  if (!open && !summary && !cancelled) return null;

  // If summary is provided, show the celebratory summary overlay
  if (summary) {
    return <TakeoffSummaryOverlay summary={summary} model={model} onDismiss={onDismissSummary} />;
  }

  const doneCount = pageStatuses.filter(s => s.status === 'done').length;
  const failedCount = pageStatuses.filter(s => s.status === 'failed').length;
  const completedCount = doneCount + failedCount;
  const progressPct = total > 0 ? (completedCount / total) * 100 : 0;
  const totalPolygonsSoFar = pageStatuses.reduce((sum, ps) => sum + (ps.polygonCount ?? 0), 0);
  const runningPage = pageStatuses.find(ps => ps.status === 'running');
  const runningPageName = runningPage
    ? sheetNames?.[runningPage.page] || `Page ${runningPage.page}`
    : '';

  return (
    <div role="dialog" aria-modal="true" aria-label="Takeoff Progress" data-testid="takeoff-progress-modal" className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>

      {/* Central content */}
      <div className="flex flex-col items-center max-w-2xl w-full px-6">

        {/* Animated AI brain icon with spinning ring */}
        <div className="mb-6 relative">
          <div className="w-20 h-20 rounded-full flex items-center justify-center relative"
            style={{
              background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(0,212,255,0.2))',
              boxShadow: '0 0 40px rgba(34,197,94,0.3)',
            }}>
            {/* Spinning ring */}
            <div className="absolute inset-0 rounded-full animate-spin"
              style={{
                border: '2px solid transparent',
                borderTopColor: 'rgba(34,197,94,0.7)',
                borderRightColor: 'rgba(0,212,255,0.5)',
                animationDuration: '2s',
              }} />
            {/* Pulsing glow ring */}
            <div className="absolute inset-0 rounded-full animate-pulse"
              style={{
                border: '2px solid rgba(34,197,94,0.3)',
              }} />
            <BrainCircuit size={36} className="text-emerald-400 animate-pulse" />
          </div>
        </div>

        {/* Large progress text */}
        <h1 className="text-3xl font-bold text-white mb-2 text-center">
          Page <span data-testid="takeoff-current-page">{currentPage}</span> of <span data-testid="takeoff-total-pages">{total}</span>
        </h1>
        {model && (
          <p className="text-xs text-white/40 mb-2 text-center">Using: <span className="text-white/60">{model}</span></p>
        )}
        <p className="text-lg text-white/60 mb-8 text-center">
          {runningPage ? (
            <>analyzing <span className="text-[#00d4ff] font-medium">{runningPageName}</span>…</>
          ) : (
            'preparing…'
          )}
        </p>

        {/* Animated progress bar */}
        <div className="w-full max-w-lg mb-4">
          <div className="h-3 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)' }}>
            <div
              className="h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #16a34a, #22c55e, #4ade80)',
                boxShadow: '0 0 12px rgba(34,197,94,0.5)',
              }}
            >
              {/* Shimmer effect */}
              <div className="absolute inset-0 animate-shimmer"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                }} />
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-white/40">
            <span>{completedCount} of {total} pages</span>
            <span>{Math.round(progressPct)}%</span>
          </div>
        </div>

        {/* Live polygon count */}
        <div className="flex items-center gap-3 mb-8 px-5 py-3 rounded-xl"
          style={{
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.2)',
          }}>
          <Layers size={18} className="text-[#00d4ff]" />
          <span className="text-xl font-bold text-white tabular-nums">{totalPolygonsSoFar}</span>
          <span className="text-sm text-white/50">polygons found so far</span>
        </div>

        {/* Page list with checkmarks */}
        <div className="w-full max-w-lg max-h-56 overflow-y-auto rounded-xl px-1 py-1 space-y-0.5"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          {pageStatuses.map(ps => {
            const pageName = sheetNames?.[ps.page] || `Page ${ps.page}`;
            return (
              <div key={ps.page}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-colors ${
                  ps.status === 'running' ? 'bg-white/5' : ''
                }`}>
                {/* Status icon */}
                {ps.status === 'queued' && (
                  <span className="w-5 h-5 flex items-center justify-center rounded-full border border-white/15 text-white/20 text-[10px]">
                    {ps.page}
                  </span>
                )}
                {ps.status === 'running' && (
                  <Loader2 className="w-5 h-5 text-[#00d4ff] animate-spin flex-shrink-0" />
                )}
                {ps.status === 'done' && (
                  <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                )}
                {ps.status === 'failed' && (
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                )}

                {/* Page name */}
                <span className={`text-sm flex-1 truncate ${
                  ps.status === 'running' ? 'text-white font-medium' :
                  ps.status === 'done' ? 'text-white/70' :
                  ps.status === 'failed' ? 'text-red-300/70' :
                  'text-white/30'
                }`}>
                  {pageName}
                </span>

                {/* Polygon count for done pages */}
                {ps.status === 'done' && (
                  <span className="text-xs text-emerald-400/80 tabular-nums">{ps.polygonCount ?? 0} polygons</span>
                )}
                {ps.status === 'running' && (
                  <span className="text-xs text-[#00d4ff]/70">analyzing…</span>
                )}
                {ps.status === 'failed' && (
                  <span className="text-xs text-red-400/70 truncate max-w-[140px]">{ps.errorMsg || 'failed'}</span>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* Cancel button — bottom right */}
      {onCancel && !cancelled && (
        <button
          onClick={() => {
            setCancelledDoneCount(doneCount);
            setCancelled(true);
            onCancel();
            setTimeout(() => setCancelled(false), 1500);
          }}
          className="fixed bottom-8 right-8 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
            e.currentTarget.style.color = '#f87171';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
          }}
        >
          Cancel
        </button>
      )}
      {cancelled && (
        <div className="fixed bottom-8 right-8 px-5 py-2.5 rounded-lg text-sm font-medium"
          style={{
            background: 'rgba(239,68,68,0.12)',
            color: '#f87171',
            border: '1px solid rgba(239,68,68,0.3)',
          }}>
          Cancelled — {cancelledDoneCount} of {total} pages done
        </div>
      )}

      {/* Shimmer keyframe */}
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

/* ─── Celebratory Summary Overlay ─── */

function TakeoffSummaryOverlay({
  summary,
  model,
  onDismiss,
}: {
  summary: TakeoffSummary;
  model: string;
  onDismiss?: () => void;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setShow(true));
  }, []);

  const elapsedSec = Math.round(summary.elapsedMs / 1000);
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <div role="dialog" aria-modal="true" aria-label="Takeoff Summary" className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div
        className={`flex flex-col items-center max-w-md w-full px-8 py-10 rounded-2xl transition-all duration-500 ${
          show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
          background: 'linear-gradient(180deg, rgba(18,18,26,0.98) 0%, rgba(10,10,15,0.98) 100%)',
          border: '1px solid rgba(34,197,94,0.3)',
          boxShadow: '0 0 60px rgba(34,197,94,0.15), 0 0 120px rgba(0,212,255,0.1)',
        }}
      >
        {/* Trophy + checkmark icons */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(34,197,94,0.25), rgba(250,204,21,0.2))',
              border: '2px solid rgba(250,204,21,0.4)',
              boxShadow: '0 0 30px rgba(250,204,21,0.2)',
            }}>
            <Trophy size={32} className="text-yellow-400" />
          </div>
          <CheckCircle size={40} className="text-emerald-400 animate-bounce" style={{ animationDuration: '1.5s' }} />
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">Takeoff Complete!</h1>
        <p className="text-sm text-white/40 mb-6">Full AI analysis finished</p>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 w-full mb-4">
          <StatCard icon={<Layers size={18} className="text-emerald-400" />} value={summary.totalPolygons} label="Polygons Detected" />
          <StatCard icon={<Eye size={18} className="text-[#00d4ff]" />} value={summary.classifications.length} label="Classifications" />
          <StatCard icon={<Sparkles size={18} className="text-purple-400" />} value={summary.totalPages} label="Pages Analyzed" />
          <StatCard icon={<Clock size={18} className="text-amber-400" />} value={timeStr} label="Time Taken" />
        </div>

        {/* Wave 19B: per-type breakdown */}
        {(summary.areaCount != null || summary.linearCount != null || summary.countItems != null) && (
          <div
            data-testid="takeoff-summary"
            className="w-full mb-4 rounded-xl p-3 text-xs font-mono"
            style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)' }}
          >
            <p className="text-white/30 uppercase tracking-wider mb-2 text-[10px]">Breakdown</p>
            <div className="flex flex-col gap-1 text-white/70">
              {summary.areaCount != null && (
                <span>
                  📐 {summary.areaCount} area{summary.areaCount !== 1 ? 's' : ''}
                  {summary.areaTotalSF != null && summary.areaTotalSF > 0 && (
                    <span className="text-emerald-400"> ({summary.areaTotalSF.toFixed(0)} SF total)</span>
                  )}
                </span>
              )}
              {summary.linearCount != null && (
                <span>
                  📏 {summary.linearCount} linear element{summary.linearCount !== 1 ? 's' : ''}
                  {summary.linearTotalLF != null && summary.linearTotalLF > 0 && (
                    <span className="text-blue-400"> ({summary.linearTotalLF.toFixed(0)} LF total)</span>
                  )}
                </span>
              )}
              {summary.countItems != null && (
                <span>🔢 {summary.countItems} counted item{summary.countItems !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        )}

        {/* Classifications preview */}
        {summary.classifications.length > 0 && (
          <div className="w-full mb-6">
            <p className="text-xs text-white/30 mb-2 uppercase tracking-wider">Classifications Found</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.classifications.slice(0, 12).map((cls, i) => (
                <span key={cls || `cls-${i}`} className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(0,212,255,0.08)',
                    color: 'rgba(0,212,255,0.7)',
                    border: '1px solid rgba(0,212,255,0.15)',
                  }}>
                  {cls}
                </span>
              ))}
              {summary.classifications.length > 12 && (
                <span className="text-xs px-2 py-0.5 text-white/30">+{summary.classifications.length - 12} more</span>
              )}
            </div>
          </div>
        )}

        {/* Model badge */}
        <span className="text-xs font-medium px-3 py-1 rounded-full mb-6"
          style={{
            background: 'rgba(0,212,255,0.1)',
            color: 'rgba(0,212,255,0.5)',
            border: '1px solid rgba(0,212,255,0.15)',
          }}>
          Powered by {model}
        </span>

        {/* View Results button */}
        <button
          onClick={onDismiss}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all"
          style={{
            background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
            color: '#fff',
            border: '1px solid rgba(34,197,94,0.5)',
            boxShadow: '0 0 20px rgba(34,197,94,0.3)',
            letterSpacing: 0.3,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 30px rgba(34,197,94,0.5)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 20px rgba(34,197,94,0.3)'; }}
        >
          View Results
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
      {icon}
      <div>
        <div className="text-lg font-bold text-white tabular-nums">{value}</div>
        <div className="text-[10px] text-white/35 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}
