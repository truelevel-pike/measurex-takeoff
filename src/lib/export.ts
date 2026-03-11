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
