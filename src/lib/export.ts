import * as XLSX from 'xlsx';
import type { Classification, Polygon, ScaleCalibration } from './types';
import { calculateLinearFeet } from './polygon-utils';

export function exportToExcel(
  classifications: Classification[],
  polygons: Polygon[],
  scale: ScaleCalibration | null
): XLSX.WorkBook {
  const unit = scale?.unit ?? 'px';
  const ppu = scale?.pixelsPerUnit ?? 1;

  const byType: Record<'area'|'linear'|'count', any[]> = { area: [], linear: [], count: [] };

  for (const cls of classifications) {
    const clsPolys = polygons.filter(p => p.classificationId === cls.id);
    for (const p of clsPolys) {
      const realArea = p.area / (ppu * ppu);
      const lf = calculateLinearFeet(p.points, ppu, cls.type !== 'linear' ? true : false);
      const row = {
        Page: p.pageNumber ?? '-',
        Classification: cls.name,
        Type: cls.type.toUpperCase(),
        [`Area (sq ${unit})`]: cls.type === 'area' ? round2(realArea) : 0,
        [`Perimeter (${unit})`]: cls.type !== 'count' ? round2(lf) : 0,
        Count: cls.type === 'count' ? 1 : 0,
        'Polygon ID': p.id.slice(0, 8),
      };
      byType[cls.type].push(row);
    }
  }

  const wb = XLSX.utils.book_new();
  (['area','linear','count'] as const).forEach((t) => {
    const rows = byType[t];
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data' }]);
    autoWidth(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, t === 'area' ? 'Areas' : t === 'linear' ? 'Linear' : 'Counts');
  });
  return wb;
}

export function downloadExcel(
  classifications: Classification[],
  polygons: Polygon[],
  scale: ScaleCalibration | null,
  filename = 'measurex-takeoff.xlsx'
) {
  const wb = exportToExcel(classifications, polygons, scale);
  try {
    XLSX.writeFile(wb, filename);
  } catch {
    // iOS Safari fallback: write to blob and open in new tab
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      // final fallback: create link and click
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

function round2(n: number) { return Math.round(n * 100) / 100; }

function autoWidth(ws: XLSX.WorkSheet, rows: Record<string, any>[]) {
  const hdrs = Object.keys(rows[0] || { A: '' });
  ws['!cols'] = hdrs.map((h) => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length));
    return { wch: Math.min(maxLen + 2, 40) };
  });
}
