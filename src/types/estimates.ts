export interface UnitCost {
  classificationId: string;
  classificationName: string;
  unit: "SF" | "LF" | "EA" | "CY" | "SY" | "TON" | "GAL" | "HR" | "LS";
  costPerUnit: number;
}

export interface EstimateLine {
  classificationId: string;
  classificationName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  subtotal: number;
}

export interface EstimateSummary {
  lines: EstimateLine[];
  grandTotal: number;
  projectId: string;
  generatedAt: string;
}

export type UnitCostMap = Record<string, UnitCost>;
