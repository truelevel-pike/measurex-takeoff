/**
 * Demo project data for first-time users.
 * Provides a realistic pre-filled project with classifications and polygons
 * so new users can explore MeasureX without uploading their own PDF.
 */

import type { ProjectState, Classification, Polygon, ScaleCalibration } from './types';

export const DEMO_PROJECT_KEY = 'mx-demo-project';
export const DEMO_PROJECT_ID = '__demo__';

const classifications: Classification[] = [
  { id: 'cls-demo-01', name: 'Concrete Slab', color: '#3B82F6', type: 'area', visible: true, tradeGroup: 'STRUCTURAL' },
  { id: 'cls-demo-02', name: 'Structural Steel', color: '#EF4444', type: 'linear', visible: true, tradeGroup: 'STRUCTURAL' },
  { id: 'cls-demo-03', name: 'CMU Wall', color: '#F97316', type: 'area', visible: true, tradeGroup: 'STRUCTURAL' },
  { id: 'cls-demo-04', name: 'Exterior Glazing', color: '#06B6D4', type: 'area', visible: true, tradeGroup: 'ARCHITECTURAL' },
  { id: 'cls-demo-05', name: 'Interior Partition', color: '#8B5CF6', type: 'linear', visible: true, tradeGroup: 'ARCHITECTURAL' },
  { id: 'cls-demo-06', name: 'Metal Stud Framing', color: '#EC4899', type: 'linear', visible: true, tradeGroup: 'ARCHITECTURAL' },
  { id: 'cls-demo-07', name: 'Roof Membrane', color: '#10B981', type: 'area', visible: true, tradeGroup: 'ARCHITECTURAL' },
  { id: 'cls-demo-08', name: 'HVAC Ductwork', color: '#EAB308', type: 'linear', visible: true, tradeGroup: 'MECHANICAL' },
  { id: 'cls-demo-09', name: 'Plumbing Runs', color: '#14B8A6', type: 'linear', visible: true, tradeGroup: 'MECHANICAL' },
  { id: 'cls-demo-10', name: 'Electrical Conduit', color: '#6366F1', type: 'linear', visible: true, tradeGroup: 'MECHANICAL' },
  { id: 'cls-demo-11', name: 'Fire Sprinkler Lines', color: '#F43F5E', type: 'linear', visible: true, tradeGroup: 'MECHANICAL' },
  { id: 'cls-demo-12', name: 'Asphalt Paving', color: '#78716C', type: 'area', visible: true, tradeGroup: 'SITEWORK' },
  { id: 'cls-demo-13', name: 'Concrete Curb', color: '#A3A3A3', type: 'linear', visible: true, tradeGroup: 'SITEWORK' },
  { id: 'cls-demo-14', name: 'Landscaping', color: '#22C55E', type: 'area', visible: true, tradeGroup: 'SITEWORK' },
  { id: 'cls-demo-15', name: 'Storm Drain', color: '#0EA5E9', type: 'linear', visible: true, tradeGroup: 'SITEWORK' },
  { id: 'cls-demo-16', name: 'Ceiling Grid', color: '#D946EF', type: 'area', visible: true, tradeGroup: 'ARCHITECTURAL' },
  { id: 'cls-demo-17', name: 'Elevator Shaft', color: '#737373', type: 'count', visible: true, tradeGroup: 'STRUCTURAL' },
  { id: 'cls-demo-18', name: 'Bollard', color: '#CA8A04', type: 'count', visible: true, tradeGroup: 'SITEWORK' },
  { id: 'cls-demo-19', name: 'Fire Hydrant', color: '#DC2626', type: 'count', visible: true, tradeGroup: 'SITEWORK' },
  { id: 'cls-demo-20', name: 'Light Fixture', color: '#FBBF24', type: 'count', visible: true, tradeGroup: 'MECHANICAL' },
];

/** Helper to generate rectangular polygon points */
function rect(x: number, y: number, w: number, h: number) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/** Helper to generate a line (two-point polygon) */
function line(x1: number, y1: number, x2: number, y2: number) {
  return [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ];
}

function len(pts: { x: number; y: number }[]) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function areaOf(pts: { x: number; y: number }[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a / 2);
}

let polyIdx = 0;
function makePoly(classificationId: string, points: { x: number; y: number }[], pageNumber: number, label?: string): Polygon {
  polyIdx++;
  return {
    id: `poly-demo-${String(polyIdx).padStart(3, '0')}`,
    points,
    classificationId,
    pageNumber,
    area: areaOf(points),
    linearFeet: len(points),
    isComplete: true,
    label,
    confidence: 0.85 + Math.random() * 0.14,
    detectedByModel: 'Demo AI',
    createdAt: new Date().toISOString(),
  };
}

