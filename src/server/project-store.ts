/**
 * Server-side persistence layer for MeasureX projects.
 *
 * Dual mode:
 * - If SUPABASE_SERVICE_ROLE_KEY is set → uses Supabase (tables: mx_projects, mx_pages, mx_scales, mx_classifications, mx_polygons)
 * - Otherwise → uses file-based storage in data/projects/
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import type { Classification, Polygon, ScaleCalibration } from '@/lib/types';
import { assertSafeId } from '@/lib/safe-id';
import { NotFoundError } from '@/lib/errors';

// ── Types ──────────────────────────────────────────────────────────────

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  totalPages?: number;
  thumbnail?: string;
}

export interface PageInfo {
  pageNum: number;
  width: number;
  height: number;
  text: string;
  name?: string;
  drawingSet?: string;
}

// ── Mode detection ────────────────────────────────────────────────────

function isValidUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSupabaseMode(): boolean {
  return (
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    isValidUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}

// ── Supabase Client (lazy, only created in Supabase mode) ─────────────

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _client!;
}

// ── File-mode helpers ─────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

function projectDir(projectId: string): string {
  assertSafeId(projectId, 'projectId');
  return path.join(PROJECTS_DIR, projectId);
}

/**
 * Read and parse a JSON file from disk, returning `fallback` if the file
 * does not exist or cannot be parsed.  This is intentionally lenient so that
 * missing data files (e.g. on first run or after a partial write failure) are
 * treated as empty rather than fatal errors.
 *
 * @param filePath - Absolute path to the JSON file.
 * @param fallback - Value returned when the file is absent or unparseable.
 */
async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Serialize `data` as pretty-printed JSON and write it to `filePath`.
 * The file is created (or overwritten) atomically via `fs.writeFile`.
 *
 * @param filePath - Absolute path to the destination JSON file.
 * @param data     - Any JSON-serializable value to persist.
 */
async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ── initDataDir ───────────────────────────────────────────────────────

export async function initDataDir(): Promise<void> {
  if (isSupabaseMode()) return;
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
}

// ── Projects CRUD ──────────────────────────────────────────────────────

export async function createProject(name: string): Promise<ProjectMeta> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (isSupabaseMode()) {
    const sb = getClient();
    const { error } = await sb.from('mx_projects').insert({
      id,
      name,
      created_at: now,
      updated_at: now,
    });
    if (error) throw new Error(`createProject: ${error.message}`);
  } else {
    const dir = projectDir(id);
    await fs.mkdir(dir, { recursive: true });
    await writeJson(path.join(dir, 'project.json'), { id, name, createdAt: now, updatedAt: now });
    await writeJson(path.join(dir, 'classifications.json'), []);
    await writeJson(path.join(dir, 'polygons.json'), []);
    await writeJson(path.join(dir, 'pages.json'), []);
    await writeJson(path.join(dir, 'scale.json'), null);
  }

  return { id, name, createdAt: now, updatedAt: now };
}

export async function getProject(projectId: string): Promise<ProjectMeta | null> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw new Error(`getProject: ${error.message}`);
    if (!data) return null;
    // totalPages is stored in the `description` column as JSON: {"totalPages":7}
    let totalPages: number | undefined;
    try { totalPages = data.description ? JSON.parse(data.description)?.totalPages : undefined; } catch {}
    return {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      totalPages,
    };
  }

  return readJson<ProjectMeta | null>(path.join(projectDir(projectId), 'project.json'), null);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_projects')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`listProjects: ${error.message}`);
    return (data || []).map((row: Record<string, unknown>): ProjectMeta => ({
      id: row.id as string,
      name: row.name as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  }

  // File mode: read each project dir
  let entries: string[];
  try {
    entries = await fs.readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const projects: ProjectMeta[] = [];
  for (const entry of entries) {
    const meta = await readJson<ProjectMeta | null>(
      path.join(PROJECTS_DIR, entry, 'project.json'),
      null,
    );
    if (meta) projects.push(meta);
  }
  projects.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return projects;
}

/** Quick summary flags used by the onboarding checklist. */
export async function getProjectSummary(projectId: string): Promise<{ polygonCount: number; scaleCount: number }> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const [{ count: pc }, { count: sc }] = await Promise.all([
      sb.from('mx_polygons').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
      sb.from('mx_scales').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
    ]);
    return { polygonCount: pc ?? 0, scaleCount: sc ?? 0 };
  }
  const dir = projectDir(projectId);
  const [polygons, entries] = await Promise.all([
    readJson<unknown[]>(path.join(dir, 'polygons.json'), []),
    fs.readdir(dir).catch(() => [] as string[]),
  ]);
  const scaleCount = entries.filter((f: string) => /^scale-\d+\.json$/.test(f)).length;
  return { polygonCount: polygons.length, scaleCount };
}

export async function getThumbnail(projectId: string): Promise<string | null> {
  const thumbPath = path.join(projectDir(projectId), 'thumbnail.txt');
  try {
    return await fs.readFile(thumbPath, 'utf-8');
  } catch {
    return null;
  }
}

export async function saveThumbnail(projectId: string, dataUrl: string): Promise<void> {
  const dir = projectDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'thumbnail.txt'), dataUrl, 'utf-8');
}

