'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Folder,
  Plus,
  Trash2,
  Clock,
  FileSpreadsheet,
  GitCompare,
  Share2,
  FileText,
  X,
  Star,
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronRight,
  Archive,
  Users,
  FolderPlus,
  MoreHorizontal,
  CheckCircle2,
  Circle,
  Pencil,
  XCircle,
} from 'lucide-react';
import type { ProjectState } from '@/lib/types';
import DrawingComparison from '@/components/DrawingComparison';
import CollaborationPanel from '@/components/CollaborationPanel';
import AutoNameTool from '@/components/AutoNameTool';

/* ── Project thumbnail helpers ─────────────────────────────────── */
const THUMB_PALETTE = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#10B981',
  '#06B6D4', '#EAB308', '#EF4444', '#6366F1', '#14B8A6',
];

function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function thumbColor(name: string): string {
  return THUMB_PALETTE[nameHash(name) % THUMB_PALETTE.length];
}

function thumbInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface ProjectRow {
  id: string;
  name: string;
  // API returns camelCase — support both for forward/backward compat
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
  pdfPath?: string;
  pdf_path?: string;
  pageCount?: number;
  state?: ProjectState;
  thumbnail?: string;
}

/** Format a project date — handles camelCase and snake_case API fields */
function fmtDate(p: ProjectRow): string {
  const raw = p.updatedAt || p.createdAt || p.updated_at || p.created_at;
  if (!raw) return '—';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

interface FolderItem {
  id: string;
  name: string;
  projectIds: string[];
}

type SidebarSection = 'all' | 'starred' | 'my-projects' | 'shared' | 'archived' | string; // string = folder id

// localStorage helpers
function loadStarred(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem('mx-starred');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveStarred(s: Set<string>) {
  localStorage.setItem('mx-starred', JSON.stringify([...s]));
}
function loadFolders(): FolderItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('mx-folders');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveFolders(f: FolderItem[]) {
  localStorage.setItem('mx-folders', JSON.stringify(f));
}
function loadOnboardingDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('mx-onboarding-complete') === 'true';
}
function saveOnboardingDismissed(v: boolean) {
  localStorage.setItem('mx-onboarding-complete', v ? 'true' : 'false');
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showCollab, setShowCollab] = useState(false);
  const [showAutoName, setShowAutoName] = useState(false);

  // New dashboard state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');
  const [activeSection, setActiveSection] = useState<SidebarSection>('all');
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null);

  // Load persisted local state
  useEffect(() => {
    setStarredIds(loadStarred());
    setFolders(loadFolders());
    setShowOnboarding(!loadOnboardingDismissed());
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error(`Failed to load projects (${res.status})`);
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const trimmed = newName.trim();
      // BUG-R5-005: check for duplicate project name — open existing instead of creating
      const existing = projects.find(
        (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existing) {
        handleOpen(existing.id);
        setShowCreate(false);
        setNewName('');
        return;
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          state: {
            classifications: [],
            polygons: [],
            annotations: [],
            scale: null,
            scales: {},
            currentPage: 1,
            totalPages: 1,
          } as ProjectState,
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const data = await res.json();
      setShowCreate(false);
      setNewName('');
      handleOpen(data.project.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Create failed';
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      setError(message);
    }
  };

  const handleOpen = (id: string) => router.push(`/?project=${id}`);

  // Star toggle
  const toggleStar = (id: string) => {
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveStarred(next);
      return next;
    });
  };

  // Folder CRUD
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const folder: FolderItem = { id: crypto.randomUUID(), name: newFolderName.trim(), projectIds: [] };
    const next = [...folders, folder];
    setFolders(next);
    saveFolders(next);
    setNewFolderName('');
    setCreatingFolder(false);
  };

  const handleDeleteFolder = (folderId: string) => {
    const next = folders.filter(f => f.id !== folderId);
    setFolders(next);
    saveFolders(next);
    if (activeSection === folderId) setActiveSection('all');
  };

  const handleRenameFolder = (folderId: string) => {
    if (!editFolderName.trim()) return;
    const next = folders.map(f => f.id === folderId ? { ...f, name: editFolderName.trim() } : f);
    setFolders(next);
    saveFolders(next);
    setEditingFolderId(null);
    setEditFolderName('');
  };

  const moveToFolder = (projectId: string, folderId: string) => {
    const next = folders.map(f => {
      const filtered = f.projectIds.filter(pid => pid !== projectId);
      if (f.id === folderId) return { ...f, projectIds: [...filtered, projectId] };
      return { ...f, projectIds: filtered };
    });
    setFolders(next);
    saveFolders(next);
    setContextMenu(null);
  };

  // Filter projects based on active section and search
  const filteredProjects = useMemo(() => {
    let list = projects;
    // Section filter
    if (activeSection === 'starred') {
      list = list.filter(p => starredIds.has(p.id));
    } else if (activeSection === 'my-projects') {
      // All projects are "mine" in single-user mode
    } else if (activeSection === 'shared') {
      list = []; // No shared projects in single-user mode
    } else if (activeSection === 'archived') {
      list = []; // No archived projects yet
    } else if (activeSection !== 'all') {
      // Folder filter
      const folder = folders.find(f => f.id === activeSection);
      if (folder) list = list.filter(p => folder.projectIds.includes(p.id));
    }
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }

    const sorted = [...list];
    const getTimestamp = (p: ProjectRow) => {
      const raw = p.updatedAt || p.createdAt || p.updated_at || p.created_at;
      const time = raw ? new Date(raw).getTime() : 0;
      return Number.isNaN(time) ? 0 : time;
    };

    if (sortBy === 'newest') {
      sorted.sort((a, b) => getTimestamp(b) - getTimestamp(a));
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => getTimestamp(a) - getTimestamp(b));
    } else if (sortBy === 'az') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'za') {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    }

    return sorted;
  }, [projects, activeSection, starredIds, searchQuery, folders, sortBy]);

  // Onboarding steps
  const onboardingSteps = useMemo(() => [
    { label: 'Create a project', done: projects.length > 0, hint: '' },
    { label: 'Upload drawings', done: projects.some(p => p.pdfPath || p.pdf_path || (p.pageCount ?? 0) > 0), hint: '' },
    { label: 'Set the scale', done: false, hint: 'Click the "No scale" indicator in the toolbar to calibrate your drawing scale.' },
    { label: 'Run AI takeoff', done: false, hint: 'Click the Sparkles (\u2728) button in the toolbar to auto-detect quantities.' },
    { label: 'Export quantities', done: false, hint: '' },
  ], [projects]);
  const completedOnboardingSteps = onboardingSteps.filter(step => step.done).length;

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    saveOnboardingDismissed(true);
  };

  // Section label
  const sectionLabel = activeSection === 'all' ? 'All Projects'
    : activeSection === 'starred' ? 'Starred'
    : activeSection === 'my-projects' ? 'My Projects'
    : activeSection === 'shared' ? 'Shared with Me'
    : activeSection === 'archived' ? 'Archived'
    : folders.find(f => f.id === activeSection)?.name || 'Projects';

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  return (
    <div className="min-h-screen bg-zinc-900 text-white flex flex-col" onClick={() => contextMenu && setContextMenu(null)}>
      {/* Top header bar */}
      <header className="bg-zinc-800 border-b border-zinc-700 px-3 sm:px-6 py-3 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <FileSpreadsheet size={22} className="text-blue-400 shrink-0" aria-hidden />
          <span className="text-lg font-bold">MeasureX</span>
          <span className="text-zinc-400 text-sm ml-1 hidden sm:inline">Projects</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap justify-end">
          {/* Search in header */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
            <input
              aria-label="Search projects"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="bg-zinc-700 border border-zinc-600 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-zinc-400 outline-none focus:border-blue-500 w-32 sm:w-56"
            />
          </div>
          <select
            aria-label="Sort projects"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'az' | 'za')}
            className="bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A-Z</option>
            <option value="za">Z-A</option>
          </select>
          <button aria-label="Compare Drawings" onClick={() => setShowCompare(true)}
            className="hidden md:flex bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg text-sm font-medium items-center gap-1.5 transition-colors border border-zinc-600">
            <GitCompare size={14} aria-hidden /> Compare
          </button>
          <button aria-label="Share Project" onClick={() => setShowCollab(true)}
            className="hidden md:flex bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg text-sm font-medium items-center gap-1.5 transition-colors border border-zinc-600">
            <Share2 size={14} aria-hidden /> Share
          </button>
          <button aria-label="Auto-Name Drawings" onClick={() => setShowAutoName(true)}
            className="hidden lg:flex bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg text-sm font-medium items-center gap-1.5 transition-colors border border-zinc-600">
            <FileText size={14} aria-hidden /> Auto-Name
          </button>
          <button aria-label="New Project"
            onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 sm:px-4 py-1.5 rounded-lg font-medium text-sm flex items-center gap-1.5 transition-colors min-h-[44px]"
            style={{ touchAction: 'manipulation' }}>
            <Plus size={14} aria-hidden /> <span className="hidden sm:inline">New Project</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar — hidden on mobile */}
        <aside className="hidden md:flex w-56 bg-zinc-800/80 border-r border-zinc-700 flex-col shrink-0 overflow-y-auto">
          <nav className="flex-1 py-3">
            {/* All Projects */}
            <button
              onClick={() => setActiveSection('all')}
              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-zinc-700/60 transition-colors ${activeSection === 'all' ? 'bg-zinc-700/80 text-white' : 'text-zinc-300'}`}
            >
              <span className="flex items-center gap-2"><Folder size={15} aria-hidden /> All Projects</span>
              <span className="text-xs text-zinc-500 bg-zinc-700 px-1.5 py-0.5 rounded">{projects.length}</span>
            </button>

            {/* Starred */}
            <button
              onClick={() => setActiveSection('starred')}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-zinc-700/60 transition-colors ${activeSection === 'starred' ? 'bg-zinc-700/80 text-white' : 'text-zinc-300'}`}
            >
              <Star size={15} aria-hidden /> Starred
            </button>

            {/* My Projects */}
            <button
              onClick={() => setActiveSection('my-projects')}
              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-zinc-700/60 transition-colors ${activeSection === 'my-projects' ? 'bg-zinc-700/80 text-white' : 'text-zinc-300'}`}
            >
              <span className="flex items-center gap-2"><FileSpreadsheet size={15} aria-hidden /> My Projects</span>
              <span className="text-xs text-zinc-500 bg-zinc-700 px-1.5 py-0.5 rounded">{projects.length}</span>
            </button>

            {/* Shared with Me */}
            <button
              onClick={() => setActiveSection('shared')}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-zinc-700/60 transition-colors ${activeSection === 'shared' ? 'bg-zinc-700/80 text-white' : 'text-zinc-300'}`}
            >
              <Users size={15} aria-hidden /> Shared with Me
            </button>

            {/* Divider */}
            <div className="border-t border-zinc-700 my-2" />

            {/* Folders header */}
            <div className="px-4 py-1.5 flex items-center justify-between">
              <button
                onClick={() => setFoldersExpanded(!foldersExpanded)}
                className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1 hover:text-zinc-200"
              >
                {foldersExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Folders
              </button>
              <button
                aria-label="Create folder"
                onClick={() => setCreatingFolder(true)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <FolderPlus size={14} />
              </button>
            </div>

            {foldersExpanded && (
              <>
                {creatingFolder && (
                  <div className="px-4 py-1 flex items-center gap-1">
                    <input
                      aria-label="Folder name"
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateFolder();
                        if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
                      }}
                      placeholder="Folder name"
                      className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                      autoFocus
                    />
                    <button onClick={handleCreateFolder} className="text-blue-400 hover:text-blue-300 text-xs">Add</button>
                  </div>
                )}
                {folders.map(f => (
                  <div key={f.id} className="group flex items-center">
                    {editingFolderId === f.id ? (
                      <div className="flex-1 px-4 py-1 flex items-center gap-1">
                        <input
                          value={editFolderName}
                          onChange={e => setEditFolderName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameFolder(f.id);
                            if (e.key === 'Escape') { setEditingFolderId(null); setEditFolderName(''); }
                          }}
                          className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setActiveSection(f.id)}
                        className={`flex-1 text-left px-4 py-1.5 pl-7 text-sm flex items-center gap-2 hover:bg-zinc-700/60 transition-colors ${activeSection === f.id ? 'bg-zinc-700/80 text-white' : 'text-zinc-300'}`}
                      >
                        <Folder size={13} aria-hidden /> {f.name}
                        <span className="text-xs text-zinc-500 ml-auto">{f.projectIds.length}</span>
                      </button>
                    )}
                    <div className="hidden group-hover:flex items-center pr-2 gap-0.5">
                      <button aria-label={`Rename folder ${f.name}`}
                        onClick={() => { setEditingFolderId(f.id); setEditFolderName(f.name); }}
                        className="text-zinc-400 hover:text-white p-0.5"><Pencil size={11} /></button>
                      <button aria-label={`Delete folder ${f.name}`}
                        onClick={() => handleDeleteFolder(f.id)}
                        className="text-zinc-400 hover:text-red-400 p-0.5"><Trash2 size={11} /></button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Divider */}
            <div className="border-t border-zinc-700 my-2" />

            {/* Archived */}
            <button
              onClick={() => setActiveSection('archived')}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-zinc-700/60 transition-colors ${activeSection === 'archived' ? 'bg-zinc-700/80 text-white' : 'text-zinc-300'}`}
            >
              <Archive size={15} aria-hidden /> Archived
            </button>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm flex items-center justify-between">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError(null)} className="text-red-300 hover:text-white ml-3"><X size={14} /></button>
            </div>
          )}

          {/* Onboarding checklist */}
          {showOnboarding && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-base">Your First Takeoff</h3>
                <button aria-label="Dismiss onboarding" onClick={dismissOnboarding} className="text-zinc-400 hover:text-white"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {onboardingSteps.map((step, i) => (
                  <div key={i} className={`flex flex-col gap-1 text-sm rounded-lg p-2 ${step.done ? 'bg-green-900/20' : 'bg-zinc-700/30'}`}>
                    <div className={`flex items-center gap-2 ${step.done ? 'text-green-400' : 'text-zinc-300'}`}>
                      {step.done ? <CheckCircle2 size={16} className="text-green-400 shrink-0" /> : <Circle size={16} className="text-zinc-500 shrink-0" />}
                      <span className={step.done ? 'line-through' : 'font-medium'}>{step.label}</span>
                    </div>
                    {step.hint && !step.done && (
                      <span className="text-xs text-zinc-500 ml-6">{step.hint}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <div className="w-full h-1 rounded bg-zinc-700 overflow-hidden">
                  <div
                    className="h-1 bg-green-400 transition-all"
                    style={{ width: `${(completedOnboardingSteps / onboardingSteps.length) * 100}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-zinc-400">{completedOnboardingSteps}/{onboardingSteps.length} steps complete</div>
              </div>
              <button
                type="button"
                onClick={dismissOnboarding}
                className="mt-3 text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
              >
                Skip tutorial
              </button>
            </div>
          )}

          {/* Section header + view toggle */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{sectionLabel}</h2>
            <div className="flex items-center gap-2">
              <button
                aria-label="Grid view"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
              ><LayoutGrid size={16} /></button>
              <button
                aria-label="List view"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
              ><List size={16} /></button>
            </div>
          </div>

          {/* Create project inline */}
          {showCreate && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 mb-5">
              <h3 className="font-semibold text-sm mb-3">Create New Project</h3>
              <div className="flex gap-3">
                <input
                  aria-label="Project name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Project name (e.g., 123 Main St Addition)"
                  className="flex-1 bg-zinc-700 border border-zinc-600 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-400 outline-none focus:border-blue-500"
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
                <button aria-label="Create project" onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="bg-green-600 hover:bg-green-500 disabled:bg-zinc-600 disabled:text-zinc-400 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors">
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button aria-label="Cancel create"
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                  className="text-zinc-400 hover:text-white px-3 text-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden animate-pulse">
                  <div className="h-28 bg-gray-800 rounded-t" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-gray-800 rounded w-3/4" />
                    <div className="h-3 bg-gray-800 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : error && projects.length === 0 ? (
            <div className="text-center py-16">
              <XCircle size={48} className="text-red-500 mx-auto mb-4" aria-hidden />
              <div className="text-lg text-zinc-300 mb-2">Failed to load projects</div>
              <div className="text-sm text-zinc-500 mb-4">Please try again.</div>
              <button
                onClick={() => { setError(null); loadProjects(); }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-16">
              <Folder size={48} className="text-zinc-600 mx-auto mb-4" aria-hidden />
              <div className="text-lg text-zinc-400 mb-2">No projects yet</div>
              <div className="text-sm text-zinc-500 mb-4">Click &quot;New Project&quot; to get started</div>
              <button
                onClick={() => setShowCreate(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors inline-flex items-center gap-2"
              >
                <Plus size={14} /> New Project
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid view */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProjects.map(p => {
                const polyCount = p.state?.polygons?.length || 0;
                const clsCount = p.state?.classifications?.length || 0;
                return (
                  <div
                    key={p.id}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden hover:border-zinc-500 transition-colors cursor-pointer group"
                    onClick={() => handleOpen(p.id)}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, projectId: p.id }); }}
                  >
                    {/* Project thumbnail */}
                    {p.thumbnail ? (
                      <img
                        src={p.thumbnail}
                        alt="Project preview"
                        className="w-full h-28 object-cover"
                        style={{ background: '#0a0a0f' }}
                      />
                    ) : (
                      <div
                        className="h-28 flex items-center justify-center"
                        style={{ backgroundColor: thumbColor(p.name) + '22' }}
                      >
                        <span
                          className="text-2xl font-bold rounded-full w-14 h-14 flex items-center justify-center"
                          style={{ backgroundColor: thumbColor(p.name), color: '#fff' }}
                        >
                          {thumbInitials(p.name)}
                        </span>
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-medium text-sm text-white truncate flex-1">{p.name}</span>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          <button
                            aria-label={starredIds.has(p.id) ? `Unstar ${p.name}` : `Star ${p.name}`}
                            onClick={e => { e.stopPropagation(); toggleStar(p.id); }}
                            className="text-zinc-500 hover:text-yellow-400 transition-colors p-0.5"
                          >
                            <Star size={14} className={starredIds.has(p.id) ? 'fill-yellow-400 text-yellow-400' : ''} />
                          </button>
                          <button
                            aria-label={`Actions for ${p.name}`}
                            onClick={e => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, projectId: p.id }); }}
                            className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white transition-opacity p-0.5"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-400">
                        <span className="flex items-center gap-1"><Clock size={11} aria-hidden />{fmtDate(p)}</span>
                        {polyCount > 0 && <span>{polyCount} drawings</span>}
                        {clsCount > 0 && <span>{clsCount} cls</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List view */
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-zinc-400 text-left">
                    <th className="px-4 py-3 font-medium w-8"></th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Last Edited</th>
                    <th className="px-4 py-3 font-medium">Drawings</th>
                    <th className="px-4 py-3 font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map(p => {
                    const polyCount = p.state?.polygons?.length || 0;
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-zinc-700/50 hover:bg-zinc-700/40 cursor-pointer transition-colors group"
                        onClick={() => handleOpen(p.id)}
                        onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, projectId: p.id }); }}
                      >
                        <td className="px-4 py-3">
                          <button
                            aria-label={starredIds.has(p.id) ? `Unstar ${p.name}` : `Star ${p.name}`}
                            onClick={e => { e.stopPropagation(); toggleStar(p.id); }}
                            className="text-zinc-500 hover:text-yellow-400 transition-colors"
                          >
                            <Star size={14} className={starredIds.has(p.id) ? 'fill-yellow-400 text-yellow-400' : ''} />
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-white">
                          <span className="flex items-center gap-2.5">
                            <span
                              className="text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shrink-0"
                              style={{ backgroundColor: thumbColor(p.name), color: '#fff' }}
                            >
                              {thumbInitials(p.name)}
                            </span>
                            {p.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{fmtDate(p)}</td>
                        <td className="px-4 py-3 text-zinc-400">{polyCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              aria-label={`Actions for ${p.name}`}
                              onClick={e => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, projectId: p.id }); }}
                              className="text-zinc-400 hover:text-white p-1"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            <button
                              aria-label={`Delete ${p.name}`}
                              onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                              className="text-zinc-400 hover:text-red-400 p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
            onClick={() => { handleOpen(contextMenu.projectId); setContextMenu(null); }}
          >Open</button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
            onClick={() => { toggleStar(contextMenu.projectId); setContextMenu(null); }}
          >{starredIds.has(contextMenu.projectId) ? 'Unstar' : 'Star'}</button>
          {folders.length > 0 && (
            <>
              <div className="border-t border-zinc-700 my-1" />
              <div className="px-4 py-1 text-xs text-zinc-500">Move to folder</div>
              {folders.map(f => (
                <button
                  key={f.id}
                  className="w-full text-left px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2"
                  onClick={() => moveToFolder(contextMenu.projectId, f.id)}
                >
                  <Folder size={12} /> {f.name}
                </button>
              ))}
            </>
          )}
          <div className="border-t border-zinc-700 my-1" />
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
            onClick={() => { handleDelete(contextMenu.projectId); setContextMenu(null); }}
          >Delete</button>
        </div>
      )}

      {/* Modals — preserved exactly */}
      {showCompare && (
        <DrawingComparison onClose={() => setShowCompare(false)} />
      )}

      {showCollab && (
        <CollaborationPanel onClose={() => setShowCollab(false)} />
      )}

      {showAutoName && (
        <div
          role="dialog"
          aria-label="Auto-Name Tool"
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
          <div style={{ position: 'relative', width: '100%', maxWidth: 600 }}>
            <button
              aria-label="Close auto-name tool"
              onClick={() => setShowAutoName(false)}
              style={{
                position: 'absolute',
                top: -12,
                right: -12,
                zIndex: 1,
                background: '#1a1a2e',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#8892a0',
                borderRadius: '50%',
                width: 28,
                height: 28,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
            <AutoNameTool />
          </div>
        </div>
      )}
    </div>
  );
}
