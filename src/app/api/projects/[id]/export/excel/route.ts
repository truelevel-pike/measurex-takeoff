import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getPolygons, getClassifications, getScale, getProject, initDataDir } from '@/server/project-store';
import { calculatePolygonArea, calculateLinearLength } from '@/server/geometry-engine';
import type { Classification, Polygon } from '@/lib/types';

type ClassificationType = Classification['type'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function unitLabel(type: ClassificationType): string {
  if (type === 'area') return 'SF';
  if (type === 'linear') return 'FT';
  return 'EA';
}

interface QuantityRow {
  name: string;
  type: ClassificationType;
  color: string;
  count: number;
  totalValue: number;
  unit: string;
}

function buildQuantityRows(
  classifications: Classification[],
  polygons: Polygon[],
  pixelsPerFoot: number,
): QuantityRow[] {
  const scaleConfig = { pixelsPerFoot: pixelsPerFoot || 1, unit: 'imperial' as const };

  return classifications.map((c) => {
    const classPolygons = polygons.filter((p) => p.classificationId === c.id);
    let totalValue = 0;

    for (const p of classPolygons) {
      if (c.type === 'area') {
        totalValue += calculatePolygonArea(p.points, scaleConfig);
      } else if (c.type === 'linear') {
        totalValue += calculateLinearLength(p.points, scaleConfig);
      } else {
        totalValue += 1;
      }
    }

    return {
      name: c.name,
      type: c.type,
      color: c.color,
      count: classPolygons.length,
      totalValue: round2(totalValue),
      unit: unitLabel(c.type),
    };
  });
}

function applyCellStyle(ws: XLSX.WorkSheet, cellRef: string, style: object) {
  if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
  ws[cellRef].s = style;
}

function buildSummarySheet(projectName: string, rows: QuantityRow[]): XLSX.WorkSheet {
  const headerStyle = { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1a1a2e' } } };
  const sectionStyle = { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '16213e' } } };
  const totalStyle = { font: { bold: true } };

  const aoa: Array<Array<string | number>> = [];
  aoa.push([`MeasureX Takeoff — ${projectName}`]);
  aoa.push([`Exported: ${new Date().toLocaleString()}`]);
  aoa.push([]);
  aoa.push(['Classification', 'Type', 'Count', 'Total Quantity', 'Unit']);

  for (const type of ['area', 'linear', 'count'] as ClassificationType[]) {
    const section = rows.filter((r) => r.type === type);
    if (section.length === 0) continue;

    const typeLabel = type === 'area' ? 'AREA' : type === 'linear' ? 'LINEAR' : 'COUNT';
    aoa.push([typeLabel, '', '', '', '']);

    for (const r of section) {
      aoa.push([r.name, r.type.toUpperCase(), r.count, r.totalValue, r.unit]);
    }

    const sectionTotal = round2(section.reduce((sum, r) => sum + r.totalValue, 0));
    const sectionCount = section.reduce((sum, r) => sum + r.count, 0);
    aoa.push([`${typeLabel} TOTAL`, '', sectionCount, sectionTotal, section[0]?.unit ?? '']);
    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 10 }];

  // Style header rows
  ['A1', 'B1', 'C1', 'D1', 'E1'].forEach((r) => applyCellStyle(ws, r, headerStyle));
  ['A4', 'B4', 'C4', 'D4', 'E4'].forEach((r) => applyCellStyle(ws, r, sectionStyle));

  // Merge title row
  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
  ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 4 } });

  return ws;
}

