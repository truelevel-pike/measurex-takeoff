'use client';

import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { Classification, Polygon } from '@/lib/types';
import {
  addToGroup,
  createGroup,
  getGroupStats,
  removeFromGroup,
  type PolygonGroup,
} from '@/lib/polygon-groups';

interface PolygonGroupPanelProps {
  className?: string;
  polygons?: Polygon[];
  classifications?: Classification[];
  initialGroups?: PolygonGroup[];
  onGroupsChange?: (groups: PolygonGroup[]) => void;
}

function formatArea(area: number, pixelsPerUnit: number, unit: string): string {
  const realArea = pixelsPerUnit > 0 ? area / (pixelsPerUnit * pixelsPerUnit) : area;
  return `${realArea.toFixed(1)} sq ${unit}`;
}

// BUG-PIKE-020 fix: accept pixelsPerUnit so raw-pixel linearFeet is converted to LF before display
function formatLength(length: number, pixelsPerUnit: number, unit: string): string {
  const realLength = pixelsPerUnit > 0 ? length / pixelsPerUnit : length;
  return `${realLength.toFixed(1)} ${unit}`;
}

function seedPolygonGroupsFromClassifications(
  groups: Array<{ id: string; name: string; color: string; classificationIds: string[] }>,
  polygons: Polygon[]
): PolygonGroup[] {
  return groups.map((group) =>
    createGroup(group.name, group.color, {
      id: group.id,
      polygonIds: polygons
        .filter((polygon) => group.classificationIds.includes(polygon.classificationId))
        .map((polygon) => polygon.id),
      visible: true,
    })
  );
}