export async function updateProject(
  projectId: string,
  patch: Partial<Pick<ProjectMeta, 'name' | 'totalPages' | 'thumbnail'>>,
): Promise<ProjectMeta | null> {
  const now = new Date().toISOString();

  // Thumbnails are always stored as local files (both modes)
  if (patch.thumbnail !== undefined) {
    await saveThumbnail(projectId, patch.thumbnail);
    delete patch.thumbnail;
  }

  if (isSupabaseMode()) {
    const sb = getClient();
    const updatePayload: Record<string, unknown> = { updated_at: now };
    if (patch.name !== undefined) updatePayload.name = patch.name;
    // Persist totalPages in description as JSON (no schema migration needed)
    if (patch.totalPages !== undefined) {
      updatePayload.description = JSON.stringify({ totalPages: patch.totalPages });
    }
    const { data, error } = await sb
      .from('mx_projects')
      .update(updatePayload)
      .eq('id', projectId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`updateProject: ${error.message}`);
    if (!data) return null;
    let totalPages: number | undefined;
    try { totalPages = data.description ? JSON.parse(data.description)?.totalPages : undefined; } catch {}
    return {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      totalPages,
    };
  }

  const filePath = path.join(projectDir(projectId), 'project.json');
  const existing = await readJson<ProjectMeta | null>(filePath, null);
  if (!existing) return null;
  const { thumbnail: _thumbnail, ...safePatch } = patch;
  void _thumbnail;
  const updated = { ...existing, ...safePatch, updatedAt: now };
  await writeJson(filePath, updated);
  return updated;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  if (isSupabaseMode()) {
    const sb = getClient();
    // Explicitly delete child rows first so any failure surfaces before we
    // remove the parent.  If any child delete fails we throw immediately and
    // mx_projects is left intact (consistent state).
    const childTables = [
      'mx_scales',
      'mx_polygons',
      'mx_classifications',
      'mx_assemblies',
      'mx_pages',
      'mx_history',
    ] as const;
    for (const table of childTables) {
      try {
        const { error } = await sb.from(table).delete().eq('project_id', projectId);
        if (error) throw error;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[deleteProject] failed deleting ${table} for project ${projectId}:`, msg);
        throw new Error(`deleteProject: failed to delete from ${table}: ${msg}`);
      }
    }
    // All child rows gone — safe to delete the project itself.
    const { error } = await sb.from('mx_projects').delete().eq('id', projectId);
    if (error) throw new Error(`deleteProject: failed to delete mx_projects: ${error.message}`);
    // BUG-A7-5-062 fix: clean up file-based snapshots directory (snapshots are always file-based)
    await fs.rm(snapshotsDir(projectId), { recursive: true, force: true }).catch(() => {});
    return true;
  }

  try {
    await fs.rm(projectDir(projectId), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// ── Share Tokens ────────────────────────────────────────────────────────

export async function generateShareToken(projectId: string): Promise<string> {
  const token = crypto.randomUUID();

  if (isSupabaseMode()) {
    const sb = getClient();
    const { error } = await sb
      .from('mx_projects')
      .update({ share_token: token })
      .eq('id', projectId);
    if (error) throw new Error(`generateShareToken: ${error.message}`);
  } else {
    const filePath = path.join(projectDir(projectId), 'project.json');
    const existing = await readJson<ProjectMeta & { shareToken?: string } | null>(filePath, null);
    if (!existing) throw new Error('Project not found');
    await writeJson(filePath, { ...existing, shareToken: token });
  }

  return token;
}

export async function getShareToken(projectId: string): Promise<string | null> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_projects')
      .select('share_token')
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw new Error(`getShareToken: ${error.message}`);
    return data?.share_token ?? null;
  }

  const meta = await readJson<ProjectMeta & { shareToken?: string } | null>(
    path.join(projectDir(projectId), 'project.json'),
    null,
  );
  return meta?.shareToken ?? null;
}

export async function revokeShareToken(projectId: string): Promise<void> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { error } = await sb
      .from('mx_projects')
      .update({ share_token: null })
      .eq('id', projectId);
    if (error) throw new Error(`revokeShareToken: ${error.message}`);
  } else {
    const filePath = path.join(projectDir(projectId), 'project.json');
    const existing = await readJson<ProjectMeta & { shareToken?: string } | null>(filePath, null);
    if (!existing) return;
    delete existing.shareToken;
    await writeJson(filePath, existing);
  }
}

export async function getProjectByShareToken(token: string): Promise<ProjectMeta | null> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_projects')
      .select('*')
      .eq('share_token', token)
      .maybeSingle();
    if (error) throw new Error(`getProjectByShareToken: ${error.message}`);
    if (!data) return null;
    let totalPages: number | undefined;
    try { totalPages = data.description ? JSON.parse(data.description)?.totalPages : undefined; } catch {}
    return {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      totalPages,
    };
  }

  // File mode: scan all projects for the matching share token
  let entries: string[];
  try {
    entries = await fs.readdir(PROJECTS_DIR);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const meta = await readJson<ProjectMeta & { shareToken?: string } | null>(
      path.join(PROJECTS_DIR, entry, 'project.json'),
      null,
    );
    if (meta?.shareToken === token) return meta;
  }
  return null;
}

// ── Pages CRUD ─────────────────────────────────────────────────────────

export async function createPage(projectId: string, page: PageInfo): Promise<PageInfo> {
  if (isSupabaseMode()) {
    const sb = getClient();
    // Start with core columns that are guaranteed to exist in the base schema
    const corePayload: Record<string, unknown> = {
      project_id: projectId,
      page_number: page.pageNum,
      width: page.width,
      height: page.height,
      text: page.text ?? '',
    };
    // Optional columns added by later migrations — include and strip on error
    const optionalFields: Array<[string, unknown]> = [
      ['name', page.name ?? null],
      ['drawing_set', page.drawingSet ?? null],
    ];
    let payload: Record<string, unknown> = { ...corePayload };
    for (const [k, v] of optionalFields) payload[k] = v;

    let { error } = await sb.from('mx_pages').upsert(payload, { onConflict: 'project_id,page_number' });
    if (error && (error.message.includes("column") || error.message.includes("schema cache"))) {
      // One or more optional columns are missing — fall back to core-only insert
      const result = await sb.from('mx_pages').upsert(corePayload, { onConflict: 'project_id,page_number' });
      error = result.error;
    }
    if (error) throw new Error(`createPage: ${error.message}`);
    return page;
  }

  const filePath = path.join(projectDir(projectId), 'pages.json');
  const pages = await readJson<PageInfo[]>(filePath, []);
  const idx = pages.findIndex((p) => p.pageNum === page.pageNum);
  if (idx >= 0) pages[idx] = page;
  else pages.push(page);
  await writeJson(filePath, pages);
  return page;
}

export async function getPages(projectId: string): Promise<PageInfo[]> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_pages')
      .select('*')
      .eq('project_id', projectId)
      .order('page_number', { ascending: true });
    if (error) throw new Error(`getPages: ${error.message}`);
    return (data || []).map((row: Record<string, unknown>): PageInfo => ({
      pageNum: row.page_number as number,
      width: row.width as number,
      height: row.height as number,
      text: (row.text as string | null) ?? '',
      name: (row.name as string | null) ?? undefined,
      drawingSet: (row.drawing_set as string | null) ?? undefined,
    }));
  }

  return readJson<PageInfo[]>(path.join(projectDir(projectId), 'pages.json'), []);
}

export async function updatePage(
  projectId: string,
  pageNum: number,
  patch: Partial<PageInfo>,
): Promise<PageInfo | null> {
  // Guard: if patch is empty, return early to avoid sending a no-op .update({}) to Supabase.
  if (Object.keys(patch).length === 0) return null;

  const updateData: Record<string, unknown> = {};
  if (patch.width !== undefined) updateData.width = patch.width;
  if (patch.height !== undefined) updateData.height = patch.height;
  if (patch.text !== undefined) updateData.text = patch.text;
  if (patch.name !== undefined) updateData.name = patch.name;
  if (patch.drawingSet !== undefined) updateData.drawing_set = patch.drawingSet;

  if (Object.keys(updateData).length === 0) return null;

  if (isSupabaseMode()) {
    const sb = getClient();

    const { data, error } = await sb
      .from('mx_pages')
      .update(updateData)
      .eq('project_id', projectId)
      .eq('page_number', pageNum)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`updatePage: ${error.message}`);
    if (!data) return null;
    return {
      pageNum: data.page_number,
      width: data.width,
      height: data.height,
      text: data.text ?? '',
      name: data.name ?? undefined,
      drawingSet: data.drawing_set ?? undefined,
    };
  }

  const filePath = path.join(projectDir(projectId), 'pages.json');
  const pages = await readJson<PageInfo[]>(filePath, []);
  const idx = pages.findIndex((p) => p.pageNum === pageNum);
  if (idx < 0) return null;
  pages[idx] = { ...pages[idx], ...patch };
  await writeJson(filePath, pages);
  return pages[idx];
}

export async function deletePage(
  projectId: string,
  pageNumber: number,
): Promise<boolean> {
  if (isSupabaseMode()) {
    const sb = getClient();
    // Clean up associated scales and polygons for this page
    await sb.from('mx_scales').delete().eq('project_id', projectId).eq('page_number', pageNumber);
    await sb.from('mx_polygons').delete().eq('project_id', projectId).eq('page_number', pageNumber);
    const { data, error } = await sb
      .from('mx_pages')
      .delete()
      .eq('project_id', projectId)
      .eq('page_number', pageNumber)
      .select('page_number');
    if (error) throw new Error(`deletePage: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }

  // File mode: remove the page and associated polygons
  const pagesPath = path.join(projectDir(projectId), 'pages.json');
  const pages = await readJson<PageInfo[]>(pagesPath, []);
  const filtered = pages.filter((p) => p.pageNum !== pageNumber);
  if (filtered.length === pages.length) return false;
  await writeJson(pagesPath, filtered);

  // Clean up polygons for this page
  const polygonsPath = path.join(projectDir(projectId), 'polygons.json');
  const polygons = await readJson<Polygon[]>(polygonsPath, []);
  const filteredPolygons = polygons.filter((p) => p.pageNumber !== pageNumber);
  await writeJson(polygonsPath, filteredPolygons);

  // BUG-A7-5-068 fix: clean up scale file for this page
  const scaleFile = path.join(projectDir(projectId), `scale-${pageNumber}.json`);
  await fs.rm(scaleFile, { force: true }).catch(() => {});

  return true;
}

// ── Classifications CRUD ───────────────────────────────────────────────

export async function createClassification(
  projectId: string,
  data: Omit<Classification, 'id'> & { id?: string },
): Promise<Classification> {
  const id = data.id || crypto.randomUUID();

  if (isSupabaseMode()) {
    const sb = getClient();
    const baseRow = {
      id,
      project_id: projectId,
      name: data.name,
      color: data.color,
      type: data.type,
      visible: data.visible ?? true,
    };
    const formulaFields = {
      formula: data.formula ?? null,
      formula_unit: data.formulaUnit ?? null,
      formula_saved_to_library: data.formulaSavedToLibrary ?? false,
    };
    // Try full insert first; if formula columns don't exist in DB, retry without them
    let { error } = await sb.from('mx_classifications').insert({ ...baseRow, ...formulaFields });
    if (error && /formula/.test(error.message)) {
      ({ error } = await sb.from('mx_classifications').insert(baseRow));
    }
    if (error) {
      if (error.message?.includes("duplicate key") || (error as any).code === "23505") {
        // Classification already exists — return the existing record
        const { data: existing } = await sb
          .from("mx_classifications")
          .select()
          .eq("id", id)
          .eq("project_id", projectId)
          .single();
        if (existing) {
          return {
            id: existing.id,
            name: existing.name,
            color: existing.color,
            type: existing.type,
            visible: existing.visible ?? true,
            formula: existing.formula ?? undefined,
            formulaUnit: existing.formula_unit ?? undefined,
            formulaSavedToLibrary: existing.formula_saved_to_library ?? false,
          };
        }
      }
      throw new Error(`createClassification: ${error.message}`);
    }
    // Build return object explicitly — spreading `data` (which may have id?: undefined)
    // over { id } would overwrite id with undefined.
    return {
      id,
      name: data.name,
      color: data.color,
      type: data.type,
      visible: data.visible ?? true,
      formula: data.formula,
      formulaUnit: data.formulaUnit,
      formulaSavedToLibrary: data.formulaSavedToLibrary,
    };
  }

  const filePath = path.join(projectDir(projectId), 'classifications.json');
  const list = await readJson<Classification[]>(filePath, []);
  // BUG-A7-5-058 fix: upsert guard — if classification with same ID exists, update it
  const existingIdx = list.findIndex((c) => c.id === id);
  const cls: Classification = { id, ...data };
  if (existingIdx >= 0) {
    list[existingIdx] = cls;
  } else {
    list.push(cls);
  }
  await writeJson(filePath, list);
  return cls;
}

export async function getClassifications(projectId: string): Promise<Classification[]> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_classifications')
      .select('*')
      .eq('project_id', projectId);
    if (error) throw new Error(`getClassifications: ${error.message}`);
    return (data || []).map((row: Record<string, unknown>): Classification => ({
      id: row.id as string,
      name: row.name as string,
      color: row.color as string,
      type: row.type as Classification['type'],
      visible: row.visible as boolean,
      formula: (row.formula as string | null) ?? undefined,
      formulaUnit: (row.formula_unit as string | null) ?? undefined,
      formulaSavedToLibrary: (row.formula_saved_to_library as boolean | null) ?? undefined,
    }));
  }

  return readJson<Classification[]>(path.join(projectDir(projectId), 'classifications.json'), []);
}

