'use client';

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { X, Download, FileSpreadsheet, FileText, Eye, Printer } from 'lucide-react';
import { useFocusTrap } from '@/lib/use-focus-trap';
// BUG-A8-011: xlsx@0.18.x has known prototype pollution / ReDoS CVEs
// (CVE-2023-30533 and related). TODO: migrate to exceljs or SheetJS Pro.
// For now, lazy-load via dynamic import to restrict client bundle exposure.
// The server-side API routes (api/projects/[id]/export/excel) are the
// preferred export path; this component is a fallback for offline/quick use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _xlsxModule: any = null;
async function getXLSX() {
  if (!_xlsxModule) _xlsxModule = await import('xlsx');
  return _xlsxModule as typeof import('xlsx');
}
import { useStore } from '@/lib/store';
import { calculateLinearFeet } from '@/lib/polygon-utils';
import type { Classification, Polygon, ScaleCalibration } from '@/lib/types';
import { getNotificationPrefs } from '@/components/NotificationSettings';

// ── Types ──────────────────────────────────────────────────────────────────────

type GroupByOption = 'none' | 'type' | 'drawing' | 'group' | 'trade';

interface ColumnVisibility {
  name: boolean;
  type: boolean;
  area: boolean;
  linear: boolean;
  count: boolean;
  perPage: boolean;
  total: boolean;
}

type MeasurementFilter = 'all' | 'area' | 'linear' | 'count';

interface PreviewRow {
  name: string;
  type: string;
  area: number;
  linear: number;
  count: number;
  perPage: string;
  total: number;
  unit: string;
  isGroupHeader?: boolean;
}

// ── Helpers (reuse logic from export.ts) ─────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pickScaleForPage(
  pageNumber: number,
  scales: Record<number, ScaleCalibration>,
  fallbackScale: ScaleCalibration | null
): ScaleCalibration | null {
  if (scales[pageNumber]) return scales[pageNumber];
  return fallbackScale;
}

function computeClassificationTotals(
  classifications: Classification[],
  polygons: Polygon[],
  scale: ScaleCalibration | null,
  scales: Record<number, ScaleCalibration>
): PreviewRow[] {
  const rows: PreviewRow[] = [];

  for (const cls of classifications) {
    const clsPolygons = polygons.filter((p) => p.classificationId === cls.id);
    if (clsPolygons.length === 0) continue;

    let totalArea = 0;
    let totalLinear = 0;
    let totalCount = 0;
    const pageMap = new Map<number, number>();

    for (const poly of clsPolygons) {
      const pageScale = pickScaleForPage(poly.pageNumber, scales, scale);
      const ppu = pageScale?.pixelsPerUnit && pageScale.pixelsPerUnit > 0 ? pageScale.pixelsPerUnit : 1;

      if (cls.type === 'area') {
        const val = poly.area / (ppu * ppu);
        totalArea += val;
        pageMap.set(poly.pageNumber, (pageMap.get(poly.pageNumber) ?? 0) + val);
      } else if (cls.type === 'linear') {
        const val = calculateLinearFeet(poly.points, ppu, false);
        totalLinear += val;
        pageMap.set(poly.pageNumber, (pageMap.get(poly.pageNumber) ?? 0) + val);
      } else {
        totalCount += 1;
        pageMap.set(poly.pageNumber, (pageMap.get(poly.pageNumber) ?? 0) + 1);
      }
    }

    const pageScale = pickScaleForPage(clsPolygons[0].pageNumber, scales, scale);
    const baseUnit = pageScale?.unit ?? 'px';
    const unit =
      cls.type === 'area' ? `sq ${baseUnit}` : cls.type === 'linear' ? baseUnit : 'ea';

    const totalValue =
      cls.type === 'area' ? totalArea : cls.type === 'linear' ? totalLinear : totalCount;

    const pageEntries = Array.from(pageMap.entries());
    const perPageStr = pageEntries
      .map(([pg, val]) => `P${pg}: ${round2(val)}`)
      .join(', ');

    rows.push({
      name: cls.name,
      type: cls.type.toUpperCase(),
      area: round2(totalArea),
      linear: round2(totalLinear),
      count: totalCount,
      perPage: perPageStr,
      total: round2(totalValue),
      unit,
    });
  }

  return rows;
}

