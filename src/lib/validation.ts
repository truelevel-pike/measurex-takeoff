import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared Zod schemas for MeasureX API validation
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid();

export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color like #ff0000');

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

// Project
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  totalPages: z.number().int().positive().optional(),
});

// Classification
export const createClassificationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  color: colorSchema,
  formulaType: z.enum(['area', 'linear', 'count']).optional(),
  unit: z.string().max(20).optional(),
  visible: z.boolean().optional(),
});

export const updateClassificationSchema = createClassificationSchema.partial();

// Polygon
export const createPolygonSchema = z.object({
  points: z.array(pointSchema).min(2, 'Polygon must have at least 2 points'),
  classificationId: uuidSchema,
  pageNumber: z.number().int().positive(),
  area: z.number().nonnegative().optional(),
  label: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  type: z.enum(['area', 'linear', 'count']).optional(),
});

export const updatePolygonSchema = createPolygonSchema.partial();

// Compare
export const compareProjectsSchema = z.object({
  projectIdA: uuidSchema,
  projectIdB: uuidSchema,
});

// Assembly
export const createAssemblySchema = z.object({
  name: z.string().min(1).max(100),
  classificationId: uuidSchema.optional(),
  items: z.array(z.object({
    label: z.string().min(1),
    quantity: z.number().nonnegative(),
    unit: z.string().max(20),
    unitCost: z.number().nonnegative().optional(),
  })).optional(),
});

// ---------------------------------------------------------------------------
// Helper: parse or throw 400-ready error
// ---------------------------------------------------------------------------
export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: Response } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const { NextResponse } = require('next/server');
    return {
      success: false,
      error: NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}
