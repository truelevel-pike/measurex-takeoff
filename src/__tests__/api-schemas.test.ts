import {
  PolygonSchema,
  ClassificationCreateSchema,
  ClassificationUpdateSchema,
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ScaleSchema,
  AssemblyCreateSchema,
  ProjectIdSchema,
  ClassificationIdSchema,
  PolygonIdSchema,
  AssemblyIdSchema,
  PointSchema,
  parseParams,
  validationError,
} from '@/lib/api-schemas';

describe('ProjectIdSchema', () => {
  it('accepts valid UUID', () => {
    const result = ProjectIdSchema.safeParse({ id: '550e8400-e29b-41d4-a716-446655440001' });
    expect(result.success).toBe(true);
  });
  it('rejects non-UUID', () => {
    const result = ProjectIdSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
  it('rejects missing id', () => {
    const result = ProjectIdSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('ClassificationIdSchema', () => {
  it('accepts valid id + cid', () => {
    const result = ClassificationIdSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440001',
      cid: '550e8400-e29b-41d4-a716-446655440002',
    });
    expect(result.success).toBe(true);
  });
  it('rejects missing cid', () => {
    const result = ClassificationIdSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(false);
  });
});

describe('PolygonIdSchema', () => {
  it('accepts valid id + pid', () => {
    const result = PolygonIdSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440001',
      pid: '550e8400-e29b-41d4-a716-446655440002',
    });
    expect(result.success).toBe(true);
  });
});

describe('AssemblyIdSchema', () => {
  it('accepts valid id + aid', () => {
    const result = AssemblyIdSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440001',
      aid: '550e8400-e29b-41d4-a716-446655440002',
    });
    expect(result.success).toBe(true);
  });
});

describe('PointSchema', () => {
  it('accepts valid point', () => {
    const result = PointSchema.safeParse({ x: 10.5, y: 20.3 });
    expect(result.success).toBe(true);
  });
  it('rejects non-number x', () => {
    const result = PointSchema.safeParse({ x: 'hello', y: 20 });
    expect(result.success).toBe(false);
  });
});

describe('ClassificationCreateSchema', () => {
  it('accepts valid classification', () => {
    const result = ClassificationCreateSchema.safeParse({ name: 'Walls', type: 'area' });
    expect(result.success).toBe(true);
  });
  it('accepts with optional color', () => {
    const result = ClassificationCreateSchema.safeParse({ name: 'Walls', type: 'area', color: '#ff0000' });
    expect(result.success).toBe(true);
  });
  it('rejects invalid type', () => {
    const result = ClassificationCreateSchema.safeParse({ name: 'X', type: 'bad' });
    expect(result.success).toBe(false);
  });
  it('rejects empty name', () => {
    const result = ClassificationCreateSchema.safeParse({ name: '', type: 'area' });
    expect(result.success).toBe(false);
  });
  it('rejects name over 100 chars', () => {
    const result = ClassificationCreateSchema.safeParse({ name: 'a'.repeat(101), type: 'area' });
    expect(result.success).toBe(false);
  });
  it('rejects invalid color format', () => {
    const result = ClassificationCreateSchema.safeParse({ name: 'W', type: 'area', color: 'red' });
    expect(result.success).toBe(false);
  });
  it('accepts all valid types', () => {
    for (const type of ['area', 'linear', 'count']) {
      expect(ClassificationCreateSchema.safeParse({ name: 'Test', type }).success).toBe(true);
    }
  });
});

