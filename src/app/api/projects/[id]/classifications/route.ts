import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

const VALID_TYPES = ['area', 'linear', 'count'];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const name = (body?.name || '').toString().trim();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const type = body?.type;
    if (!VALID_TYPES.includes(type))
      return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });

    const color = body?.color || '#3b82f6';

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('mx_classifications')
      .insert({ project_id: id, name, type, color })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({
      classification: {
        id: data.id,
        name: data.name,
        type: data.type,
        color: data.color,
        visible: data.visible,
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('mx_classifications')
      .select('id, name, type, color, visible')
      .eq('project_id', id)
      .order('created_at', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ classifications: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
