"use client";

import { useState, useEffect } from "react";

interface EstimatesTabProps {
  projectId: string;
  classifications: Array<{
    id: string;
    name: string;
    color: string;
    type: "area" | "linear" | "count";
    unit?: string;
  }>;
  quantities: Record<string, number>;
}

interface AssemblyRow {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  quantityFormula: string;
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
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);

    fetch(`/api/projects/${projectId}/assemblies`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled && Array.isArray(data.assemblies)) {
          setAssemblies(data.assemblies);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error("Failed to fetch assemblies:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
        Loading estimates…
      </div>
    );
  }

  if (classifications.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
        No classifications defined. Add classifications to generate estimates.
      </div>
    );
  }

  // Build a map: classification type → first matching assembly
  const assemblyByType: Record<string, AssemblyRow | undefined> = {};
  for (const a of assemblies) {
    if (!assemblyByType[a.quantityFormula]) {
      assemblyByType[a.quantityFormula] = a;
    }
  }

  const rows = classifications.map((c) => {
    const qty = quantities[c.id] ?? 0;
    const unit = c.unit || defaultUnit[c.type] || "EA";
    const matchedAssembly = assemblyByType[c.type];
    const costPerUnit = matchedAssembly?.unitCost ?? 0;
    const subtotal = qty * costPerUnit;
    return { ...c, qty, unit, assemblyName: matchedAssembly?.name, costPerUnit, subtotal };
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
            <th className="py-2 px-3">Assembly</th>
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
              <td className="py-2 px-3 text-gray-400 text-xs">
                {row.assemblyName ?? "—"}
              </td>
              <td className="py-2 px-3 text-right text-gray-300 tabular-nums">
                {currencyFmt.format(row.costPerUnit)}
              </td>
              <td className="py-2 px-3 text-right text-gray-200 tabular-nums">
                {currencyFmt.format(row.subtotal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-600 font-semibold">
            <td colSpan={5} className="py-3 px-3 text-right text-gray-300">
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
