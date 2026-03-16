/**
 * Server-side file-based persistence layer for MeasureX projects.
 * Stores JSON files under ./data/projects/{projectId}/.
 * Designed to swap to Supabase later without changing the API surface.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { Classification, Polygon, ScaleCalibration } from '@/lib/types';

// ── Types ──────────────────────────────────────────────────────────────

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageInfo {
  pageNum: number;
  width: number;
  height: number;
  text: string;
}

// ── Paths ──────────────────────────────────────────────────────────────

const DATA_ROOT = path.resolve(process.cwd(), 'data');

function projectDir(projectId: string): string {
  return path.join(DATA_ROOT, 'projects', projectId);
}

function filePath(projectId: string, file: string): string {
  return path.join(projectDir(projectId), file);
}

// ── Helpers ────────────────────────────────────────────────────────────

export async function initDataDir(): Promise<void> {
  await fs.mkdir(path.join(DATA_ROOT, 'projects'), { recursive: true });
}

async function readJSON<T>(fp: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(fp, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(fp: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Projects CRUD ──────────────────────────────────────────────────────

export async function createProject(name: string): Promise<ProjectMeta> {
  await initDataDir();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const meta: ProjectMeta = { id, name, createdAt: now, updatedAt: now };
  await writeJSON(filePath(id, 'project.json'), meta);
  // Initialize empty collections
  await writeJSON(filePath(id, 'classifications.json'), []);
  await writeJSON(filePath(id, 'polygons.json'), []);
  await writeJSON(filePath(id, 'pages.json'), []);
  await writeJSON(filePath(id, 'scale.json'), null);
  return meta;
}

export async function getProject(projectId: string): Promise<ProjectMeta | null> {
  return readJSON<ProjectMeta | null>(filePath(projectId, 'project.json'), null);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  await initDataDir();
  const projectsDir = path.join(DATA_ROOT, 'projects');
  let entries: string[];
  try {
    entries = await fs.readdir(projectsDir);
  } catch {
    return [];
  }
  const results: ProjectMeta[] = [];
  for (const entry of entries) {
    const meta = await readJSON<ProjectMeta | null>(
      path.join(projectsDir, entry, 'project.json'),
      null,
    );
    if (meta) results.push(meta);
  }
  return results;
}

export async function updateProject(
  projectId: string,
  patch: Partial<Pick<ProjectMeta, 'name'>>,
): Promise<ProjectMeta | null> {
  const existing = await getProject(projectId);
  if (!existing) return null;
  const updated: ProjectMeta = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeJSON(filePath(projectId, 'project.json'), updated);
  return updated;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  try {
    await fs.rm(projectDir(projectId), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// ── Pages CRUD ─────────────────────────────────────────────────────────

export async function createPage(projectId: string, page: PageInfo): Promise<PageInfo> {
  const pages = await getPages(projectId);
  const idx = pages.findIndex((p) => p.pageNum === page.pageNum);
  if (idx >= 0) {
    pages[idx] = page;
  } else {
    pages.push(page);
  }
  await writeJSON(filePath(projectId, 'pages.json'), pages);
  return page;
}

export async function getPages(projectId: string): Promise<PageInfo[]> {
  return readJSON<PageInfo[]>(filePath(projectId, 'pages.json'), []);
}

export async function updatePage(
  projectId: string,
  pageNum: number,
  patch: Partial<PageInfo>,
): Promise<PageInfo | null> {
  const pages = await getPages(projectId);
  const idx = pages.findIndex((p) => p.pageNum === pageNum);
  if (idx < 0) return null;
  pages[idx] = { ...pages[idx], ...patch };
  await writeJSON(filePath(projectId, 'pages.json'), pages);
  return pages[idx];
}

// ── Classifications CRUD ───────────────────────────────────────────────

export async function createClassification(
  projectId: string,
  data: Omit<Classification, 'id'>,
): Promise<Classification> {
  const list = await getClassifications(projectId);
  const entry: Classification = { id: crypto.randomUUID(), ...data };
  list.push(entry);
  await writeJSON(filePath(projectId, 'classifications.json'), list);
  return entry;
}

export async function getClassifications(projectId: string): Promise<Classification[]> {
  return readJSON<Classification[]>(filePath(projectId, 'classifications.json'), []);
}

export async function updateClassification(
  projectId: string,
  classificationId: string,
  patch: Partial<Classification>,
): Promise<Classification | null> {
  const list = await getClassifications(projectId);
  const idx = list.findIndex((c) => c.id === classificationId);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  await writeJSON(filePath(projectId, 'classifications.json'), list);
  return list[idx];
}

export async function deleteClassification(
  projectId: string,
  classificationId: string,
): Promise<boolean> {
  const list = await getClassifications(projectId);
  const filtered = list.filter((c) => c.id !== classificationId);
  if (filtered.length === list.length) return false;
  await writeJSON(filePath(projectId, 'classifications.json'), filtered);
  return true;
}

// ── Polygons CRUD ──────────────────────────────────────────────────────

export async function createPolygon(
  projectId: string,
  data: Omit<Polygon, 'id'>,
): Promise<Polygon> {
  const list = await getPolygons(projectId);
  const entry: Polygon = { id: crypto.randomUUID(), ...data };
  list.push(entry);
  await writeJSON(filePath(projectId, 'polygons.json'), list);
  return entry;
}

export async function getPolygons(projectId: string): Promise<Polygon[]> {
  return readJSON<Polygon[]>(filePath(projectId, 'polygons.json'), []);
}

export async function updatePolygon(
  projectId: string,
  polygonId: string,
  patch: Partial<Polygon>,
): Promise<Polygon | null> {
  const list = await getPolygons(projectId);
  const idx = list.findIndex((p) => p.id === polygonId);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  await writeJSON(filePath(projectId, 'polygons.json'), list);
  return list[idx];
}

export async function deletePolygon(projectId: string, polygonId: string): Promise<boolean> {
  const list = await getPolygons(projectId);
  const filtered = list.filter((p) => p.id !== polygonId);
  if (filtered.length === list.length) return false;
  await writeJSON(filePath(projectId, 'polygons.json'), filtered);
  return true;
}

// ── Scale CRUD ─────────────────────────────────────────────────────────

export async function setScale(
  projectId: string,
  scale: ScaleCalibration,
): Promise<ScaleCalibration> {
  await writeJSON(filePath(projectId, 'scale.json'), scale);
  return scale;
}

export async function getScale(projectId: string): Promise<ScaleCalibration | null> {
  return readJSON<ScaleCalibration | null>(filePath(projectId, 'scale.json'), null);
}
