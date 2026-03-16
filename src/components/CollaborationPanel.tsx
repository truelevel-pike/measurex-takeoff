'use client';

import React, { useState } from 'react';
import { Users, Mail, Link2, Check, X, ChevronDown, Shield, Eye, Pencil } from 'lucide-react';

// --- Types ---
type Permission = 'view' | 'edit' | 'admin';

interface Collaborator {
  id: string;
  name: string;
  email: string;
  role: Permission;
  type: 'internal' | 'external';
  initials: string;
  color: string;
}

interface CollaborationPanelProps {
  projectName?: string;
  onClose?: () => void;
}

// --- Sample data ---
const SAMPLE_COLLABORATORS: Collaborator[] = [
  { id: 'c1', name: 'Sarah Kim',      email: 'sarah.kim@firm.com',       role: 'admin',  type: 'internal', initials: 'SK', color: '#6366f1' },
  { id: 'c2', name: 'Marcus Webb',    email: 'marcus.webb@firm.com',     role: 'edit',   type: 'internal', initials: 'MW', color: '#22c55e' },
  { id: 'c3', name: 'Priya Nair',     email: 'priya.nair@firm.com',      role: 'view',   type: 'internal', initials: 'PN', color: '#f59e0b' },
  { id: 'c4', name: 'General Contractor', email: 'gc@buildco.com',       role: 'view',   type: 'external', initials: 'GC', color: '#ef4444' },
  { id: 'c5', name: 'City Inspector', email: 'inspector@cityplanning.gov', role: 'view', type: 'external', initials: 'CI', color: '#06b6d4' },
  { id: 'c6', name: 'MEP Consultant', email: 'mep@engpartners.com',      role: 'edit',   type: 'external', initials: 'ME', color: '#a855f7' },
];

const FAKE_SHARE_URL = 'https://measurex.app/share/proj_8fq2k7?token=abc123';

// --- Helpers ---
const ROLE_LABELS: Record<Permission, string> = { view: 'View Only', edit: 'Can Edit', admin: 'Admin' };
const ROLE_COLORS: Record<Permission, string> = {
  view: 'rgba(0,212,255,0.3)',
  edit: 'rgba(34,197,94,0.35)',
  admin: 'rgba(239,68,68,0.35)',
};
const ROLE_TEXT: Record<Permission, string> = { view: '#00d4ff', edit: '#4ade80', admin: '#f87171' };

function RoleIcon({ role }: { role: Permission }) {
  if (role === 'admin') return <Shield size={11} />;
  if (role === 'edit') return <Pencil size={11} />;
  return <Eye size={11} />;
}

function RoleBadge({ role }: { role: Permission }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'monospace',
        background: ROLE_COLORS[role],
        color: ROLE_TEXT[role],
        letterSpacing: 0.5,
        border: `1px solid ${ROLE_TEXT[role]}55`,
      }}
    >
      <RoleIcon role={role} />
      {ROLE_LABELS[role]}
    </span>
  );
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <div
      aria-hidden
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: `${color}33`,
        border: `2px solid ${color}88`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: 'monospace',
        flexShrink: 0,
        boxShadow: `0 0 8px ${color}44`,
      }}
    >
      {initials}
    </div>
  );
}