export async function updateClassification(
  projectId: string,
  classificationId: string,
  patch: Partial<Classification>,
): Promise<Classification | null> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const updateData: Record<string, unknown> = {};
    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.color !== undefined) updateData.color = patch.color;
    if (patch.type !== undefined) updateData.type = patch.type;
    if (patch.visible !== undefined) updateData.visible = patch.visible;
    const formulaKeys: (keyof typeof updateData)[] = [];
    if (patch.formula !== undefined) { updateData.formula = patch.formula; formulaKeys.push('formula'); }
    if (patch.formulaUnit !== undefined) { updateData.formula_unit = patch.formulaUnit; formulaKeys.push('formula_unit'); }
    if (patch.formulaSavedToLibrary !== undefined) { updateData.formula_saved_to_library = patch.formulaSavedToLibrary; formulaKeys.push('formula_saved_to_library'); }

    let { data: row, error } = await sb
      .from('mx_classifications')
      .update(updateData)
      .eq('id', classificationId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle();
    // If formula columns don't exist in DB, retry without them
    if (error && /formula/.test(error.message) && formulaKeys.length > 0) {
      for (const k of formulaKeys) delete updateData[k];
      ({ data: row, error } = await sb
        .from('mx_classifications')
        .update(updateData)
        .eq('id', classificationId)
        .eq('project_id', projectId)
        .select('*')
        .maybeSingle());
    }
    if (error) throw new Error(`updateClassification: ${error.message}`);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      type: row.type,
      visible: row.visible,
      formula: row.formula ?? undefined,
      formulaUnit: row.formula_unit ?? undefined,
      formulaSavedToLibrary: row.formula_saved_to_library ?? undefined,
    };
  }

  const filePath = path.join(projectDir(projectId), 'classifications.json');
  const list = await readJson<Classification[]>(filePath, []);
  const idx = list.findIndex((c) => c.id === classificationId);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  await writeJson(filePath, list);
  return list[idx];
}

