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

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  try {
    const { id, pid } = await params;
    const body = await req.json();

    const updates: Record<string, unknown> = {};

    if (body.classificationId !== undefined) updates.classification_id = body.classificationId;
    if (body.pageNumber !== undefined) updates.page_number = body.pageNumber;
    if (body.label !== undefined) updates.label = body.label;
    if (body.isComplete !== undefined) updates.is_complete = body.isComplete;

    if (body.points !== undefined) {
      const points: Point[] = body.points;
      updates.points = JSON.stringify(points);
      updates.area_pixels = calculatePolygonArea(points);
      updates.linear_pixels = calculateLinearFeet(points, 1, true);
    }

    if (Object.keys(updates).length === 0)
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('mx_polygons')
      .update(updates)
      .eq('id', pid)
      .eq('project_id', id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  try {
    const { id, pid } = await params;
    const supabase = getSupabase();

    const { error } = await supabase
      .from('mx_polygons')
      .delete()
      .eq('id', pid)
      .eq('project_id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