export default function PolygonGroupPanel({
  className,
  polygons: polygonsProp,
  classifications: classificationsProp,
  initialGroups,
  onGroupsChange,
}: PolygonGroupPanelProps) {
  const storePolygons = useStore((s) => s.polygons);
  const storeClassifications = useStore((s) => s.classifications);
  const classificationGroups = useStore((s) => s.groups);
  const scale = useStore((s) => s.scale);
  const scales = useStore((s) => s.scales);

  const polygons = polygonsProp ?? storePolygons;
  const classifications = classificationsProp ?? storeClassifications;

  const [groups, setGroups] = useState<PolygonGroup[]>(() => {
    if (initialGroups && initialGroups.length > 0) {
      return initialGroups;
    }
    if (classificationGroups.length > 0) {
      return seedPolygonGroupsFromClassifications(classificationGroups, polygons);
    }
    return [];
  });

  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#22c55e');

  const pixelsPerUnit = scale?.pixelsPerUnit ?? 1;
  const unit = scale?.unit ?? 'ft';

  const classificationById = useMemo(() => {
    const map = new Map<string, Classification>();
    for (const classification of classifications) {
      map.set(classification.id, classification);
    }
    return map;
  }, [classifications]);

  const polygonGroupLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const group of groups) {
      for (const polygonId of group.polygonIds) {
        lookup.set(polygonId, group.id);
      }
    }
    return lookup;
  }, [groups]);

  function updateGroups(nextGroups: PolygonGroup[]) {
    setGroups(nextGroups);
    onGroupsChange?.(nextGroups);
  }

  function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;

    const nextGroups = [...groups, createGroup(name, newGroupColor)];
    updateGroups(nextGroups);

    setNewGroupName('');
    setNewGroupColor('#22c55e');
    setShowNewGroupForm(false);
  }

  function setPolygonGroup(polygonId: string, nextGroupId: string) {
    let nextGroups = groups.map((group) => removeFromGroup(group, polygonId));
    if (nextGroupId) {
      nextGroups = nextGroups.map((group) => {
        if (group.id !== nextGroupId) return group;
        return addToGroup(group, polygonId);
      });
    }
    updateGroups(nextGroups);
  }

  function toggleGroupVisibility(groupId: string) {
    const nextGroups = groups.map((group) =>
      group.id === groupId ? { ...group, visible: !group.visible } : group
    );
    updateGroups(nextGroups);
  }

  return (
    <section className={className ?? 'rounded border border-[#00d4ff]/20 bg-[#0a0a0f] text-[#e5e7eb]'}>
      <div className="flex items-center justify-between border-b border-[#00d4ff]/20 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold tracking-wide">Polygon Groups</h3>
          <p className="text-xs text-[#94a3b8]">{groups.length} groups</p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewGroupForm((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded border border-[#00d4ff]/30 px-2 py-1 text-xs text-[#00d4ff] hover:bg-[#00d4ff]/10"
        >
          <Plus size={14} />
          New Group
        </button>
      </div>

      {showNewGroupForm && (
        <form onSubmit={handleCreateGroup} className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-[#00d4ff]/10 px-3 py-2">
          <input
            type="text"
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            placeholder="Group name"
            className="rounded border border-[#00d4ff]/25 bg-[#0b1220] px-2 py-1 text-sm text-[#e5e7eb] outline-none focus:border-[#00d4ff]/50"
            aria-label="New group name"
          />
          <input
            type="color"
            value={newGroupColor}
            onChange={(event) => setNewGroupColor(event.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-[#00d4ff]/25 bg-transparent"
            aria-label="New group color"
          />
          <button
            type="submit"
            className="rounded border border-[#22c55e]/40 px-2 py-1 text-xs text-[#22c55e] hover:bg-[#22c55e]/10"
          >
            Create
          </button>
        </form>
      )}

      <div className="max-h-64 overflow-y-auto px-2 py-2">
        {groups.length === 0 ? (
          <p className="px-1 py-4 text-xs text-[#94a3b8]">No groups yet. Create one to organize polygons.</p>
        ) : (
          groups.map((group) => {
            const stats = getGroupStats(group, polygons);
            return (
              <div key={group.id} className="mb-2 rounded border border-[#00d4ff]/15 bg-[#0b1220]/60 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-sm border border-black/20"
                      style={{ backgroundColor: group.color }}
                      aria-label={`${group.name} color`}
                    />
                    <span className="text-sm font-medium">{group.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleGroupVisibility(group.id)}
                    className="rounded p-1 text-[#94a3b8] hover:bg-[#00d4ff]/10 hover:text-[#00d4ff]"
                    aria-label={group.visible ? `Hide ${group.name}` : `Show ${group.name}`}
                    title={group.visible ? 'Hide group polygons' : 'Show group polygons'}
                  >
                    {group.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                </div>

                <div className="mt-1 flex flex-wrap gap-2 text-xs text-[#94a3b8]">
                  <span>{stats.polygonCount} polygons</span>
                  <span>{formatArea(stats.totalArea, pixelsPerUnit, unit)}</span>
                  <span>{formatLength(stats.totalLength, pixelsPerUnit, unit)}</span>
                </div>

                {!group.visible && (
                  <p className="mt-1 text-[11px] text-[#fbbf24]">Group hidden: polygons in this group are hidden.</p>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-[#00d4ff]/20 px-3 py-2">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">Polygon Assignments</h4>
        <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {polygons.map((polygon) => {
            const classification = classificationById.get(polygon.classificationId);
            const groupId = polygonGroupLookup.get(polygon.id) ?? '';
            const assignedGroup = groupId ? groups.find((group) => group.id === groupId) : null;
            const hidden = assignedGroup ? !assignedGroup.visible : false;

            return (
              <div
                key={polygon.id}
                className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded border px-2 py-1 ${
                  hidden ? 'border-[#fbbf24]/30 bg-[#fbbf24]/5 opacity-70' : 'border-[#00d4ff]/10 bg-[#0b1220]/40'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {polygon.label || `Polygon ${polygon.id.slice(0, 8)}`}
                  </p>
                  <p className="truncate text-[11px] text-[#94a3b8]">
                    {classification?.name ?? 'Unclassified'}
                    {' | '}
                    A {formatArea(polygon.area || 0, pixelsPerUnit, unit)}
                    {' | '}
                    L {formatLength(polygon.linearFeet || 0, (scales[polygon.pageNumber] ?? scale)?.pixelsPerUnit ?? pixelsPerUnit, unit)}
                  </p>
                </div>

                <select
                  value={groupId}
                  onChange={(event) => setPolygonGroup(polygon.id, event.target.value)}
                  className="rounded border border-[#00d4ff]/20 bg-[#0a0a0f] px-2 py-1 text-xs text-[#e5e7eb] outline-none"
                  aria-label={`Assign ${polygon.label || polygon.id} to group`}
                >
                  <option value="">No group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {polygons.length === 0 && (
        <p className="border-t border-[#00d4ff]/10 px-3 py-3 text-xs text-[#94a3b8]">No polygons available for grouping.</p>
      )}

      <div className="border-t border-[#00d4ff]/10 px-3 py-2 text-[11px] text-[#94a3b8]">
        Hidden polygons: {groups.filter((group) => !group.visible).reduce((sum, group) => sum + group.polygonIds.length, 0)}
      </div>

    </section>
  );
}