export async function deleteClassification(
  projectId: string,
  classificationId: string,
): Promise<boolean> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_classifications')
      .delete()
      .eq('id', classificationId)
      .eq('project_id', projectId)
      .select('id');
    if (error) throw new Error(`deleteClassification: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }

  const filePath = path.join(projectDir(projectId), 'classifications.json');
  const list = await readJson<Classification[]>(filePath, []);
  const before = list.length;
  const filtered = list.filter((c) => c.id !== classificationId);
  if (filtered.length === before) return false;
  await writeJson(filePath, filtered);
  return true;
}

// ── Polygons CRUD ──────────────────────────────────────────────────────

/**
 * Delete all polygons for a specific project page.
 * Used by AI takeoff before re-inserting a fresh batch to avoid duplicate-key errors on re-runs.
 */
export async function deletePolygonsByPage(projectId: string, pageNumber: number): Promise<void> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { error } = await sb
      .from('mx_polygons')
      .delete()
      .eq('project_id', projectId)
      .eq('page_number', pageNumber);
    if (error) throw new Error(`deletePolygonsByPage: ${error.message}`);
    return;
  }

  // File mode
  const filePath = path.join(projectDir(projectId), 'polygons.json');
  const list = await readJson<Polygon[]>(filePath, []);
  const filtered = list.filter((p) => p.pageNumber !== pageNumber);
  await writeJson(filePath, filtered);
}

/**
 * Persist a new polygon (or upsert an existing one by id) for the given project.
 *
 * In Supabase mode the polygon is upserted into `mx_polygons` — if a row with
 * the same `id` already exists it will be replaced.  In file mode the polygon
 * is appended to `polygons.json`.  Either way a history record is written so
 * the action can be undone.
 *
 * @param projectId - UUID of the parent project.
 * @param data      - Polygon fields (minus `id`); supply `id` to force a
 *                    specific UUID (e.g. when restoring from a snapshot).
 * @returns The persisted {@link Polygon} with its resolved `id`.
 */
export async function createPolygon(
  projectId: string,
  data: Omit<Polygon, 'id'> & { id?: string },
): Promise<Polygon> {
  const id = data.id || crypto.randomUUID();

  if (isSupabaseMode()) {
    const sb = getClient();
    const row: Record<string, unknown> = {
      id,
      project_id: projectId,
      classification_id: data.classificationId,
      page_number: data.pageNumber ?? 1,
      points: data.points,
      area_pixels: data.area ?? 0,
      linear_pixels: data.linearFeet ?? 0,
      is_complete: data.isComplete ?? true,
      label: data.label ?? null,
    };
    // Only include AI-detection columns when values are present,
    // so inserts succeed even if the columns haven't been migrated yet.
    if (data.confidence != null) row.confidence = data.confidence;
    if (data.detectedByModel != null) row.detected_by_model = data.detectedByModel;
    const { error } = await sb.from('mx_polygons').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`createPolygon: ${error.message}`);
    const created: Polygon = {
      id,
      points: data.points,
      classificationId: data.classificationId,
      pageNumber: data.pageNumber ?? 1,
      area: row.area_pixels as number,
      linearFeet: row.linear_pixels as number,
      isComplete: data.isComplete ?? true,
      label: data.label,
      confidence: data.confidence,
      detectedByModel: data.detectedByModel,
    };
    await recordHistory({ projectId, actionType: 'create', entityType: 'polygon', entityId: id, beforeData: null, afterData: created });
    return created;
  }

  const filePath = path.join(projectDir(projectId), 'polygons.json');
  const list = await readJson<Polygon[]>(filePath, []);
  const poly: Polygon = { id, ...data };
  // Upsert: replace existing entry with same id instead of pushing a duplicate.
  const existingIdx = list.findIndex((p) => p.id === id);
  if (existingIdx !== -1) {
    list[existingIdx] = poly;
  } else {
    list.push(poly);
  }
  await writeJson(filePath, list);
  await recordHistory({ projectId, actionType: 'create', entityType: 'polygon', entityId: id, beforeData: null, afterData: poly });
  return poly;
}

export async function getPolygons(projectId: string): Promise<Polygon[]> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_polygons')
      .select('*')
      .eq('project_id', projectId);
    if (error) throw new Error(`getPolygons: ${error.message}`);
    return (data || []).map((row: Record<string, unknown>): Polygon => ({
      id: row.id as string,
      points: row.points as Polygon['points'],
      classificationId: row.classification_id as string,
      pageNumber: row.page_number as number,
      area: row.area_pixels as number,
      linearFeet: row.linear_pixels as number,
      isComplete: row.is_complete as boolean,
      label: (row.label as string | null) ?? undefined,
      confidence: (row.confidence as number | null) ?? undefined,
      detectedByModel: (row.detected_by_model as string | null) ?? undefined,
      createdAt: (row.created_at as string | null) ?? undefined,
      updatedAt: (row.updated_at as string | null) ?? undefined,
    }));
  }

  return readJson<Polygon[]>(path.join(projectDir(projectId), 'polygons.json'), []);
}

export async function updatePolygon(
  projectId: string,
  polygonId: string,
  patch: Partial<Polygon>,
): Promise<Polygon | null> {
  if (isSupabaseMode()) {
    const sb = getClient();
    // Fetch before-data
    const { data: beforeRow } = await sb.from('mx_polygons').select('*').eq('id', polygonId).eq('project_id', projectId).maybeSingle();
    const updateData: Record<string, unknown> = {};
    if (patch.points !== undefined) updateData.points = patch.points;
    if (patch.classificationId !== undefined) updateData.classification_id = patch.classificationId;
    if (patch.pageNumber !== undefined) updateData.page_number = patch.pageNumber;
    if (patch.area !== undefined) updateData.area_pixels = patch.area;
    if (patch.linearFeet !== undefined) updateData.linear_pixels = patch.linearFeet;
    if (patch.isComplete !== undefined) updateData.is_complete = patch.isComplete;
    if (patch.label !== undefined) updateData.label = patch.label;

    const { data: row, error } = await sb
      .from('mx_polygons')
      .update(updateData)
      .eq('id', polygonId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`updatePolygon: ${error.message}`);
    if (!row) return null;
    const updated = {
      id: row.id,
      points: row.points,
      classificationId: row.classification_id,
      pageNumber: row.page_number,
      area: row.area_pixels as number,
      linearFeet: row.linear_pixels as number,
      isComplete: row.is_complete,
      label: row.label ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    await recordHistory({ projectId, actionType: 'update', entityType: 'polygon', entityId: polygonId, beforeData: beforeRow, afterData: updated });
    return updated;
  }

  const filePath = path.join(projectDir(projectId), 'polygons.json');
  const list = await readJson<Polygon[]>(filePath, []);
  const idx = list.findIndex((p) => p.id === polygonId);
  if (idx < 0) return null;
  const beforeData = { ...list[idx] };
  list[idx] = { ...list[idx], ...patch };
  await writeJson(filePath, list);
  await recordHistory({ projectId, actionType: 'update', entityType: 'polygon', entityId: polygonId, beforeData, afterData: list[idx] });
  return list[idx];
}

export async function deletePolygon(projectId: string, polygonId: string): Promise<boolean> {
  if (isSupabaseMode()) {
    const sb = getClient();
    // Fetch before-data
    const { data: beforeRow } = await sb.from('mx_polygons').select('*').eq('id', polygonId).eq('project_id', projectId).maybeSingle();
    const { data, error } = await sb
      .from('mx_polygons')
      .delete()
      .eq('id', polygonId)
      .eq('project_id', projectId)
      .select('id');
    if (error) throw new Error(`deletePolygon: ${error.message}`);
    const deleted = (data?.length ?? 0) > 0;
    if (deleted) {
      await recordHistory({ projectId, actionType: 'delete', entityType: 'polygon', entityId: polygonId, beforeData: beforeRow, afterData: null });
    }
    return deleted;
  }

  const filePath = path.join(projectDir(projectId), 'polygons.json');
  const list = await readJson<Polygon[]>(filePath, []);
  const existing = list.find((p) => p.id === polygonId);
  const filtered = list.filter((p) => p.id !== polygonId);
  if (filtered.length === list.length) return false;
  await writeJson(filePath, filtered);
  await recordHistory({ projectId, actionType: 'delete', entityType: 'polygon', entityId: polygonId, beforeData: existing, afterData: null });
  return true;
}

// ── History ─────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string;
  projectId: string;
  actionType: "create" | "update" | "delete";
  entityType: "polygon" | "classification" | "scale";
  entityId: string | null;
  beforeData: unknown | null;
  afterData: unknown | null;
  createdAt: string;
}

export async function recordHistory(
  entry: Omit<HistoryEntry, "id" | "createdAt">,
): Promise<void> {
  try {
    if (isSupabaseMode()) {
      const sb = getClient();
      await sb.from('mx_history').insert({
        project_id: entry.projectId,
        action_type: entry.actionType,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        before_data: entry.beforeData ?? null,
        after_data: entry.afterData ?? null,
      });
    } else {
      const filePath = path.join(projectDir(entry.projectId), 'history.json');
      const list = await readJson<HistoryEntry[]>(filePath, []);
      list.unshift({
        id: crypto.randomUUID(),
        ...entry,
        createdAt: new Date().toISOString(),
      });
      if (list.length > 200) list.length = 200;
      await writeJson(filePath, list);
    }
  } catch (err) {
    console.error('[recordHistory] failed:', err);
  }
}

export async function getHistory(
  projectId: string,
  limit: number = 100,
): Promise<HistoryEntry[]> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_history')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`getHistory: ${error.message}`);
    return (data || []).map((row: Record<string, unknown>): HistoryEntry => ({
      id: row.id as string,
      projectId: row.project_id as string,
      actionType: row.action_type as HistoryEntry['actionType'],
      entityType: row.entity_type as HistoryEntry['entityType'],
      entityId: (row.entity_id as string | null) ?? null,
      beforeData: row.before_data ?? null,
      afterData: row.after_data ?? null,
      createdAt: row.created_at as string,
    }));
  }

  const list = await readJson<HistoryEntry[]>(
    path.join(projectDir(projectId), 'history.json'),
    [],
  );
  return list.slice(0, limit);
}

// ── Scale CRUD ─────────────────────────────────────────────────────────

export async function setScale(
  projectId: string,
  scale: ScaleCalibration,
): Promise<ScaleCalibration> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { error } = await sb.from('mx_scales').upsert(
      {
        project_id: projectId,
        page_number: scale.pageNumber ?? 1,
        pixels_per_unit: scale.pixelsPerUnit,
        unit: scale.unit,
        label: scale.label ?? 'Custom',
        source: scale.source,
        confidence: scale.confidence ?? null,
      },
      { onConflict: 'project_id,page_number' },
    );
    if (error) throw new Error(`setScale: ${error.message}`);
    return scale;
  }

  const pageNum = scale.pageNumber ?? 1;
  const filePath = path.join(projectDir(projectId), `scale-${pageNum}.json`);
  await writeJson(filePath, scale);
  return scale;
}

export async function getScale(projectId: string, pageNumber: number = 1): Promise<ScaleCalibration | null> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_scales')
      .select('*')
      .eq('project_id', projectId)
      .eq('page_number', pageNumber)
      .maybeSingle();
    if (error) throw new Error(`getScale: ${error.message}`);
    if (!data) return null;
    return {
      pixelsPerUnit: data.pixels_per_unit,
      unit: data.unit,
      label: data.label,
      source: data.source,
      confidence: data.confidence ?? undefined,
      pageNumber: data.page_number,
    };
  }

  return readJson<ScaleCalibration | null>(path.join(projectDir(projectId), `scale-${pageNumber}.json`), null);
}

export async function listScales(projectId: string): Promise<ScaleCalibration[]> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_scales')
      .select('*')
      .eq('project_id', projectId)
      .order('page_number', { ascending: true });
    if (error) throw new Error(`listScales: ${error.message}`);
    return (data || []).map((row: Record<string, unknown>): ScaleCalibration => ({
      pixelsPerUnit: row.pixels_per_unit as number,
      unit: row.unit as 'ft' | 'in' | 'm' | 'cm' | 'mm',
      label: row.label as string,
      source: row.source as ScaleCalibration['source'],
      confidence: (row.confidence as number | null) ?? undefined,
      pageNumber: row.page_number as number,
    }));
  }

  // BUG-A7-5-057 fix: use top-level fs import instead of dynamic import()
  const dir = projectDir(projectId);
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  const scaleFiles = entries.filter((f: string) => /^scale-\d+\.json$/.test(f)).sort();
  const scales: ScaleCalibration[] = [];
  for (const file of scaleFiles) {
    const s = await readJson<ScaleCalibration | null>(path.join(dir, file), null);
    if (s) scales.push(s);
  }
  return scales;
}

// ── Assemblies CRUD ─────────────────────────────────────────────────

export interface AssemblyRow {
  id: string;
  projectId: string;
  classificationId?: string;
  name: string;
  unit: string;
  unitCost: number;
  quantityFormula: string;
  createdAt: string;
}

export async function getAssemblies(projectId: string): Promise<AssemblyRow[]> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_assemblies')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`getAssemblies: ${error.message}`);
    return (data || []).map((row: Record<string, unknown>): AssemblyRow => ({
      id: row.id as string,
      projectId: row.project_id as string,
      classificationId: (row.classification_id as string | null) ?? undefined,
      name: row.name as string,
      unit: (row.unit as string | null) ?? 'SF',
      unitCost: parseFloat(String(row.unit_cost ?? 0)),
      quantityFormula: (row.quantity_formula as string | null) ?? 'area',
      createdAt: row.created_at as string,
    }));
  }

  return readJson<AssemblyRow[]>(path.join(projectDir(projectId), 'assemblies.json'), []);
}

export async function createAssembly(
  projectId: string,
  data: Omit<AssemblyRow, 'id' | 'projectId' | 'createdAt'>,
): Promise<AssemblyRow> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (isSupabaseMode()) {
    const sb = getClient();
    // Build payload incrementally — start with the absolute minimum and add
    // optional columns one group at a time, falling back on schema-cache errors.
    // This handles production DBs where not all migrations have been applied.
    const baseRow: Record<string, unknown> = {
      id,
      project_id: projectId,
      name: data.name,
    };

    // Full payload with all known columns
    const fullRow: Record<string, unknown> = {
      ...baseRow,
      unit: data.unit,
      unit_cost: data.unitCost,
      quantity_formula: data.quantityFormula,
      created_at: now,
      updated_at: now,
    };
    // Only include classification_id when a valid value is provided
    if (data.classificationId != null && data.classificationId !== '') {
      fullRow.classification_id = data.classificationId;
    }

    let { error } = await sb.from('mx_assemblies').insert(fullRow);

    // If schema cache error, progressively strip columns until the insert succeeds
    if (error && (error.message.includes('column') || error.message.includes('schema cache'))) {
      // Try without classification_id + timestamps
      const midRow: Record<string, unknown> = {
        ...baseRow,
        unit: data.unit,
        unit_cost: data.unitCost,
        quantity_formula: data.quantityFormula,
      };
      ({ error } = await sb.from('mx_assemblies').insert(midRow));
    }
    if (error && (error.message.includes('column') || error.message.includes('schema cache'))) {
      // Last resort: only mandatory columns
      ({ error } = await sb.from('mx_assemblies').insert(baseRow));
    }
    if (error) throw new Error(`createAssembly: ${error.message}`);
  } else {
    const filePath = path.join(projectDir(projectId), 'assemblies.json');
    const list = await readJson<AssemblyRow[]>(filePath, []);
    list.push({ id, projectId, createdAt: now, ...data });
    await writeJson(filePath, list);
  }

  return { id, projectId, createdAt: now, ...data };
}

export async function updateAssembly(
  projectId: string,
  assemblyId: string,
  patch: Partial<Omit<AssemblyRow, 'id' | 'projectId' | 'createdAt'>>,
): Promise<AssemblyRow | null> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    // Only set classification_id when a non-empty value is explicitly provided
    if (patch.classificationId != null && patch.classificationId !== '') {
      updateData.classification_id = patch.classificationId;
    }
    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.unit !== undefined) updateData.unit = patch.unit;
    if (patch.unitCost !== undefined) updateData.unit_cost = patch.unitCost;
    if (patch.quantityFormula !== undefined) updateData.quantity_formula = patch.quantityFormula;

    const { data: row, error } = await sb
      .from('mx_assemblies')
      .update(updateData)
      .eq('id', assemblyId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`updateAssembly: ${error.message}`);
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      classificationId: (row.classification_id as string | null) ?? undefined,
      name: row.name,
      unit: row.unit,
      unitCost: parseFloat(row.unit_cost),
      quantityFormula: row.quantity_formula,
      createdAt: row.created_at,
    };
  }

  const filePath = path.join(projectDir(projectId), 'assemblies.json');
  const list = await readJson<AssemblyRow[]>(filePath, []);
  const idx = list.findIndex((a) => a.id === assemblyId);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  await writeJson(filePath, list);
  return list[idx];
}

export async function deleteAssembly(projectId: string, assemblyId: string): Promise<boolean> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_assemblies')
      .delete()
      .eq('id', assemblyId)
      .eq('project_id', projectId)
      .select('id');
    if (error) throw new Error(`deleteAssembly: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }

  const filePath = path.join(projectDir(projectId), 'assemblies.json');
  const list = await readJson<AssemblyRow[]>(filePath, []);
  const before = list.length;
  const filtered = list.filter((a) => a.id !== assemblyId);
  if (filtered.length === before) return false;
  await writeJson(filePath, filtered);
  return true;
}