function CollaboratorRow({
  collab,
  onRoleChange,
  onRemove,
}: {
  collab: Collaborator;
  onRoleChange: (id: string, role: Permission) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(14,16,22,0.6)',
        border: '1px solid rgba(0,212,255,0.1)',
        marginBottom: 6,
      }}
    >
      <Avatar initials={collab.initials} color={collab.color} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {collab.name}
        </div>
        <div style={{ fontSize: 11, color: '#8892a0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {collab.email}
        </div>
      </div>

      {/* Role selector */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <select
          value={collab.role}
          onChange={(e) => onRoleChange(collab.id, e.target.value as Permission)}
          aria-label={`Role for ${collab.name}`}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            background: '#12121a',
            color: ROLE_TEXT[collab.role],
            border: `1px solid ${ROLE_TEXT[collab.role]}55`,
            borderRadius: 6,
            padding: '3px 24px 3px 8px',
            fontSize: 11,
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <option value="view" style={{ background: '#12121a', color: '#e0e0e0' }}>View Only</option>
          <option value="edit" style={{ background: '#12121a', color: '#e0e0e0' }}>Can Edit</option>
          <option value="admin" style={{ background: '#12121a', color: '#e0e0e0' }}>Admin</option>
        </select>
        <ChevronDown
          size={11}
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#8892a0',
            pointerEvents: 'none',
          }}
        />
      </div>

      <button
        aria-label={`Remove ${collab.name}`}
        onClick={() => onRemove(collab.id)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#8892a0',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#8892a0')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ---- Main Component ----

export default function CollaborationPanel({ projectName = 'Untitled Project', onClose }: CollaborationPanelProps) {
  const [activeTab, setActiveTab] = useState<'internal' | 'external'>('internal');
  const [collaborators, setCollaborators] = useState<Collaborator[]>(SAMPLE_COLLABORATORS);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Permission>('view');
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState<string | null>(null);

  function handleRoleChange(id: string, role: Permission) {
    setCollaborators((prev) => prev.map((c) => (c.id === id ? { ...c, role } : c)));
  }

  function handleRemove(id: string) {
    setCollaborators((prev) => prev.filter((c) => c.id !== id));
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email || !email.includes('@')) {
      setInviteError('Please enter a valid email address.');
      return;
    }
    if (collaborators.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
      setInviteError('This person is already a collaborator.');
      return;
    }
    const initials = email.slice(0, 2).toUpperCase();
    const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'];
    const color = colors[collaborators.length % colors.length];
    const newCollab: Collaborator = {
      id: `c${Date.now()}`,
      name: email.split('@')[0],
      email,
      role: inviteRole,
      type: activeTab,
      initials,
      color,
    };
    setCollaborators((prev) => [...prev, newCollab]);
    setInviteSent(email);
    setInviteEmail('');
    setInviteError(null);
    setTimeout(() => setInviteSent(null), 3000);
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(FAKE_SHARE_URL).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const tabCollabs = collaborators.filter((c) => c.type === activeTab);

  const inputStyle: React.CSSProperties = {
    background: '#0d0d14',
    border: '1px solid rgba(0,212,255,0.2)',
    borderRadius: 8,
    color: '#e0faff',
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 0',
    background: active ? 'rgba(0,212,255,0.12)' : 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid #00d4ff' : '2px solid transparent',
    color: active ? '#00d4ff' : '#8892a0',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: 1,
    cursor: 'pointer',
    textTransform: 'uppercase' as const,
    transition: 'all 150ms',
  });

  return (
    <div
      role="dialog"
      aria-label="Collaboration Panel"
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
          maxHeight: '88vh',
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

        {/* Invite form */}
        <form onSubmit={handleInvite} style={{ padding: '14px 18px', borderBottom: '1px solid rgba(0,212,255,0.1)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8892a0', fontFamily: 'monospace', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
            Invite Collaborator
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Mail size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8892a0', pointerEvents: 'none' }} />
              <input
                type="email"
                placeholder="Enter email address"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); }}
                style={{ ...inputStyle, paddingLeft: 32 }}
                aria-label="Invite email"
              />
            </div>
            {/* Permission dropdown */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Permission)}
                aria-label="Invite permission"
                style={{
                  ...inputStyle,
                  width: 'auto',
                  paddingRight: 28,
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="view" style={{ background: '#12121a' }}>View Only</option>
                <option value="edit" style={{ background: '#12121a' }}>Can Edit</option>
                <option value="admin" style={{ background: '#12121a' }}>Admin</option>
              </select>
              <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#8892a0', pointerEvents: 'none' }} />
            </div>
            <button
              type="submit"
              style={{
                background: 'rgba(0,212,255,0.15)',
                border: '1px solid rgba(0,212,255,0.4)',
                color: '#00d4ff',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0,
                fontFamily: 'monospace',
                letterSpacing: 0.5,
              }}
            >
              Invite
            </button>
          </div>
          {inviteError && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#f87171' }}>{inviteError}</p>
          )}
          {inviteSent && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check size={12} /> Invitation sent to {inviteSent}
            </p>
          )}
        </form>

        {/* Copy link */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 18px',
            borderBottom: '1px solid rgba(0,212,255,0.1)',
            background: 'rgba(14,16,22,0.4)',
            flexShrink: 0,
          }}
        >
          <Link2 size={14} style={{ color: '#8892a0', flexShrink: 0 }} />
          <span
            style={{
              flex: 1,
              fontSize: 11,
              color: '#8892a0',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {FAKE_SHARE_URL}
          </span>
          <button
            onClick={handleCopyLink}
            aria-label="Copy share link"
            style={{
              background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(0,212,255,0.1)',
              border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(0,212,255,0.3)'}`,
              color: copied ? '#4ade80' : '#00d4ff',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 200ms',
              fontFamily: 'monospace',
            }}
          >
            {copied ? <Check size={12} /> : <Link2 size={12} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,212,255,0.15)', flexShrink: 0 }}>
          <button style={tabStyle(activeTab === 'internal')} onClick={() => setActiveTab('internal')} aria-selected={activeTab === 'internal'}>
            Internal ({collaborators.filter((c) => c.type === 'internal').length})
          </button>
          <button style={tabStyle(activeTab === 'external')} onClick={() => setActiveTab('external')} aria-selected={activeTab === 'external'}>
            External ({collaborators.filter((c) => c.type === 'external').length})
          </button>
        </div>

        {/* Collaborators list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
          <div style={{ fontSize: 11, color: '#8892a0', fontFamily: 'monospace', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
            {activeTab === 'internal' ? 'Team Members' : 'Outside Collaborators'} — {tabCollabs.length}
          </div>
          {tabCollabs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#8892a0', fontSize: 13, padding: '24px 0' }}>
              No {activeTab} collaborators yet.
            </div>
          ) : (
            tabCollabs.map((c) => (
              <CollaboratorRow
                key={c.id}
                collab={c}
                onRoleChange={handleRoleChange}
                onRemove={handleRemove}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