function buildTypeSheet(
  type: ClassificationType,
  rows: QuantityRow[],
  polygons: Polygon[],
  classifications: Classification[],
  pixelsPerFoot: number,
): XLSX.WorkSheet {
  const scaleConfig = { pixelsPerFoot: pixelsPerFoot || 1, unit: 'imperial' as const };
  const aoa: Array<Array<string | number>> = [];
  const typeRows = rows.filter((r) => r.type === type);

  const typeLabel = type === 'area' ? 'Area Classifications' : type === 'linear' ? 'Linear Classifications' : 'Count Classifications';
  aoa.push([typeLabel]);
  aoa.push([]);

  if (type === 'area') {
    aoa.push(['Classification', 'Polygon #', 'Area (SF)', 'Page']);
    for (const r of typeRows) {
      const cls = classifications.find((c) => c.name === r.name && c.type === type);
      if (!cls) continue;
      const clsPolygons = polygons.filter((p) => p.classificationId === cls.id);
      for (let i = 0; i < clsPolygons.length; i++) {
        const p = clsPolygons[i];
        const area = round2(calculatePolygonArea(p.points, scaleConfig));
        aoa.push([r.name, i + 1, area, p.pageNumber ?? 1]);
      }
      aoa.push([r.name + ' TOTAL', clsPolygons.length, r.totalValue, '']);
      aoa.push([]);
    }
  } else if (type === 'linear') {
    aoa.push(['Classification', 'Segment #', 'Length (FT)', 'Page']);
    for (const r of typeRows) {
      const cls = classifications.find((c) => c.name === r.name && c.type === type);
      if (!cls) continue;
      const clsPolygons = polygons.filter((p) => p.classificationId === cls.id);
      for (let i = 0; i < clsPolygons.length; i++) {
        const p = clsPolygons[i];
        const length = round2(calculateLinearLength(p.points, scaleConfig));
        aoa.push([r.name, i + 1, length, p.pageNumber ?? 1]);
      }
      aoa.push([r.name + ' TOTAL', clsPolygons.length, r.totalValue, '']);
      aoa.push([]);
    }
  } else {
    aoa.push(['Classification', 'Count', 'Page Distribution']);
    for (const r of typeRows) {
      const cls = classifications.find((c) => c.name === r.name && c.type === type);
      if (!cls) continue;
      const clsPolygons = polygons.filter((p) => p.classificationId === cls.id);
      const pageMap: Record<number, number> = {};
      for (const p of clsPolygons) {
        const pg = p.pageNumber ?? 1;
        pageMap[pg] = (pageMap[pg] ?? 0) + 1;
      }
      const distribution = Object.entries(pageMap).map(([pg, cnt]) => `Pg${pg}:${cnt}`).join(', ');
      aoa.push([r.name, r.count, distribution]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 16 }, { wch: 8 }];

  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } });

  return ws;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;

    const [project, polygons, classifications, scale] = await Promise.all([
      getProject(id),
      getPolygons(id),
      getClassifications(id),
      getScale(id),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const pixelsPerFoot = scale?.pixelsPerUnit || 1;
    const projectName = project.name || id;
    const rows = buildQuantityRows(classifications, polygons, pixelsPerFoot);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summarySheet = buildSummarySheet(projectName, rows);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // Sheet 2: Areas (if any)
    const areaRows = rows.filter((r) => r.type === 'area');
    if (areaRows.length > 0) {
      const areaSheet = buildTypeSheet('area', rows, polygons, classifications, pixelsPerFoot);
      XLSX.utils.book_append_sheet(wb, areaSheet, 'Areas');
    }

    // Sheet 3: Linear (if any)
    const linearRows = rows.filter((r) => r.type === 'linear');
    if (linearRows.length > 0) {
      const linearSheet = buildTypeSheet('linear', rows, polygons, classifications, pixelsPerFoot);
      XLSX.utils.book_append_sheet(wb, linearSheet, 'Linear');
    }

    // Sheet 4: Counts (if any)
    const countRows = rows.filter((r) => r.type === 'count');
    if (countRows.length > 0) {
      const countSheet = buildTypeSheet('count', rows, polygons, classifications, pixelsPerFoot);
      XLSX.utils.book_append_sheet(wb, countSheet, 'Counts');
    }

    // Write to buffer — use 'buffer' type, then extract a proper ArrayBuffer slice.
    // ArrayBuffer satisfies BodyInit; Buffer does not in strict Next.js TS configs.
    const nodeBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    const arrayBuf: ArrayBuffer = nodeBuf.buffer.slice(
      nodeBuf.byteOffset,
      nodeBuf.byteOffset + nodeBuf.byteLength,
    ) as ArrayBuffer;
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '-');

    return new Response(arrayBuf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="measurex-${safeName}.xlsx"`,
        'Content-Length': String(nodeBuf.byteLength),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