describe('ClassificationUpdateSchema', () => {
  it('accepts partial update with just name', () => {
    const result = ClassificationUpdateSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });
  it('accepts empty object', () => {
    const result = ClassificationUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('ProjectCreateSchema', () => {
  it('accepts valid project', () => {
    const result = ProjectCreateSchema.safeParse({ name: 'My Project' });
    expect(result.success).toBe(true);
  });
  it('accepts with description', () => {
    const result = ProjectCreateSchema.safeParse({ name: 'My Project', description: 'A test' });
    expect(result.success).toBe(true);
  });
  it('rejects empty name', () => {
    const result = ProjectCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
  it('rejects name over 200 chars', () => {
    const result = ProjectCreateSchema.safeParse({ name: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe('ProjectUpdateSchema', () => {
  it('accepts partial update', () => {
    const result = ProjectUpdateSchema.safeParse({ name: 'Renamed' });
    expect(result.success).toBe(true);
  });
  it('accepts empty object', () => {
    const result = ProjectUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('PolygonSchema', () => {
  it('rejects polygon with < 3 points', () => {
    const result = PolygonSchema.safeParse({
      classificationId: '550e8400-e29b-41d4-a716-446655440001',
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    });
    expect(result.success).toBe(false);
  });
  it('accepts valid polygon', () => {
    const result = PolygonSchema.safeParse({
      classificationId: '550e8400-e29b-41d4-a716-446655440001',
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    });
    expect(result.success).toBe(true);
  });
  it('accepts polygon with optional fields', () => {
    const result = PolygonSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440099',
      classificationId: '550e8400-e29b-41d4-a716-446655440001',
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      pageNumber: 2,
      label: 'Room A',
    });
    expect(result.success).toBe(true);
  });
  it('rejects non-UUID classificationId', () => {
    const result = PolygonSchema.safeParse({
      classificationId: 'not-uuid',
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('ScaleSchema', () => {
  it('accepts valid scale', () => {
    const result = ScaleSchema.safeParse({ pixelsPerUnit: 96, unit: 'ft' });
    expect(result.success).toBe(true);
  });
  it('rejects invalid unit', () => {
    const result = ScaleSchema.safeParse({ pixelsPerUnit: 96, unit: 'yard' });
    expect(result.success).toBe(false);
  });
  it('rejects zero pixelsPerUnit', () => {
    const result = ScaleSchema.safeParse({ pixelsPerUnit: 0, unit: 'ft' });
    expect(result.success).toBe(false);
  });
  it('rejects negative pixelsPerUnit', () => {
    const result = ScaleSchema.safeParse({ pixelsPerUnit: -10, unit: 'in' });
    expect(result.success).toBe(false);
  });
  it('accepts all valid units', () => {
    for (const unit of ['ft', 'in', 'm', 'cm', 'mm']) {
      expect(ScaleSchema.safeParse({ pixelsPerUnit: 1, unit }).success).toBe(true);
    }
  });
  it('accepts optional scaleType and scaleValue', () => {
    const result = ScaleSchema.safeParse({
      pixelsPerUnit: 96,
      unit: 'ft',
      scaleType: 'architectural',
      scaleValue: '1/4" = 1\'',
    });
    expect(result.success).toBe(true);
  });
});

describe('AssemblyCreateSchema', () => {
  it('accepts valid assembly', () => {
    const result = AssemblyCreateSchema.safeParse({ name: 'Drywall Assembly' });
    expect(result.success).toBe(true);
  });
  it('accepts with items', () => {
    const result = AssemblyCreateSchema.safeParse({
      name: 'Drywall Assembly',
      items: [{
        classificationId: '550e8400-e29b-41d4-a716-446655440001',
        quantity: 100,
        unit: 'SF',
      }],
    });
    expect(result.success).toBe(true);
  });
  it('rejects empty name', () => {
    const result = AssemblyCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('parseParams', () => {
  it('returns parsed data on valid input', () => {
    const result = parseParams(ProjectIdSchema, { id: '550e8400-e29b-41d4-a716-446655440001' });
    expect(result).toEqual({ id: '550e8400-e29b-41d4-a716-446655440001' });
  });
  it('returns null on invalid input', () => {
    const result = parseParams(ProjectIdSchema, { id: 'bad' });
    expect(result).toBeNull();
  });
});

describe('validationError', () => {
  it('returns a Response with status 422', () => {
    // Response.json is available in Node 18+ and in Next.js runtime
    if (typeof Response === 'undefined' || typeof Response.json !== 'function') {
      // Polyfill for Jest environment
      (globalThis as any).Response = {
        json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
      };
    }
    const result = ProjectIdSchema.safeParse({ id: 'bad' });
    if (result.success) throw new Error('Expected failure');
    const response = validationError(result.error);
    expect(response.status).toBe(422);
  });
});
