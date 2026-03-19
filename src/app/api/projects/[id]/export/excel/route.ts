import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getPolygons, getClassifications, getScale, getProject, getAssemblies, initDataDir } from '@/server/project-store';
import { calculatePolygonArea, calculateLinearLength } from '@/server/geometry-engine';
import type { Classification, Polygon } from '@/lib/types';
import type { ScaleConfig } from '@/server/geometry-engine';

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
  classificationId: string;
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
      classificationId: c.id,
      name: c.name,
      type: c.type,
      quantity: round2(quantity),
      unit: unitLabel(c.type),
    };
  });
}

function currency(n: number): string {
  return `$${round2(n).toFixed(2)}`;
}

function buildSummarySheet(projectName: string, totalCostEstimate: number): XLSX.WorkSheet {
  const aoa: Array<Array<string | number>> = [
    ['Project Name', projectName],
    ['Date', new Date().toISOString()],
    ['Total Cost Estimate', currency(totalCostEstimate)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 24 }, { wch: 40 }];
  return ws;
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

type QuantityFormula = 'area' | 'linear' | 'count';

function normalizeFormula(formula: string): QuantityFormula | null {
  const value = formula.trim().toLowerCase();
  if (value === 'area' || value === 'linear' || value === 'count') return value;
  return null;
}

function quantityForAssembly(
  formula: string,
  row: QuantityRow | undefined,
): number {
  if (!row) return 0;
  const normalized = normalizeFormula(formula);
  if (!normalized) return row.quantity;
  if (normalized === row.type) return row.quantity;
  return 0;
}

function buildAssembliesSheet(
  assemblies: Array<{
    assemblyName: string;
    classificationName: string;
    unit: string;
    unitCost: number;
    formula: string;
    totalCost: number;
  }>,
): XLSX.WorkSheet {
  const aoa: Array<Array<string | number>> = [
    ['Assembly Name', 'Classification', 'Unit', 'Unit Cost', 'Formula', 'Total Cost'],
    ...assemblies.map((row) => [
      row.assemblyName,
      row.classificationName,
      row.unit,
      round2(row.unitCost),
      row.formula,
      round2(row.totalCost),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  return ws;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const { id } = await params;

    const [project, polygons, classifications, assemblies, scale] = await Promise.all([
      getProject(id),
      getPolygons(id),
      getClassifications(id),
      getAssemblies(id),
      getScale(id),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const ppu = scale?.pixelsPerUnit ?? null;
    const unit = (scale?.unit === 'm' || scale?.unit === 'mm') ? 'metric' as const : 'imperial' as const;
    const scaleConfig: ScaleConfig = { pixelsPerFoot: ppu, unit };
    const projectName = project.name || id;
    const rows = buildQuantityRows(classifications, polygons, scaleConfig);
    const quantityByClassificationId = new Map(rows.map((row) => [row.classificationId, row]));

    const assemblyRows = assemblies.map((assembly) => {
      const classification = classifications.find((c) => c.id === assembly.classificationId);
      const quantityRow = quantityByClassificationId.get(assembly.classificationId);
      const quantity = quantityForAssembly(assembly.quantityFormula, quantityRow);
      const totalCost = round2(quantity * assembly.unitCost);
      return {
        assemblyName: assembly.name,
        classificationName: classification?.name ?? 'Unknown',
        unit: assembly.unit,
        unitCost: assembly.unitCost,
        formula: assembly.quantityFormula,
        totalCost,
      };
    });
    const totalCostEstimate = round2(assemblyRows.reduce((sum, row) => sum + row.totalCost, 0));

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summarySheet = buildSummarySheet(projectName, totalCostEstimate);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // Sheet 2: Quantities
    const quantitiesSheet = buildQuantitiesSheet(rows);
    XLSX.utils.book_append_sheet(wb, quantitiesSheet, 'Quantities');

    // Sheet 3: Assemblies
    const assembliesSheet = buildAssembliesSheet(assemblyRows);
    XLSX.utils.book_append_sheet(wb, assembliesSheet, 'Assemblies');

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
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
