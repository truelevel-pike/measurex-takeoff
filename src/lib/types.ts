export interface Point { x: number; y: number }

export interface Polygon {
  id: string;
  points: Point[];
  classificationId: string;
  pageNumber: number;
  area: number;       // raw pixel area (stored as area_pixels in DB)
  linearFeet: number; // raw pixel length (stored as linear_pixels in DB)
  isComplete: boolean;
  label?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Classification {
  id: string;
  name: string;
  color: string; // hex color
  type: 'area' | 'linear' | 'count';
  visible: boolean;
  formula?: string;
  formulaUnit?: string;
  formulaSavedToLibrary?: boolean;
}

export interface ScaleCalibration {
  pixelsPerUnit: number;
  unit: 'ft' | 'in' | 'm' | 'mm';
  label: string;
  source: 'manual' | 'auto' | 'ai';
  confidence?: number;
  pageNumber?: number;
}

export interface ProjectState {
  classifications: Classification[];
  polygons: Polygon[];
  scale: ScaleCalibration | null;
  scales: Record<number, ScaleCalibration>; // per-page scales
  currentPage: number;
  totalPages: number;
}

export interface DetectedElement {
  name: string;
  type: 'area' | 'linear' | 'count';
  classification?: string;
  points: Point[];
  color?: string;
  confidence?: number;
}

export interface Material {
  id: string;
  name: string;
  unitCost: number;
  wasteFactor: number;
  coverageRate: number;
  unit: string;
  formula?: string;
}

export interface Assembly {
  id: string;
  name: string;
  classificationId: string;
  materials: Material[];
  isLibrary: boolean;
}

export interface ClassificationBreakdown {
  id: string;
  name: string;
  classificationIds: string[];
}

export interface ClassificationGroup {
  id: string;
  name: string;
  color: string;
  classificationIds: string[];
  breakdowns: ClassificationBreakdown[];
}

export interface Markup {
  id: string;
  type: "text" | "arrow" | "cloud" | "dimension" | "highlight" | "freehand";
  points: { x: number; y: number }[];
  text?: string;
  color: string;
  strokeWidth: number;
  pageNumber: number;
}

export interface DrawingSet {
  id: string;
  name: string;
  projectId: string;
  drawings: Drawing[];
  createdAt: string;
}

export interface Drawing {
  id: string;
  name: string;
  setId: string;
  pageCount: number;
  thumbnailUrl?: string;
  uploadedAt: string;
  sheetNumber?: string;
}

export interface PDFViewerHandle {
  containerEl: HTMLDivElement | null;
  zoom: number;
  pan: Point;
  pageDimensions: { width: number; height: number };
  goToPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  fitToPage: () => void;
  getPageCanvas: () => HTMLCanvasElement | null;
}
