import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

interface ScaleRow {
  page_number: number;
  pixels_per_unit: number;
  unit: string;
}

interface ClassRow {
  id: string;
  name: string;
  type: string;
  color: string;
}

interface PolyRow {
  classification_id: string;
  page_number: number;
  area_pixels: number;
  linear_pixels: number;
}

function convertArea(areaPixels: number, pixelsPerUnit: number, unit: string): number {
  const ppu2 = pixelsPerUnit * pixelsPerUnit;
  switch (unit) {
    case 'ft': return areaPixels / ppu2;
    case 'in': return areaPixels / (ppu2 * 144);
    case 'm':  return (areaPixels / ppu2) * 10.764;
    case 'mm': return areaPixels / ppu2 / 92903;
    default:   return areaPixels / ppu2;
  }
}

function convertLinear(linearPixels: number, pixelsPerUnit: number, unit: string): number {
  const raw = linearPixels / pixelsPerUnit;
  switch (unit) {
    case 'ft': return raw;
    case 'in': return raw / 12;
    case 'm':  return raw * 3.28084;
    case 'mm': return raw * 0.00328084;
    default:   return raw;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const [polygonsRes, classificationsRes, scalesRes] = await Promise.all([
      supabase.from('mx_polygons').select('classification_id, page_number, area_pixels, linear_pixels').eq('project_id', id),
      supabase.from('mx_classifications').select('id, name, type, color').eq('project_id', id),
      supabase.from('mx_scales').select('page_number, pixels_per_unit, unit').eq('project_id', id),
    ]);

    if (polygonsRes.error) throw polygonsRes.error;
    if (classificationsRes.error) throw classificationsRes.error;
    if (scalesRes.error) throw scalesRes.error;

    const polygons = (polygonsRes.data || []) as PolyRow[];
    const classifications = (classificationsRes.data || []) as ClassRow[];
    const scales = (scalesRes.data || []) as ScaleRow[];

    const scaleByPage = new Map<number, ScaleRow>();
    for (const s of scales) scaleByPage.set(s.page_number, s);

    const classMap = new Map<string, ClassRow>();
    for (const c of classifications) classMap.set(c.id, c);

    // Build per-classification accumulators + per-polygon detail rows
    const summaryMap = new Map<string, { name: string; type: string; sqFt: number; linearFt: number; count: number }>();
    const areaRows: Array<{ Classification: string; 'Area (sq ft)': number; Page: number }> = [];
    const linearRows: Array<{ Classification: string; 'Length (ft)': number; Page: number }> = [];
    const countRows: Array<{ Classification: string; Count: number; Page: number }> = [];

    for (const poly of polygons) {
      const cls = classMap.get(poly.classification_id);
      if (!cls) continue;

      const scale = scaleByPage.get(poly.page_number) ?? scaleByPage.get(1);
      const ppu = scale?.pixels_per_unit ?? 1;
      const unit = scale?.unit ?? 'ft';

      if (!summaryMap.has(cls.id)) {
        summaryMap.set(cls.id, { name: cls.name, type: cls.type, sqFt: 0, linearFt: 0, count: 0 });
      }
      const acc = summaryMap.get(cls.id)!;

      switch (cls.type) {
        case 'area': {
          const sqFt = convertArea(poly.area_pixels, ppu, unit);
          acc.sqFt += sqFt;
          areaRows.push({ Classification: cls.name, 'Area (sq ft)': Math.round(sqFt * 100) / 100, Page: poly.page_number });
          break;
        }
        case 'linear': {
          const ft = convertLinear(poly.linear_pixels, ppu, unit);
          acc.linearFt += ft;
          linearRows.push({ Classification: cls.name, 'Length (ft)': Math.round(ft * 100) / 100, Page: poly.page_number });
          break;
        }
        case 'count': {
          acc.count += 1;
          countRows.push({ Classification: cls.name, Count: 1, Page: poly.page_number });
          break;
        }
      }
    }

    // Summary sheet
    const summaryData = Array.from(summaryMap.values()).map((s) => {
      let quantity: number;
      let unit: string;
      if (s.type === 'area') { quantity = Math.round(s.sqFt * 100) / 100; unit = 'sq ft'; }
      else if (s.type === 'linear') { quantity = Math.round(s.linearFt * 100) / 100; unit = 'ft'; }
      else { quantity = s.count; unit = 'ea'; }
      return { Classification: s.name, Type: s.type, Quantity: quantity, Unit: unit };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData.length ? summaryData : [{ Classification: '', Type: '', Quantity: 0, Unit: '' }]), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(areaRows.length ? areaRows : [{ Classification: '', 'Area (sq ft)': 0, Page: 0 }]), 'Areas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linearRows.length ? linearRows : [{ Classification: '', 'Length (ft)': 0, Page: 0 }]), 'Linear');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(countRows.length ? countRows : [{ Classification: '', Count: 0, Page: 0 }]), 'Counts');

    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const uint8 = new Uint8Array(xlsxBuffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=project-${id}-takeoff.xlsx`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Excel export failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
