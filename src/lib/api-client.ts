import type { Classification, Polygon, ScaleCalibration } from './types';

// Re-export Project shape matching what the API actually returns
export interface Project {
  id: string;
  name: string;
  state: {
    classifications: Classification[];
    polygons: Polygon[];
    scale: ScaleCalibration | null;
    scales: Record<number, ScaleCalibration>;
    currentPage: number;
    totalPages: number;
  };
  created_at: string;
  updated_at: string;
}

export interface Quantities {
  classifications: Array<{
    id: string;
    name: string;
    type: string;
    count: number;
    totalArea: number;
    totalLinearFeet: number;
  }>;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let message = `API error: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

async function requestBlob(url: string, options?: RequestInit): Promise<Blob> {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.blob();
}

// ─── Projects ───

export async function createProject(name: string): Promise<Project> {
  const data = await request<{ project: Project }>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return data.project;
}

export async function getProject(id: string): Promise<Project> {
  const data = await request<{ project: Project }>(`/api/projects/${id}`);
  return data.project;
}

// ─── PDF Upload ───

export async function uploadPDF(
  projectId: string,
  file: File
): Promise<{ pages: number }> {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ pages: number }>(
    `/api/projects/${projectId}/upload`,
    { method: 'POST', body: formData }
  );
}

// ─── Classifications ───

export async function createClassification(
  projectId: string,
  data: Partial<Classification>
): Promise<Classification> {
  const result = await request<{ classification: Classification }>(
    `/api/projects/${projectId}/classifications`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
  return result.classification;
}

export async function updateClassification(
  projectId: string,
  id: string,
  data: Partial<Classification>
): Promise<Classification> {
  const result = await request<{ classification: Classification }>(
    `/api/projects/${projectId}/classifications/${id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
  return result.classification;
}

export async function deleteClassification(
  projectId: string,
  id: string
): Promise<void> {
  await request<unknown>(`/api/projects/${projectId}/classifications/${id}`, {
    method: 'DELETE',
  });
}

// ─── Polygons ───

export async function createPolygon(
  projectId: string,
  data: Partial<Polygon>
): Promise<Polygon> {
  const result = await request<{ polygon: Polygon }>(
    `/api/projects/${projectId}/polygons`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
  return result.polygon;
}

export async function updatePolygon(
  projectId: string,
  id: string,
  data: Partial<Polygon>
): Promise<Polygon> {
  const result = await request<{ polygon: Polygon }>(
    `/api/projects/${projectId}/polygons/${id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
  return result.polygon;
}

export async function deletePolygon(
  projectId: string,
  id: string
): Promise<void> {
  await request<unknown>(`/api/projects/${projectId}/polygons/${id}`, {
    method: 'DELETE',
  });
}

// ─── Quantities & Export ───

export async function getQuantities(projectId: string): Promise<Quantities> {
  return request<Quantities>(`/api/projects/${projectId}/quantities`);
}

export async function exportExcel(projectId: string): Promise<Blob> {
  return requestBlob(`/api/projects/${projectId}/export/excel`);
}

export async function exportJSON(projectId: string): Promise<unknown> {
  return request<unknown>(`/api/projects/${projectId}/export/json`);
}
