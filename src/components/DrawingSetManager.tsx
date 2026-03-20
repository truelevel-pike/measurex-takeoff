'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import {
  UploadCloud,
  Plus,
  FolderOpen,
  Folder,
  MoreVertical,
  FileText,
  ArrowUpDown,
  Trash2,
  Pencil,
  FolderInput,
  Archive,
  X,
  Check,
} from 'lucide-react';
import type { Drawing, DrawingSet } from '@/lib/types';

type SortBy = 'name' | 'date' | 'sheet';

interface DrawingSetManagerProps {
  projectId: string;
  onDrawingSelect?: (drawing: Drawing) => void;
}

interface UploadItem {
  id: string;
  fileName: string;
  progress: number;
  done: boolean;
}

export default function DrawingSetManager({ projectId, onDrawingSelect }: DrawingSetManagerProps) {
  const [sets, setSets] = useState<DrawingSet[]>([
    {
      id: 'default-set',
      name: 'Default Set',
      projectId,
      drawings: [],
      createdAt: new Date().toISOString(),
    },
  ]);
  const [selectedSetId, setSelectedSetId] = useState<string>('default-set');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editingSetName, setEditingSetName] = useState('');
  const [setMenuId, setSetMenuId] = useState<string | null>(null);
  const [drawingMenuId, setDrawingMenuId] = useState<string | null>(null);
  const [moveSubmenuDrawingId, setMoveSubmenuDrawingId] = useState<string | null>(null);
  const [deleteConfirmSetId, setDeleteConfirmSetId] = useState<string | null>(null);
  // BUG-A7-5-003 fix: inline drawing rename state — replaces window.prompt() which blocks in iframes/sandbox
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [editingDrawingName, setEditingDrawingName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editDrawingInputRef = useRef<HTMLInputElement>(null);
  // BUG-A6-003 fix: track all upload interval IDs so they can be cleared on unmount.
  const uploadIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  const selectedSet = sets.find((s) => s.id === selectedSetId);

  useEffect(() => {
    if (editingSetId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSetId]);

  // BUG-A6-003 fix: clear all in-flight upload intervals on unmount.
  useEffect(() => {
    return () => {
      uploadIntervalsRef.current.forEach((id) => clearInterval(id));
    };
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handler = () => {
      setSetMenuId(null);
      setDrawingMenuId(null);
      setMoveSubmenuDrawingId(null);
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  const createSet = () => {
    const id = crypto.randomUUID();
    const newSet: DrawingSet = {
      id,
      name: 'Untitled Set',
      projectId,
      drawings: [],
      createdAt: new Date().toISOString(),
    };
    setSets((prev) => [...prev, newSet]);
    setSelectedSetId(id);
    setEditingSetId(id);
    setEditingSetName('Untitled Set');
  };

  const commitRename = (setId: string) => {
    const name = editingSetName.trim();
    if (name) {
      setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, name } : s)));
    }
    setEditingSetId(null);
  };

  const deleteSet = (setId: string) => {
    setSets((prev) => prev.filter((s) => s.id !== setId));
    if (selectedSetId === setId) {
      setSelectedSetId(sets.find((s) => s.id !== setId)?.id ?? '');
    }
    setDeleteConfirmSetId(null);
    setSetMenuId(null);
  };

  const simulateUpload = useCallback(
    (files: FileList | File[]) => {
      if (!selectedSetId) return;
      const fileArray = Array.from(files).filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
      if (fileArray.length === 0) return;

      const newUploads: UploadItem[] = fileArray.map((f) => ({
        id: crypto.randomUUID(),
        fileName: f.name,
        progress: 0,
        done: false,
      }));
      setUploads((prev) => [...prev, ...newUploads]);

      // Simulate progress for each file
      newUploads.forEach((upload) => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 25 + 10;
          if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            // Remove from tracked intervals ref
            uploadIntervalsRef.current = uploadIntervalsRef.current.filter((id) => id !== interval);

            // Add drawing to set
            const drawing: Drawing = {
              id: crypto.randomUUID(),
              name: upload.fileName.replace('.pdf', ''),
              setId: selectedSetId,
              pageCount: Math.ceil(Math.random() * 10) + 1,
              uploadedAt: new Date().toISOString(),
              sheetNumber: `S-${String(Math.ceil(Math.random() * 50)).padStart(3, '0')}`,
            };
            setSets((prev) =>
              prev.map((s) => (s.id === selectedSetId ? { ...s, drawings: [...s.drawings, drawing] } : s))
            );

            // Remove from uploads after a moment
            setTimeout(() => {
              setUploads((prev) => prev.filter((u) => u.id !== upload.id));
            }, 800);
          }
          setUploads((prev) => prev.map((u) => (u.id === upload.id ? { ...u, progress, done: progress >= 100 } : u)));
        }, 300);
        // Track the interval ID so it can be cleared on unmount (BUG-A6-003).
        uploadIntervalsRef.current.push(interval);
      });
    },
    [selectedSetId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        simulateUpload(e.dataTransfer.files);
      }
    },
    [simulateUpload]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      simulateUpload(e.target.files);
      e.target.value = '';
    }
  };

  const sortedDrawings = selectedSet
    ? [...selectedSet.drawings].sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'date') return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        return (a.sheetNumber ?? '').localeCompare(b.sheetNumber ?? '');
      })
    : [];

  const renameDrawing = (drawingId: string, newName: string) => {
    setSets((prev) =>
      prev.map((s) => ({
        ...s,
        drawings: s.drawings.map((d) => (d.id === drawingId ? { ...d, name: newName } : d)),
      }))
    );
  };

  const deleteDrawing = (drawingId: string) => {
    setSets((prev) =>
      prev.map((s) => ({
        ...s,
        drawings: s.drawings.filter((d) => d.id !== drawingId),
      }))
    );
    setDrawingMenuId(null);
  };

  const moveDrawing = (drawingId: string, targetSetId: string) => {
    setSets((prev) => {
      // Two-pass: first find the drawing and remove it from its source set.
      let movedDrawing: Drawing | null = null;
      const afterRemove = prev.map((s) => {
        const found = s.drawings.find((d) => d.id === drawingId);
        if (found) {
          movedDrawing = { ...found, setId: targetSetId };
          return { ...s, drawings: s.drawings.filter((d) => d.id !== drawingId) };
        }
        return s;
      });
      if (!movedDrawing) return prev; // drawing not found — no-op
      // Second pass: insert into the target set.
      return afterRemove.map((s) => {
        if (s.id === targetSetId) {
          return { ...s, drawings: [...s.drawings, movedDrawing!] };
        }
        return s;
      });
    });
    setDrawingMenuId(null);
    setMoveSubmenuDrawingId(null);
  };

  return (
    <div className="flex flex-col h-full w-[280px] bg-[#12121a] text-neutral-200 text-sm select-none">
      {/* Upload button */}
      <div className="p-3 border-b border-[#1e1e2e]">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-3 rounded-lg transition-colors"
        >
          <UploadCloud size={16} />
          Upload Drawings
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="px-3 py-2 border-b border-[#1e1e2e] space-y-2">
          {uploads.map((u) => (
            <div key={u.id} className="space-y-1">
              <div className="flex justify-between text-xs text-neutral-400">
                <span className="truncate max-w-[180px]">{u.fileName}</span>
                <span>{Math.round(u.progress)}%</span>
              </div>
              <div className="h-1.5 rounded bg-[#1e1e2e] overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${u.done ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${u.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sets list */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Drawing Sets</span>
        <button
          onClick={createSet}
          className="text-neutral-400 hover:text-white p-1 rounded hover:bg-[#1e1e2e] transition-colors"
          title="New Set"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-shrink-0 max-h-[200px] overflow-y-auto px-1">
        {sets.map((s) => {
          const isActive = s.id === selectedSetId;
          const isEditing = editingSetId === s.id;

          return (
            <div
              key={s.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group ${
                isActive ? 'bg-[#1e1e2e] text-white' : 'hover:bg-[#1a1a28] text-neutral-400'
              }`}
              onClick={() => {
                setSelectedSetId(s.id);
                setSetMenuId(null);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setSetMenuId(s.id);
              }}
            >
              {isActive ? <FolderOpen size={14} /> : <Folder size={14} />}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  value={editingSetName}
                  onChange={(e) => setEditingSetName(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(s.id);
                    if (e.key === 'Escape') setEditingSetId(null);
                  }}
                  className="flex-1 bg-transparent outline-none border-b border-blue-400 text-white text-sm px-0"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate text-sm">{s.name}</span>
              )}
              <span className="text-[10px] bg-[#2a2a3e] text-neutral-400 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {s.drawings.length}
              </span>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSetMenuId(setMenuId === s.id ? null : s.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-white p-0.5 transition-opacity"
                >
                  <MoreVertical size={12} />
                </button>
                {setMenuId === s.id && (
                  <div
                    className="absolute right-0 top-6 z-50 bg-[#1e1e2e] border border-[#2a2a3e] rounded-lg shadow-xl py-1 w-32"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setEditingSetId(s.id);
                        setEditingSetName(s.name);
                        setSetMenuId(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#2a2a3e] flex items-center gap-2"
                    >
                      <Pencil size={12} /> Rename
                    </button>
                    {deleteConfirmSetId === s.id ? (
                      <div className="px-3 py-1.5 text-xs space-y-1">
                        <div className="text-red-400">Delete set?</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => deleteSet(s.id)}
                            className="text-red-400 hover:text-red-300 flex items-center gap-1"
                          >
                            <Check size={10} /> Yes
                          </button>
                          <button
                            onClick={() => setDeleteConfirmSetId(null)}
                            className="text-neutral-400 hover:text-white flex items-center gap-1"
                          >
                            <X size={10} /> No
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmSetId(s.id)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#2a2a3e] text-red-400 flex items-center gap-2"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Divider + sort controls */}
      <div className="px-3 pt-3 pb-1 border-t border-[#1e1e2e] flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Drawings</span>
        <div className="flex items-center gap-1">
          <ArrowUpDown size={10} className="text-neutral-500" />
          {(['name', 'date', 'sheet'] as SortBy[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                sortBy === key ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {key === 'name' ? 'Name' : key === 'date' ? 'Date' : 'Sheet'}
            </button>
          ))}
        </div>
      </div>

      {/* Drawing list + drag zone */}
      <div
        className={`flex-1 overflow-y-auto px-2 py-1 ${
          dragOver ? 'bg-blue-900/20 border-2 border-dashed border-blue-500 rounded-lg m-1' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {sortedDrawings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-neutral-500 text-xs gap-2">
            <UploadCloud size={28} className="text-neutral-600" />
            <span>Drop PDF files here</span>
            <span>or click Upload above</span>
          </div>
        ) : (
          <div className="space-y-1">
            {sortedDrawings.map((d) => (
              <div
                key={d.id}
                className="flex items-start gap-2 p-2 rounded-lg hover:bg-[#1a1a28] cursor-pointer group relative"
                onClick={() => onDrawingSelect?.(d)}
              >
                {/* Thumbnail placeholder */}
                <div className="relative w-10 h-12 rounded bg-[#1e1e2e] border border-[#2a2a3e] flex flex-col items-center justify-center flex-shrink-0">
                  {d.thumbnailUrl ? (
                    <Image src={d.thumbnailUrl} alt={d.name} fill className="object-cover rounded" />
                  ) : (
                    <>
                      <FileText size={14} className="text-neutral-500" />
                      <span className="text-[8px] text-neutral-600 mt-0.5">Page 1</span>
                    </>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {editingDrawingId === d.id ? (
                    // BUG-A7-5-003 fix: inline rename input — no window.prompt(), works in iframes
                    <input
                      ref={editDrawingInputRef}
                      className="text-xs font-medium bg-[#2a2a3e] text-neutral-200 border border-blue-500 rounded px-1 w-full outline-none"
                      value={editingDrawingName}
                      onChange={(e) => setEditingDrawingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editingDrawingName.trim()) {
                          renameDrawing(d.id, editingDrawingName.trim());
                          setEditingDrawingId(null);
                        } else if (e.key === 'Escape') {
                          setEditingDrawingId(null);
                        }
                        e.stopPropagation();
                      }}
                      onBlur={() => {
                        if (editingDrawingName.trim()) renameDrawing(d.id, editingDrawingName.trim());
                        setEditingDrawingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="text-xs font-medium text-neutral-200 truncate">{d.name}</div>
                  )}
                  <div className="text-[10px] text-neutral-500">
                    {d.pageCount} pg{d.pageCount !== 1 ? 's' : ''}
                    {d.sheetNumber && <span className="ml-2">#{d.sheetNumber}</span>}
                  </div>
                </div>
                {/* Drawing actions */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrawingMenuId(drawingMenuId === d.id ? null : d.id);
                      setMoveSubmenuDrawingId(null);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-white p-0.5 transition-opacity"
                  >
                    <MoreVertical size={12} />
                  </button>
                  {drawingMenuId === d.id && (
                    <div
                      className="absolute right-0 top-5 z-50 bg-[#1e1e2e] border border-[#2a2a3e] rounded-lg shadow-xl py-1 w-40"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          // BUG-A7-5-003 fix: inline rename instead of window.prompt() (blocks in iframes)
                          setEditingDrawingId(d.id);
                          setEditingDrawingName(d.name);
                          setDrawingMenuId(null);
                          setTimeout(() => editDrawingInputRef.current?.focus(), 50);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#2a2a3e] flex items-center gap-2"
                      >
                        <Pencil size={12} /> Rename
                      </button>
                      <div
                        className="relative"
                        onMouseEnter={() => setMoveSubmenuDrawingId(d.id)}
                        onMouseLeave={() => setMoveSubmenuDrawingId(null)}
                      >
                        <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#2a2a3e] flex items-center gap-2">
                          <FolderInput size={12} /> Move to Set
                        </button>
                        {moveSubmenuDrawingId === d.id && sets.filter((s) => s.id !== selectedSetId).length > 0 && (
                          <div className="absolute left-full top-0 ml-1 bg-[#1e1e2e] border border-[#2a2a3e] rounded-lg shadow-xl py-1 w-36">
                            {sets
                              .filter((s) => s.id !== selectedSetId)
                              .map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => moveDrawing(d.id, s.id)}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#2a2a3e] truncate"
                                >
                                  {s.name}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteDrawing(d.id)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#2a2a3e] text-red-400 flex items-center gap-2"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                      <button
                        onClick={() => {
                          deleteDrawing(d.id);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#2a2a3e] text-neutral-400 flex items-center gap-2"
                      >
                        <Archive size={12} /> Archive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
