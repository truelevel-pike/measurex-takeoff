import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { getPolygons, getClassifications, getScale, listScales, getProject, getAssemblies, initDataDir } from '@/server/project-store';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { fireWebhook } from '@/lib/webhooks';
import { rateLimitResponse } from '@/lib/rate-limit';
import { calculatePolygonArea, calculateLinearLength } from '@/server/geometry-engine';
import { applyCustomFormula } from '@/lib/formula-eval';
import type { Classification, Polygon } from '@/lib/types';
import type { ScaleConfig } from '@/server/geometry-engine';
import type { UnitCostMap } from '@/types/estimates';

const UnitCostSchema = z.object({
  classificationId: z.string(),
  classificationName: z.string(),
  unit: z.enum(['SF', 'LF', 'EA', 'CY', 'SY', 'TON', 'GAL', 'HR', 'LS']),
  costPerUnit: z.number().finite().nonnegative(),
});

const UnitCostMapSchema = z.record(z.string(), UnitCostSchema);

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
  // Wave 30B: per-page scales map so multi-page projects compute correctly.
  // Key = pageNumber (1-based), value = ScaleConfig for that page.
  pageScales?: Map<number, ScaleConfig>,
): QuantityRow[] {
  // BUG-PIKE-014 fix: build name→rawValue map for custom formula references
  const classNames = classifications.map((c) => c.name);
  const rawByName: Record<string, number> = {};

  // First pass: compute raw totals for all classifications (needed for formula cross-refs)
  const rawTotals = new Map<string, number>();
  for (const c of classifications) {
    const classPolygons = polygons.filter((p) => p.classificationId === c.id);
    let qty = 0;
    for (const p of classPolygons) {
      const sc = pageScales?.get(p.pageNumber) ?? scaleConfig;
      if (c.type === 'area') qty += calculatePolygonArea(p.points, sc) ?? 0;
      else if (c.type === 'linear') qty += calculateLinearLength(p.points, sc, true) ?? 0;
      else qty += 1;
    }
    rawTotals.set(c.id, qty);
    rawByName[c.name.toLowerCase()] = qty;
  }

  return classifications.map((c) => {
    const classPolygons = polygons.filter((p) => p.classificationId === c.id);
    let quantity = 0;

    for (const p of classPolygons) {
      // Use page-specific scale when available; fall back to project-level scale.
      const sc = (pageScales?.get(p.pageNumber)) ?? scaleConfig;
      if (c.type === 'area') {
        quantity += calculatePolygonArea(p.points, sc) ?? 0;
      } else if (c.type === 'linear') {
        quantity += calculateLinearLength(p.points, sc, true) ?? 0;
      } else {
        quantity += 1;
      }
    }

    // BUG-PIKE-014 fix: apply custom formula override when classification.formula is set
    const formulaResult = applyCustomFormula(c.formula, classNames, rawByName);
    const finalQuantity = formulaResult !== null ? formulaResult : quantity;
    const finalUnit = formulaResult !== null && c.formulaUnit ? c.formulaUnit : unitLabel(c.type);

    return {
      classificationId: c.id,
      name: c.name,
      type: c.type,
      quantity: round2(finalQuantity),
      unit: finalUnit,
    };
  });
}

function currency(n: number): string {
  return `$${round2(n).toFixed(2)}`;
}

function buildSummarySheet(projectName: string, totalCostEstimate: number): XLSX.WorkSheet {
  // BUG-A5-5-048: write totalCostEstimate as a number so Excel can format it, not a currency string
  const aoa: Array<Array<string | number>> = [
    ['Project Name', projectName],
    ['Date', new Date().toISOString()],
    ['Total Cost Estimate', round2(totalCostEstimate)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 24 }, { wch: 40 }];
  // Apply currency format to the cost cell (B3)
  if (ws['B3']) ws['B3'].z = '$#,##0.00';
  return ws;
}

function buildQuantitiesSheet(rows: QuantityRow[], classifications: Classification[]): XLSX.WorkSheet {
  // Collect all unique custom property keys across all classifications
  const allKeys = Array.from(
    new Set(
      classifications.flatMap((c) => (c.customProperties ?? []).map((p) => p.key).filter(Boolean))
    )
  );

  const header: string[] = ['Classification Name', 'Type', 'Quantity', 'Unit', ...allKeys];
  const dataRows = rows.map((row) => {
    const cls = classifications.find((c) => c.id === row.classificationId);
    const propMap = Object.fromEntries((cls?.customProperties ?? []).map((p) => [p.key, p.value]));
    return [row.name, row.type, row.quantity, row.unit, ...allKeys.map((k) => propMap[k] ?? '')] as Array<string | number>;
  });

  const aoa: Array<Array<string | number>> = [header, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, ...allKeys.map(() => ({ wch: 18 }))];
  return ws;
}

