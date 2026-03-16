import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

interface ScaleRow {
  page_number: number;
  pixels_per_unit: number;
  unit: string;
}

interface ClassRow {
  id: string;
  name: string;
  type: string;
  color: string;
}

interface PolyRow {
  classification_id: string;
  page_number: number;
  area_pixels: number;
  linear_pixels: number;
}

function convertArea(areaPixels: number, pixelsPerUnit: number, unit: string): number {
  const ppu2 = pixelsPerUnit * pixelsPerUnit;
  switch (unit) {
    case 'ft': return areaPixels / ppu2;
    case 'in': return areaPixels / (ppu2 * 144);
    case 'm':  return (areaPixels / ppu2) * 10.764;
    case 'mm': return areaPixels / (ppu2) / 92903;
    default:   return areaPixels / ppu2;
  }
}

function convertLinear(linearPixels: number, pixelsPerUnit: number, unit: string): number {
  const raw = linearPixels / pixelsPerUnit;
  switch (unit) {
    case 'ft': return raw;
    case 'in': return raw / 12;
    case 'm':  return raw * 3.28084;
    case 'mm': return raw * 0.00328084;
    default:   return raw;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const [polygonsRes, classificationsRes, scalesRes] = await Promise.all([
      supabase.from('mx_polygons').select('classification_id, page_number, area_pixels, linear_pixels').eq('project_id', id),
      supabase.from('mx_classifications').select('id, name, type, color').eq('project_id', id),
      supabase.from('mx_scales').select('page_number, pixels_per_unit, unit').eq('project_id', id),
    ]);

    if (polygonsRes.error) throw polygonsRes.error;
    if (classificationsRes.error) throw classificationsRes.error;
    if (scalesRes.error) throw scalesRes.error;

    const polygons = (polygonsRes.data || []) as PolyRow[];
    const classifications = (classificationsRes.data || []) as ClassRow[];
    const scales = (scalesRes.data || []) as ScaleRow[];

    const scaleByPage = new Map<number, ScaleRow>();
    for (const s of scales) scaleByPage.set(s.page_number, s);

    const classMap = new Map<string, ClassRow>();
    for (const c of classifications) classMap.set(c.id, c);

    // Accumulate per classification
    const accum = new Map<string, { sqFt: number; linearFt: number; count: number; polygonCount: number }>();

    for (const poly of polygons) {
      const scale = scaleByPage.get(poly.page_number) ?? scaleByPage.get(1);
      const ppu = scale?.pixels_per_unit ?? 1;
      const unit = scale?.unit ?? 'ft';

      const cls = classMap.get(poly.classification_id);
      if (!cls) continue;

      if (!accum.has(cls.id)) accum.set(cls.id, { sqFt: 0, linearFt: 0, count: 0, polygonCount: 0 });
      const a = accum.get(cls.id)!;
      a.polygonCount++;

      switch (cls.type) {
        case 'area':
          a.sqFt += convertArea(poly.area_pixels, ppu, unit);
          break;
        case 'linear':
          a.linearFt += convertLinear(poly.linear_pixels, ppu, unit);
          break;
        case 'count':
          a.count += 1;
          break;
      }
    }

    const quantities = classifications.map((cls) => {
      const a = accum.get(cls.id) ?? { sqFt: 0, linearFt: 0, count: 0, polygonCount: 0 };
      const base: Record<string, unknown> = {
        classificationId: cls.id,
        name: cls.name,
        type: cls.type,
        color: cls.color,
        polygonCount: a.polygonCount,
      };
      if (cls.type === 'area') base.sqFt = Math.round(a.sqFt * 100) / 100;
      if (cls.type === 'linear') base.linearFt = Math.round(a.linearFt * 100) / 100;
      if (cls.type === 'count') base.count = a.count;
      return base;
    });

    return NextResponse.json({ quantities });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
