import { NextResponse } from 'next/server';
import {
  getClassifications,
  getPolygons,
  getProject,
  getScale,
  initDataDir,
} from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
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
  const dateLabel = escapeHtml(generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  const rowsHtml = rows
    .map((row, index) => {
      const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
      return `
            <tr style="background:${bg}">
              <td style="padding:11px 14px;border-bottom:1px solid #e2e8f0;font-size:14px">${escapeHtml(row.name)}</td>
              <td style="padding:11px 14px;border-bottom:1px solid #e2e8f0;font-size:14px">${escapeHtml(row.type.toUpperCase())}</td>
              <td style="padding:11px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:right;font-variant-numeric:tabular-nums">${row.quantity.toFixed(2)}</td>
              <td style="padding:11px 14px;border-bottom:1px solid #e2e8f0;font-size:14px">${row.unit}</td>
            </tr>`;
    })
    .join('');

  const totalsRow = `
            <tr style="background:#f1f5f9;font-weight:700;border-top:2px solid #cbd5e1">
              <td style="padding:12px 14px;font-size:14px;color:#1e293b">TOTALS</td>
              <td style="padding:12px 14px;font-size:14px"></td>
              <td style="padding:12px 14px;font-size:14px;text-align:right;font-variant-numeric:tabular-nums">
                ${totals.totalArea.toFixed(2)} SF &nbsp;/&nbsp; ${totals.totalLinear.toFixed(2)} LF &nbsp;/&nbsp; ${totals.totalCount.toFixed(0)} EA
              </td>
              <td style="padding:12px 14px;font-size:14px"></td>
            </tr>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quantity Takeoff Report — ${safeName}</title>
    <style>
      @page { size: letter; margin: 0.5in; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #1e293b;
        background: #ffffff;
        line-height: 1.5;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .no-print { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div style="max-width:880px;margin:0 auto;padding:32px 24px">

      <!-- Header -->
      <header style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f766e;padding-bottom:16px;margin-bottom:28px">
        <div>
          <div style="font-size:22px;font-weight:800;color:#1e293b;letter-spacing:-0.02em">
            <span style="color:#0f766e">&#9650;</span> MeasureX Takeoff
          </div>
          <div style="font-size:13px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.06em">Quantity Takeoff Report</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:700;color:#1e293b">${safeName}</div>
          <div style="font-size:13px;color:#64748b;margin-top:2px">${dateLabel}</div>
        </div>
      </header>

      <!-- Summary Cards -->
      <section style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:28px">
        <div style="border:2px solid #0f766e;border-radius:10px;padding:16px 18px;background:#f0fdfa">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:600">Total Area</div>
          <div style="font-size:26px;font-weight:800;color:#0f766e;margin-top:4px;font-variant-numeric:tabular-nums">${totals.totalArea.toFixed(2)} <span style="font-size:14px;font-weight:600;color:#64748b">SF</span></div>
        </div>
        <div style="border:2px solid #0f766e;border-radius:10px;padding:16px 18px;background:#f0fdfa">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:600">Total Linear</div>
          <div style="font-size:26px;font-weight:800;color:#0f766e;margin-top:4px;font-variant-numeric:tabular-nums">${totals.totalLinear.toFixed(2)} <span style="font-size:14px;font-weight:600;color:#64748b">LF</span></div>
        </div>
        <div style="border:2px solid #0f766e;border-radius:10px;padding:16px 18px;background:#f0fdfa">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:600">Total Count</div>
          <div style="font-size:26px;font-weight:800;color:#0f766e;margin-top:4px;font-variant-numeric:tabular-nums">${totals.totalCount.toFixed(0)} <span style="font-size:14px;font-weight:600;color:#64748b">EA</span></div>
        </div>
      </section>

      <!-- Quantities Table -->
      <section>
        <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#1e293b">
              <th style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#f1f5f9;padding:12px 14px;font-weight:700">Classification</th>
              <th style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#f1f5f9;padding:12px 14px;font-weight:700">Type</th>
              <th style="text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#f1f5f9;padding:12px 14px;font-weight:700">Quantity</th>
              <th style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#f1f5f9;padding:12px 14px;font-weight:700">Unit</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="4" style="text-align:center;color:#64748b;padding:24px;font-size:14px">No classifications available.</td></tr>'}
            ${rows.length > 0 ? totalsRow : ''}
          </tbody>
        </table>
      </section>

      <!-- Footer -->
      <footer style="text-align:center;margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0">
        <div style="font-size:12px;color:#94a3b8">Generated by MeasureX &middot; measurex.ai &middot; ${dateLabel}</div>
      </footer>

    </div>
  </body>
</html>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
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
