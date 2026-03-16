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

    const { data, error } = await supabase
      .from('mx_pages')
      .select('id, page_number, width, height, pdf_url')
      .eq('project_id', id)
      .order('page_number', { ascending: true });
    if (error) throw error;

    const pages = (data || []).map((r) => ({
      id: r.id,
      pageNumber: r.page_number,
      width: r.width,
      height: r.height,
      pdfUrl: r.pdf_url,
    }));

    return NextResponse.json({ pages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
