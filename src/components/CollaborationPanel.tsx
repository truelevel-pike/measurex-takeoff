'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Link2, Check, X } from 'lucide-react';

interface CollaborationPanelProps {
  projectId: string;
  projectName?: string;
  onClose?: () => void;
}

type SharePermission = 'view' | 'edit' | 'manage';

const PERMISSION_LABELS: Record<SharePermission, string> = {
  view: 'Can View (read-only)',
  edit: 'Can Edit (draw polygons)',
  manage: 'Can Manage (full access)',
};

export default function CollaborationPanel({ projectId, projectName = 'Untitled Project', onClose }: CollaborationPanelProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [permission, setPermission] = useState<SharePermission>('view');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  // Fetch or create share token on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchShareToken() {
      setLoading(true);
      setError(null);
      try {
        // Try GET first
        const getRes = await fetch(`/api/projects/${projectId}/share`);
        if (getRes.ok) {
          const data = await getRes.json();
          if (data.token) {
            if (!cancelled) {
              setShareUrl(`${window.location.origin}/share/${data.token}`);
              setLoading(false);
            }
            return;
          }
        }

        // No token yet — create one via POST
        const postRes = await fetch(`/api/projects/${projectId}/share`, { method: 'POST' });
        if (!postRes.ok) {
          throw new Error('Failed to generate share link');
        }
        const { token } = await postRes.json();
        if (!cancelled) {
          // Base URL without permission — permission is appended when copying
          setShareUrl(`${window.location.origin}/share/${token}`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load share link');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchShareToken();
    return () => { cancelled = true; };
  }, [projectId]);

  const handleCopyLink = useCallback(() => {
    if (!shareUrl) return;
    // Append permission param so the share page can enforce it
    const urlWithPerm = permission === 'view' ? shareUrl : `${shareUrl}?perm=${permission}`;

    navigator.clipboard.writeText(urlWithPerm).then(() => {
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback: execCommand copy
      try {
        const ta = document.createElement('textarea');
        ta.value = urlWithPerm;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) {
          setCopied(true);
          if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
          copiedTimerRef.current = setTimeout(() => setCopied(false), 2500);
        } else {
          setCopyError(true);
          if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
          copiedTimerRef.current = setTimeout(() => setCopyError(false), 3000);
        }
      } catch {
        setCopyError(true);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopyError(false), 3000);
      }
    });
  }, [shareUrl]);

  return (
    <div
      role="dialog"
      aria-label="Collaboration Panel"
      data-testid="collab-panel"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: '#0a0a0f',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: 16,
          boxShadow: '0 0 40px rgba(0,212,255,0.15)',
          width: '100%',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(0,212,255,0.2)',
            background: 'rgba(10,10,15,0.6)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={18} style={{ color: '#00d4ff' }} />
            <div>
              <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#e0faff', letterSpacing: 1 }}>
                SHARE PROJECT
              </div>
              <div style={{ fontSize: 11, color: '#8892a0', marginTop: 1 }}>{projectName}</div>
            </div>
          </div>
          {onClose && (
            <button
              aria-label="Close collaboration panel"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#8892a0',
                borderRadius: 8,
                padding: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#e0e0e0'; e.currentTarget.style.borderColor = 'rgba(255,100,100,0.4)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#8892a0'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Permission selector */}
        <div style={{ padding: '12px 18px 0', background: 'rgba(14,16,22,0.4)' }}>
          <label style={{ fontSize: 11, color: '#8892a0', fontFamily: 'monospace', display: 'block', marginBottom: 4 }}>
            Permission level
          </label>
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as SharePermission)}
            data-testid="share-permission-select"
            style={{
              width: '100%',
              background: '#0a0a0f',
              border: '1px solid rgba(0,212,255,0.25)',
              color: '#e0faff',
              borderRadius: 6,
              padding: '5px 8px',
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
              marginBottom: 10,
            }}
          >
            {(Object.entries(PERMISSION_LABELS) as [SharePermission, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* Expiry display */}
        {shareUrl && !loading && !error && (
          <div
            data-testid="share-expiry-display"
            style={{
              padding: '4px 18px 8px',
              background: 'rgba(14,16,22,0.4)',
              fontSize: 11,
              color: '#5a6270',
              fontFamily: 'monospace',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: '#3a9a6e', fontSize: 12 }}>∞</span>
            Link never expires · Revoke to disable access
          </div>
        )}

        {/* Share link */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            background: 'rgba(14,16,22,0.4)',
            flexShrink: 0,
          }}
        >
          <Link2 size={14} style={{ color: '#8892a0', flexShrink: 0 }} />
          <span
            data-testid="share-url-display"
            style={{
              flex: 1,
              fontSize: 11,
              color: loading ? '#5a6270' : error ? '#f87171' : '#8892a0',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Generating share link…' : error ? error : shareUrl}
          </span>
          <button
            data-testid="share-copy-btn"
            onClick={handleCopyLink}
            disabled={loading || !!error}
            aria-label="Copy share link"
            style={{
              background: copied ? 'rgba(34,197,94,0.15)' : copyError ? 'rgba(239,68,68,0.15)' : 'rgba(0,212,255,0.1)',
              border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : copyError ? 'rgba(239,68,68,0.4)' : 'rgba(0,212,255,0.3)'}`,
              color: copied ? '#4ade80' : copyError ? '#f87171' : '#00d4ff',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 700,
              cursor: loading || error ? 'not-allowed' : 'pointer',
              opacity: loading || error ? 0.5 : 1,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 200ms',
              fontFamily: 'monospace',
            }}
          >
            {copied ? <Check size={12} /> : <Link2 size={12} />}
            {copied ? 'Copied!' : copyError ? 'Copy Failed' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
