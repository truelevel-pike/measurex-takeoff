"use client";

import { useState, useEffect, useCallback } from "react";

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
  // BUG-PIKE-009 fix: classificationId needed for per-classification cost matching
  classificationId?: string;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftCost, setDraftCost] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);

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

  const startEdit = useCallback((assembly: AssemblyRow) => {
    setEditingId(assembly.id);
    setDraftCost(String(assembly.unitCost));
  }, []);

  const commitEdit = useCallback(async (assembly: AssemblyRow) => {
    const parsed = parseFloat(draftCost);
    const newCost = isNaN(parsed) ? assembly.unitCost : Math.max(0, parsed);

    setEditingId(null);
    setDraftCost("");

    if (newCost === assembly.unitCost) return;

    setSavingId(assembly.id);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/assemblies/${assembly.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitCost: newCost }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setAssemblies((prev) =>
          prev.map((a) =>
            a.id === assembly.id
              ? { ...a, unitCost: data.assembly?.unitCost ?? newCost }
              : a
          )
        );
      } else {
        console.error("Failed to update unit cost:", await res.text());
      }
    } catch (err) {
      console.error("Error patching unit cost:", err);
    } finally {
      setSavingId(null);
    }
  }, [draftCost, projectId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, assembly: AssemblyRow) => {
      if (e.key === "Enter") {
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        setEditingId(null);
        setDraftCost("");
      }
    },
    []
  );

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

  // BUG-PIKE-009 fix: match assemblies by classificationId first (exact match),
  // then fall back to quantityFormula/type for unlinked classifications.
  // The previous code keyed by quantityFormula which meant all "area" classifications
  // shared the same assembly — ignoring per-classification unit cost assignments.
  const assemblyByClassId = new Map<string, AssemblyRow>();
  const assemblyByFormula = new Map<string, AssemblyRow>();
  for (const a of assemblies) {
    if (a.classificationId) {
      assemblyByClassId.set(a.classificationId, a);
    }
    // Keep first-seen per formula as fallback
    if (!assemblyByFormula.has(a.quantityFormula)) {
      assemblyByFormula.set(a.quantityFormula, a);
    }
  }

  const rows = classifications.map((c) => {
    const qty = quantities[c.id] ?? 0;
    const unit = c.unit || defaultUnit[c.type] || "EA";
    // Prefer exact classificationId match; fall back to formula/type match
    const matchedAssembly =
      assemblyByClassId.get(c.id) ??
      assemblyByFormula.get(c.type) ??
      undefined;
    const costPerUnit = matchedAssembly?.unitCost ?? 0;
    const subtotal = qty * costPerUnit;
    return { ...c, qty, unit, assembly: matchedAssembly, costPerUnit, subtotal };
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
                {row.assembly?.name ?? "—"}
              </td>
              <td className="py-2 px-3 text-right tabular-nums">
                {row.assembly ? (
                  editingId === row.assembly.id ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-24 text-right bg-gray-900 border border-[#00d4ff]/40 rounded px-1 py-0.5 text-gray-100 text-sm tabular-nums focus:outline-none focus:border-[#00d4ff]"
                      value={draftCost}
                      autoFocus
                      onChange={(e) => setDraftCost(e.target.value)}
                      onBlur={() => commitEdit(row.assembly!)}
                      onKeyDown={(e) => handleKeyDown(e, row.assembly!)}
                    />
                  ) : (
                    <button
                      type="button"
                      title="Click to edit unit cost"
                      onClick={() => startEdit(row.assembly!)}
                      className={`text-gray-300 hover:text-white hover:underline decoration-dotted cursor-pointer tabular-nums transition-opacity ${savingId === row.assembly.id ? "opacity-50" : ""}`}
                    >
                      {savingId === row.assembly.id ? "saving…" : currencyFmt.format(row.costPerUnit)}
                    </button>
                  )
                ) : (
                  <span className="text-gray-600">—</span>
                )}
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