// ── Group rows by a key ─────────────────────────────────────────────────────

function groupRows(
  rows: PreviewRow[],
  groupBy: GroupByOption,
  classifications: Classification[],
  groups: { id: string; name: string; classificationIds: string[] }[]
): PreviewRow[] {
  if (groupBy === 'none') return rows;

  const grouped = new Map<string, PreviewRow[]>();

  for (const row of rows) {
    let key = 'Other';
    if (groupBy === 'type') {
      key = row.type;
    } else if (groupBy === 'group' || groupBy === 'trade') {
      const cls = classifications.find(
        (c) => c.name === row.name
      );
      if (cls) {
        const grp = groups.find((g) => g.classificationIds.includes(cls.id));
        if (grp) key = grp.name;
      }
    } else if (groupBy === 'drawing') {
      key = row.perPage ? `Page ${row.perPage.split(':')[0]?.replace('P', '') ?? '?'}` : 'Unknown';
    }

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const result: PreviewRow[] = [];
  for (const [key, grpRows] of grouped) {
    result.push({
      name: key,
      type: '',
      area: 0,
      linear: 0,
      count: 0,
      perPage: '',
      total: 0,
      unit: '',
      isGroupHeader: true,
    });
    result.push(...grpRows);
  }

  return result;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ExportPanelProps {
  onClose: () => void;
}

export default function ExportPanel({ onClose }: ExportPanelProps) {
  const projectId = useStore((s) => s.projectId);
  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const scales = useStore((s) => s.scales);
  const groups = useStore((s) => s.groups);
  const totalPages = useStore((s) => s.totalPages);
  const currentPage = useStore((s) => s.currentPage);

  const focusTrapRef = useFocusTrap(true);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus close button when panel mounts
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape to close
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  // Drawing selection
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => {
    const pages = new Set<number>();
    for (let i = 1; i <= totalPages; i++) pages.add(i);
    return pages;
  });
  const [selectAll, setSelectAll] = useState(true);

  // Group By (up to 3 cascading)
  const [groupBy1, setGroupBy1] = useState<GroupByOption>('none');
  const [groupBy2, setGroupBy2] = useState<GroupByOption>('none');
  const [groupBy3, setGroupBy3] = useState<GroupByOption>('none');

  // Filters
  const [measurementFilter, setMeasurementFilter] = useState<MeasurementFilter>('all');
  const [selectedClassificationIds, setSelectedClassificationIds] = useState<Set<string>>(
    () => new Set(classifications.map((c) => c.id))
  );

  // Column visibility
  const [columns, setColumns] = useState<ColumnVisibility>({
    name: true,
    type: true,
    area: true,
    linear: true,
    count: true,
    perPage: false,
    total: true,
  });

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Toggle page selection
  const togglePage = (page: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedPages(new Set());
    } else {
      const pages = new Set<number>();
      for (let i = 1; i <= totalPages; i++) pages.add(i);
      setSelectedPages(pages);
    }
    setSelectAll(!selectAll);
  };

  // Toggle classification filter
  const toggleClassificationFilter = (id: string) => {
    setSelectedClassificationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle column
  const toggleColumn = (col: keyof ColumnVisibility) => {
    setColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  // Filtered polygons
  const filteredPolygons = useMemo(() => {
    let filtered = polygons.filter((p) => selectedPages.has(p.pageNumber));
    if (measurementFilter !== 'all') {
      const typeClassIds = new Set(
        classifications
          .filter((c) => c.type === measurementFilter)
          .map((c) => c.id)
      );
      filtered = filtered.filter((p) => typeClassIds.has(p.classificationId));
    }
    filtered = filtered.filter((p) => selectedClassificationIds.has(p.classificationId));
    return filtered;
  }, [polygons, selectedPages, measurementFilter, classifications, selectedClassificationIds]);

  // Filtered classifications
  const filteredClassifications = useMemo(() => {
    let filtered = classifications.filter((c) => selectedClassificationIds.has(c.id));
    if (measurementFilter !== 'all') {
      filtered = filtered.filter((c) => c.type === measurementFilter);
    }
    return filtered;
  }, [classifications, selectedClassificationIds, measurementFilter]);

  // Preview rows
  const previewRows = useMemo(() => {
    const rows = computeClassificationTotals(
      filteredClassifications,
      filteredPolygons,
      scale,
      scales
    );

    let grouped = groupRows(rows, groupBy1, classifications, groups);
    if (groupBy1 !== 'none' && groupBy2 !== 'none') {
      // Apply second level grouping on non-header rows
      const nonHeaders = grouped.filter((r) => !r.isGroupHeader);
      grouped = groupRows(nonHeaders, groupBy2, classifications, groups);
    }
    if (groupBy2 !== 'none' && groupBy3 !== 'none') {
      const nonHeaders = grouped.filter((r) => !r.isGroupHeader);
      grouped = groupRows(nonHeaders, groupBy3, classifications, groups);
    }

    return grouped;
  }, [filteredClassifications, filteredPolygons, scale, scales, groupBy1, groupBy2, groupBy3, classifications, groups]);

  // ── Export: Screen View (grouped/filtered, visible columns) ──
  // BUG-A8-011: xlsx loaded via dynamic import (lazy) to reduce client bundle exposure
  const handleScreenViewExport = useCallback(async () => {
    const XLSX = await getXLSX();
    const wb = XLSX.utils.book_new();
    const headers: string[] = [];
    if (columns.name) headers.push('Name');
    if (columns.type) headers.push('Type');
    if (columns.area) headers.push('Area');
    if (columns.linear) headers.push('Linear');
    if (columns.count) headers.push('Count');
    if (columns.perPage) headers.push('Per Page');
    if (columns.total) headers.push('Total');

    const aoa: (string | number)[][] = [headers];

    for (const row of previewRows) {
      const r: (string | number)[] = [];
      if (row.isGroupHeader) {
        r.push(row.name);
        for (let i = 1; i < headers.length; i++) r.push('');
        aoa.push(r);
        continue;
      }
      if (columns.name) r.push(row.name);
      if (columns.type) r.push(row.type);
      if (columns.area) r.push(row.area);
      if (columns.linear) r.push(row.linear);
      if (columns.count) r.push(row.count);
      if (columns.perPage) r.push(row.perPage);
      if (columns.total) r.push(`${row.total} ${row.unit}`);
      aoa.push(r);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Export');

    try {
      XLSX.writeFile(wb, 'measurex-screen-export.xlsx');
    } catch {
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'measurex-screen-export.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    if (getNotificationPrefs().exportReady) showToast('Screen view exported!');
  }, [previewRows, columns, showToast]);

  // ── Export: Full Export (flat dump, all columns, no grouping) ──
  // BUG-A8-011: xlsx loaded via dynamic import
  const handleFullExport = useCallback(async () => {
    const XLSX = await getXLSX();
    const allRows = computeClassificationTotals(
      filteredClassifications,
      filteredPolygons,
      scale,
      scales
    );

    const wb = XLSX.utils.book_new();
    const headers = ['Name', 'Type', 'Area', 'Linear', 'Count', 'Per Page', 'Total', 'Unit'];
    const aoa: (string | number)[][] = [headers];

    for (const row of allRows) {
      aoa.push([
        row.name,
        row.type,
        row.area,
        row.linear,
        row.count,
        row.perPage,
        row.total,
        row.unit,
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Full Export');

    try {
      XLSX.writeFile(wb, 'measurex-full-export.xlsx');
    } catch {
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'measurex-full-export.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    if (getNotificationPrefs().exportReady) showToast('Full export completed!');
  }, [filteredClassifications, filteredPolygons, scale, scales, showToast]);

  // ── Export: Print / PDF ──
  const handlePrintExport = useCallback(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const derivedName = params.get('name');
    const name = derivedName && derivedName.trim().length > 0 ? derivedName : 'Untitled Project';
    const printUrl = `/print?projectId=${projectId}&name=${encodeURIComponent(name)}&page=${currentPage}`;
    window.open(printUrl, '_blank');
    if (getNotificationPrefs().exportReady) showToast('Print view opened in new tab');
  }, [projectId, currentPage, showToast]);

  // ── Export: Contractor Report ──
  const handleContractorReport = useCallback(() => {
    window.open(`/api/projects/${projectId}/export/contractor`, '_blank');
    if (getNotificationPrefs().exportReady) showToast('Contractor report opened in new tab');
  }, [projectId, showToast]);

  // ── Export: JSON ──
  const handleJsonExport = useCallback(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const derivedProjectName = params.get('name');
    const projectName = derivedProjectName && derivedProjectName.trim().length > 0
      ? derivedProjectName
      : null;

    const data = {
      projectId,
      projectName,
      exportedAt: new Date().toISOString(),
      scale: {
        pixelsPerUnit: scale?.pixelsPerUnit ?? null,
        unit: scale?.unit ?? null,
      },
      classifications,
      polygons: polygons.map((poly) => ({
        id: poly.id,
        classificationId: poly.classificationId,
        pageNumber: poly.pageNumber,
        points: poly.points,
        area: poly.area,
        linearFeet: poly.linearFeet,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName || 'project'}-export.json`;
    a.click();
    URL.revokeObjectURL(url);

    if (getNotificationPrefs().exportReady) showToast('JSON export completed!');
  }, [projectId, scale, classifications, polygons, showToast]);

  // ── Export: IFC Stub (JSON) ──
  const handleIfcStubExport = useCallback(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const projectName = params.get('name')?.trim() || 'Untitled Project';

    const ifcSpaces = filteredPolygons.map((poly) => {
      const cls = classifications.find((c) => c.id === poly.classificationId);
      const pageScale = pickScaleForPage(poly.pageNumber, scales, scale);
      const ppu = pageScale?.pixelsPerUnit && pageScale.pixelsPerUnit > 0 ? pageScale.pixelsPerUnit : 1;
      const area = cls?.type === 'area' ? round2(poly.area / (ppu * ppu)) : 0;
      return {
        GlobalId: crypto.randomUUID(),
        Name: poly.label || cls?.name || `Polygon ${poly.id.slice(0, 6)}`,
        area,
        classification: cls?.name || 'Unclassified',
      };
    });

    const data = {
      IFCPROJECT: { GlobalId: crypto.randomUUID(), Name: projectName },
      IFCSITE: { GlobalId: crypto.randomUUID(), Name: 'Site' },
      IFCBUILDING: { GlobalId: crypto.randomUUID(), Name: 'Building' },
      IFCBUILDINGSTOREY: { GlobalId: crypto.randomUUID(), Name: 'Level 1' },
      IFCSPACE: ifcSpaces,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export-ifc-stub.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (getNotificationPrefs().exportReady) showToast('IFC stub exported!');
  }, [filteredPolygons, classifications, scale, scales, showToast]);

  // ── Export: CSV (coordinates) ──
  const handleCsvCoordinatesExport = useCallback(() => {
    const lines = ['polygon_id,polygon_name,classification,point_index,x,y'];

    for (const poly of filteredPolygons) {
      const cls = classifications.find((c) => c.id === poly.classificationId);
      const name = (poly.label || cls?.name || '').replace(/,/g, ' ');
      const classification = (cls?.name || 'Unclassified').replace(/,/g, ' ');
      for (let i = 0; i < poly.points.length; i++) {
        const pt = poly.points[i];
        lines.push(`${poly.id},${name},${classification},${i},${pt.x},${pt.y}`);
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export-coordinates.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (getNotificationPrefs().exportReady) showToast('CSV coordinates exported!');
  }, [filteredPolygons, classifications, showToast]);

  // ── Export: Markdown Report ──
  const handleMarkdownExport = useCallback(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const projectName = params.get('name')?.trim() || 'Untitled Project';
    const date = new Date().toLocaleDateString();

    const summaryRows = previewRows.filter((r) => !r.isGroupHeader);
    const totalPolygons = filteredPolygons.length;
    const totalArea = summaryRows.reduce((sum, r) => sum + r.area, 0);

    // Classification table
    const classTable = summaryRows.map(
      (r) => `| ${r.name} | ${r.count || summaryRows.filter((s) => s.name === r.name).length} | ${r.total} ${r.unit} |`,
    );

    // Polygon list
    const polyList = filteredPolygons.map((poly) => {
      const cls = classifications.find((c) => c.id === poly.classificationId);
      const pageScale = pickScaleForPage(poly.pageNumber, scales, scale);
      const ppu = pageScale?.pixelsPerUnit && pageScale.pixelsPerUnit > 0 ? pageScale.pixelsPerUnit : 1;
      const area = cls?.type === 'area' ? round2(poly.area / (ppu * ppu)) : 0;
      const name = poly.label || cls?.name || `Polygon ${poly.id.slice(0, 6)}`;
      return `- **${name}** — Classification: ${cls?.name || 'Unclassified'}, Area: ${area}`;
    });

    const md = [
      `# MeasureX Takeoff Report`,
      ``,
      `**Project:** ${projectName}`,
      `**Date Generated:** ${date}`,
      ``,
      `## Project Summary`,
      ``,
      `- Total Polygons: ${totalPolygons}`,
      `- Total Area: ${round2(totalArea)}`,
      ``,
      `## Classification Breakdown`,
      ``,
      `| Classification | Count | Total Area |`,
      `| --- | --- | --- |`,
      ...classTable,
      ``,
      `## All Polygons`,
      ``,
      ...polyList,
      ``,
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export-report.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (getNotificationPrefs().exportReady) showToast('Markdown report exported!');
  }, [filteredPolygons, classifications, previewRows, scale, scales, showToast]);

  // ── Visible columns for preview ──
  const visibleColumns = useMemo(() => {
    const cols: { key: keyof PreviewRow; label: string }[] = [];
    if (columns.name) cols.push({ key: 'name', label: 'Name' });
    if (columns.type) cols.push({ key: 'type', label: 'Type' });
    if (columns.area) cols.push({ key: 'area', label: 'Area' });
    if (columns.linear) cols.push({ key: 'linear', label: 'Linear' });
    if (columns.count) cols.push({ key: 'count', label: 'Count' });
    if (columns.perPage) cols.push({ key: 'perPage', label: 'Per Page' });
    if (columns.total) cols.push({ key: 'total', label: 'Total' });
    return cols;
  }, [columns]);

  const groupByOptions: { value: GroupByOption; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'type', label: 'Classification Type' },
    { value: 'drawing', label: 'Drawing' },
    { value: 'group', label: 'Group' },
    { value: 'trade', label: 'Trade' },
  ];

  const pageNumbers = useMemo(() => {
    const nums: number[] = [];
    for (let i = 1; i <= totalPages; i++) nums.push(i);
    return nums;
  }, [totalPages]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-panel-heading"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={focusTrapRef}
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-gray-700 bg-gray-900 text-gray-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            <h2 id="export-panel-heading" className="text-lg font-semibold">Export</h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close export panel"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {/* ── Drawings Section ── */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-300 uppercase tracking-wide">
              Drawings
            </h3>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 rounded bg-gray-800 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-750">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={toggleSelectAll}
                  className="accent-emerald-500"
                />
                All
              </label>
              {pageNumbers.map((pg) => (
                <label
                  key={pg}
                  className="flex items-center gap-1.5 rounded bg-gray-800 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-750"
                >
                  <input
                    type="checkbox"
                    checked={selectedPages.has(pg)}
                    onChange={() => togglePage(pg)}
                    className="accent-emerald-500"
                  />
                  Page {pg}
                </label>
              ))}
            </div>
          </section>

          {/* ── Group By Section ── */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-300 uppercase tracking-wide">
              Group By
            </h3>
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Level 1</span>
                <select
                  value={groupBy1}
                  onChange={(e) => {
                    setGroupBy1(e.target.value as GroupByOption);
                    if (e.target.value === 'none') {
                      setGroupBy2('none');
                      setGroupBy3('none');
                    }
                  }}
                  aria-label="Group by level 1"
                  className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-emerald-500 focus:outline-none"
                >
                  {groupByOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Level 2</span>
                <select
                  value={groupBy2}
                  onChange={(e) => {
                    setGroupBy2(e.target.value as GroupByOption);
                    if (e.target.value === 'none') setGroupBy3('none');
                  }}
                  disabled={groupBy1 === 'none'}
                  aria-label="Group by level 2"
                  className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 disabled:opacity-40 focus:border-emerald-500 focus:outline-none"
                >
                  {groupByOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Level 3</span>
                <select
                  value={groupBy3}
                  onChange={(e) => setGroupBy3(e.target.value as GroupByOption)}
                  disabled={groupBy2 === 'none'}
                  aria-label="Group by level 3"
                  className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 disabled:opacity-40 focus:border-emerald-500 focus:outline-none"
                >
                  {groupByOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* ── Filter Section ── */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-300 uppercase tracking-wide">
              Filter
            </h3>
            <div className="space-y-3">
              {/* Measurement type */}
              <div>
                <span className="mb-1 block text-xs text-gray-400">Measurement Type</span>
                <div className="flex gap-2" role="group" aria-label="Measurement type filter">
                  {(['all', 'area', 'linear', 'count'] as MeasurementFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setMeasurementFilter(f)}
                      aria-pressed={measurementFilter === f}
                      className={`rounded px-3 py-1 text-sm capitalize ${
                        measurementFilter === f
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {f === 'all' ? 'All' : `${f} Only`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Classification filter */}
              <div>
                <span className="mb-1 block text-xs text-gray-400">Classifications</span>
                <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded border border-gray-700 bg-gray-800/50 p-2">
                  {classifications.map((cls) => (
                    <label
                      key={cls.id}
                      className="flex items-center gap-1.5 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedClassificationIds.has(cls.id)}
                        onChange={() => toggleClassificationFilter(cls.id)}
                        className="accent-emerald-500"
                      />
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: cls.color }}
                        aria-hidden="true"
                      />
                      {cls.name}
                    </label>
                  ))}
                  {classifications.length === 0 && (
                    <span className="text-xs text-gray-400">No classifications yet</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── Columns Section ── */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-300 uppercase tracking-wide">
              Columns
            </h3>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ['name', 'Name'],
                  ['type', 'Type'],
                  ['area', 'Area'],
                  ['linear', 'Linear'],
                  ['count', 'Count'],
                  ['perPage', 'Per-Page'],
                  ['total', 'Total'],
                ] as [keyof ColumnVisibility, string][]
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={columns[key]}
                    onChange={() => toggleColumn(key)}
                    className="accent-emerald-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {/* ── Preview Table ── */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-300 uppercase tracking-wide">
              Preview
            </h3>
            <div className="max-h-64 overflow-auto rounded border border-gray-700">
              <table className="w-full text-left text-sm" aria-label="Export preview">
                <thead className="sticky top-0 bg-gray-800 text-xs uppercase text-gray-300">
                  <tr>
                    {visibleColumns.map((col) => (
                      <th key={col.key} className="px-3 py-2 font-medium" scope="col">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {previewRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={visibleColumns.length}
                        className="px-3 py-4 text-center text-gray-400"
                      >
                        No data to preview
                      </td>
                    </tr>
                  )}
                  {previewRows.map((row, i) => (
                    <tr
                      key={row.name ? `${row.name}-${i}` : i}
                      className={
                        row.isGroupHeader
                          ? 'bg-gray-800/80 font-semibold text-emerald-400'
                          : 'hover:bg-gray-800/40'
                      }
                    >
                      {visibleColumns.map((col) => (
                        <td key={col.key} className="px-3 py-1.5">
                          {row.isGroupHeader && col.key !== 'name'
                            ? ''
                            : col.key === 'total'
                              ? `${row[col.key]} ${row.unit}`
                              : String(row[col.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-700 px-6 py-4">
          <button
            onClick={handleScreenViewExport}
            aria-label="Export screen view to Excel"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            Screen View
          </button>
          <button
            onClick={handleFullExport}
            aria-label="Full export to Excel"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Full Export
          </button>
          <button
            onClick={handlePrintExport}
            aria-label="Print blueprint with polygon overlays"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print Blueprint
          </button>
          <button
            onClick={handleContractorReport}
            aria-label="Generate contractor report"
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Open Contractor Report
          </button>
          <button
            onClick={handleJsonExport}
            aria-label="Export to JSON"
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export JSON
          </button>
          <button
            onClick={handleIfcStubExport}
            aria-label="Export IFC stub JSON"
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            IFC Stub (JSON)
          </button>
          <button
            onClick={handleCsvCoordinatesExport}
            aria-label="Export CSV with coordinates"
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            CSV (coordinates)
          </button>
          <button
            onClick={handleMarkdownExport}
            aria-label="Export Markdown report"
            className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Markdown Report
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-lg bg-gray-800 px-4 py-2 text-sm text-emerald-400 shadow-lg border border-gray-700" role="status" aria-live="polite">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
