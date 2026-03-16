import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

const VALID_UNITS = ['ft', 'in', 'm', 'mm'];
const VALID_SOURCES = ['manual', 'auto', 'ai'];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { pageNumber, pixelsPerUnit, unit, label, source, confidence } = body;

    if (!pageNumber || typeof pageNumber !== 'number')
      return NextResponse.json({ error: 'pageNumber required' }, { status: 400 });
    if (!pixelsPerUnit || typeof pixelsPerUnit !== 'number' || pixelsPerUnit <= 0)
      return NextResponse.json({ error: 'pixelsPerUnit must be a positive number' }, { status: 400 });
    if (!VALID_UNITS.includes(unit))
      return NextResponse.json({ error: `unit must be one of: ${VALID_UNITS.join(', ')}` }, { status: 400 });
    if (!VALID_SOURCES.includes(source))
      return NextResponse.json({ error: `source must be one of: ${VALID_SOURCES.join(', ')}` }, { status: 400 });

    const supabase = getSupabase();

    const row = {
      project_id: id,
      page_number: pageNumber,
      pixels_per_unit: pixelsPerUnit,
      unit,
      label: label || 'Custom',
      source,
      confidence: confidence ?? null,
    };

    const { data, error } = await supabase
      .from('mx_scales')
      .upsert(row, { onConflict: 'project_id,page_number' })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({
      scale: {
        pageNumber: data.page_number,
        pixelsPerUnit: data.pixels_per_unit,
        unit: data.unit,
        label: data.label,
        source: data.source,
        confidence: data.confidence,
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
      .from('mx_scales')
      .select('*')
      .eq('project_id', id)
      .order('page_number', { ascending: true });

    if (page) {
      query = query.eq('page_number', Number(page));
    }

    const { data, error } = await query;
    if (error) throw error;

    const scales = (data || []).map((r) => ({
      pageNumber: r.page_number,
      pixelsPerUnit: r.pixels_per_unit,
      unit: r.unit,
      label: r.label,
      source: r.source,
      confidence: r.confidence,
    }));

    return NextResponse.json({ scales });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
