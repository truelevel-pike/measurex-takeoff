import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import {
  initDataDir,
  getProjectByShareToken,
  getClassifications,
  getPolygons,
  getScale,
  getPages,
} from '@/server/project-store';
import { validationError } from '@/lib/api-schemas';
import { calculatePolygonArea, calculateLinearLength } from '@/server/geometry-engine';
import type { Classification, Polygon } from '@/lib/types';
import type { ScaleConfig } from '@/server/geometry-engine';
import type { PageInfo } from '@/server/project-store';

const TokenSchema = z.object({ token: z.string().uuid() });

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
  quantity: number;
  unit: string;
}

function buildQuantityRows(
  classifications: Classification[],
  polygons: Polygon[],
  scaleConfig: ScaleConfig,
): QuantityRow[] {
  return classifications.map((c) => {
    const classPolygons = polygons.filter((p) => p.classificationId === c.id);
    let quantity = 0;

    for (const p of classPolygons) {
      if (c.type === 'area') {
        quantity += calculatePolygonArea(p.points, scaleConfig) ?? 0;
      } else if (c.type === 'linear') {
        quantity += calculateLinearLength(p.points, scaleConfig, true) ?? 0;
      } else {
        quantity += 1;
      }
    }

    return {
      name: c.name,
      type: c.type,
      quantity: round2(quantity),
      unit: unitLabel(c.type),
    };
  });
}

function buildQuantitiesSheet(rows: QuantityRow[]): XLSX.WorkSheet {
  const aoa: Array<Array<string | number>> = [
    ['Classification Name', 'Type', 'Quantity', 'Unit'],
    ...rows.map((row) => [row.name, row.type, row.quantity, row.unit]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 10 }];
  return ws;
}

function buildPdfHtml(projectName: string, rows: QuantityRow[]): string {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const tableRows = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.type)}</td><td>${r.quantity}</td><td>${escapeHtml(r.unit)}</td></tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contractor Report — ${escapeHtml(projectName)}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
      color: #1a1a1a;
    }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .date { color: #666; margin-bottom: 32px; font-size: 14px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid #e0e0e0;
    }
    th {
      background: #f5f5f5;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    td { font-size: 14px; }
    tr:last-child td { border-bottom: none; }
    .print-btn {
      margin-top: 32px;
      padding: 10px 24px;
      background: #111;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    .print-btn:hover { background: #333; }
  </style>
</head>
<body>
  <h1>Contractor Report</h1>
  <h2 style="font-size:18px;font-weight:normal;margin-top:0;">${escapeHtml(projectName)}</h2>
  <p class="date">${date}</p>

  <table>
    <thead>
      <tr>
        <th>Classification</th>
        <th>Type</th>
        <th>Quantity</th>
        <th>Unit</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <button class="print-btn no-print" onclick="window.print()">Print Report</button>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await initDataDir();
    const paramsResult = TokenSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { token } = paramsResult.data;

    const url = new URL(_req.url);
    const format = url.searchParams.get('format') ?? 'json';

    if (!['json', 'excel', 'pdf'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Use json, excel, or pdf.' },
        { status: 400 },
      );
    }

    const project = await getProjectByShareToken(token);
    if (!project) {
      return NextResponse.json(
        { error: 'Share link not found or revoked' },
        { status: 404 },
      );
    }

    const [classifications, polygons, scale, pages] = await Promise.all([
      getClassifications(project.id).catch(() => [] as Classification[]),
      getPolygons(project.id).catch(() => [] as Polygon[]),
      getScale(project.id).catch(() => null),
      getPages(project.id).catch(() => [] as PageInfo[]),
    ]);

    const ppu = scale?.pixelsPerUnit ?? null;
    const unit =
      scale?.unit === 'm' || scale?.unit === 'mm'
        ? ('metric' as const)
        : ('imperial' as const);
    const scaleConfig: ScaleConfig = { pixelsPerFoot: ppu, unit };
    const projectName = project.name || 'Untitled Project';
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '-');

    // --- JSON format ---
    if (format === 'json') {
      const payload = { project, pages, classifications, polygons, scale };
      const json = JSON.stringify(payload, null, 2);
      return new Response(json, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="measurex-${safeName}.json"`,
          'Content-Length': String(new TextEncoder().encode(json).byteLength),
        },
      });
    }

    // Build quantity rows (shared by excel and pdf)
    const rows = buildQuantityRows(classifications, polygons, scaleConfig);

    // --- Excel format ---
    if (format === 'excel') {
      const wb = XLSX.utils.book_new();
      const quantitiesSheet = buildQuantitiesSheet(rows);
      XLSX.utils.book_append_sheet(wb, quantitiesSheet, 'Quantities');

      const buf = XLSX.write(wb, {
        bookType: 'xlsx',
        type: 'array',
      }) as ArrayBuffer;
      const bytes = new Uint8Array(buf);

      return new Response(bytes, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="measurex-${safeName}.xlsx"`,
          'Content-Length': String(bytes.byteLength),
        },
      });
    }

    // --- PDF (HTML) format ---
    const html = buildPdfHtml(projectName, rows);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (err: unknown) {
    console.error('[share export GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
