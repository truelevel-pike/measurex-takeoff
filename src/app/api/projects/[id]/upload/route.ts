import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Dynamic import for server-safe pdfjs
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) } as any);
    const doc = await loadingTask.promise;

    const pageCount = doc.numPages;
    const pages: { pageNumber: number; width: number; height: number }[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const [, , w, h] = page.view; // [x1, y1, x2, y2]
      pages.push({ pageNumber: i, width: w, height: h });
    }

    const supabase = getSupabase();

    // Upload PDF to storage
    const storagePath = `${id}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('mx-pdfs')
      .upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('mx-pdfs').getPublicUrl(storagePath);
    const pdfUrl = urlData.publicUrl;

    // Insert pages into mx_pages
    const rows = pages.map((p) => ({
      project_id: id,
      page_number: p.pageNumber,
      width: p.width,
      height: p.height,
      pdf_url: pdfUrl,
    }));

    const { error: insertError } = await supabase
      .from('mx_pages')
      .upsert(rows, { onConflict: 'project_id,page_number' });
    if (insertError) throw insertError;

    return NextResponse.json({ pageCount, pages, pdfUrl }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
