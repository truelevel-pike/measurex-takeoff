/**
 * @jest-environment node
 */

import { POST as aiTakeoffRoute } from '@/app/api/ai-takeoff/route';
import { broadcastToProject } from '@/lib/sse-broadcast';

jest.mock('@/lib/rate-limit', () => ({
  rateLimitResponse: jest.fn(() => null),
}));

jest.mock('@/lib/sse-broadcast', () => ({
  broadcastToProject: jest.fn(),
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AI takeoff integration: OpenAI -> parse -> polygons API persistence', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalGoogleKey === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = originalGoogleKey;
    }
    jest.clearAllMocks();
  });

  it('persists parsed AI polygons through project polygon API and emits progress events', async () => {
    process.env.GOOGLE_API_KEY = 'test-google-key';
    const projectId = '11111111-1111-4111-8111-111111111111';
    let batchOperations: Array<Record<string, unknown>> = [];

    const geminiElements = [
      {
        name: 'Room 101',
        type: 'area',
        classification: 'Rooms',
        points: [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { x: 300, y: 200 },
          { x: 100, y: 200 },
        ],
        color: '#22aa44',
        confidence: 0.9,
      },
      {
        name: 'Wall A',
        type: 'linear',
        classification: 'Walls',
        points: [
          { x: 500, y: 300 },
          { x: 800, y: 300 },
        ],
        color: '#aabbcc',
        confidence: 0.85,
      },
      {
        name: 'Outlet',
        type: 'count',
        classification: 'Outlets',
        points: [{ x: 900, y: 50 }],
        color: '#cc8844',
        confidence: 0.8,
      },
    ];

    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('generativelanguage.googleapis.com')) {
        return jsonResponse({
          candidates: [{ content: { parts: [{ text: JSON.stringify(geminiElements) }] } }],
        });
      }

      if (url.endsWith(`/api/projects/${projectId}/classifications`) && method === 'GET') {
        return jsonResponse({ classifications: [] });
      }

      if (url.endsWith(`/api/projects/${projectId}/classifications`) && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}'));
        return jsonResponse({
          classification: { id: body.id, name: body.name, type: body.type, color: body.color, visible: true },
        });
      }

      if (url.endsWith(`/api/projects/${projectId}/batch`) && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}'));
        batchOperations = Array.isArray(body.operations) ? body.operations : [];
        return jsonResponse({
          results: batchOperations.map(() => ({ type: 'createPolygon', ok: true, id: crypto.randomUUID() })),
        });
      }

      return new Response('unexpected fetch', { status: 500 });
    });

    global.fetch = fetchMock as typeof fetch;

    const res = await aiTakeoffRoute(
      new Request('http://localhost/api/ai-takeoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          pageNumber: 2,
          imageBase64: 'data:image/png;base64,abc123',
          pageWidth: 1000,
          pageHeight: 500,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
    // 3 elements detected (area, linear, count)
    expect(body.results).toHaveLength(3);
    expect(body.persistedPolygons).toBeGreaterThanOrEqual(1);

    // Gemini endpoint was called
    const geminiCall = fetchMock.mock.calls.find(([url]) => String(url).includes('generativelanguage.googleapis.com'));
    expect(geminiCall).toBeTruthy();

    // At least 3 classifications created (one per unique classification name)
    const classificationPosts = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).endsWith(`/api/projects/${projectId}/classifications`) &&
        (init?.method ?? 'GET') === 'POST',
    );
    expect(classificationPosts).toHaveLength(3);

    expect(broadcastToProject).toHaveBeenCalledWith(projectId, 'ai-takeoff:started', { page: 2 });
    expect(broadcastToProject).toHaveBeenCalledWith(
      projectId,
      'ai-takeoff:complete',
      expect.objectContaining({ page: 2 }),
    );
  });
});
