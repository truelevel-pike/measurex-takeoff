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

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    jest.clearAllMocks();
  });

  it('persists parsed AI polygons through project polygon API and emits progress events', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const projectId = '11111111-1111-4111-8111-111111111111';
    const polygonPosts: Array<Record<string, unknown>> = [];

    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === 'https://api.openai.com/v1/chat/completions') {
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    name: 'Room 101',
                    type: 'area',
                    classification: 'Rooms',
                    points: [
                      { x: 0.1, y: 0.2 },
                      { x: 0.3, y: 0.2 },
                      { x: 0.3, y: 0.4 },
                    ],
                    color: '#22aa44',
                  },
                  {
                    name: 'Wall A',
                    type: 'linear',
                    classification: 'Walls',
                    points: [
                      { x: 0.5, y: 0.6 },
                      { x: 0.8, y: 0.6 },
                    ],
                    color: '#aabbcc',
                  },
                  {
                    name: 'Outlet',
                    type: 'count',
                    classification: 'Outlets',
                    quantity: 2,
                    points: [{ x: 0.9, y: 0.1 }],
                    color: '#cc8844',
                  },
                ]),
              },
            },
          ],
        });
      }

      if (url.endsWith(`/api/projects/${projectId}/classifications`) && method === 'GET') {
        return jsonResponse({ classifications: [] });
      }

      if (url.endsWith(`/api/projects/${projectId}/classifications`) && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}'));
        return jsonResponse({
          classification: {
            id: body.id,
            name: body.name,
            type: body.type,
            color: body.color,
            visible: true,
          },
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
    expect(body.results).toHaveLength(4);
    expect(body.persistedPolygons).toBe(4);

    const openAiCall = fetchMock.mock.calls.find(([url]) => String(url) === 'https://api.openai.com/v1/chat/completions');
    expect(openAiCall).toBeTruthy();
    const openAiPayload = JSON.parse(String(openAiCall?.[1]?.body || '{}'));
    const userContent = openAiPayload.messages[1].content;
    const imagePart = userContent.find((part: { type: string }) => part.type === 'image_url');
    expect(imagePart.image_url.url).toBe('data:image/png;base64,abc123');

    const classificationPosts = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).endsWith(`/api/projects/${projectId}/classifications`) &&
        (init?.method ?? 'GET') === 'POST',
    );
    expect(classificationPosts).toHaveLength(3);

    expect(polygonPosts).toHaveLength(4);
    const areaPolygon = polygonPosts.find((p) => p.label === 'Room 101');
    expect(areaPolygon).toBeTruthy();
    expect((areaPolygon?.points as Array<{ x: number; y: number }>)[0]).toEqual({ x: 100, y: 100 });

    const linearPolygon = polygonPosts.find((p) => p.label === 'Wall A');
    expect(linearPolygon).toBeTruthy();
    const linearPoints = linearPolygon?.points as Array<{ x: number; y: number }>;
    expect(linearPoints).toHaveLength(3);
    expect(linearPoints[1]).toEqual(linearPoints[2]);

    expect(broadcastToProject).toHaveBeenCalledWith(projectId, 'ai-takeoff:started', { page: 2 });
    expect(broadcastToProject).toHaveBeenCalledWith(
      projectId,
      'ai-takeoff:complete',
      expect.objectContaining({ page: 2, detected: 4, persistedPolygons: 4 }),
    );
  });
});
