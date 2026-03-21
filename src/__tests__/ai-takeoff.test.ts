/**
 * @jest-environment node
 */

import { POST as aiTakeoffRoute } from '@/app/api/ai-takeoff/route';

jest.mock('@/lib/rate-limit', () => ({
  rateLimitResponse: jest.fn(() => null),
}));

jest.mock('@/lib/sse-broadcast', () => ({
  broadcastToProject: jest.fn(),
}));

jest.mock('@/lib/polygon-utils', () => ({
  calculatePolygonArea: jest.fn(() => 10000),
  calculateLinearFeet: jest.fn(() => 400),
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/ai-takeoff', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('AI Takeoff route tests', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalPublicApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalPublicApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_OPENAI_API_KEY = originalPublicApiKey;
    }
    jest.clearAllMocks();
  });

  it('returns 503 when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.NEXT_PUBLIC_OPENAI_API_KEY;

    const res = await aiTakeoffRoute(
      makeRequest({
        imageBase64: 'data:image/png;base64,abc',
        pageWidth: 800,
        pageHeight: 600,
      }),
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
  });

  it('returns 400 when imageBase64 is missing', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const req = makeRequest({ pageWidth: 100, pageHeight: 100 }); // no imageBase64, no projectId
    const res = await aiTakeoffRoute(req);

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('Validation failed');
    // issues array should mention imageBase64 or the refine message
    expect(body.issues).toBeDefined();
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('returns 400 when pageWidth/pageHeight are invalid', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    // pageWidth/pageHeight are optional in the schema but must be positive when provided
    const req = makeRequest({ imageBase64: 'data:image/png;base64,abc', pageWidth: 0, pageHeight: 0 });
    const res = await aiTakeoffRoute(req);

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('Validation failed');
  });

  it('creates classifications and polygons from AI-detected elements', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const projectId = '22222222-2222-4222-8222-222222222222';
    const polygonPosts: Array<Record<string, unknown>> = [];
    const classificationPosts: Array<Record<string, unknown>> = [];

    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === 'https://api.openai.com/v1/chat/completions') {
        return jsonResponse({
          choices: [{
            message: {
              content: JSON.stringify([
                {
                  name: 'Living Room',
                  type: 'area',
                  classification: 'Rooms',
                  points: [
                    { x: 0.1, y: 0.1 },
                    { x: 0.5, y: 0.1 },
                    { x: 0.5, y: 0.5 },
                    { x: 0.1, y: 0.5 },
                  ],
                  color: '#ff0000',
                },
                {
                  name: 'Door',
                  type: 'count',
                  classification: 'Doors',
                  quantity: 1,
                  points: [{ x: 0.3, y: 0.3 }],
                  color: '#00ff00',
                },
              ]),
            },
          }],
        });
      }

      if (url.endsWith(`/api/projects/${projectId}/classifications`) && method === 'GET') {
        return jsonResponse({ classifications: [] });
      }

      if (url.endsWith(`/api/projects/${projectId}/classifications`) && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}'));
        classificationPosts.push(body as Record<string, unknown>);
        return jsonResponse({
          classification: { id: body.id, name: body.name, type: body.type, color: body.color, visible: true },
        });
      }

      if (url.endsWith(`/api/projects/${projectId}/polygons`) && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}'));
        polygonPosts.push(body as Record<string, unknown>);
        return jsonResponse({ polygon: body });
      }

      return new Response('unexpected fetch', { status: 500 });
    });

    global.fetch = fetchMock as typeof fetch;

    const res = await aiTakeoffRoute(
      makeRequest({
        projectId,
        pageNumber: 1,
        imageBase64: 'data:image/png;base64,abc',
        pageWidth: 1000,
        pageHeight: 800,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.persistedPolygons).toBe(2);

    // 2 distinct classifications created
    expect(classificationPosts).toHaveLength(2);
    expect(classificationPosts.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Rooms', 'Doors']),
    );

    // 2 polygons persisted
    expect(polygonPosts).toHaveLength(2);
  });

  it('denormalizes points from 0-1 range to pixel coordinates', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const projectId = '33333333-3333-4333-8333-333333333333';
    const polygonPosts: Array<Record<string, unknown>> = [];

    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === 'https://api.openai.com/v1/chat/completions') {
        return jsonResponse({
          choices: [{
            message: {
              content: JSON.stringify([
                {
                  name: 'Slab',
                  type: 'area',
                  classification: 'Foundation',
                  points: [
                    { x: 0.0, y: 0.0 },
                    { x: 1.0, y: 0.0 },
                    { x: 1.0, y: 1.0 },
                  ],
                  color: '#aabbcc',
                },
              ]),
            },
          }],
        });
      }

      if (url.endsWith('/classifications') && method === 'GET') {
        return jsonResponse({ classifications: [] });
      }

      if (url.endsWith('/classifications') && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}'));
        return jsonResponse({
          classification: { id: body.id, name: body.name, type: body.type, color: body.color, visible: true },
        });
      }

      if (url.endsWith('/polygons') && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}'));
        polygonPosts.push(body as Record<string, unknown>);
        return jsonResponse({ polygon: body });
      }

      return new Response('unexpected', { status: 500 });
    });

    global.fetch = fetchMock as typeof fetch;

    const pageWidth = 2000;
    const pageHeight = 1000;

    const res = await aiTakeoffRoute(
      makeRequest({
        projectId,
        imageBase64: 'data:image/png;base64,abc',
        pageWidth,
        pageHeight,
      }),
    );

    expect(res.status).toBe(200);
    expect(polygonPosts).toHaveLength(1);

    const points = polygonPosts[0].points as Array<{ x: number; y: number }>;
    // (0,0) -> (0,0), (1,0) -> (2000,0), (1,1) -> (2000,1000)
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[1]).toEqual({ x: 2000, y: 0 });
    expect(points[2]).toEqual({ x: 2000, y: 1000 });
  });
});