function buildCustomPropertiesSheet(classifications: Classification[]): XLSX.WorkSheet | null {
  const rows = classifications.flatMap((c) =>
    (c.customProperties ?? []).map((p) => [c.name, p.key, p.value])
  );
  if (rows.length === 0) return null;
  const aoa: Array<Array<string | number>> = [
    ['Classification', 'Property', 'Value'],
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 28 }];
  return ws;
}

type QuantityFormula = 'area' | 'linear' | 'count';

function normalizeFormula(formula: string): QuantityFormula | null {
  const value = formula.trim().toLowerCase();
  if (value === 'area') return 'area';
  if (value === 'linear' || value === 'perimeter') return 'linear';
  if (value === 'count') return 'count';
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

function buildEstimatesSheet(
  rows: QuantityRow[],
  unitCosts: UnitCostMap,
): XLSX.WorkSheet {
  const dataRows: Array<Array<string | number>> = [];
  let grandTotal = 0;

  for (const row of rows) {
    const cost = unitCosts[row.classificationId]?.costPerUnit ?? 0;
    const subtotal = round2(row.quantity * cost);
    grandTotal += subtotal;
    dataRows.push([row.name, row.quantity, row.unit, round2(cost), round2(subtotal)]);
  }

  const aoa: Array<Array<string | number>> = [
    ['Classification', 'Quantity', 'Unit', 'Unit Cost ($/unit)', 'Subtotal ($)'],
    ...dataRows,
    ['', '', '', 'GRAND TOTAL', round2(grandTotal)],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 16 }];
  return ws;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = rateLimitResponse(_req, 10, 60_000);
    if (limited) return limited;
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;

    const [project, polygons, classifications, assemblies, scale, allPageScales] = await Promise.all([
      getProject(id),
      getPolygons(id),
      getClassifications(id),
      getAssemblies(id),
      getScale(id),
      // Wave 30B: load per-page scales so multi-page exports are accurate
      listScales(id).catch(() => [] as Awaited<ReturnType<typeof listScales>>),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const ppu = scale?.pixelsPerUnit ?? 0;
    const unit = (scale?.unit === 'm' || scale?.unit === 'mm') ? 'metric' as const : 'imperial' as const;
    const scaleConfig: ScaleConfig = { pixelsPerFoot: ppu, unit };
    // Wave 30B: build per-page scale map for accurate multi-page calculations
    const pageScales = new Map<number, ScaleConfig>();
    for (const ps of allPageScales) {
      if (ps.pageNumber != null && ps.pixelsPerUnit > 0) {
        const psUnit = (ps.unit === 'm' || ps.unit === 'mm') ? 'metric' as const : 'imperial' as const;
        pageScales.set(ps.pageNumber, { pixelsPerFoot: ps.pixelsPerUnit, unit: psUnit });
      }
    }
    const projectName = project.name || id;
    const url = new URL(_req.url);
    const unitCostsParam = url.searchParams.get('unitCosts');
    let unitCosts: UnitCostMap = {};
    if (unitCostsParam) {
      try {
        const parsed: unknown = JSON.parse(Buffer.from(unitCostsParam, 'base64').toString('utf-8'));
        const validated = UnitCostMapSchema.safeParse(parsed);
        if (validated.success) {
          unitCosts = validated.data;
        }
        // Invalid schema — fall through to empty costs
      } catch {
        // Invalid base64/JSON — use empty costs
      }
    }
    const rows = buildQuantityRows(classifications, polygons, scaleConfig, pageScales.size > 0 ? pageScales : undefined);
    const quantityByClassificationId = new Map(rows.map((row) => [row.classificationId, row]));

    const assemblyRows = assemblies.map((assembly) => {
      const classification = classifications.find((c) => c.id === assembly.classificationId);
      const quantityRow = assembly.classificationId ? quantityByClassificationId.get(assembly.classificationId) : undefined;
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

    // Sheet 2: Quantities (with custom property columns inline)
    const quantitiesSheet = buildQuantitiesSheet(rows, classifications);
    XLSX.utils.book_append_sheet(wb, quantitiesSheet, 'Quantities');

    // Sheet 3: Assemblies
    const assembliesSheet = buildAssembliesSheet(assemblyRows);
    XLSX.utils.book_append_sheet(wb, assembliesSheet, 'Assemblies');

    // Sheet 4: Estimates
    const estimatesSheet = buildEstimatesSheet(rows, unitCosts);
    XLSX.utils.book_append_sheet(wb, estimatesSheet, 'Estimates');

    // Sheet 5: Custom Properties (only if any exist)
    const customPropsSheet = buildCustomPropertiesSheet(classifications);
    if (customPropsSheet) {
      XLSX.utils.book_append_sheet(wb, customPropsSheet, 'Custom Properties');
    }

    // Write to binary array — Uint8Array is a valid BodyInit in every Next.js runtime.
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const bytes = new Uint8Array(buf);
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '-');

    // Fire export.requested webhook (fire-and-forget)
    void fireWebhook(id, 'export.requested', { format: 'excel', projectName, polygons: polygons.length });

    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="measurex-${safeName}.xlsx"`,
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
