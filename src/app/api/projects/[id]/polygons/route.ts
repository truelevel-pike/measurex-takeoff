import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculatePolygonArea, calculateLinearFeet } from '@/lib/polygon-utils';
import type { Point } from '@/lib/types';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const points: Point[] = body?.points;
    if (!Array.isArray(points) || points.length < 2)
      return NextResponse.json({ error: 'points array required (min 2)' }, { status: 400 });

    const classificationId = body?.classificationId;
    if (!classificationId)
      return NextResponse.json({ error: 'classificationId required' }, { status: 400 });

    const pageNumber = body?.pageNumber ?? 1;
    const areaPixels = calculatePolygonArea(points);
    const linearPixels = calculateLinearFeet(points, 1, true);

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('mx_polygons')
      .insert({
        project_id: id,
        classification_id: classificationId,
        page_number: pageNumber,
        points: JSON.stringify(points),
        area_pixels: areaPixels,
        linear_pixels: linearPixels,
        is_complete: body?.isComplete ?? true,
        label: body?.label ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({
      polygon: {
        id: data.id,
        classificationId: data.classification_id,
        pageNumber: data.page_number,
        points: data.points,
        area_pixels: data.area_pixels,
        linear_pixels: data.linear_pixels,
        isComplete: data.is_complete,
        label: data.label,
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const page = searchParams.get('page');

    const supabase = getSupabase();

    let query = supabase
      .from('mx_polygons')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: true });

    if (page) {
      query = query.eq('page_number', Number(page));
    }

    const { data, error } = await query;
    if (error) throw error;

    const polygons = (data || []).map((r) => ({
      id: r.id,
      classificationId: r.classification_id,
      pageNumber: r.page_number,
      points: r.points,
      area_pixels: r.area_pixels,
      linear_pixels: r.linear_pixels,
      isComplete: r.is_complete,
      label: r.label,
    }));

    return NextResponse.json({ polygons });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
