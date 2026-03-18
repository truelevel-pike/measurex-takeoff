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

// ── Types ──────────────────────────────────────────────────────────────

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  totalPages?: number;
}

export interface PageInfo {
  pageNum: number;
  width: number;
  height: number;
  text: string;
}

// ── Mode detection ────────────────────────────────────────────────────

function isSupabaseMode(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── Supabase Client (lazy, only created in Supabase mode) ─────────────

import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    // Dynamic import would be cleaner but createClient is sync; require at call time
    const { createClient } = require('@supabase/supabase-js');
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
  return path.join(PROJECTS_DIR, projectId);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

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
    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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

export async function updateProject(
  projectId: string,
  patch: Partial<Pick<ProjectMeta, 'name' | 'totalPages'>>,
): Promise<ProjectMeta | null> {
  const now = new Date().toISOString();

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
  const updated = { ...existing, ...patch, updatedAt: now };
  await writeJson(filePath, updated);
  return updated;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  if (isSupabaseMode()) {
    const sb = getClient();
    await sb.from('mx_polygons').delete().eq('project_id', projectId);
    await sb.from('mx_classifications').delete().eq('project_id', projectId);
    await sb.from('mx_pages').delete().eq('project_id', projectId);
    await sb.from('mx_scales').delete().eq('project_id', projectId);
    const { error } = await sb.from('mx_projects').delete().eq('id', projectId);
    if (error) throw new Error(`deleteProject: ${error.message}`);
    return true;
  }

  try {
    await fs.rm(projectDir(projectId), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// ── Pages CRUD ─────────────────────────────────────────────────────────

export async function createPage(projectId: string, page: PageInfo): Promise<PageInfo> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { error } = await sb.from('mx_pages').upsert(
      {
        project_id: projectId,
        page_number: page.pageNum,
        width: page.width,
        height: page.height,
        pdf_url: page.text ?? null,
      },
      { onConflict: 'project_id,page_number' },
    );
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
    return (data || []).map((row: any) => ({
      pageNum: row.page_number,
      width: row.width,
      height: row.height,
      text: row.pdf_url ?? '',
    }));
  }

  return readJson<PageInfo[]>(path.join(projectDir(projectId), 'pages.json'), []);
}

export async function updatePage(
  projectId: string,
  pageNum: number,
  patch: Partial<PageInfo>,
): Promise<PageInfo | null> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const updateData: Record<string, unknown> = {};
    if (patch.width !== undefined) updateData.width = patch.width;
    if (patch.height !== undefined) updateData.height = patch.height;
    if (patch.text !== undefined) updateData.pdf_url = patch.text;

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
      text: data.pdf_url ?? '',
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

// ── Classifications CRUD ───────────────────────────────────────────────

export async function createClassification(
  projectId: string,
  data: Omit<Classification, 'id'> & { id?: string },
): Promise<Classification> {
  const id = data.id || crypto.randomUUID();

  if (isSupabaseMode()) {
    const sb = getClient();
    const row = {
      id,
      project_id: projectId,
      name: data.name,
      color: data.color,
      type: data.type,
      visible: data.visible ?? true,
    };
    const { error } = await sb.from('mx_classifications').insert(row);
    if (error) throw new Error(`createClassification: ${error.message}`);
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
  const cls: Classification = { id, ...data };
  list.push(cls);
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
    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      type: row.type,
      visible: row.visible,
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

    const { data: row, error } = await sb
      .from('mx_classifications')
      .update(updateData)
      .eq('id', classificationId)
      .eq('project_id', projectId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`updateClassification: ${error.message}`);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      type: row.type,
      visible: row.visible,
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

export async function createPolygon(
  projectId: string,
  data: Omit<Polygon, 'id'> & { id?: string },
): Promise<Polygon> {
  const id = data.id || crypto.randomUUID();

  if (isSupabaseMode()) {
    const sb = getClient();
    const row = {
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
    const { error } = await sb.from('mx_polygons').insert(row);
    if (error) throw new Error(`createPolygon: ${error.message}`);
    // Build return object explicitly — spreading `data` (which may have id?: undefined)
    // over { id } would overwrite id with undefined.
    return {
      id,
      points: data.points,
      classificationId: data.classificationId,
      pageNumber: data.pageNumber ?? 1,
      area: row.area_pixels,
      linearFeet: row.linear_pixels,
      isComplete: data.isComplete ?? true,
      label: data.label,
    };
  }

  const filePath = path.join(projectDir(projectId), 'polygons.json');
  const list = await readJson<Polygon[]>(filePath, []);
  const poly: Polygon = { id, ...data };
  list.push(poly);
  await writeJson(filePath, list);
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
    return (data || []).map((row: any) => ({
      id: row.id,
      points: row.points,
      classificationId: row.classification_id,
      pageNumber: row.page_number,
      area: row.area_pixels,
      linearFeet: row.linear_pixels,
      isComplete: row.is_complete,
      label: row.label ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
    return {
      id: row.id,
      points: row.points,
      classificationId: row.classification_id,
      pageNumber: row.page_number,
      area: row.area_pixels,
      linearFeet: row.linear_pixels,
      isComplete: row.is_complete,
      label: row.label ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  const filePath = path.join(projectDir(projectId), 'polygons.json');
  const list = await readJson<Polygon[]>(filePath, []);
  const idx = list.findIndex((p) => p.id === polygonId);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  await writeJson(filePath, list);
  return list[idx];
}

export async function deletePolygon(projectId: string, polygonId: string): Promise<boolean> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_polygons')
      .delete()
      .eq('id', polygonId)
      .eq('project_id', projectId)
      .select('id');
    if (error) throw new Error(`deletePolygon: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }

  const filePath = path.join(projectDir(projectId), 'polygons.json');
  const list = await readJson<Polygon[]>(filePath, []);
  const before = list.length;
  const filtered = list.filter((p) => p.id !== polygonId);
  if (filtered.length === before) return false;
  await writeJson(filePath, filtered);
  return true;
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

  const filePath = path.join(projectDir(projectId), 'scale.json');
  await writeJson(filePath, scale);
  return scale;
}

export async function getScale(projectId: string): Promise<ScaleCalibration | null> {
  if (isSupabaseMode()) {
    const sb = getClient();
    const { data, error } = await sb
      .from('mx_scales')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) throw new Error(`getScale: ${error.message}`);
    if (!data) return null;
    return {
      pixelsPerUnit: data.pixels_per_unit,
      unit: data.unit,
      label: data.label,
      source: data.source,
      confidence: data.confidence ?? undefined,
    };
  }

  return readJson<ScaleCalibration | null>(path.join(projectDir(projectId), 'scale.json'), null);
}

// ── Assemblies CRUD ─────────────────────────────────────────────────

export interface AssemblyRow {
  id: string;
  projectId: string;
  classificationId: string;
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
    return (data || []).map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      classificationId: row.classification_id,
      name: row.name,
      unit: row.unit,
      unitCost: parseFloat(row.unit_cost),
      quantityFormula: row.quantity_formula,
      createdAt: row.created_at,
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
    const row = {
      id,
      project_id: projectId,
      classification_id: data.classificationId,
      name: data.name,
      unit: data.unit,
      unit_cost: data.unitCost,
      quantity_formula: data.quantityFormula,
      created_at: now,
      updated_at: now,
    };
    const { error } = await sb.from('mx_assemblies').insert(row);
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
    if (patch.classificationId !== undefined) updateData.classification_id = patch.classificationId;
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
      classificationId: row.classification_id,
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
