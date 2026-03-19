"use client";

import { useState, useRef, useCallback } from "react";
import type { UnitCostMap } from "@/types/estimates";
import { loadUnitCosts, updateUnitCost } from "@/lib/estimate-storage";

interface EstimatesTabProps {
  projectId: string;
  classifications: Array<{
    id: string;
    name: string;
    color: string;
    type: "area" | "linear" | "count";
    unit: string;
  }>;
  quantities: Record<string, number>;
}

const defaultUnit: Record<string, string> = {
  area: "SF",
  linear: "LF",
  count: "EA",
};

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function EstimatesTab({
  projectId,
  classifications,
  quantities,
}: EstimatesTabProps) {
  const [loadedProjectId, setLoadedProjectId] = useState(projectId);
  const [unitCosts, setUnitCosts] = useState<UnitCostMap>(() => loadUnitCosts(projectId));
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  if (loadedProjectId !== projectId) {
    setLoadedProjectId(projectId);
    setUnitCosts(loadUnitCosts(projectId));
  }

  const handleCostChange = useCallback(
    (classificationId: string, classificationName: string, unit: string, value: number) => {
      if (debounceTimers.current[classificationId]) {
        clearTimeout(debounceTimers.current[classificationId]);
      }
      debounceTimers.current[classificationId] = setTimeout(() => {
        const updated = updateUnitCost(projectId, classificationId, {
          classificationId,
          classificationName,
          unit: unit as "SF" | "LF" | "EA",
          costPerUnit: value,
        });
        setUnitCosts(updated);
      }, 300);

      // Optimistic local update
      setUnitCosts((prev) => ({
        ...prev,
        [classificationId]: {
          ...prev[classificationId],
          classificationId,
          classificationName,
          unit: unit as "SF" | "LF" | "EA",
          costPerUnit: value,
        },
      }));
    },
    [projectId],
  );

  if (classifications.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
        No classifications defined. Add classifications to generate estimates.
      </div>
    );
  }

  const rows = classifications.map((c) => {
    const qty = quantities[c.id] ?? 0;
    const unit = c.unit || defaultUnit[c.type] || "EA";
    const costPerUnit = unitCosts[c.id]?.costPerUnit ?? 0;
    const subtotal = qty * costPerUnit;
    return { ...c, qty, unit, costPerUnit, subtotal };
  });
  const grandTotal = rows.reduce((sum, r) => sum + r.subtotal, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
            <th className="py-2 px-3">Classification</th>
            <th className="py-2 px-3 text-right">Quantity</th>
            <th className="py-2 px-3">Unit</th>
            <th className="py-2 px-3 text-right">Unit Cost</th>
            <th className="py-2 px-3 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-800/50">
              <td className="py-2 px-3 flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: row.color }}
                />
                <span className="text-gray-200">{row.name}</span>
              </td>
              <td className="py-2 px-3 text-right text-gray-300 tabular-nums">
                {row.qty.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </td>
              <td className="py-2 px-3 text-gray-400">{row.unit}</td>
              <td className="py-2 px-3 text-right">
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  defaultValue={row.costPerUnit || ""}
                  onChange={(e) =>
                    handleCostChange(
                      row.id,
                      row.name,
                      row.unit,
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-right text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="$0.00"
                />
              </td>
              <td className="py-2 px-3 text-right text-gray-200 tabular-nums">
                {currencyFmt.format(row.subtotal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-600 font-semibold">
            <td colSpan={4} className="py-3 px-3 text-right text-gray-300">
              Grand Total
            </td>
            <td className="py-3 px-3 text-right text-white tabular-nums">
              {currencyFmt.format(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
