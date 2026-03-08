import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ProjectState } from '@/lib/types';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
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
    const state: ProjectState = body?.state || { classifications: [], polygons: [], scale: null, scales: {}, currentPage: 1, totalPages: 1 };
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const supabase = getServiceClient();
    const { data, error } = await supabase.from('measurex_projects').insert({ name, state }).select().single();
    if (error) throw error;
    return NextResponse.json({ project: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Create failed' }, { status: 500 });
  }
}
