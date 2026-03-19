/**
 * @jest-environment node
 */

import { randomUUID } from 'node:crypto';
import { POST as createProjectRoute } from '@/app/api/projects/route';
import {
  GET as getProjectRoute,
  PUT as updateProjectRoute,
  DELETE as deleteProjectRoute,
} from '@/app/api/projects/[id]/route';
import {
  GET as listClassificationsRoute,
  POST as createClassificationRoute,
} from '@/app/api/projects/[id]/classifications/route';
import {
  PATCH as updateClassificationRoute,
  DELETE as deleteClassificationRoute,
} from '@/app/api/projects/[id]/classifications/[cid]/route';
import {
  GET as listPolygonsRoute,
  POST as createPolygonRoute,
} from '@/app/api/projects/[id]/polygons/route';
import {
  PUT as updatePolygonRoute,
  DELETE as deletePolygonRoute,
} from '@/app/api/projects/[id]/polygons/[pid]/route';

jest.mock('@/lib/polygon-utils', () => ({
  calculatePolygonArea: jest.fn(() => 10000),
  calculateLinearFeet: jest.fn(() => 400),
}));

jest.mock('@/lib/sse-broadcast', () => ({
  broadcastToProject: jest.fn(),
}));

describe('API integration: project/classification/polygon CRUD', () => {
  const createdProjectIds = new Set<string>();
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeAll(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterAll(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }

    if (originalSupabaseKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseKey;
    }
  });

  afterEach(async () => {
    for (const projectId of createdProjectIds) {
      await deleteProjectRoute(new Request('http://localhost/api/projects/' + projectId, { method: 'DELETE' }), {
        params: Promise.resolve({ id: projectId }),
      });
    }
    createdProjectIds.clear();
  });

  async function createProject(name: string) {
    const res = await createProjectRoute(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
      {} as Record<string, never>,
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    const projectId = json.project?.id as string;

    expect(projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    createdProjectIds.add(projectId);
    return { projectId, project: json.project };
  }

  it('Project CRUD: create, get, update name, delete', async () => {
    const { projectId } = await createProject('Project CRUD Integration');

    const getRes = await getProjectRoute(new Request('http://localhost/api/projects/' + projectId), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.project.id).toBe(projectId);
    expect(getJson.project.name).toBe('Project CRUD Integration');

    const updateRes = await updateProjectRoute(
      new Request('http://localhost/api/projects/' + projectId, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Project CRUD Updated' }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(updateRes.status).toBe(200);
    const updateJson = await updateRes.json();
    expect(updateJson.project.name).toBe('Project CRUD Updated');

    const deleteRes = await deleteProjectRoute(new Request('http://localhost/api/projects/' + projectId, { method: 'DELETE' }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(deleteRes.status).toBe(200);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.ok).toBe(true);

    createdProjectIds.delete(projectId);

    const getAfterDeleteRes = await getProjectRoute(new Request('http://localhost/api/projects/' + projectId), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(getAfterDeleteRes.status).toBe(404);
  });

  it('Classification CRUD: create on project, list, update, delete', async () => {
    const { projectId } = await createProject('Classification CRUD Integration');
    const classificationId = randomUUID();

    const createRes = await createClassificationRoute(
      new Request('http://localhost/api/projects/' + projectId + '/classifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: classificationId,
          name: 'Flooring',
          type: 'area',
          color: '#3b82f6',
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(createRes.status).toBe(200);
    const createJson = await createRes.json();
    expect(createJson.classification.id).toBe(classificationId);
    expect(createJson.classification.name).toBe('Flooring');

    const listRes = await listClassificationsRoute(
      new Request('http://localhost/api/projects/' + projectId + '/classifications'),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(Array.isArray(listJson.classifications)).toBe(true);
    expect(listJson.classifications.some((c: { id: string }) => c.id === classificationId)).toBe(true);

    const updateRes = await updateClassificationRoute(
      new Request('http://localhost/api/projects/' + projectId + '/classifications/' + classificationId, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Flooring Updated', color: '#22c55e' }),
      }),
      { params: Promise.resolve({ id: projectId, cid: classificationId }) },
    );
    expect(updateRes.status).toBe(200);
    const updateJson = await updateRes.json();
    expect(updateJson.classification.name).toBe('Flooring Updated');
    expect(updateJson.classification.color).toBe('#22c55e');

    const deleteRes = await deleteClassificationRoute(
      new Request('http://localhost/api/projects/' + projectId + '/classifications/' + classificationId, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: projectId, cid: classificationId }) },
    );
    expect(deleteRes.status).toBe(200);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.ok).toBe(true);

    const listAfterDeleteRes = await listClassificationsRoute(
      new Request('http://localhost/api/projects/' + projectId + '/classifications'),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(listAfterDeleteRes.status).toBe(200);
    const listAfterDeleteJson = await listAfterDeleteRes.json();
    expect(
      listAfterDeleteJson.classifications.some((c: { id: string }) => c.id === classificationId),
    ).toBe(false);
  });

  it('Polygon CRUD: create on project/classification, get(list), update, delete', async () => {
    const { projectId } = await createProject('Polygon CRUD Integration');
    const classificationId = randomUUID();
    const polygonId = randomUUID();

    const classificationRes = await createClassificationRoute(
      new Request('http://localhost/api/projects/' + projectId + '/classifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: classificationId,
          name: 'Concrete',
          type: 'area',
          color: '#f97316',
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(classificationRes.status).toBe(200);
    const classificationJson = await classificationRes.json();
    expect(classificationJson.classification.id).toBe(classificationId);

    const createPolygonRes = await createPolygonRoute(
      new Request('http://localhost/api/projects/' + projectId + '/polygons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: polygonId,
          classificationId,
          pageNumber: 1,
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(createPolygonRes.status).toBe(200);
    const createPolygonJson = await createPolygonRes.json();
    expect(createPolygonJson.polygon.id).toBe(polygonId);
    expect(createPolygonJson.polygon.classificationId).toBe(classificationId);
    expect(createPolygonJson.polygon.area).toBeGreaterThan(0);

    const listPolygonsRes = await listPolygonsRoute(
      new Request('http://localhost/api/projects/' + projectId + '/polygons'),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(listPolygonsRes.status).toBe(200);
    const listPolygonsJson = await listPolygonsRes.json();
    expect(Array.isArray(listPolygonsJson.polygons)).toBe(true);
    expect(listPolygonsJson.polygons.some((p: { id: string }) => p.id === polygonId)).toBe(true);

    const updatePolygonRes = await updatePolygonRoute(
      new Request('http://localhost/api/projects/' + projectId + '/polygons/' + polygonId, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: 'Main slab',
          points: [
            { x: 0, y: 0 },
            { x: 120, y: 0 },
            { x: 120, y: 120 },
            { x: 0, y: 120 },
          ],
        }),
      }),
      { params: Promise.resolve({ id: projectId, pid: polygonId }) },
    );
    expect(updatePolygonRes.status).toBe(200);
    const updatePolygonJson = await updatePolygonRes.json();
    expect(updatePolygonJson.polygon.label).toBe('Main slab');
    expect(updatePolygonJson.polygon.points).toHaveLength(4);

    const deletePolygonRes = await deletePolygonRoute(
      new Request('http://localhost/api/projects/' + projectId + '/polygons/' + polygonId, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: projectId, pid: polygonId }) },
    );
    expect(deletePolygonRes.status).toBe(200);
    const deletePolygonJson = await deletePolygonRes.json();
    expect(deletePolygonJson.ok).toBe(true);

    const listAfterDeleteRes = await listPolygonsRoute(
      new Request('http://localhost/api/projects/' + projectId + '/polygons'),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(listAfterDeleteRes.status).toBe(200);
    const listAfterDeleteJson = await listAfterDeleteRes.json();
    expect(listAfterDeleteJson.polygons.some((p: { id: string }) => p.id === polygonId)).toBe(false);
  });
});
