import type { Polygon } from '@/lib/types';

export interface PolygonGroup {
  id: string;
  name: string;
  color: string;
  polygonIds: string[];
  visible: boolean;
}

export interface GroupStats {
  polygonCount: number;
  totalArea: number;
  totalLength: number;
}

interface CreateGroupOptions {
  id?: string;
  polygonIds?: string[];
  visible?: boolean;
}

export function createGroup(name: string, color: string, options: CreateGroupOptions = {}): PolygonGroup {
  return {
    id: options.id ?? crypto.randomUUID(),
    name: name.trim() || 'Untitled Group',
    color,
    polygonIds: Array.from(new Set(options.polygonIds ?? [])),
    visible: options.visible ?? true,
  };
}

export function addToGroup(group: PolygonGroup, polygonId: string): PolygonGroup {
  if (group.polygonIds.includes(polygonId)) return group;
  return {
    ...group,
    polygonIds: [...group.polygonIds, polygonId],
  };
}

export function removeFromGroup(group: PolygonGroup, polygonId: string): PolygonGroup {
  if (!group.polygonIds.includes(polygonId)) return group;
  return {
    ...group,
    polygonIds: group.polygonIds.filter((id) => id !== polygonId),
  };
}

// BUG-A7-4-062: O(groups × polygons) when called per group in a render loop.
// Callers with many groups should pre-build a Map<id, Polygon> and avoid repeated full scans.
export function getGroupStats(group: PolygonGroup, polygons: Polygon[]): GroupStats {
  const polygonIds = new Set(group.polygonIds);
  let polygonCount = 0;
  let totalArea = 0;
  let totalLength = 0;

  for (const polygon of polygons) {
    if (!polygonIds.has(polygon.id)) continue;
    polygonCount += 1;
    totalArea += polygon.area || 0;
    totalLength += polygon.linearFeet || 0;
  }

  return {
    polygonCount,
    totalArea,
    totalLength,
  };
}
