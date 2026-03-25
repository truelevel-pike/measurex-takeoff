'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Folder,
  Plus,
  Trash2,
  Clock,
  FileSpreadsheet,
  GitCompare,
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
  Upload,
  Loader2,
  BookOpen,
  GraduationCap,
  Play,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import type { ProjectState } from '@/lib/types';
const DrawingComparison = dynamic(() => import('@/components/DrawingComparison'), { ssr: false });
import CollaborationPanel from '@/components/CollaborationPanel';
import AutoNameTool from '@/components/AutoNameTool';
import RecentProjectsSection, { saveRecentProject } from '@/components/RecentProjectsSection';
import DuplicateProjectModal from '@/components/DuplicateProjectModal';
import RecentProjects from '@/components/RecentProjects';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import TagInput from '@/components/TagInput';
import { getActiveWorkspace } from '@/lib/workspace';
import { saveDemoProject, DEMO_PROJECT_ID } from '@/lib/demo-data';
const WhatsNewModal = dynamic(() => import('@/components/WhatsNewModal'), { ssr: false });
import { useWhatsNew } from '@/components/WhatsNewModal';

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
  tags?: string[];
  polygonCount?: number;
  scaleCount?: number;
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
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed);
  } catch { return new Set(); }
}
function saveStarred(s: Set<string>) {
  localStorage.setItem('mx-starred', JSON.stringify([...s]));
}
function loadFolders(): FolderItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('mx-folders');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch { return []; }
}
function saveFolders(f: FolderItem[]) {
  localStorage.setItem('mx-folders', JSON.stringify(f));
}
// Tags stored per-project in localStorage
function loadProjectTags(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('mx-project-tags');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed;
  } catch { return {}; }
}
function saveProjectTags(tags: Record<string, string[]>) {
  localStorage.setItem('mx-project-tags', JSON.stringify(tags));
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
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [projectsOffset, setProjectsOffset] = useState(0);
  const PROJECTS_PAGE_SIZE = 20;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // BUG-W16-003: thumbnails are not included in the list endpoint — fetch lazily
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showCollab, setShowCollab] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Wave 21: multi-select for bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [showAutoName, setShowAutoName] = useState(false);
  const whatsNew = useWhatsNew();

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
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; name: string } | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newProjectTags, setNewProjectTags] = useState<string[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pageDragOver, setPageDragOver] = useState(false);
  const pageDragCounter = React.useRef(0);

  // Load persisted local state
  useEffect(() => {
    setStarredIds(loadStarred());
    setFolders(loadFolders());
    setShowOnboarding(!loadOnboardingDismissed());
  }, []);

  const loadProjects = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true);
      setProjectsOffset(0);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const offset = reset ? 0 : projectsOffset;
      const res = await fetch(`/api/projects?limit=${PROJECTS_PAGE_SIZE}&offset=${offset}`);
      if (res.status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
      if (!res.ok) throw new Error(`Failed to load projects (${res.status})`);
      const data = await res.json();
      const projectTags = loadProjectTags();
      const enriched = (data.projects || []).map((p: ProjectRow) => ({
        ...p,
        tags: projectTags[p.id] || [],
      }));
      setProjectsTotal(data.total ?? enriched.length);
      if (reset) {
        setProjects(enriched);
      } else {
        setProjects(prev => [...prev, ...enriched]);
        setProjectsOffset(offset + enriched.length);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      setError(message);
      if (message.includes('Too many requests')) {
        setTimeout(() => loadProjects(reset), 5000);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsOffset]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // BUG-W16-003: lazy-load thumbnails for projects that have data (polygonCount > 0).
  // Fetch max 10 at a time to avoid hammering the API.
  useEffect(() => {
    const needsThumbnail = projects
      .filter(p => !p.thumbnail && !thumbnails[p.id] && (p.polygonCount ?? 0) > 0)
      .slice(0, 10);
    if (needsThumbnail.length === 0) return;

    let cancelled = false;
    const fetchBatch = async () => {
      const results = await Promise.allSettled(
        needsThumbnail.map(async (p) => {
          const res = await fetch(`/api/projects/${p.id}`, { cache: 'no-store' });
          if (!res.ok) return null;
          const data = await res.json();
          return { id: p.id, thumbnail: data.project?.thumbnail as string | null };
        })
      );
      if (cancelled) return;
      const updates: Record<string, string> = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.thumbnail) {
          updates[r.value.id] = r.value.thumbnail;
        }
      }
      if (Object.keys(updates).length > 0) {
        setThumbnails(prev => ({ ...prev, ...updates }));
      }
    };
    void fetchBatch();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    // If a PDF is selected, use the full upload flow
    if (pdfFile) {
      setShowCreate(false);
      const name = newName.trim();
      setNewName('');
      setPdfFile(null);
      setNewProjectTags([]);
      await handlePdfUpload(pdfFile, name);
      return;
    }
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
      // Save tags for the new project
      if (newProjectTags.length > 0) {
        const allProjectTags = loadProjectTags();
        allProjectTags[data.project.id] = newProjectTags;
        saveProjectTags(allProjectTags);
      }
      setShowCreate(false);
      setNewName('');
      setNewProjectTags([]);
      loadProjects();
      handleOpen(data.project.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Create failed';
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string) => {
    // BUG-W19-004: replace window.confirm with a proper modal
    setPendingDeleteId(id);
  };

  const toggleSelectProject = (id: string, shiftKey = false) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedId) {
        // Range select using current projects order
        const ids = projects.map((p) => p.id);
        const a = ids.indexOf(lastSelectedId);
        const b = ids.indexOf(id);
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i++) next.add(ids[i]);
      } else {
        if (next.has(id)) next.delete(id); else next.add(id);
      }
      return next;
    });
    setLastSelectedId(id);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    setConfirmBulkDelete(false);
    setSelectedIds(new Set());
    await Promise.allSettled(
      ids.map((id) => fetch(`/api/projects/${id}`, { method: 'DELETE' }))
    );
    setProjects((prev) => prev.filter((p) => !ids.includes(p.id)));
    setProjectsTotal((prev) => Math.max(0, prev - ids.length));
    // BUG-W27-004: clear localStorage if the currently open project was bulk-deleted
    if (typeof localStorage !== 'undefined') {
      const current = localStorage.getItem('measurex_project_id');
      if (current && ids.includes(current)) {
        localStorage.removeItem('measurex_project_id');
      }
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setProjects(prev => prev.filter(p => p.id !== id));
      // BUG-W27-004: if this is the currently open project, clear localStorage
      // so the canvas doesn't reload stale state when the user navigates back.
      if (typeof localStorage !== 'undefined' && localStorage.getItem('measurex_project_id') === id) {
        localStorage.removeItem('measurex_project_id');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      setError(message);
    }
  };

  const handleOpen = (id: string, name?: string) => {
    const project = projects.find(p => p.id === id);
    saveRecentProject(id, project?.name || name || id);
    router.push(`/?project=${id}`);
  };

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
    // Workspace filter — only show projects in the active workspace (empty = show all)
    // Guard against SSR where window/localStorage is unavailable (prevents React #310)
    const ws = typeof window !== 'undefined' ? getActiveWorkspace() : null;
    if (ws && ws.projectIds.length > 0) {
      list = list.filter(p => ws.projectIds.includes(p.id));
    }
    // Search filter — matches project name OR any tag (Wave 30B)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    // Tag filter (OR logic)
    if (selectedTags.length > 0) {
      list = list.filter(p => p.tags?.some(t => selectedTags.includes(t)));
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
  }, [projects, activeSection, starredIds, searchQuery, folders, sortBy, selectedTags]);

  // Onboarding steps — derived from real project data instead of stale localStorage flags
  const onboardingSteps = useMemo(() => {
    const hasScale = projects.some(p => (p.scaleCount ?? 0) > 0);
    const hasPolygons = projects.some(p => (p.polygonCount ?? 0) > 0);
    return [
      { label: 'Create a project', done: projects.length > 0, hint: '' },
      { label: 'Upload drawings', done: projects.some(p => p.pdfPath || p.pdf_path || (p.pageCount ?? 0) > 0), hint: '' },
      { label: 'Set the scale', done: hasScale, hint: 'Click the "No scale" indicator in the toolbar to calibrate your drawing scale.' },
      { label: 'Run AI takeoff', done: localStorage.getItem('mx-onboarding-takeoff-run') === 'true', hint: 'Click the Sparkles (\u2728) button in the toolbar to auto-detect quantities.' },
      { label: 'Export quantities', done: localStorage.getItem('mx-onboarding-exported') === 'true', hint: '' },
    ];
  }, [projects]);
  const completedOnboardingSteps = onboardingSteps.filter(step => step.done).length;

  // Collect all unique tags from all projects
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const p of projects) {
      if (p.tags) p.tags.forEach(t => tags.add(t));
    }
    return [...tags].sort();
  }, [projects]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }, []);

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    saveOnboardingDismissed(true);
  };

  /** Auto-generate project name from PDF filename */
  const nameFromFile = (file: File) =>
    file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');

  /** Full PDF upload flow: create project → upload file → redirect */
  // BUG-A8-5-009 fix: wrap in useCallback so handlePageDrop dep array is valid
  // BUG-A8-6-001 fix: moved before handlePageDrop to fix "used before declaration" TS error
  const handlePdfUpload = useCallback(async (file: File, projectName?: string) => {
    const name = (projectName || nameFromFile(file)).trim();
    if (!name) return;
    setUploading(true);
    try {
      // 1. Create the project
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          state: { classifications: [], polygons: [], annotations: [], scale: null, scales: {}, currentPage: 1, totalPages: 1 } as ProjectState,
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const data = await res.json();
      const projectId = data.project.id;

      // 2. Upload the PDF
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: fd,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

      // 3. Refresh project list then redirect
      await loadProjects();
      saveRecentProject(projectId, name);
      router.push(`/?project=${projectId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      await loadProjects();
      setUploading(false);
    }
  }, [loadProjects, router]);

  // Page-wide drag-and-drop handlers
  // BUG-A8-6-001 fix: moved after handlePdfUpload to fix "used before declaration" TS error
  const handlePageDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    pageDragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setPageDragOver(true);
    }
  }, []);
  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    pageDragCounter.current--;
    if (pageDragCounter.current === 0) {
      setPageDragOver(false);
    }
  }, []);
  const handlePageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);
  // BUG-A8-5-009 fix: add handlePdfUpload to useCallback deps
  const handlePageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    pageDragCounter.current = 0;
    setPageDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handlePdfUpload(file);
    }
  }, [handlePdfUpload]);

  /** Handle file selection in the create modal */
  const handleFileSelect = (file: File | null) => {
    setPdfFile(file);
    if (file && !newName.trim()) {
      setNewName(nameFromFile(file));
    }
  };

  /** Handle drop on the empty-state drop zone */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handlePdfUpload(file);
    }
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
    <div
      className="min-h-screen bg-[#000000] text-white flex flex-col"
      onClick={() => contextMenu && setContextMenu(null)}
      onDragEnter={handlePageDragEnter}
      onDragLeave={handlePageDragLeave}
      onDragOver={handlePageDragOver}
      onDrop={handlePageDrop}
    >
      {/* Hero section */}
      <header className="bg-[#000000] border-b border-[#00d4ff]/40 shrink-0">
        <div className="px-4 sm:px-8 py-6 sm:py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#00d4ff]/10 border border-[#00d4ff]/30 p-2.5 rounded-xl">
              <FileSpreadsheet size={32} className="text-blue-400" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">MeasureX</h1>
              <p className="text-sm text-[#00d4ff]/70 font-mono tracking-wider">AI-POWERED CONSTRUCTION TAKEOFF</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <WorkspaceSwitcher />
            </div>
            <button
              aria-label="Upload PDF"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.pdf';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handlePdfUpload(file);
                };
                input.click();
              }}
              className="border border-[#00d4ff]/60 hover:border-[#00d4ff] text-[#00d4ff] hover:bg-[#00d4ff]/10 bg-transparent px-5 sm:px-6 py-2.5 rounded-lg font-mono font-semibold text-sm flex items-center gap-2 transition-all min-h-[44px] tracking-wider"
              style={{ touchAction: 'manipulation' }}
            >
              <Upload size={16} aria-hidden /> Upload PDF
            </button>
          </div>
        </div>
        {/* Secondary toolbar */}
        <div className="px-4 sm:px-8 pb-3 flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
            <input
              aria-label="Search projects"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search name or tag…"
              className="bg-[#0a0a0f] border border-zinc-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#00d4ff]/60 w-32 sm:w-56 font-mono"
            />
            {searchQuery.trim() && (
              <span
                data-testid="search-result-count"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#00d4ff]/60 font-mono pointer-events-none"
                aria-live="polite"
              >
                {filteredProjects.length}
              </span>
            )}
          </div>
          <select
            aria-label="Sort projects"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'az' | 'za')}
            className="bg-[#0a0a0f] text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#00d4ff]/60 font-mono"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A-Z</option>
            <option value="za">Z-A</option>
          </select>
          <button aria-label="Classification Library" onClick={() => router.push('/library')}
            className="hidden md:flex bg-transparent hover:bg-[#00d4ff]/10 text-zinc-400 hover:text-[#00d4ff] px-3 py-1.5 rounded-lg text-sm font-mono items-center gap-1.5 transition-colors border border-zinc-700 hover:border-[#00d4ff]/40">
            <BookOpen size={14} aria-hidden /> Library
          </button>
          <button aria-label="Compare Drawings" onClick={() => setShowCompare(true)}
            className="hidden md:flex bg-transparent hover:bg-[#00d4ff]/10 text-zinc-400 hover:text-[#00d4ff] px-3 py-1.5 rounded-lg text-sm font-mono items-center gap-1.5 transition-colors border border-zinc-700 hover:border-[#00d4ff]/40">
            <GitCompare size={14} aria-hidden /> Compare
          </button>
          {/* Share is available via right-click context menu on individual projects */}
          <button aria-label="Auto-Name Drawings" onClick={() => setShowAutoName(true)}
            className="hidden lg:flex bg-transparent hover:bg-[#00d4ff]/10 text-zinc-400 hover:text-[#00d4ff] px-3 py-1.5 rounded-lg text-sm font-mono items-center gap-1.5 transition-colors border border-zinc-700 hover:border-[#00d4ff]/40">
            <FileText size={14} aria-hidden /> Auto-Name
          </button>
          <button aria-label="What's New" onClick={whatsNew.open}
            className="hidden lg:flex bg-transparent hover:bg-[#00d4ff]/10 text-zinc-400 hover:text-[#00d4ff] px-3 py-1.5 rounded-lg text-sm font-mono items-center gap-1.5 transition-colors border border-zinc-700 hover:border-[#00d4ff]/40">
            <Star size={14} aria-hidden /> What&apos;s New
          </button>
          <button aria-label="New Project"
            onClick={() => setShowCreate(true)}
            className="border border-[#00d4ff]/60 text-[#00d4ff] px-3 py-1.5 rounded text-sm font-mono flex items-center gap-1.5 transition-colors hover:bg-[#00d4ff]/15 hover:border-[#00d4ff]"
            style={{ touchAction: 'manipulation' }}>
            <Plus size={14} aria-hidden /> New Project
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar — hidden on mobile */}
        <aside className="hidden md:flex w-56 bg-[#000000] border-r border-[#00d4ff]/20 flex-col shrink-0 overflow-y-auto">
          <nav className="flex-1 py-3">
            {/* All Projects */}
            <button
              onClick={() => setActiveSection('all')}
              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-[#00d4ff]/5 transition-colors ${activeSection === 'all' ? 'border-l-2 border-[#00d4ff] text-[#00d4ff] bg-[#00d4ff]/5' : 'text-zinc-400 hover:text-[#00d4ff]'}`}
            >
              <span className="flex items-center gap-2"><Folder size={15} aria-hidden /> All Projects</span>
              <span className="text-xs text-[#00d4ff]/70 font-mono">{projects.length}</span>
            </button>

            {/* Starred */}
            <button
              onClick={() => setActiveSection('starred')}
              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-[#00d4ff]/5 transition-colors ${activeSection === 'starred' ? 'border-l-2 border-[#00d4ff] text-[#00d4ff] bg-[#00d4ff]/5' : 'text-zinc-400 hover:text-[#00d4ff]'}`}
            >
              <span className="flex items-center gap-2"><Star size={15} aria-hidden /> Starred</span>
              {starredIds.size > 0 && (
                <span className="text-xs text-[#00d4ff]/70 font-mono">{starredIds.size}</span>
              )}
            </button>

            {/* My Projects */}
            <button
              onClick={() => setActiveSection('my-projects')}
              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-[#00d4ff]/5 transition-colors ${activeSection === 'my-projects' ? 'border-l-2 border-[#00d4ff] text-[#00d4ff] bg-[#00d4ff]/5' : 'text-zinc-400 hover:text-[#00d4ff]'}`}
            >
              <span className="flex items-center gap-2"><FileSpreadsheet size={15} aria-hidden /> My Projects</span>
              <span className="text-xs text-[#00d4ff]/70 font-mono">{projects.length}</span>
            </button>

            {/* Shared with Me */}
            <button
              onClick={() => setActiveSection('shared')}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-[#00d4ff]/5 transition-colors ${activeSection === 'shared' ? 'border-l-2 border-[#00d4ff] text-[#00d4ff] bg-[#00d4ff]/5' : 'text-zinc-400 hover:text-[#00d4ff]'}`}
            >
              <Users size={15} aria-hidden /> Shared with Me
            </button>

            {/* Divider */}
            <div className="border-t border-[#00d4ff]/20 my-2" />

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
                        className={`flex-1 text-left px-4 py-1.5 pl-7 text-sm flex items-center gap-2 hover:bg-[#00d4ff]/5 transition-colors ${activeSection === f.id ? 'bg-zinc-700/80 text-white' : 'text-zinc-300'}`}
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
            <div className="border-t border-[#00d4ff]/20 my-2" />

            {/* Archived */}
            <button
              onClick={() => setActiveSection('archived')}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-[#00d4ff]/5 transition-colors ${activeSection === 'archived' ? 'bg-zinc-700/80 text-white' : 'text-zinc-300'}`}
            >
              <Archive size={15} aria-hidden /> Archived
            </button>

            {/* Divider */}
            <div className="border-t border-[#00d4ff]/20 my-2" />

            {/* Library */}
            <button
              onClick={() => router.push('/library')}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-[#00d4ff]/5 transition-colors text-zinc-300"
            >
              <BookOpen size={15} aria-hidden /> Library
            </button>

            {/* Learn */}
            <button
              onClick={() => router.push('/learn')}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-[#00d4ff]/5 transition-colors text-zinc-300"
            >
              <GraduationCap size={15} aria-hidden /> Learn
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

          <RecentProjectsSection projects={projects} />

          {/* Onboarding checklist */}
          {showOnboarding && (
            <div className="bg-[#0a0a0f] border border-[#00d4ff]/20 rounded-xl p-5 mb-5">
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

          <RecentProjects />

          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              <span className="text-xs text-zinc-400 mr-1">Tags:</span>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 ml-1"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Section header + view toggle */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-mono text-[#00d4ff] tracking-wider">[ {sectionLabel.toUpperCase()} ]</h2>
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
            <div className="bg-[#0a0a0f] border border-[#00d4ff]/20 rounded-xl p-5 mb-5">
              <h3 className="font-semibold text-sm mb-3">Create New Project</h3>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">PDF Drawing (optional)</label>
                  <label className="flex items-center gap-2 bg-zinc-700 border border-zinc-600 rounded-lg px-4 py-2 text-sm text-zinc-300 cursor-pointer hover:border-zinc-500 transition-colors">
                    <Upload size={14} className="text-zinc-400 shrink-0" />
                    <span className="truncate">{pdfFile ? pdfFile.name : 'Choose PDF file...'}</span>
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      className="hidden"
                      data-testid="upload-multi-btn"
                      onChange={e => handleFileSelect(e.target.files?.[0] || null)}
                    />
                    {pdfFile && (
                      <button
                        type="button"
                        aria-label="Remove file"
                        onClick={e => { e.preventDefault(); setPdfFile(null); }}
                        className="ml-auto text-zinc-400 hover:text-white shrink-0"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                </div>
                <div className="flex gap-3">
                  <input
                    aria-label="Project name"
                    data-testid="project-name-input"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Project name (e.g., 123 Main St Addition)"
                    className="flex-1 bg-zinc-700 border border-zinc-600 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-400 outline-none focus:border-blue-500"
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    autoFocus
                  />
                  <button aria-label="Create project" data-testid="create-project-btn" onClick={handleCreate}
                    disabled={creating || !newName.trim()}
                    className="bg-green-600 hover:bg-green-500 disabled:bg-zinc-600 disabled:text-zinc-400 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors">
                    {creating ? (pdfFile ? 'Uploading...' : 'Creating...') : (pdfFile ? 'Create & Upload' : 'Create')}
                  </button>
                  <button aria-label="Cancel create"
                    onClick={() => { setShowCreate(false); setNewName(''); setPdfFile(null); setNewProjectTags([]); }}
                    className="text-zinc-400 hover:text-white px-3 text-sm">
                    Cancel
                  </button>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Tags</label>
                  <TagInput value={newProjectTags} onChange={setNewProjectTags} allTags={allTags} />
                </div>
              </div>
            </div>
          )}

          {/* First-time onboarding full-screen welcome */}
          {!loading && projects.length === 0 && showOnboarding ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20">
              <div className="flex flex-col items-center gap-6 max-w-md text-center">
                <div className="bg-[#00d4ff]/10 border border-[#00d4ff]/20 p-5 rounded-2xl">
                  <FileSpreadsheet size={56} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold tracking-tight mb-2">MeasureX</h2>
                  <p className="text-zinc-400 text-lg">Blueprint intelligence at your fingertips</p>
                </div>
                <button
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.pdf';
                    input.onchange = (ev) => {
                      const file = (ev.target as HTMLInputElement).files?.[0];
                      if (file) handlePdfUpload(file);
                    };
                    input.click();
                  }}
                  className="border border-[#00d4ff]/60 hover:border-[#00d4ff] text-[#00d4ff] hover:bg-[#00d4ff]/10 bg-transparent px-8 py-4 rounded-xl font-mono font-semibold text-lg flex items-center gap-3 transition-all"
                >
                  <Upload size={22} /> Upload Blueprint
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-sm text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
                >
                  or create blank project
                </button>
                <button
                  onClick={() => {
                    saveDemoProject();
                    router.push(`/?project=${DEMO_PROJECT_ID}`);
                  }}
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 hover:text-white px-6 py-3 rounded-xl font-medium text-base flex items-center gap-2 transition-colors border border-zinc-600 mt-2"
                >
                  <Play size={18} /> Try Demo
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-[#0a0a0f] border border-[#00d4ff]/10 rounded-xl overflow-hidden animate-pulse">
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
                className="border border-[#00d4ff]/60 hover:border-[#00d4ff] text-[#00d4ff] hover:bg-[#00d4ff]/10 bg-transparent px-5 py-2 rounded-lg font-mono font-medium text-sm transition-all"
              >
                Retry
              </button>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              {/* No search/filter results vs no projects at all */}
              {projects.length > 0 ? (
                <div className="text-center">
                  <Search size={40} className="text-zinc-600 mx-auto mb-3" aria-hidden />
                  <div className="text-lg font-medium text-zinc-300 mb-1">No matching projects</div>
                  <div className="text-sm text-zinc-500 mb-4">
                    {searchQuery ? `No projects match "${searchQuery}"` : 'No projects in this view'}
                  </div>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <div data-testid="projects-empty-state" className="flex flex-col items-center gap-6 max-w-lg text-center">
                  <div className="bg-[#00d4ff]/10 border border-[#00d4ff]/20 p-5 rounded-2xl">
                    <FileSpreadsheet size={56} className="text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight mb-2">Create your first project</h2>
                    <p className="text-zinc-400 text-base">Upload a PDF blueprint to get started with AI-powered construction takeoff.</p>
                  </div>
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.pdf';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handlePdfUpload(file);
                      };
                      input.click();
                    }}
                    className="border border-[#00d4ff]/60 hover:border-[#00d4ff] text-[#00d4ff] hover:bg-[#00d4ff]/10 bg-transparent px-8 py-4 rounded-xl font-mono font-semibold text-lg flex items-center gap-3 transition-all"
                  >
                    <Upload size={22} /> Upload PDF Blueprint
                  </button>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`w-full border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
                      dragOver
                        ? 'border-blue-400 bg-blue-600/10'
                        : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-500'
                    }`}
                  >
                    <Upload size={28} className={`mx-auto mb-2 ${dragOver ? 'text-blue-400' : 'text-zinc-600'}`} aria-hidden />
                    <div className={`text-sm font-medium ${dragOver ? 'text-blue-300' : 'text-zinc-500'}`}>
                      {dragOver ? 'Drop PDF here' : 'or drag & drop a PDF here'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowCreate(true)}
                      className="text-sm text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors"
                    >
                      Create blank project
                    </button>
                    <span className="text-zinc-600">·</span>
                    <button
                      onClick={() => {
                        saveDemoProject();
                        router.push(`/?project=${DEMO_PROJECT_ID}`);
                      }}
                      className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
                    >
                      <Play size={13} /> Try Demo
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid view */
            <>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 mb-3 px-1">
                <span className="text-xs text-zinc-400">{selectedIds.size} selected</span>
                <button
                  data-testid="delete-selected-btn"
                  onClick={() => setConfirmBulkDelete(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
                >
                  Delete selected ({selectedIds.size})
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 text-xs text-zinc-400 border border-zinc-700 rounded-lg hover:border-zinc-500 transition-colors"
                >
                  Clear selection
                </button>
              </div>
            )}
            <div data-testid="project-list" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProjects.map(p => {
                const polyCount = p.state?.polygons?.length || 0;
                const clsCount = p.state?.classifications?.length || 0;
                return (
                  <div
                    key={p.id}
                    data-testid="project-card"
                    data-project-id={p.id}
                    className={`relative bg-[#0a0a0f] border rounded-xl overflow-hidden transition-all cursor-pointer group hover:shadow-[0_0_12px_rgba(0,212,255,0.12)] ${selectedIds.has(p.id) ? 'border-[#00d4ff]/80 ring-2 ring-[#00d4ff]/40' : 'border-[#00d4ff]/20 hover:border-[#00d4ff]/60'}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('[data-select-checkbox]')) return;
                      handleOpen(p.id);
                    }}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, projectId: p.id }); }}
                  >
                    {/* Multi-select checkbox */}
                    <div
                      data-select-checkbox
                      className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ opacity: selectedIds.has(p.id) ? 1 : undefined }}
                      onClick={(e) => { e.stopPropagation(); toggleSelectProject(p.id, e.shiftKey); }}
                    >
                      <input
                        type="checkbox"
                        data-testid="project-select-checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => {}}
                        className="w-4 h-4 accent-[#00d4ff] cursor-pointer"
                        aria-label={`Select ${p.name}`}
                      />
                    </div>
                    {/* Project thumbnail — loaded lazily from individual project endpoint */}
                    {(p.thumbnail || thumbnails[p.id]) ? (
                      <div className="relative w-full h-28" style={{ background: '#0a0a0f' }}>
                        <Image
                          data-testid="project-thumbnail"
                          src={p.thumbnail || thumbnails[p.id]}
                          alt="Project preview"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div
                        className="h-28 flex items-center justify-center border-b border-[#00d4ff]/10"
                        style={{ backgroundColor: '#050508' }}
                      >
                        <span
                          className="text-lg font-mono font-bold text-[#00d4ff]/80 tracking-widest"
                        >
                          [ {thumbInitials(p.name)} ]
                        </span>
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-mono text-sm text-[#00d4ff] truncate flex-1">{p.name}</span>
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
                      <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
                        <span className="flex items-center gap-1"><Clock size={11} aria-hidden />{fmtDate(p)}</span>
                        {(p.pageCount || p.state?.totalPages || 0) > 0 && (
                          <span className="flex items-center gap-1"><FileText size={11} aria-hidden />{p.pageCount || p.state?.totalPages} pages</span>
                        )}
                        <span
                          data-testid="project-polygon-count"
                          data-count={polyCount}
                          className="flex items-center gap-1"
                          title={polyCount > 0 ? `${polyCount} polygon${polyCount !== 1 ? 's' : ''} drawn` : 'No polygons yet'}
                        >
                          <span
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: polyCount > 0 ? '#22c55e' : '#52525b' }}
                            aria-hidden="true"
                          />
                          {polyCount > 0 ? `${polyCount} drawings` : 'No drawings'}
                        </span>
                        {clsCount > 0 && <span>{clsCount} cls</span>}
                      </div>
                      {p.tags && p.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.tags.map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 font-mono bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          ) : (
            /* List view */
            <div data-testid="project-list" className="bg-[#0a0a0f] border border-[#00d4ff]/20 rounded-xl overflow-hidden">
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
                        data-testid="project-card"
                        data-project-id={p.id}
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
                        <td className="px-4 py-3">
                          <span
                            data-testid="project-polygon-count"
                            data-count={polyCount}
                            className="flex items-center gap-1.5 text-zinc-400"
                            title={polyCount > 0 ? `${polyCount} polygon${polyCount !== 1 ? 's' : ''} drawn` : 'No polygons yet'}
                          >
                            <span
                              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: polyCount > 0 ? '#22c55e' : '#52525b' }}
                              aria-hidden="true"
                            />
                            {polyCount > 0 ? polyCount : '—'}
                          </span>
                        </td>
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

          {/* BUG-W16-002: Load more button — shown when there are more projects server-side */}
          {projects.length < projectsTotal && (
            <div className="flex justify-center pt-4 pb-2">
              <button
                data-testid="load-more-projects-btn"
                onClick={() => loadProjects(false)}
                disabled={loadingMore}
                className="px-6 py-2 text-sm text-[#00d4ff] border border-[#00d4ff]/30 rounded-xl hover:bg-[#00d4ff]/10 transition-colors disabled:opacity-50 font-mono"
              >
                {loadingMore ? 'Loading…' : `Load more (${projectsTotal - projects.length} remaining)`}
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Context menu — BUG-A8-4-010 fix: clamp to viewport bounds */}
      {contextMenu && (
        <div
          ref={(el) => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const maxLeft = window.innerWidth - rect.width - 8;
            const maxTop = window.innerHeight - rect.height - 8;
            const clampedLeft = Math.min(contextMenu.x, maxLeft);
            const clampedTop = Math.min(contextMenu.y, maxTop);
            if (el.style.left !== `${clampedLeft}px`) el.style.left = `${clampedLeft}px`;
            if (el.style.top !== `${clampedTop}px`) el.style.top = `${clampedTop}px`;
          }}
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
          <button
            className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
            onClick={() => { setShowCollab(contextMenu.projectId); setContextMenu(null); }}
          >Share</button>
          <div className="border-t border-zinc-700 my-1" />
          <button
            className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
            onClick={() => {
              const p = projects.find(pr => pr.id === contextMenu.projectId);
              setDuplicateTarget({ id: contextMenu.projectId, name: p?.name || 'Project' });
              setContextMenu(null);
            }}
          >Duplicate</button>
          <div className="border-t border-zinc-700 my-1" />
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
            onClick={() => { handleDelete(contextMenu.projectId); setContextMenu(null); }}
          >Delete</button>
        </div>
      )}

      {/* Modals — preserved exactly */}
      {showCompare && (
        <DrawingComparison
          drawings={projects.map(p => ({ id: p.id, name: p.name }))}
          onClose={() => setShowCompare(false)}
        />
      )}

      {showCollab && (
        <CollaborationPanel
          projectId={showCollab}
          projectName={projects.find(p => p.id === showCollab)?.name}
          onClose={() => setShowCollab(null)}
        />
      )}

      {duplicateTarget && (
        <DuplicateProjectModal
          projectId={duplicateTarget.id}
          projectName={duplicateTarget.name}
          onClose={() => setDuplicateTarget(null)}
          onDuplicated={(newId) => { loadProjects(); handleOpen(newId); }}
        />
      )}

      {/* Upload spinner overlay */}
      {uploading && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
          <Loader2 size={48} className="text-blue-400 animate-spin mb-4" />
          <div className="text-lg font-semibold text-white">Uploading &amp; processing PDF...</div>
          <div className="text-sm text-zinc-400 mt-1">This may take a moment</div>
        </div>
      )}

      {/* Page-wide drag overlay */}
      {pageDragOver && (
        <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-blue-400 rounded-3xl p-16 flex flex-col items-center gap-4">
            <Upload size={56} className="text-blue-400" />
            <div className="text-xl font-semibold text-blue-300">Drop PDF to create new project</div>
            <div className="text-sm text-zinc-400">Release to upload your blueprint</div>
          </div>
        </div>
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
            <AutoNameTool projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
          </div>
        </div>
      )}

      {/* What's New modal */}
      {whatsNew.show && <WhatsNewModal onClose={whatsNew.dismiss} />}

      {/* Wave 21: Bulk delete confirmation */}
      {confirmBulkDelete && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmBulkDelete(false)}
        >
          <div
            className="bg-[#0a0a0f] border border-red-500/30 rounded-xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-white mb-2">Delete {selectedIds.size} project{selectedIds.size !== 1 ? 's' : ''}?</h2>
            <p className="text-xs text-zinc-400 mb-5">This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                data-testid="delete-selected-cancel"
                onClick={() => setConfirmBulkDelete(false)}
                className="px-4 py-2 text-xs text-gray-400 border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="delete-selected-confirm"
                onClick={handleBulkDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Delete {selectedIds.size}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BUG-W19-004: Delete confirmation modal */}
      {pendingDeleteId && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPendingDeleteId(null)}
        >
          <div
            className="bg-[#0a0a0f] border border-red-500/30 rounded-xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-white mb-2">Delete project?</h2>
            <p className="text-xs text-zinc-400 mb-5">
              <span className="font-medium text-white">
                {projects.find(p => p.id === pendingDeleteId)?.name ?? 'This project'}
              </span>{' '}
              will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                data-testid="delete-project-cancel"
                onClick={() => setPendingDeleteId(null)}
                className="px-4 py-2 text-xs text-gray-400 border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="delete-project-confirm"
                onClick={confirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-center py-2 pointer-events-none">
        <span className="text-[11px] text-zinc-600 font-medium tracking-wide pointer-events-auto select-none">
          MeasureX v1.0.0
        </span>
      </footer>
    </div>
  );
}