// ── Snapshots CRUD ──────────────────────────────────────────────────────

export interface SnapshotMeta {
  id: string;
  projectId: string;
  description: string;
  createdAt: string;
  polygonCount: number;
  classificationCount: number;
  assemblyCount: number;
  pageCount: number;
}

export interface SnapshotData extends SnapshotMeta {
  classifications: Classification[];
  polygons: Polygon[];
  scales: ScaleCalibration[];
  assemblies: AssemblyRow[];
  pages: PageInfo[];
}

function snapshotsDir(projectId: string): string {
  return path.join(projectDir(projectId), 'snapshots');
}

export async function createSnapshot(
  projectId: string,
  description: string,
): Promise<SnapshotMeta> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Gather all project data
  const [classifications, polygons, scales, assemblies, pages] = await Promise.all([
    getClassifications(projectId),
    getPolygons(projectId),
    listScales(projectId),
    getAssemblies(projectId),
    getPages(projectId),
  ]);

  const snapshot: SnapshotData = {
    id,
    projectId,
    description,
    createdAt: now,
    polygonCount: polygons.length,
    classificationCount: classifications.length,
    assemblyCount: assemblies.length,
    pageCount: pages.length,
    classifications,
    polygons,
    scales,
    assemblies,
    pages,
  };

  // File-based storage (works for both modes — snapshots are always file-based)
  const dir = snapshotsDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  await writeJson(path.join(dir, `${id}.json`), snapshot);

  const meta: SnapshotMeta = {
    id: snapshot.id,
    projectId: snapshot.projectId,
    description: snapshot.description,
    createdAt: snapshot.createdAt,
    polygonCount: snapshot.polygonCount,
    classificationCount: snapshot.classificationCount,
    assemblyCount: snapshot.assemblyCount,
    pageCount: snapshot.pageCount,
  };
  return meta;
}

