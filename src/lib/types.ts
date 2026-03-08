export interface Point { x: number; y: number }

export interface Polygon {
  id: string;
  points: Point[];
  classificationId: string;
  pageNumber: number;
  area: number; // pixels; convert to real units via scale when displaying
  linearFeet: number;
  isComplete: boolean;
  label?: string;
}

export interface Classification {
  id: string;
  name: string;
  color: string; // hex color
  type: 'area' | 'linear' | 'count';
  visible: boolean;
}

export interface ScaleCalibration {
  pixelsPerUnit: number;
  unit: 'ft' | 'in' | 'm' | 'mm';
  label: string;
  source: 'manual' | 'auto' | 'ai';
  confidence?: number;
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
  points: Point[];
  color?: string;
  confidence?: number;
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
