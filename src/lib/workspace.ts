export type Workspace = {
  id: string;
  name: string;
  projectIds: string[]; // project IDs belonging to this workspace
};

export const DEFAULT_WORKSPACE: Workspace = {
  id: 'default',
  name: 'My Workspace',
  projectIds: [],
};

const WORKSPACES_KEY = 'mx-workspaces';
const ACTIVE_KEY = 'mx-active-workspace';

export function getWorkspaces(): Workspace[] {
  if (typeof window === 'undefined') return [DEFAULT_WORKSPACE];
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    if (!raw) return [DEFAULT_WORKSPACE];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [DEFAULT_WORKSPACE];
    return parsed.length > 0 ? parsed : [DEFAULT_WORKSPACE];
  } catch {
    return [DEFAULT_WORKSPACE];
  }
}

export function saveWorkspaces(workspaces: Workspace[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
}

export function getActiveWorkspace(): Workspace {
  if (typeof window === 'undefined') return DEFAULT_WORKSPACE;
  const workspaces = getWorkspaces();
  const activeId = localStorage.getItem(ACTIVE_KEY);
  return workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? DEFAULT_WORKSPACE;
}

export function setActiveWorkspace(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_KEY, id);
}
