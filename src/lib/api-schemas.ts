import { z } from 'zod';

// Shared primitives
export const ProjectIdSchema = z.object({ id: z.string().uuid() });
export const ClassificationIdSchema = z.object({ id: z.string().uuid(), cid: z.string().uuid() });
export const PolygonIdSchema = z.object({ id: z.string().uuid(), pid: z.string().uuid() });
export const AssemblyIdSchema = z.object({ id: z.string().uuid(), aid: z.string().uuid() });

// Point
export const PointSchema = z.object({ x: z.number(), y: z.number() });

// Polygon
export const PolygonSchema = z.object({
  id: z.string().uuid().optional(),
  classificationId: z.string().uuid(),
  points: z.array(PointSchema).min(3),
  pageNumber: z.number().int().positive().optional(),
  label: z.string().optional(),
});

// Classification
export const ClassificationCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['area', 'linear', 'count']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  visible: z.boolean().optional(),
});

export const ClassificationUpdateSchema = ClassificationCreateSchema.partial();

// Project
export const ProjectCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const ProjectUpdateSchema = ProjectCreateSchema.partial();

// Scale
export const ScaleSchema = z.object({
  pixelsPerUnit: z.number().positive(),
  unit: z.enum(['ft', 'in', 'm', 'cm', 'mm']),
  pageNumber: z.number().int().positive().optional(),
  scaleType: z.enum(['architectural', 'civil', 'ratio', 'custom']).optional(),
  scaleValue: z.string().optional(),
});

// Assembly
export const AssemblyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  items: z.array(z.object({
    classificationId: z.string().uuid(),
    quantity: z.number(),
    unit: z.string(),
  })).optional(),
});

export const AssemblyUpdateSchema = AssemblyCreateSchema.partial();

// AI Takeoff options
export const AiTakeoffOptionsSchema = z.object({
  pageNumber: z.number().int().positive().optional(),
  classificationTypes: z.array(z.enum(['area', 'linear', 'count'])).optional(),
  confidence: z.number().min(0).max(1).optional(),
}).optional();

// Helper: parse route params
export function parseParams<T extends z.ZodTypeAny>(
  schema: T,
  params: Record<string, string>
): z.infer<T> | null {
  const result = schema.safeParse(params);
  if (!result.success) return null;
  return result.data;
}

// Helper: standard validation error response
export function validationError(errors: z.ZodError) {
  return Response.json(
    { error: 'Validation failed', details: errors.flatten() },
    { status: 422 }
  );
}
