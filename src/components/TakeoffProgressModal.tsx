'use client';

import React from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export interface PageStatus {
  page: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  polygonCount?: number;
  errorMsg?: string;
}

interface TakeoffProgressModalProps {
  open: boolean;
  pageStatuses: PageStatus[];
  total: number;
  currentPage: number;
  model: string;
}

export default function TakeoffProgressModal({ open, pageStatuses, total, currentPage, model }: TakeoffProgressModalProps) {
  if (!open) return null;

  const doneCount = pageStatuses.filter(s => s.status === 'done').length;
  const failedCount = pageStatuses.filter(s => s.status === 'failed').length;
  const completedCount = doneCount + failedCount;
  const progressPct = total > 0 ? (completedCount / total) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#12121a] rounded-xl shadow-2xl max-w-lg w-full border border-white/10">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">AI Takeoff — All Pages</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30">
              {model}
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#00d4ff] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-white/60 tabular-nums whitespace-nowrap">
              {currentPage}/{total}
            </span>
          </div>
        </div>

        {/* Page list */}
        <div className="px-6 py-4 max-h-72 overflow-y-auto space-y-1">
          {pageStatuses.map(ps => (
            <div key={ps.page} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-white/5">
              {/* Status icon */}
              {ps.status === 'queued' && (
                <span className="w-5 h-5 flex items-center justify-center text-white/30 text-sm">○</span>
              )}
              {ps.status === 'running' && (
                <Loader2 className="w-5 h-5 text-[#00d4ff] animate-spin" />
              )}
              {ps.status === 'done' && (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              )}
              {ps.status === 'failed' && (
                <XCircle className="w-5 h-5 text-red-400" />
              )}

              {/* Page label */}
              <span className="text-sm text-white/80 w-16">Page {ps.page}</span>

              {/* Status detail */}
              <span className="text-xs text-white/50 flex-1 truncate">
                {ps.status === 'queued' && 'queued'}
                {ps.status === 'running' && 'analyzing...'}
                {ps.status === 'done' && `done — ${ps.polygonCount ?? 0} polygons`}
                {ps.status === 'failed' && (ps.errorMsg || 'failed')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
