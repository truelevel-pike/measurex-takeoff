import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const [projectRes, pagesRes, classificationsRes, polygonsRes, scalesRes] = await Promise.all([
      supabase.from('mx_projects').select('*').eq('id', id).single(),
      supabase.from('mx_pages').select('*').eq('project_id', id).order('page_number'),
      supabase.from('mx_classifications').select('*').eq('project_id', id),
      supabase.from('mx_polygons').select('*').eq('project_id', id),
      supabase.from('mx_scales').select('*').eq('project_id', id),
    ]);

    if (projectRes.error) throw projectRes.error;
    if (!projectRes.data) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const exportData = {
      project: projectRes.data,
      pages: pagesRes.data || [],
      classifications: classificationsRes.data || [],
      polygons: polygonsRes.data || [],
      scales: scalesRes.data || [],
      exportedAt: new Date().toISOString(),
    };

    const body = JSON.stringify(exportData, null, 2);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename=project-${id}.json`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
