import { NextResponse } from 'next/server';
import {
  getClassifications,
  getPages,
  getPolygons,
  getProject,
  getScale,
  getThumbnail,
  initDataDir,
  listScales,
} from '@/server/project-store';
import type { PageInfo } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { calculateLinearLength, calculatePolygonArea } from '@/server/geometry-engine';
import type { Classification, Polygon, ScaleCalibration } from '@/lib/types';
import type { ScaleConfig } from '@/server/geometry-engine';

interface QuantityRow {
  classificationId: string;
  name: string;
  color: string;
  type: Classification['type'];
  quantity: number;
  unit: 'SF' | 'LF' | 'EA';
}

interface PageMeasurement {
  classificationId: string;
  name: string;
  color: string;
  type: Classification['type'];
  count: number;
  area: number;
  linear: number;
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

function pickScale(
  pageNumber: number,
  allScales: ScaleCalibration[],
  fallback: ScaleCalibration | null,
): ScaleCalibration | null {
  const pageScale = allScales.find((s) => s.pageNumber === pageNumber);
  return pageScale ?? fallback;
}

function buildScaleConfig(scale: ScaleCalibration | null): ScaleConfig {
  const unit = scale?.unit === 'm' || scale?.unit === 'mm' ? 'metric' : 'imperial';
  return { pixelsPerFoot: scale?.pixelsPerUnit ?? null, unit };
}

function buildQuantityRows(
  classifications: Classification[],
  polygons: Polygon[],
  allScales: ScaleCalibration[],
  fallbackScale: ScaleCalibration | null,
): QuantityRow[] {
  return classifications.map((cls) => {
    const clsPolygons = polygons.filter((p) => p.classificationId === cls.id);
    let quantity = 0;

    for (const poly of clsPolygons) {
      const sc = buildScaleConfig(pickScale(poly.pageNumber, allScales, fallbackScale));
      if (cls.type === 'area') {
        quantity += calculatePolygonArea(poly.points, sc) ?? 0;
      } else if (cls.type === 'linear') {
        quantity += calculateLinearLength(poly.points, sc, true) ?? 0;
      } else {
        quantity += 1;
      }
    }

    return {
      classificationId: cls.id,
      name: cls.name,
      color: cls.color,
      type: cls.type,
      quantity: round2(quantity),
      unit: unitLabel(cls.type),
    };
  });
}

function buildPageMeasurements(
  pageNumber: number,
  classifications: Classification[],
  polygons: Polygon[],
  allScales: ScaleCalibration[],
  fallbackScale: ScaleCalibration | null,
): PageMeasurement[] {
  const pagePolys = polygons.filter((p) => p.pageNumber === pageNumber);
  const measurements = new Map<string, PageMeasurement>();

  for (const poly of pagePolys) {
    const cls = classifications.find((c) => c.id === poly.classificationId);
    if (!cls) continue;

    let m = measurements.get(cls.id);
    if (!m) {
      m = { classificationId: cls.id, name: cls.name, color: cls.color, type: cls.type, count: 0, area: 0, linear: 0 };
      measurements.set(cls.id, m);
    }

    const sc = buildScaleConfig(pickScale(poly.pageNumber, allScales, fallbackScale));
    m.count += 1;
    if (cls.type === 'area') {
      m.area += calculatePolygonArea(poly.points, sc) ?? 0;
    } else if (cls.type === 'linear') {
      m.linear += calculateLinearLength(poly.points, sc, true) ?? 0;
    }
  }

  return Array.from(measurements.values());
}

function buildSvgOverlay(
  pagePolygons: Polygon[],
  classifications: Classification[],
  pageWidth: number,
  pageHeight: number,
): string {
  const paths = pagePolygons
    .map((poly) => {
      const cls = classifications.find((c) => c.id === poly.classificationId);
      if (!cls || poly.points.length < 2) return '';
      const color = cls.color;
      const pts = poly.points.map((p) => `${p.x / pageWidth},${p.y / pageHeight}`).join(' ');
      if (cls.type === 'linear') {
        return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="0.003" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      return `<polygon points="${pts}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="0.002"/>`;
    })
    .filter(Boolean)
    .join('\n        ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible">${paths}</svg>`;
}

function buildPageSection(
  pageNum: number,
  pageName: string | undefined,
  thumbnail: string | null,
  svgOverlay: string,
  measurements: PageMeasurement[],
): string {
  const title = pageName ? `${escapeHtml(pageName)} (Page ${pageNum})` : `Page ${pageNum}`;

  const imageSection =
    thumbnail !== null
      ? `
      <figure style="position:relative;display:inline-block;width:100%;max-width:860px;margin:0 0 20px">
        <img src="${thumbnail}" style="width:100%;height:auto;display:block;border:1px solid #e2e8f0;border-radius:6px" alt="Page ${pageNum}" />
        ${svgOverlay}
      </figure>`
      : '';

  const measurementRows = measurements
    .map(
      (m, i) => `
              <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
                <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;border-left:4px solid ${m.color}">
                  ${escapeHtml(m.name)}
                </td>
                <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:center;font-variant-numeric:tabular-nums">${m.count}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${m.type === 'area' ? round2(m.area).toFixed(2) : '—'}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${m.type === 'linear' ? round2(m.linear).toFixed(2) : '—'}</td>
              </tr>`,
    )
    .join('');

  return `
      <!-- Page ${pageNum} -->
      <section style="margin-bottom:36px;page-break-inside:avoid">
        <h3 style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.04em">${title}</h3>
        ${imageSection}
        <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden">
          <thead>
            <tr style="background:#1e293b">
              <th style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#f1f5f9;padding:10px 14px;font-weight:700">Classification</th>
              <th style="text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#f1f5f9;padding:10px 14px;font-weight:700">Count</th>
              <th style="text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#f1f5f9;padding:10px 14px;font-weight:700">Area (SF)</th>
              <th style="text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#f1f5f9;padding:10px 14px;font-weight:700">Linear (LF)</th>
            </tr>
          </thead>
          <tbody>
            ${measurementRows || '<tr><td colspan="4" style="text-align:center;color:#64748b;padding:20px;font-size:13px">No measurements on this page.</td></tr>'}
          </tbody>
        </table>
      </section>`;
}

function buildReportHtml(
  projectName: string,
  rows: QuantityRow[],
  pageSections: string,
  generatedAt: Date,
  totals: { totalArea: number; totalLinear: number; totalCount: number },
): string {
  const safeName = escapeHtml(projectName);
  const dateLabel = escapeHtml(
    generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  );

  const rowsHtml = rows
    .map((row, index) => {
      const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
      return `
            <tr style="background:${bg}">
              <td style="padding:11px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;border-left:4px solid ${row.color}">${escapeHtml(row.name)}</td>
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
    <title>Contractor Report — ${safeName}</title>
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
        section { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div style="max-width:880px;margin:0 auto;padding:32px 24px">

      <!-- Header -->
      <header style="background:#0f172a;border-radius:10px;padding:20px 28px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em">
            <span style="color:#0f766e">&#9650;</span> MeasureX Takeoff
          </div>
          <div style="font-size:13px;color:#94a3b8;margin-top:2px;text-transform:uppercase;letter-spacing:0.06em">Contractor Report</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:700;color:#ffffff">${safeName}</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:2px">${dateLabel}</div>
        </div>
      </header>

      <!-- Print button -->
      <div class="no-print" style="margin-bottom:20px;text-align:right">
        <button onclick="window.print()" style="padding:10px 24px;background:#0f766e;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer">Print Report</button>
      </div>

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

      <!-- Per-Page Sections -->
      ${pageSections}

      <!-- Overall Quantities Table -->
      <section style="margin-bottom:36px">
        <h3 style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.04em">Overall Quantities</h3>
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

    const [project, classifications, polygons, fallbackScale, allScales, pages, thumbnail] =
      await Promise.all([
        getProject(id),
        getClassifications(id),
        getPolygons(id),
        getScale(id),
        listScales(id),
        getPages(id),
        getThumbnail(id),
      ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const rows = buildQuantityRows(classifications, polygons, allScales, fallbackScale);
    const totalArea = round2(rows.filter((r) => r.type === 'area').reduce((s, r) => s + r.quantity, 0));
    const totalLinear = round2(rows.filter((r) => r.type === 'linear').reduce((s, r) => s + r.quantity, 0));
    const totalCount = round2(rows.filter((r) => r.type === 'count').reduce((s, r) => s + r.quantity, 0));

    // Determine which pages have polygons
    const pagesWithPolygons = new Set(polygons.map((p) => p.pageNumber));
    // Also include all known pages for measurement tables
    const allPageNums = new Set([...pagesWithPolygons, ...pages.map((p) => p.pageNum)]);
    const sortedPageNums = Array.from(allPageNums).sort((a, b) => a - b);

    // Build per-page sections
    const pageSectionsHtml = sortedPageNums
      .map((pageNum) => {
        const pageInfo = pages.find((p) => p.pageNum === pageNum);
        const pagePolygons = polygons.filter((p) => p.pageNumber === pageNum);
        const measurements = buildPageMeasurements(pageNum, classifications, polygons, allScales, fallbackScale);

        // Only show image for page 1 (thumbnail is always page 1)
        const pageThumbnail = pageNum === 1 ? thumbnail : null;

        let svgOverlay = '';
        if (pageThumbnail && pageInfo && pagePolygons.length > 0) {
          svgOverlay = buildSvgOverlay(pagePolygons, classifications, pageInfo.width, pageInfo.height);
        }

        // Skip pages with no measurements
        if (measurements.length === 0) return '';

        return buildPageSection(pageNum, pageInfo?.name, pageThumbnail, svgOverlay, measurements);
      })
      .filter(Boolean)
      .join('');

    const html = buildReportHtml(project.name || id, rows, pageSectionsHtml, new Date(), {
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
