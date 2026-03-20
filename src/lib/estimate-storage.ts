import type { UnitCost, UnitCostMap } from '@/types/estimates';

function storageKey(projectId: string): string {
  return `mx-unit-costs-${projectId}`;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function loadUnitCosts(projectId: string): UnitCostMap {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as UnitCostMap;
  } catch {
    return {};
  }
}

export function saveUnitCosts(projectId: string, costs: UnitCostMap): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(costs));
  } catch {
    // Fail silently on storage errors
  }
}

export function updateUnitCost(
  projectId: string,
  classificationId: string,
  update: Partial<UnitCost>,
): UnitCostMap {
  const costs = loadUnitCosts(projectId);
  costs[classificationId] = { ...costs[classificationId], ...update } as UnitCost;
  saveUnitCosts(projectId, costs);
  return costs;
}

export function deleteUnitCost(projectId: string, classificationId: string): UnitCostMap {
  const costs = loadUnitCosts(projectId);
  delete costs[classificationId];
  saveUnitCosts(projectId, costs);
  return costs;
}

export function clearAllUnitCosts(projectId: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(storageKey(projectId));
  } catch {
    // Fail silently on storage errors
  }
}
