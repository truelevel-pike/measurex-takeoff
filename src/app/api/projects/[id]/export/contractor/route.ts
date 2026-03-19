import { NextResponse } from 'next/server';
import {
  getClassifications,
  getPolygons,
  getProject,
  getScale,
  initDataDir,
} from '@/server/project-store';
import { calculateLinearLength, calculatePolygonArea } from '@/server/geometry-engine';
import type { Classification, Polygon } from '@/lib/types';
import type { ScaleConfig } from '@/server/geometry-engine';

interface QuantityRow {
  classificationId: string;
  name: string;
  type: Classification['type'];
  quantity: number;
  unit: 'SF' | 'LF' | 'EA';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function unitLabel(type: Classification['type']): 'SF' | 'LF' | 'EA' {
  if (type === 'area') return 'SF';
  if (type === 'linear') return 'LF';
  return 'EA';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildQuantityRows(
  classifications: Classification[],
  polygons: Polygon[],
  scaleConfig: ScaleConfig,
): QuantityRow[] {
  return classifications.map((classification) => {
    const classPolygons = polygons.filter((polygon) => polygon.classificationId === classification.id);
    let quantity = 0;

    for (const polygon of classPolygons) {
      if (classification.type === 'area') {
        quantity += calculatePolygonArea(polygon.points, scaleConfig) ?? 0;
      } else if (classification.type === 'linear') {
        quantity += calculateLinearLength(polygon.points, scaleConfig, true) ?? 0;
      } else {
        quantity += 1;
      }
    }

    return {
      classificationId: classification.id,
      name: classification.name,
      type: classification.type,
      quantity: round2(quantity),
      unit: unitLabel(classification.type),
    };
  });
}

function buildReportHtml(
  projectName: string,
  rows: QuantityRow[],
  generatedAt: Date,
  totals: { totalArea: number; totalLinear: number; totalCount: number },
): string {
  const safeName = escapeHtml(projectName);
  const dateLabel = escapeHtml(generatedAt.toLocaleDateString('en-US'));
  const rowsHtml = rows
    .map((row, index) => {
      const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
      return `
        <tr style="background:${bg}">
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.type.toUpperCase())}</td>
          <td style="text-align:right">${row.quantity.toFixed(2)}</td>
          <td>${row.unit}</td>
        </tr>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Contractor Report - ${safeName}</title>
    <style>
      @page { size: letter; margin: 0.5in; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #0f172a;
        background: #ffffff;
        line-height: 1.45;
      }
      .report {
        max-width: 900px;
        margin: 0 auto;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 12px;
        margin-bottom: 20px;
      }
      .title {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
      }
      .meta {
        margin-top: 4px;
        color: #475569;
        font-size: 13px;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 20px;
      }
      .card {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px 12px;
        background: #f8fafc;
      }
      .card .label {
        margin: 0;
        color: #64748b;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .card .value {
        margin: 2px 0 0;
        font-size: 20px;
        font-weight: 700;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #e2e8f0;
      }
      thead th {
        text-align: left;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        background: #e2e8f0;
        color: #334155;
        padding: 10px;
        border-bottom: 1px solid #cbd5e1;
      }
      tbody td {
        padding: 10px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 14px;
      }
      tbody tr:last-child td {
        border-bottom: none;
      }
    </style>
  </head>
  <body>
    <main class="report">
      <header class="header">
        <div>
          <h1 class="title">Contractor Report</h1>
          <div class="meta"><strong>Project:</strong> ${safeName}</div>
        </div>
        <div class="meta"><strong>Date:</strong> ${dateLabel}</div>
      </header>

      <section class="summary">
        <article class="card">
          <p class="label">Total Area</p>
          <p class="value">${totals.totalArea.toFixed(2)} SF</p>
        </article>
        <article class="card">
          <p class="label">Total Linear</p>
          <p class="value">${totals.totalLinear.toFixed(2)} LF</p>
        </article>
        <article class="card">
          <p class="label">Total Count</p>
          <p class="value">${totals.totalCount.toFixed(2)} EA</p>
        </article>
      </section>

      <section>
        <table>
          <thead>
            <tr>
              <th>Classification</th>
              <th>Type</th>
              <th style="text-align:right">Quantity</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="4" style="text-align:center;color:#64748b">No classifications available.</td></tr>'}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;
    const [project, classifications, polygons, scale] = await Promise.all([
      getProject(id),
      getClassifications(id),
      getPolygons(id),
      getScale(id),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const unit = scale?.unit === 'm' || scale?.unit === 'mm' ? 'metric' : 'imperial';
    const scaleConfig: ScaleConfig = {
      pixelsPerFoot: scale?.pixelsPerUnit ?? null,
      unit,
    };

    const rows = buildQuantityRows(classifications, polygons, scaleConfig);
    const totalArea = round2(rows.filter((row) => row.type === 'area').reduce((sum, row) => sum + row.quantity, 0));
    const totalLinear = round2(rows.filter((row) => row.type === 'linear').reduce((sum, row) => sum + row.quantity, 0));
    const totalCount = round2(rows.filter((row) => row.type === 'count').reduce((sum, row) => sum + row.quantity, 0));
    const html = buildReportHtml(project.name || id, rows, new Date(), {
      totalArea,
      totalLinear,
      totalCount,
    });

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="contractor-report.pdf"',
        'Cache-Control': 'no-store',
        'Content-Length': String(new TextEncoder().encode(html).byteLength),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
