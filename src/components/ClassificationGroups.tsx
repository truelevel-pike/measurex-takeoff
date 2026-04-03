'use client';

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import type { ClassificationGroup } from '@/lib/types';

interface ContextMenuState {
  x: number;
  y: number;
  groupId: string;
}

export default function ClassificationGroups() {
  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const groups = useStore((s) => s.groups);
  const addGroup = useStore((s) => s.addGroup);
  const updateGroup = useStore((s) => s.updateGroup);
  const deleteGroup = useStore((s) => s.deleteGroup);
  // BUG-A6-009 fix: use the new reorderGroups store action.
  const reorderGroups = useStore((s) => s.reorderGroups);
  const moveClassificationToGroup = useStore((s) => s.moveClassificationToGroup);
  const addBreakdown = useStore((s) => s.addBreakdown);
  const deleteBreakdown = useStore((s) => s.deleteBreakdown);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#3b82f6');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [addingBreakdownGroupId, setAddingBreakdownGroupId] = useState<string | null>(null);
  const [newBreakdownName, setNewBreakdownName] = useState('');
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  // BUG-A6-020 fix: inline confirmation replaces window.confirm
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);
  // BUG-A6-019 fix: store contextMenu in a ref so the persistent listener can read it
  const contextMenuStateRef = useRef(contextMenu);
  contextMenuStateRef.current = contextMenu;

  const ppu = scale?.pixelsPerUnit || 1;
  const unit = scale?.unit || 'ft';

  // Close context menu on outside click
  // BUG-A6-019 fix: persistent listener (empty deps) avoids add/remove churn
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!contextMenuStateRef.current) return;
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // All classification IDs that belong to some group
  const groupedClassificationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) {
      for (const cid of g.classificationIds) ids.add(cid);
    }
    return ids;
  }, [groups]);

  // Ungrouped classifications
  const ungroupedClassifications = useMemo(
    () => classifications.filter((c) => !groupedClassificationIds.has(c.id)),
    [classifications, groupedClassificationIds]
  );

  // Polygon totals by classification id
  const totalsByClassification = useMemo(() => {
    const totals = new Map<string, { count: number; area: number; linear: number }>();
    for (const c of classifications) {
      const items = polygons.filter((p) => p.classificationId === c.id);
      totals.set(c.id, {
        count: items.length,
        area: items.reduce((sum, p) => sum + p.area, 0) / (ppu * ppu),
        linear: items.reduce((sum, p) => sum + (p.linearFeet || 0), 0),
      });
    }
    return totals;
  }, [classifications, polygons, ppu]);

  // Group totals
  const groupTotals = useCallback(
    (group: ClassificationGroup) => {
      let count = 0;
      let area = 0;
      let linear = 0;
      for (const cid of group.classificationIds) {
        const t = totalsByClassification.get(cid);
        if (t) {
          count += t.count;
          area += t.area;
          linear += t.linear;
        }
      }
      return { count, area, linear };
    },
    [totalsByClassification]
  );

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    addGroup(name, newGroupColor);
    setNewGroupName('');
    setNewGroupColor('#3b82f6');
    setShowAddGroup(false);
  }

  function handleContextMenu(e: React.MouseEvent, groupId: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, groupId });
  }

  function handleRenameStart(groupId: string) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    setRenamingGroupId(groupId);
    setRenameValue(group.name);
    setContextMenu(null);
  }

  function handleRenameSubmit(groupId: string) {
    const name = renameValue.trim();
    if (name) updateGroup(groupId, { name });
    setRenamingGroupId(null);
  }

  // BUG-A6-020 fix: inline confirmation replaces window.confirm
  function handleDeleteGroup(groupId: string) {
    setConfirmDeleteGroupId(groupId);
    setContextMenu(null);
  }

  function confirmDeleteGroup(groupId: string) {
    deleteGroup(groupId);
    setConfirmDeleteGroupId(null);
  }

  // BUG-A6-009 fix: handleMoveGroup now calls reorderGroups to actually persist the swap.
  function handleMoveGroup(groupId: string, direction: 'up' | 'down') {
    const idx = groups.findIndex((g) => g.id === groupId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= groups.length) return;
    const reordered = groups.map((g) => g.id);
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    reorderGroups(reordered);
  }

  function handleDrop(e: React.DragEvent, targetGroupId: string) {
    e.preventDefault();
    const classificationId = e.dataTransfer.getData('text/classification-id');
    if (classificationId) {
      moveClassificationToGroup(classificationId, targetGroupId);
    }
    setDragOverGroupId(null);
  }

  function handleDragOver(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    setDragOverGroupId(groupId);
  }

  function handleDragLeave() {
    setDragOverGroupId(null);
  }

  function handleClassificationDragStart(e: React.DragEvent, classificationId: string) {
    e.dataTransfer.setData('text/classification-id', classificationId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleAddBreakdown(groupId: string) {
    const name = newBreakdownName.trim();
    if (!name) return;
    addBreakdown(groupId, name);
    setNewBreakdownName('');
    setAddingBreakdownGroupId(null);
  }

  function renderClassificationRow(classificationId: string, draggable: boolean) {
    const classification = classifications.find((c) => c.id === classificationId);
    if (!classification) return null;
    const totals = totalsByClassification.get(classificationId) ?? { count: 0, area: 0, linear: 0 };

    return (
      <div
        key={classificationId}
        data-testid="classification-item"
        data-classification-id={classificationId}
        className="flex items-center gap-1.5 px-2 py-0.5 text-[12px] text-[#e5e7eb] hover:bg-[#0e1016] rounded cursor-default"
        draggable={draggable}
        onDragStart={(e) => handleClassificationDragStart(e, classificationId)}
      >
        <div
          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
          style={{ backgroundColor: classification.color }}
        />
        <span className="flex-1 truncate">{classification.name}</span>
        <span className="text-[10px] font-mono text-[#8892a0]">
          {classification.type === 'area'
            ? `${totals.area.toFixed(1)} sq ${unit}`
            : classification.type === 'linear'
              ? `${totals.linear.toFixed(1)} ${unit}`
              : `${totals.count} EA`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col text-[13px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#00d4ff]/20 font-semibold text-[#e5e7eb] text-sm flex items-center justify-between bg-[rgba(10,10,15,0.6)]">
        <span className="font-mono tracking-wider">GROUPS</span>
        <span className="text-xs text-[#8892a0] font-normal">{groups.length} groups</span>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {groups.map((group, idx) => {
          const isExpanded = expanded.has(group.id);
          const totals = groupTotals(group);
          const groupClassifications = group.classificationIds
            .map((cid) => classifications.find((c) => c.id === cid))
            .filter(Boolean);
          const isDragOver = dragOverGroupId === group.id;

          return (
            <div key={group.id} className="mb-0.5">
              {/* Group header */}
              <div
                className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded cursor-pointer hover:bg-[#0e1016] group ${
                  isDragOver ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/40' : ''
                }`}
                style={{ borderLeft: `3px solid ${group.color}` }}
                onClick={() => toggleExpanded(group.id)}
                onContextMenu={(e) => handleContextMenu(e, group.id)}
                onDrop={(e) => handleDrop(e, group.id)}
                onDragOver={(e) => handleDragOver(e, group.id)}
                onDragLeave={handleDragLeave}
              >
                {isExpanded ? (
                  <ChevronDown size={13} className="text-[#8892a0]" />
                ) : (
                  <ChevronRight size={13} className="text-[#8892a0]" />
                )}

                {renamingGroupId === group.id ? (
                  <input
                    data-testid="group-name-input"
                    className="flex-1 bg-[#0a0a0f] text-[#e5e7eb] text-[12px] px-1 py-0.5 rounded border border-[#00d4ff]/40 outline-none"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(group.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit(group.id);
                      if (e.key === 'Escape') setRenamingGroupId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex-1 font-medium truncate text-[12px] text-[#e5e7eb]">
                    {group.name}
                  </span>
                )}

                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[#0e1016] text-[#00d4ff]">
                  {group.classificationIds.length} items
                </span>

                {totals.count > 0 && (
                  <span className="text-[10px] font-mono text-[#8892a0]">
                    {totals.area.toFixed(0)} sf
                  </span>
                )}

                {/* Reorder buttons */}
                <button
                  type="button"
                  className="hidden group-hover:inline-flex text-[#8892a0] hover:text-[#00d4ff] p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveGroup(group.id, 'up');
                  }}
                  disabled={idx === 0}
                  aria-label="Move group up"
                >
                  <ArrowUp size={11} />
                </button>
                <button
                  type="button"
                  className="hidden group-hover:inline-flex text-[#8892a0] hover:text-[#00d4ff] p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveGroup(group.id, 'down');
                  }}
                  disabled={idx === groups.length - 1}
                  aria-label="Move group down"
                >
                  <ArrowDown size={11} />
                </button>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="ml-4 border-l border-[#00d4ff]/10 pl-1 mb-1">
                  {/* Classifications in this group */}
                  {groupClassifications.length === 0 && (
                    <div className="text-[11px] text-[#8892a0] py-1 px-2 italic">
                      Drag classifications here
                    </div>
                  )}
                  {group.classificationIds.map((cid) => renderClassificationRow(cid, true))}

                  {/* Breakdowns */}
                  {group.breakdowns.length > 0 && (
                    <div className="mt-1">
                      <div className="text-[10px] text-[#8892a0] px-2 py-0.5 font-mono uppercase tracking-wider">
                        Breakdowns
                      </div>
                      {group.breakdowns.map((bd) => (
                        <div
                          key={bd.id}
                          className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-[#e5e7eb]"
                        >
                          <span className="flex-1 truncate">{bd.name}</span>
                          <span className="text-[10px] font-mono text-[#8892a0]">
                            {bd.classificationIds.length} items
                          </span>
                          <button
                            type="button"
                            className="text-red-400 hover:text-red-500 p-0.5"
                            onClick={() => deleteBreakdown(group.id, bd.id)}
                            aria-label={`Delete breakdown ${bd.name}`}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Breakdown button */}
                  {addingBreakdownGroupId === group.id ? (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <input
                        className="flex-1 bg-[#0a0a0f] text-[#e5e7eb] text-[11px] px-1.5 py-0.5 rounded border border-[#00d4ff]/30 outline-none"
                        placeholder="Breakdown name"
                        value={newBreakdownName}
                        onChange={(e) => setNewBreakdownName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddBreakdown(group.id);
                          if (e.key === 'Escape') {
                            setAddingBreakdownGroupId(null);
                            setNewBreakdownName('');
                          }
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="text-[#00d4ff] text-[11px] font-medium"
                        onClick={() => handleAddBreakdown(group.id)}
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#8892a0] hover:text-[#00d4ff]"
                      onClick={() => {
                        setAddingBreakdownGroupId(group.id);
                        setNewBreakdownName('');
                      }}
                    >
                      <Plus size={10} />
                      Add Breakdown
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Ungrouped section */}
        {ungroupedClassifications.length > 0 && (
          <div className="mt-2 border-t border-[#00d4ff]/10 pt-1">
            <div
              className="flex items-center gap-1.5 px-1.5 py-1.5 rounded cursor-pointer hover:bg-[#0e1016]"
              style={{ borderLeft: '3px solid #4b5563' }}
              onClick={() => toggleExpanded('__ungrouped__')}
            >
              {expanded.has('__ungrouped__') ? (
                <ChevronDown size={13} className="text-[#8892a0]" />
              ) : (
                <ChevronRight size={13} className="text-[#8892a0]" />
              )}
              <span className="flex-1 font-medium text-[12px] text-[#8892a0]">Ungrouped</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[#0e1016] text-[#8892a0]">
                {ungroupedClassifications.length} items
              </span>
            </div>
            {expanded.has('__ungrouped__') && (
              <div className="ml-4 border-l border-[#4b5563]/30 pl-1">
                {ungroupedClassifications.map((c) => renderClassificationRow(c.id, true))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Group button */}
      <div className="px-2 py-2 border-t border-[#00d4ff]/10">
        {showAddGroup ? (
          <form onSubmit={handleAddGroup} className="p-2 bg-[#0e1016] border border-[#00d4ff]/20 rounded-lg">
            <input
              placeholder="Group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              data-testid="group-name-input"
              className="w-full px-2 py-1 border rounded text-[12px] mb-2 outline-none bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
              autoFocus
            />
            <div className="flex items-center gap-2 mb-2">
              <input
                type="color"
                value={newGroupColor}
                onChange={(e) => setNewGroupColor(e.target.value)}
                className="w-7 h-7 border rounded cursor-pointer bg-transparent"
                aria-label="Group color"
              />
              <input
                type="text"
                value={newGroupColor}
                onChange={(e) => setNewGroupColor(e.target.value)}
                className="flex-1 px-2 py-1 border rounded text-[11px] outline-none bg-[#0a0a0f] text-[#e5e7eb] focus:border-[#00d4ff]/40"
                placeholder="#3b82f6"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowAddGroup(false)}
                className="text-[#8892a0] text-xs"
              >
                Cancel
              </button>
              <button type="submit" data-testid="create-group-btn" className="text-[#00d4ff] font-medium text-xs">
                Create
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            data-testid="create-group-btn"
            onClick={() => setShowAddGroup(true)}
            className="w-full border border-[#00d4ff]/30 rounded px-2 py-1.5 text-xs text-[#00d4ff] hover:bg-[#00d4ff]/10 flex items-center justify-center gap-1"
          >
            <FolderPlus size={13} />
            Add Group
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-[#12121a] border border-[#00d4ff]/30 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            data-testid="rename-group-btn"
            className="w-full text-left px-3 py-1.5 text-[12px] text-[#e5e7eb] hover:bg-[#00d4ff]/10"
            onClick={() => handleRenameStart(contextMenu.groupId)}
          >
            Rename
          </button>
          <button
            type="button"
            data-testid="delete-group-btn"
            className="w-full text-left px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10"
            onClick={() => handleDeleteGroup(contextMenu.groupId)}
          >
            Delete Group
          </button>
          {ungroupedClassifications.length > 0 && (
            <>
              <div className="border-t border-[#00d4ff]/10 my-1" />
              <div className="px-3 py-1 text-[10px] text-[#8892a0] uppercase tracking-wider">
                Move to this group
              </div>
              {ungroupedClassifications.slice(0, 10).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-3 py-1 text-[11px] text-[#e5e7eb] hover:bg-[#00d4ff]/10 flex items-center gap-1.5"
                  onClick={() => {
                    moveClassificationToGroup(c.id, contextMenu.groupId);
                    setContextMenu(null);
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* BUG-A6-020: Inline delete confirmation */}
      {confirmDeleteGroupId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={() => setConfirmDeleteGroupId(null)}>
          <div className="bg-[#12121a] border border-red-500/40 rounded-lg p-4 text-[12px] min-w-[200px]" onClick={(e) => e.stopPropagation()}>
            <div className="text-red-400 mb-2">Delete group &ldquo;{groups.find((g) => g.id === confirmDeleteGroupId)?.name}&rdquo;?</div>
            <div className="text-[11px] text-[#8892a0] mb-3">Classifications will become ungrouped.</div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setConfirmDeleteGroupId(null)} className="text-[#8892a0] hover:text-white text-[11px] px-2 py-1">Cancel</button>
              <button type="button" onClick={() => confirmDeleteGroup(confirmDeleteGroupId)} className="text-red-400 hover:text-red-300 font-semibold text-[11px] px-2 py-1">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
