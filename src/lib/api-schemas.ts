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
  // BUG-A5-5-041: min(2) here because linear/count types need only 2 points;
  // sanitize.ts validatePoints() enforces min(3) for closed area polygons at the boundary layer
  points: z.array(PointSchema).min(2, 'Must have at least 2 points'),
  pageNumber: z.number().int().positive().optional(),
  label: z.string().optional(),
  area: z.number().nonnegative().optional(),
  linearFeet: z.number().nonnegative().optional(),
  isComplete: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  detectedByModel: z.string().optional(),
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
    quantity: z.number().positive().finite(),
    unit: z.string(),
  })).optional(),
});

export const AssemblyUpdateSchema = AssemblyCreateSchema.partial();

// Polygon update (partial)
export const PolygonUpdateSchema = z.object({
  points: z.array(PointSchema).min(2).optional(),
  classificationId: z.string().uuid().optional(),
  pageNumber: z.number().int().positive().optional(),
  label: z.string().optional(),
  area: z.number().optional(),
  linearFeet: z.number().optional(),
  isComplete: z.boolean().optional(),
});

// Project PUT body (autosave from client)
export const ProjectPutSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  state: z.object({
    scale: z.object({
      pixelsPerUnit: z.number().positive(),
      unit: z.string(),
      label: z.string().optional(),
      source: z.string().optional(),
      pageNumber: z.number().int().positive().optional(),
      confidence: z.number().optional(),
    }).nullable().optional(),
    totalPages: z.number().int().positive().optional(),
  }).optional(),
});

// Assembly body for PUT updates
export const AssemblyPutSchema = z.object({
  classificationId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  unit: z.string().optional(),
  unitCost: z.number().optional(),
  quantityFormula: z.string().optional(),
});

// Chat
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

const QuantityEntrySchema = z.object({
  name: z.string(),
  type: z.enum(['area', 'linear', 'count']),
  value: z.number(),
  unit: z.string(),
  count: z.number().optional(),
});

export const ChatBodySchema = z.object({
  message: z.string().min(1).optional(),
  messages: z.array(ChatMessageSchema).min(1).optional(),
  context: z.object({
    classificationCount: z.number().optional(),
    totalArea: z.number().optional(),
    unit: z.string().optional(),
    classifications: z.array(z.string()).optional(),
    quantities: z.array(QuantityEntrySchema).optional(),
    polygonCount: z.number().optional(),
    currentPage: z.number().optional(),
    totalPages: z.number().optional(),
    pageBreakdown: z.record(z.string(), z.array(z.object({
      classificationId: z.string(),
      name: z.string(),
      count: z.number(),
    }))).optional(),
  }).optional(),
}).refine(
  (d) => d.message !== undefined || d.messages !== undefined,
  { message: 'Either message or messages is required' },
);

// Drawings placeholder
export const DrawingBodySchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().optional(),
}).passthrough();

// AI Takeoff body
export const AiTakeoffBodySchema = z.object({
  imageBase64: z.string().min(1).optional(),
  pageWidth: z.number().positive().optional(),
  pageHeight: z.number().positive().optional(),
  projectId: z.string().uuid().optional(),
  pageNumber: z.number().int().positive().optional(),
  model: z.string().optional(),
}).refine(
  (data) => data.imageBase64 || (data.projectId && data.pageNumber),
  { message: 'Either imageBase64 or both projectId and pageNumber must be provided' },
);

// AI Takeoff options
export const AiTakeoffOptionsSchema = z.object({
  pageNumber: z.number().int().positive().optional(),
  classificationTypes: z.array(z.enum(['area', 'linear', 'count'])).optional(),
  confidence: z.number().min(0).max(1).optional(),
}).optional();

// Snapshot
export const SnapshotIdSchema = z.object({ id: z.string().uuid(), sid: z.string().uuid() });
export const SnapshotCreateSchema = z.object({
  description: z.string().max(500).optional().default('Manual snapshot'),
});

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
    { status: 400 }
  );
}
