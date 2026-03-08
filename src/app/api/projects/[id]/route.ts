import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ProjectState } from '@/lib/types';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getServiceClient();
    const { data, error } = await supabase.from('measurex_projects').select('*').eq('id', id).single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ project: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Load failed' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const state: ProjectState = body?.state;
    if (!state) return NextResponse.json({ error: 'state required' }, { status: 400 });
    const supabase = getServiceClient();
    const { data, error } = await supabase.from('measurex_projects').update({ state }).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ project: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getServiceClient();
    const { error } = await supabase.from('measurex_projects').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 });
  }
}
