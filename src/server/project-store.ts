/**
 * Server-side persistence layer for MeasureX projects.
 * Uses Supabase for storage.
 *
 * Tables: mx_projects, mx_pages, mx_scales, mx_classifications, mx_polygons
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

// ── Supabase Client ────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseKey);
  }
  return _client;
}

// ── Helpers ────────────────────────────────────────────────────────────

/** No-op — kept for callers that import it. Supabase needs no local dir init. */
export async function initDataDir(): Promise<void> {
  // no-op
}

// ── Projects CRUD ──────────────────────────────────────────────────────

export async function createProject(name: string): Promise<ProjectMeta> {
  const sb = getClient();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error } = await sb.from('mx_projects').insert({
    id,
    name,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(`createProject: ${error.message}`);

  return { id, name, createdAt: now, updatedAt: now };
}

export async function getProject(projectId: string): Promise<ProjectMeta | null> {
  const sb = getClient();
  const { data, error } = await sb
    .from('mx_projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw new Error(`getProject: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function listProjects(): Promise<ProjectMeta[]> {
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

export async function updateProject(
  projectId: string,
  patch: Partial<Pick<ProjectMeta, 'name'>>,
): Promise<ProjectMeta | null> {
  const sb = getClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('mx_projects')
    .update({ ...patch, updated_at: now })
    .eq('id', projectId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`updateProject: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const sb = getClient();
  // Delete child rows first (Supabase doesn't cascade by default unless FK set)
  await sb.from('mx_polygons').delete().eq('project_id', projectId);
  await sb.from('mx_classifications').delete().eq('project_id', projectId);
  await sb.from('mx_pages').delete().eq('project_id', projectId);
  await sb.from('mx_scales').delete().eq('project_id', projectId);

  const { error } = await sb.from('mx_projects').delete().eq('id', projectId);
  if (error) throw new Error(`deleteProject: ${error.message}`);
  return true;
}

// ── Pages CRUD ─────────────────────────────────────────────────────────

export async function createPage(projectId: string, page: PageInfo): Promise<PageInfo> {
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

export async function getPages(projectId: string): Promise<PageInfo[]> {
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

export async function updatePage(
  projectId: string,
  pageNum: number,
  patch: Partial<PageInfo>,
): Promise<PageInfo | null> {
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

// ── Classifications CRUD ───────────────────────────────────────────────

export async function createClassification(
  projectId: string,
  data: Omit<Classification, 'id'>,
): Promise<Classification> {
  const sb = getClient();
  const id = crypto.randomUUID();
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
  return { id, ...data };
}

export async function getClassifications(projectId: string): Promise<Classification[]> {
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

export async function updateClassification(
  projectId: string,
  classificationId: string,
  patch: Partial<Classification>,
): Promise<Classification | null> {
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

export async function deleteClassification(
  projectId: string,
  classificationId: string,
): Promise<boolean> {
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

// ── Polygons CRUD ──────────────────────────────────────────────────────

export async function createPolygon(
  projectId: string,
  data: Omit<Polygon, 'id'>,
): Promise<Polygon> {
  const sb = getClient();
  const id = crypto.randomUUID();
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
  return { id, ...data };
}

export async function getPolygons(projectId: string): Promise<Polygon[]> {
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

export async function updatePolygon(
  projectId: string,
  polygonId: string,
  patch: Partial<Polygon>,
): Promise<Polygon | null> {
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

export async function deletePolygon(projectId: string, polygonId: string): Promise<boolean> {
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

// ── Scale CRUD ─────────────────────────────────────────────────────────

export async function setScale(
  projectId: string,
  scale: ScaleCalibration,
): Promise<ScaleCalibration> {
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

export async function getScale(projectId: string): Promise<ScaleCalibration | null> {
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
