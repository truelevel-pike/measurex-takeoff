import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  try {
    const { id, cid } = await params;
    const supabase = getSupabase();

    // Cascade delete is handled by FK, but delete polygons explicitly for safety
    await supabase
      .from('mx_polygons')
      .delete()
      .eq('project_id', id)
      .eq('classification_id', cid);

    const { error } = await supabase
      .from('mx_classifications')
      .delete()
      .eq('id', cid)
      .eq('project_id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
