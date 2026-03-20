import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAssemblies, createAssembly, initDataDir } from '@/server/project-store';
import { broadcastToProject } from '@/lib/sse-broadcast';
import { ProjectIdSchema, validationError } from '@/lib/api-schemas';
import { rateLimitResponse } from '@/lib/rate-limit';

// BUG-A5-6-105: remove .passthrough() so only validated fields are used
const AssemblyBodySchema = z.object({
  classificationId: z.string().uuid().optional(),
  name: z.string().min(1),
  unit: z.string().optional(),
  unitCost: z.number().optional(),
  quantityFormula: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const assemblies = await getAssemblies(id);
    return NextResponse.json({ assemblies });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // BUG-A5-6-104: add rate limiting to POST handler
  const limited = rateLimitResponse(req);
  if (limited) return limited;
  try {
    await initDataDir();
    const paramsResult = ProjectIdSchema.safeParse(await params);
    if (!paramsResult.success) return validationError(paramsResult.error);
    const { id } = paramsResult.data;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const bodyResult = AssemblyBodySchema.safeParse(body);
    if (!bodyResult.success) return validationError(bodyResult.error);
    // BUG-A5-5-027: destructure from validated bodyResult.data, not raw body
    const { classificationId, name, unit, unitCost, quantityFormula } = bodyResult.data;
    const assembly = await createAssembly(id, {
      // classificationId is optional — omit it when not provided so the DB
      // insert does not attempt to reference a non-existent FK column.
      ...(classificationId ? { classificationId } : {}),
      name,
      unit: unit || 'SF',
      unitCost: unitCost ?? 0,
      quantityFormula: quantityFormula || 'area',
    });
    broadcastToProject(id, 'assembly:created', assembly);
    return NextResponse.json({ assembly }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
