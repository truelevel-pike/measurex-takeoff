import { ZodSchema, ZodError } from 'zod';
import { NextResponse } from 'next/server';

export function validateBody<T>(
  schema: ZodSchema<T>,
  data: unknown,
): { data: T } | { error: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      error: NextResponse.json(
        {
          error: 'Validation failed',
          issues: result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 },
      ),
    };
  }
  return { data: result.data };
}
