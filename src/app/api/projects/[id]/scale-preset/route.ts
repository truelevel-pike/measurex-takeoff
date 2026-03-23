import { NextResponse } from 'next/server';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';

const DPI = 72;

/** Parse fraction strings like "3/64", "1 1/2", "1", "3" */
function parseFraction(s: string): number | null {
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0) return null;
    return parseInt(mixedMatch[1], 10) + parseInt(mixedMatch[2], 10) / den;
  }
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const den = parseInt(fracMatch[2], 10);
    if (den === 0) return null;
    return parseInt(fracMatch[1], 10) / den;
  }
  const val = parseFloat(s);
  return val && Number.isFinite(val) ? val : null;
}

/**
 * Convert a preset label string to a pixelsPerUnit value at 72 DPI.
 * Supports:
 *   Architectural: "1/8" = 1' 0""  →  ppu = fraction * DPI
 *   Civil:         "1" = 20' 0""   →  ppu = DPI / feet
 *   Ratio/Metric:  "1 : 500"       →  ppu = DPI / ratio
 * Returns null for unrecognised formats.
 */
function presetToPixelsPerUnit(preset: string): { pixelsPerUnit: number; unit: 'ft' | 'm' } | null {
  // Ratio / Metric: "1 : 500"
  const ratioMatch = preset.match(/^1\s*:\s*(\d+)$/);
  if (ratioMatch) {
    const ratio = parseInt(ratioMatch[1], 10);
    if (ratio === 0) return null;
    return { pixelsPerUnit: DPI / ratio, unit: 'm' };
  }

  // Civil: 1" = X' 0"
  const civilMatch = preset.match(/^1"\s*=\s*(\d+)'\s*0?"?$/);
  if (civilMatch) {
    const feet = parseInt(civilMatch[1], 10);
    if (feet === 0) return null;
    return { pixelsPerUnit: DPI / feet, unit: 'ft' };
  }

  // Architectural: fraction" = 1' 0"
  const archMatch = preset.match(/^(.+?)"\s*=\s*1'\s*0?"?$/);
  if (archMatch) {
    const frac = parseFraction(archMatch[1].trim());
    if (frac === null || frac <= 0) return null;
    return { pixelsPerUnit: frac * DPI, unit: 'ft' };
  }

  return null;
}

/**
 * POST /api/projects/{id}/scale-preset
 * Body: { preset: string }
 * Returns: { preset, pixelsPerUnit, unit }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimitResponse(req);
  if (limited) return limited;

  try {
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);

    const body = await req.json().catch(() => null);
    if (!body || typeof body.preset !== 'string' || !body.preset.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: preset (string)' },
        { status: 400 }
      );
    }

    const preset = body.preset.trim();
    const result = presetToPixelsPerUnit(preset);

    if (!result) {
      return NextResponse.json(
        {
          error: `Unrecognised preset format: "${preset}". Supported formats: architectural (e.g. '1/4" = 1\' 0"'), civil (e.g. '1" = 20\' 0"'), ratio/metric (e.g. '1 : 100').`,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      preset,
      pixelsPerUnit: result.pixelsPerUnit,
      unit: result.unit,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
