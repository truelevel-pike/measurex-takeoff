import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ProjectState, Classification, Polygon, ScaleCalibration, Point } from '@/lib/types';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function toNumber(v: unknown, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function toPositiveInt(v: unknown, fallback = 1) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

function normalizePoint(input: unknown): Point {
  const p = isRecord(input) ? input : {};
  return {
    x: toNumber(p.x, 0),
    y: toNumber(p.y, 0),
  };
}

function normalizeScale(input: unknown): ScaleCalibration | null {
  if (!isRecord(input)) return null;
  const pixelsPerUnit = toNumber(input.pixelsPerUnit, NaN);
  const unit = input.unit;
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim() : 'Custom';
  const source = input.source;

  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) return null;
  if (unit !== 'ft' && unit !== 'in' && unit !== 'm' && unit !== 'mm') return null;
  if (source !== 'manual' && source !== 'auto' && source !== 'ai') return null;

  const confidence = typeof input.confidence === 'number' && Number.isFinite(input.confidence)
    ? input.confidence
    : undefined;

  return { pixelsPerUnit, unit, label, source, confidence };
}

function normalizeClassification(input: unknown): Classification | null {
  if (!isRecord(input)) return null;
  const id = typeof input.id === 'string' && input.id.trim() ? input.id : crypto.randomUUID();
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : null;
  const color = typeof input.color === 'string' && input.color.trim() ? input.color.trim() : '#3b82f6';
  const type = input.type;
  const visible = typeof input.visible === 'boolean' ? input.visible : true;

  if (!name) return null;
  if (type !== 'area' && type !== 'linear' && type !== 'count') return null;

  return { id, name, color, type, visible };
}

function normalizePolygon(input: unknown): Polygon | null {
  if (!isRecord(input)) return null;
  const id = typeof input.id === 'string' && input.id.trim() ? input.id : crypto.randomUUID();
  const classificationId = typeof input.classificationId === 'string' && input.classificationId.trim()
    ? input.classificationId
    : null;
  const pageNumber = toPositiveInt(input.pageNumber, 1);
  const pointsRaw = Array.isArray(input.points) ? input.points : [];
  const points = pointsRaw.map(normalizePoint);

  if (!classificationId) return null;

  return {
    id,
    classificationId,
    pageNumber,
    points,
    area: toNumber(input.area, 0),
    linearFeet: toNumber(input.linearFeet, 0),
    isComplete: typeof input.isComplete === 'boolean' ? input.isComplete : true,
    label: typeof input.label === 'string' ? input.label : undefined,
  };
}

function normalizeProjectState(input: unknown): ProjectState {
  const raw = isRecord(input) ? input : {};

  const classifications = Array.isArray(raw.classifications)
    ? raw.classifications.map(normalizeClassification).filter((c): c is Classification => !!c)
    : [];

  const validClassificationIds = new Set(classifications.map((c) => c.id));

  const polygons = Array.isArray(raw.polygons)
    ? raw.polygons
        .map(normalizePolygon)
        .filter((p): p is Polygon => !!p && validClassificationIds.has(p.classificationId))
    : [];

  const scale = normalizeScale(raw.scale);

  const scales: Record<number, ScaleCalibration> = {};
  if (isRecord(raw.scales)) {
    for (const [k, v] of Object.entries(raw.scales)) {
      const page = toPositiveInt(Number(k), NaN);
      const normalized = normalizeScale(v);
      if (Number.isFinite(page) && normalized) scales[page] = normalized;
    }
  }

  return {
    classifications,
    polygons,
    scale,
    scales,
    currentPage: toPositiveInt(raw.currentPage, 1),
    totalPages: toPositiveInt(raw.totalPages, 1),
  };
}

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.from('measurex_projects').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ projects: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = (body?.name || '').toString().trim();
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const state: ProjectState = normalizeProjectState(body?.state);

    const supabase = getServiceClient();
    const { data, error } = await supabase.from('measurex_projects').insert({ name, state }).select().single();
    if (error) throw error;
    return NextResponse.json({ project: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Create failed' }, { status: 500 });
  }
}