// Spread polygons across 7 pages for realism
const polygons: Polygon[] = [
  // Page 1 — Foundation / Slab Plan
  makePoly('cls-demo-01', rect(100, 150, 600, 400), 1, 'Main Slab A'),
  makePoly('cls-demo-01', rect(750, 150, 350, 300), 1, 'Slab B'),
  makePoly('cls-demo-03', rect(95, 145, 610, 10), 1, 'North CMU Wall'),
  makePoly('cls-demo-03', rect(95, 545, 610, 10), 1, 'South CMU Wall'),
  makePoly('cls-demo-17', rect(720, 200, 40, 60), 1, 'Elevator 1'),

  // Page 2 — Structural Steel
  makePoly('cls-demo-02', line(100, 200, 800, 200), 2, 'Beam Grid A'),
  makePoly('cls-demo-02', line(100, 400, 800, 400), 2, 'Beam Grid B'),
  makePoly('cls-demo-02', line(200, 100, 200, 600), 2, 'Column Line 1'),
  makePoly('cls-demo-02', line(500, 100, 500, 600), 2, 'Column Line 2'),
  makePoly('cls-demo-02', line(800, 100, 800, 600), 2, 'Column Line 3'),

  // Page 3 — Architectural Floor Plan
  makePoly('cls-demo-05', line(100, 300, 600, 300), 3, 'Corridor Partition'),
  makePoly('cls-demo-05', line(350, 100, 350, 550), 3, 'Office Divider'),
  makePoly('cls-demo-06', line(100, 150, 600, 150), 3, 'Stud Wall North'),
  makePoly('cls-demo-04', rect(100, 100, 200, 10), 3, 'Window Wall West'),
  makePoly('cls-demo-04', rect(600, 100, 10, 450), 3, 'Curtain Wall East'),
  makePoly('cls-demo-16', rect(120, 160, 220, 130), 3, 'ACT Ceiling Office 101'),

  // Page 4 — Mechanical Plan
  makePoly('cls-demo-08', line(100, 200, 500, 200), 4, 'Supply Duct Main'),
  makePoly('cls-demo-08', line(500, 200, 500, 500), 4, 'Supply Duct Branch'),
  makePoly('cls-demo-09', line(150, 100, 150, 550), 4, 'Hot Water Supply'),
  makePoly('cls-demo-09', line(180, 100, 180, 550), 4, 'Cold Water Supply'),
  makePoly('cls-demo-10', line(250, 100, 700, 100), 4, 'Main Conduit Run'),
  makePoly('cls-demo-11', line(100, 350, 800, 350), 4, 'Sprinkler Main'),
  makePoly('cls-demo-20', rect(200, 180, 10, 10), 4, 'Light Fixture A'),
  makePoly('cls-demo-20', rect(400, 180, 10, 10), 4, 'Light Fixture B'),
  makePoly('cls-demo-20', rect(600, 180, 10, 10), 4, 'Light Fixture C'),

  // Page 5 — Roof Plan
  makePoly('cls-demo-07', rect(80, 80, 900, 550), 5, 'TPO Roof Membrane'),
  makePoly('cls-demo-08', line(200, 300, 800, 300), 5, 'Roof Duct Penetration'),

  // Page 6 — Site Plan
  makePoly('cls-demo-12', rect(50, 400, 950, 200), 6, 'Parking Lot'),
  makePoly('cls-demo-13', line(50, 400, 1000, 400), 6, 'Concrete Curb North'),
  makePoly('cls-demo-13', line(50, 600, 1000, 600), 6, 'Concrete Curb South'),
  makePoly('cls-demo-14', rect(50, 50, 300, 300), 6, 'Landscape Area A'),
  makePoly('cls-demo-14', rect(700, 50, 300, 300), 6, 'Landscape Area B'),
  makePoly('cls-demo-15', line(500, 50, 500, 600), 6, 'Storm Drain Line'),
  makePoly('cls-demo-18', rect(100, 395, 8, 8), 6, 'Bollard 1'),
  makePoly('cls-demo-18', rect(300, 395, 8, 8), 6, 'Bollard 2'),
  makePoly('cls-demo-18', rect(500, 395, 8, 8), 6, 'Bollard 3'),
  makePoly('cls-demo-19', rect(900, 350, 12, 12), 6, 'Fire Hydrant'),

  // Page 7 — Detail / Sections
  makePoly('cls-demo-01', rect(100, 200, 400, 50), 7, 'Footing Detail'),
  makePoly('cls-demo-03', rect(100, 100, 20, 200), 7, 'CMU Section'),
  makePoly('cls-demo-06', line(550, 100, 550, 400), 7, 'Stud Detail'),
];

const scale: ScaleCalibration = {
  pixelsPerUnit: 12.5,
  unit: 'ft',
  label: '1" = 20\'-0"',
  source: 'ai',
  confidence: 0.92,
  pageNumber: 1,
};

const scales: Record<number, ScaleCalibration> = {};
for (let i = 1; i <= 7; i++) {
  scales[i] = { ...scale, pageNumber: i };
}

export const DEMO_PROJECT_STATE: ProjectState = {
  classifications,
  polygons,
  annotations: [],
  scale,
  scales,
  currentPage: 1,
  totalPages: 7,
};

export const DEMO_PROJECT_META = {
  id: DEMO_PROJECT_ID,
  name: 'Kirkland Office Complex — Demo',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/** Save demo project to localStorage */
export function saveDemoProject(): void {
  localStorage.setItem(DEMO_PROJECT_KEY, JSON.stringify({
    meta: DEMO_PROJECT_META,
    state: DEMO_PROJECT_STATE,
  }));
}

/** Load demo project from localStorage */
export function loadDemoProject(): { meta: typeof DEMO_PROJECT_META; state: ProjectState } | null {
  try {
    const raw = localStorage.getItem(DEMO_PROJECT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Check if a project ID is the demo project */
export function isDemoProject(projectId: string | null): boolean {
  return projectId === DEMO_PROJECT_ID;
}