export async function listSnapshots(projectId: string): Promise<SnapshotMeta[]> {
  const dir = snapshotsDir(projectId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const snapshots: SnapshotMeta[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const data = await readJson<SnapshotData | null>(path.join(dir, entry), null);
    if (!data) continue;
    const snapMeta: SnapshotMeta = {
      id: data.id,
      projectId: data.projectId,
      description: data.description,
      createdAt: data.createdAt,
      polygonCount: data.polygonCount,
      classificationCount: data.classificationCount,
      assemblyCount: data.assemblyCount,
      pageCount: data.pageCount,
    };
    snapshots.push(snapMeta);
  }

  snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return snapshots;
}

export async function getSnapshot(projectId: string, snapshotId: string): Promise<SnapshotData | null> {
  const filePath = path.join(snapshotsDir(projectId), `${snapshotId}.json`);
  return readJson<SnapshotData | null>(filePath, null);
}

export async function deleteSnapshot(projectId: string, snapshotId: string): Promise<boolean> {
  const filePath = path.join(snapshotsDir(projectId), `${snapshotId}.json`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function restoreSnapshot(projectId: string, snapshotId: string): Promise<{
  restored: boolean;
  polygonCount: number;
  classificationCount: number;
}> {
  const snapshot = await getSnapshot(projectId, snapshotId);
  if (!snapshot) throw new NotFoundError('Snapshot not found');

  if (isSupabaseMode()) {
    const sb = getClient();
    // Clear existing data
    await sb.from('mx_polygons').delete().eq('project_id', projectId);
    await sb.from('mx_classifications').delete().eq('project_id', projectId);
    await sb.from('mx_scales').delete().eq('project_id', projectId);
    await sb.from('mx_assemblies').delete().eq('project_id', projectId);

    // Recreate classifications
    for (const cls of snapshot.classifications) {
      await createClassification(projectId, cls);
    }
    // Recreate polygons
    for (const poly of snapshot.polygons) {
      await createPolygon(projectId, poly);
    }
    // Recreate scales
    for (const scale of snapshot.scales) {
      await setScale(projectId, scale);
    }
    // Recreate assemblies
    for (const asm of snapshot.assemblies) {
      await createAssembly(projectId, {
        classificationId: asm.classificationId,
        name: asm.name,
        unit: asm.unit,
        unitCost: asm.unitCost,
        quantityFormula: asm.quantityFormula,
      });
    }
  } else {
    // File mode: overwrite JSON files directly
    const dir = projectDir(projectId);
    // BUG-A7-5-056 fix: write all per-page scale files, not just the first one
    const scaleWrites = snapshot.scales.map((s) =>
      writeJson(path.join(dir, `scale-${s.pageNumber ?? 1}.json`), s)
    );
    await Promise.all([
      writeJson(path.join(dir, 'classifications.json'), snapshot.classifications),
      writeJson(path.join(dir, 'polygons.json'), snapshot.polygons),
      writeJson(path.join(dir, 'assemblies.json'), snapshot.assemblies),
      writeJson(path.join(dir, 'pages.json'), snapshot.pages),
      writeJson(path.join(dir, 'scale.json'), snapshot.scales[0] ?? null),
      ...scaleWrites,
    ]);
  }

  return {
    restored: true,
    polygonCount: snapshot.polygons.length,
    classificationCount: snapshot.classifications.length,
  };
}
