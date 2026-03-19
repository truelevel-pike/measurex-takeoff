/**
 * MeasureX API Integration Tests
 *
 * Requires a running Next.js dev server.
 * Set BASE_URL env var to override the default http://localhost:3000.
 *
 * Run: npm run test:integration
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let projectId: string;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.json();
  return { status: res.status, body };
}

describe('MeasureX API Integration', () => {
  // ── Projects ────────────────────────────────────────────────

  it('POST /api/projects → creates a project', async () => {
    const { status, body } = await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Integration Test Project' }),
    });

    expect(status).toBe(200);
    expect(body.project).toBeDefined();
    expect(body.project.id).toBeDefined();
    expect(body.project.name).toBe('Integration Test Project');

    projectId = body.project.id;
  });

  it('GET /api/projects → returns the created project', async () => {
    expect(projectId).toBeDefined();

    const { status, body } = await api('/api/projects');

    expect(status).toBe(200);
    expect(body.projects).toBeInstanceOf(Array);

    const found = body.projects.find(
      (p: { id: string }) => p.id === projectId,
    );
    expect(found).toBeDefined();
    expect(found.name).toBe('Integration Test Project');
  });

  // ── Classifications ─────────────────────────────────────────

  it('POST /api/projects/:id/classifications → creates a classification', async () => {
    expect(projectId).toBeDefined();

    const { status, body } = await api(
      `/api/projects/${projectId}/classifications`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Concrete Slab',
          type: 'area',
          color: '#ef4444',
        }),
      },
    );

    expect(status).toBe(200);
    expect(body.classification).toBeDefined();
    expect(body.classification.name).toBe('Concrete Slab');
    expect(body.classification.type).toBe('area');
  });

  // ── Quantities ──────────────────────────────────────────────

  it('GET /api/projects/:id/quantities → returns quantity data', async () => {
    expect(projectId).toBeDefined();

    const { status, body } = await api(
      `/api/projects/${projectId}/quantities`,
    );

    expect(status).toBe(200);
    expect(body.quantities).toBeInstanceOf(Array);
    expect(body.quantities.length).toBeGreaterThanOrEqual(1);

    const concrete = body.quantities.find(
      (q: { name: string }) => q.name === 'Concrete Slab',
    );
    expect(concrete).toBeDefined();
    expect(concrete.type).toBe('area');
    expect(concrete.unit).toBe('SF');
  });

  // ── Cleanup ─────────────────────────────────────────────────

  it('DELETE /api/projects/:id → removes the project', async () => {
    expect(projectId).toBeDefined();

    const { status, body } = await api(`/api/projects/${projectId}`, {
      method: 'DELETE',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    // Verify it's gone
    const { body: listBody } = await api('/api/projects');
    const found = listBody.projects.find(
      (p: { id: string }) => p.id === projectId,
    );
    expect(found).toBeUndefined();
  });
});
