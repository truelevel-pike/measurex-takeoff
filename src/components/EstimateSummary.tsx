'use client';

import React, { useEffect, useMemo } from 'react';
import { Download } from 'lucide-react';
import { useStore } from '@/lib/store';
import { calculatePolygonArea } from '@/lib/polygon-utils';
import type { Assembly, Classification } from '@/lib/types';

interface AssemblyRow {
  id: string;
  name: string;
  classificationId?: string;
  materials?: Array<{ id: string; name: string; unitCost: number; wasteFactor: number; coverageRate: number; unit: string }>;
  unitCost?: number;
  unit?: string;
}

interface EstimateSummaryProps {
  onSwitchToQuantities: () => void;
  onSwitchToAssemblies: () => void;
}

interface ClassQuantity {
  count: number;
  areaReal: number;
  lengthReal: number;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EstimateSummary({ onSwitchToQuantities, onSwitchToAssemblies }: EstimateSummaryProps) {
  const projectId = useStore((s) => s.projectId);
  const assemblies = useStore((s) => s.assemblies);
  const setAssemblies = useStore((s) => s.setAssemblies);
  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);

  // Fetch assemblies from API when this tab mounts (in case AssembliesPanel hasn't loaded them yet)
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/assemblies`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.assemblies)) return;
        const mapped: Assembly[] = data.assemblies.map((row: AssemblyRow) => ({
          id: row.id,
          name: row.name,
          classificationId: row.classificationId ?? '',
          isLibrary: false,
          materials: row.materials ?? [
            {
              id: row.id,
              name: row.name,
              unitCost: row.unitCost ?? 0,
              wasteFactor: 0,
              coverageRate: 0,
              unit: row.unit ?? 'SF',
            },
          ],
        }));
        setAssemblies(mapped);
      })
      .catch((err) => {
        if (!cancelled) console.error('EstimateSummary: failed to fetch assemblies:', err);
      });
    return () => { cancelled = true; };
  }, [projectId, setAssemblies]);

  const ppu = scale?.pixelsPerUnit || 1;

  // Compute quantities per classification
  const quantitiesByClass = useMemo(() => {
    const map: Record<string, ClassQuantity> = {};
    for (const cls of classifications) {
      const classPolygons = polygons.filter((p) => p.classificationId === cls.id && p.isComplete);
      let areaReal = 0;
      let lengthReal = 0;
      for (const p of classPolygons) {
        if (cls.type === 'area') {
          const areaPixels = calculatePolygonArea(p.points);
          areaReal += areaPixels / (ppu * ppu);
        } else if (cls.type === 'linear') {
          let perimPixels = 0;
          for (let i = 1; i < p.points.length; i++) {
            const dx = p.points[i].x - p.points[i - 1].x;
            const dy = p.points[i].y - p.points[i - 1].y;
            perimPixels += Math.sqrt(dx * dx + dy * dy);
          }
          lengthReal += perimPixels / ppu;
        }
      }
      map[cls.id] = { count: classPolygons.length, areaReal, lengthReal };
    }
    return map;
  }, [classifications, polygons, ppu]);

  function unitLabel(cls: Classification): string {
    if (cls.type === 'area') return 'SF';
    if (cls.type === 'linear') return 'FT';
    return 'EA';
  }

  function assemblyUnitCost(assembly: Assembly): number {
    return assembly.materials.reduce((sum, m) => sum + m.unitCost, 0);
  }

  // Group assemblies by classification, only classifications that have assemblies
  const classificationSections = useMemo(() => {
    function getQuantity(cls: Classification): number {
      const q = quantitiesByClass[cls.id];
      if (!q) return 0;
      if (cls.type === 'area') return q.areaReal;
      if (cls.type === 'linear') return q.lengthReal;
      return q.count;
    }
    const classIds = new Set(assemblies.map((a) => a.classificationId));
    return classifications
      .filter((cls) => classIds.has(cls.id))
      .map((cls) => {
        const clsAssemblies = assemblies.filter((a) => a.classificationId === cls.id);
        const qty = getQuantity(cls);
        const subtotal = clsAssemblies.reduce((sum, a) => sum + assemblyUnitCost(a) * qty, 0);
        return { cls, assemblies: clsAssemblies, quantity: qty, subtotal };
      });
  }, [classifications, assemblies, quantitiesByClass]);

  const grandTotal = useMemo(
    () => classificationSections.reduce((sum, s) => sum + s.subtotal, 0),
    [classificationSections]
  );

  function handleExport() {
    if (projectId) {
      window.open(`/api/projects/${projectId}/export/json`, '_blank');
    }
  }

  return (
    <aside
      className="bg-[rgba(18,18,26,0.8)] md:w-[240px] lg:w-72 shrink-0 h-full flex flex-col border-l border-[#00d4ff]/20 text-[13px]"
      aria-label="Estimate summary panel"
    >
      {/* Tab bar */}
      <div className="flex border-b border-[#00d4ff]/20 bg-[rgba(10,10,15,0.6)]">
        <button
          type="button"
          onClick={onSwitchToQuantities}
          className="flex-1 px-2 py-2 text-xs font-mono tracking-wider text-[#8892a0] hover:text-[#e5e7eb]"
        >
          Quantities
        </button>
        <button
          type="button"
          onClick={onSwitchToAssemblies}
          className="flex-1 px-2 py-2 text-xs font-mono tracking-wider text-[#8892a0] hover:text-[#e5e7eb]"
        >
          Assemblies
        </button>
        <button
          type="button"
          className="flex-1 px-2 py-2 text-xs font-mono tracking-wider text-[#00d4ff] border-b-2 border-[#00d4ff]"
        >
          Estimate
        </button>
      </div>

      {/* Header */}
      <div className="px-3 py-2 border-b border-[#00d4ff]/20 bg-[rgba(10,10,15,0.6)] flex items-center justify-between">
        <span className="font-mono tracking-wider text-sm text-[#e5e7eb]">ESTIMATE SUMMARY</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-emerald-400 font-semibold">
            ${formatCurrency(grandTotal)}
          </span>
          {projectId && (
            <button
              type="button"
              onClick={handleExport}
              className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Export estimate"
              title="Export"
            >
              <Download size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Classification sections */}
      <div className="flex-1 overflow-y-auto px-1">
        {classificationSections.length === 0 && (
          <div className="text-center text-xs py-8 text-[#8892a0]">
            No assemblies assigned to classifications yet.
            <br />
            <button
              type="button"
              onClick={onSwitchToAssemblies}
              className="text-[#00d4ff] hover:underline mt-2 inline-block"
            >
              Add assemblies
            </button>
          </div>
        )}

        {classificationSections.map(({ cls, assemblies: clsAssemblies, quantity, subtotal }) => (
          <div key={cls.id} className="mb-2">
            {/* Classification header */}
            <div className="flex items-center gap-1.5 px-1.5 py-1.5 bg-[#0e1016] rounded-t border-b border-[#00d4ff]/10">
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: cls.color }}
              />
              <span className="flex-1 font-medium text-[12px] text-[#e5e7eb] truncate">
                {cls.name}
              </span>
              <span className="text-[10px] font-mono text-[#8892a0]">
                {cls.type.toUpperCase()}
              </span>
              <span className="text-[10px] font-mono text-[#8892a0]">
                {quantity.toFixed(2)} {unitLabel(cls)}
              </span>
            </div>

            {/* Assembly line items */}
            <div className="border-l border-[#00d4ff]/20 ml-2 pl-2">
              {clsAssemblies.map((assembly) => {
                const uc = assemblyUnitCost(assembly);
                const lineTotal = uc * quantity;
                return (
                  <div
                    key={assembly.id}
                    className="flex items-center justify-between py-1 text-[11px] text-[#d1d5db] gap-2"
                  >
                    <span className="truncate flex-1">{assembly.name}</span>
                    <span className="font-mono text-[#8892a0] whitespace-nowrap">
                      ${uc.toFixed(2)} x {quantity.toFixed(1)}
                    </span>
                    <span className="font-mono text-[#e5e7eb] whitespace-nowrap min-w-[60px] text-right">
                      ${formatCurrency(lineTotal)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Classification subtotal */}
            <div className="flex items-center justify-between px-1.5 py-1 bg-[#0e1016]/60 rounded-b text-[11px]">
              <span className="text-[#8892a0] font-mono">Subtotal</span>
              <span className="font-mono text-emerald-400 font-semibold">
                ${formatCurrency(subtotal)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Grand total */}
      {classificationSections.length > 0 && (
        <div className="px-3 py-2 border-t border-[#00d4ff]/20 bg-[rgba(10,10,15,0.6)] flex items-center justify-between">
          <span className="text-xs text-[#8892a0] font-mono">GRAND TOTAL</span>
          <span className="text-sm font-mono text-emerald-400 font-semibold">
            ${formatCurrency(grandTotal)}
          </span>
        </div>
      )}
    </aside>
  );
}
