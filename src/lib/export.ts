// BUG-A8-011 / BUG-A5-6-176: xlsx@0.18.x has known CVEs (CVE-2023-30533,
// CVE-2024-22363, and related prototype-pollution / ReDoS vulnerabilities).
// The package.json pins "^0.18.5" which is affected. Upgrade to xlsx >= 0.20.x
// or migrate to exceljs to resolve. For now, tree-shake and restrict to server path.
import * as XLSX from 'xlsx';
import type { Classification, Polygon, ScaleCalibration } from './types';
import { calculateLinearFeet } from './polygon-utils';

type ClassificationType = Classification['type'];
type ExportRow = [string, string, number, number, string];

const SECTION_ORDER: ClassificationType[] = ['area', 'linear', 'count'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function titleForType(type: ClassificationType): string {
  if (type === 'area') return 'AREA CLASSIFICATIONS';
  if (type === 'linear') return 'LINEAR CLASSIFICATIONS';
  return 'COUNT CLASSIFICATIONS';
}

function unitForType(type: ClassificationType, baseUnit: string): string {
  if (type === 'area') return `sq ${baseUnit}`;
  if (type === 'linear') return baseUnit;
  return 'ea';
}

function pickScaleForPage(
  pageNumber: number,
  scales: Record<number, ScaleCalibration> | undefined,
  fallbackScale: ScaleCalibration | null
): ScaleCalibration | null {
  if (scales && scales[pageNumber]) return scales[pageNumber];
  return fallbackScale;
}

function pageNumbersFromPolygons(polygons: Polygon[]): number[] {
  return Array.from(new Set(polygons.map((p) => p.pageNumber ?? 1))).sort((a, b) => a - b);
}

function toSectionRows(
  type: ClassificationType,
  pagePolygons: Polygon[],
  classifications: Classification[],
  pageScale: ScaleCalibration | null
): { rows: ExportRow[]; totalCount: number; totalValue: number; unit: string } {
  const ppu = pageScale?.pixelsPerUnit && pageScale.pixelsPerUnit > 0 ? pageScale.pixelsPerUnit : 1;
  const baseUnit = pageScale?.unit ?? 'px';
  const sectionUnit = unitForType(type, baseUnit);

  const classTotals = new Map<string, { count: number; totalValue: number }>();

  for (const poly of pagePolygons) {
    const cls = classifications.find((c) => c.id === poly.classificationId);
    if (!cls || cls.type !== type) continue;

    const current = classTotals.get(cls.id) ?? { count: 0, totalValue: 0 };
    current.count += 1;

    if (type === 'area') {
      current.totalValue += poly.area / (ppu * ppu);
    } else if (type === 'linear') {
      current.totalValue += calculateLinearFeet(poly.points, ppu, false);
    } else {
      current.totalValue += 1;
    }
    classTotals.set(cls.id, current);
  }

  const rows: ExportRow[] = [];
  for (const cls of classifications) {
    if (cls.type !== type) continue;
    const totals = classTotals.get(cls.id);
    if (!totals) continue;
    rows.push([cls.name, cls.type.toUpperCase(), totals.count, round2(totals.totalValue), sectionUnit]);
  }

  const totalCount = rows.reduce((sum, r) => sum + r[2], 0);
  const totalValue = round2(rows.reduce((sum, r) => sum + r[3], 0));

  return { rows, totalCount, totalValue, unit: sectionUnit };
}

function buildPageSheet(
  pageNumber: number,
  pagePolygons: Polygon[],
  classifications: Classification[],
  pageScale: ScaleCalibration | null
): XLSX.WorkSheet {
  const aoa: Array<Array<string | number>> = [];

  aoa.push([`Page ${pageNumber}`]);
  aoa.push([]);

  for (const sectionType of SECTION_ORDER) {
    const section = toSectionRows(sectionType, pagePolygons, classifications, pageScale);
    aoa.push([titleForType(sectionType)]);
    aoa.push(['Name', 'Type', 'Count', 'Total Value', 'Unit']);

    if (section.rows.length === 0) {
      aoa.push([`No ${sectionType} items`, '', 0, 0, unitForType(sectionType, pageScale?.unit ?? 'px')]);
    } else {
      for (const row of section.rows) aoa.push(row);
    }

    aoa.push(['TOTAL', sectionType.toUpperCase(), section.totalCount, section.totalValue, section.unit]);
    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
  ];
  return ws;
}

function buildSummarySheet(
  classifications: Classification[],
  polygons: Polygon[],
  scale: ScaleCalibration | null,
  scales?: Record<number, ScaleCalibration>
): XLSX.WorkSheet {
  const headers = ['Name', 'Type', 'Area', 'Length', 'Count', 'Unit'];
  const aoa: Array<Array<string | number>> = [headers];

  for (const cls of classifications) {
    const clsPolygons = polygons.filter((p) => p.classificationId === cls.id);
    if (clsPolygons.length === 0) continue;

    let totalArea = 0;
    let totalLinear = 0;
    let totalCount = 0;

    for (const poly of clsPolygons) {
      const pageScale = pickScaleForPage(poly.pageNumber ?? 1, scales, scale);
      const ppu = pageScale?.pixelsPerUnit && pageScale.pixelsPerUnit > 0 ? pageScale.pixelsPerUnit : 1;

      if (cls.type === 'area') {
        totalArea += poly.area / (ppu * ppu);
      } else if (cls.type === 'linear') {
        totalLinear += calculateLinearFeet(poly.points, ppu, false);
      } else {
        totalCount += 1;
      }
    }

    // BUG-A5-6-177 fix: detect mixed scale units across pages.
    // If all polygons share the same scale unit, use it directly.
    // If units are mixed, label as 'mixed-units' to flag the inconsistency
    // instead of silently showing incorrect units from the first polygon only.
    const pageUnits = new Set(
      clsPolygons.map((poly) => {
        const ps = pickScaleForPage(poly.pageNumber ?? 1, scales, scale);
        return ps?.unit ?? 'px';
      })
    );
    const baseUnit = pageUnits.size === 1 ? (pageUnits.values().next().value as string) : 'mixed-units';
    const unit = cls.type === 'area'
      ? (baseUnit === 'mixed-units' ? 'mixed-units' : `sq ${baseUnit}`)
      : cls.type === 'linear' ? baseUnit : 'ea';

    aoa.push([
      cls.name,
      cls.type.toUpperCase(),
      round2(totalArea),
      round2(totalLinear),
      totalCount,
      unit,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
  ];
  return ws;
}

export function exportToExcel(
  classifications: Classification[],
  polygons: Polygon[],
  scale: ScaleCalibration | null,
  scales?: Record<number, ScaleCalibration>
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const pageNumbers = pageNumbersFromPolygons(polygons);
  if (pageNumbers.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['No takeoff data available']]);
    ws['!cols'] = [{ wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    return wb;
  }

  // Summary sheet with all classifications (Name, Type, Area, Length, Count, Unit)
  const summaryWs = buildSummarySheet(classifications, polygons, scale, scales);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  for (const pageNumber of pageNumbers) {
    const pagePolygons = polygons.filter((p) => (p.pageNumber ?? 1) === pageNumber);
    const pageScale = pickScaleForPage(pageNumber, scales, scale);
    const ws = buildPageSheet(pageNumber, pagePolygons, classifications, pageScale);
    XLSX.utils.book_append_sheet(wb, ws, `Page ${pageNumber}`.slice(0, 31));
  }

  return wb;
}

export function downloadExcel(
  classifications: Classification[],
  polygons: Polygon[],
  scale: ScaleCalibration | null,
  scales?: Record<number, ScaleCalibration>,
  filename = 'measurex-takeoff.xlsx'
) {
  const wb = exportToExcel(classifications, polygons, scale, scales);
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
