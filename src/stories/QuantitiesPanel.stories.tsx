import React, { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import QuantitiesPanel from '../components/QuantitiesPanel';
import { useStore } from '../lib/store';
import type { Classification, Polygon } from '../lib/types';

/**
 * QuantitiesPanel — classification list with area/linear/count totals.
 * Stories mock the Zustand store via a decorator that hydrates state before render.
 */

/* ------------------------------------------------------------------ */
/*  Mock data                                                         */
/* ------------------------------------------------------------------ */

const mockClassifications: Classification[] = [
  { id: 'c1', name: 'Concrete Slab', color: '#3b82f6', type: 'area', visible: true },
  { id: 'c2', name: 'Interior Wall', color: '#ef4444', type: 'linear', visible: true },
  { id: 'c3', name: 'Electrical Outlets', color: '#22c55e', type: 'count', visible: true },
];

const mockPolygons: Polygon[] = [
  {
    id: 'p1',
    classificationId: 'c1',
    pageNumber: 1,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    area: 8000,
    linearFeet: 360,
    isComplete: true,
    label: 'East slab',
  },
  {
    id: 'p2',
    classificationId: 'c1',
    pageNumber: 1,
    points: [
      { x: 120, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 60 },
      { x: 120, y: 60 },
    ],
    area: 4800,
    linearFeet: 280,
    isComplete: true,
    label: 'West slab',
  },
  {
    id: 'p3',
    classificationId: 'c2',
    pageNumber: 1,
    points: [
      { x: 10, y: 10 },
      { x: 200, y: 10 },
    ],
    area: 0,
    linearFeet: 190,
    isComplete: true,
    label: 'Perimeter run',
  },
  {
    id: 'p4',
    classificationId: 'c3',
    pageNumber: 1,
    points: [{ x: 50, y: 50 }],
    area: 0,
    linearFeet: 0,
    isComplete: true,
    label: 'Outlet A',
  },
  {
    id: 'p5',
    classificationId: 'c3',
    pageNumber: 2,
    points: [{ x: 150, y: 80 }],
    area: 0,
    linearFeet: 0,
    isComplete: true,
    label: 'Outlet B',
  },
];

/* ------------------------------------------------------------------ */
/*  Store harness                                                     */
/* ------------------------------------------------------------------ */

function StoreHarness({
  classifications,
  polygons,
}: {
  classifications: Classification[];
  polygons: Polygon[];
}) {
  useEffect(() => {
    useStore.setState({
      classifications,
      polygons,
      scale: { pixelsPerUnit: 10, unit: 'ft', label: '1/4" = 1\'', source: 'manual' },
      showQuantitiesDrawer: true,
      selectedClassification: classifications[0]?.id ?? null,
      currentPage: 1,
      totalPages: 3,
    });

    return () => {
      useStore.setState({
        classifications: [],
        polygons: [],
        selectedClassification: null,
        showQuantitiesDrawer: false,
      });
    };
  }, [classifications, polygons]);

  return (
    <div style={{ minHeight: '80vh', position: 'relative' }}>
      <QuantitiesPanel />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Meta                                                              */
/* ------------------------------------------------------------------ */

const meta = {
  title: 'Panels/QuantitiesPanel',
  component: StoreHarness,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    classifications: { control: false },
    polygons: { control: false },
  },
} satisfies Meta<typeof StoreHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/*  Stories                                                           */
/* ------------------------------------------------------------------ */

/** Empty state — no classifications, no polygons. */
export const Empty: Story = {
  args: {
    classifications: [],
    polygons: [],
  },
};

/** Loaded state — 3 classifications with polygon data and area/linear/count measurements. */
export const Loaded: Story = {
  args: {
    classifications: mockClassifications,
    polygons: mockPolygons,
  },
};

/* ------------------------------------------------------------------ */
/*  GroupedByTrade mock data                                          */
/* ------------------------------------------------------------------ */

const tradeClassifications: Classification[] = [
  // Structural
  { id: 'tc1', name: 'Concrete Foundation', color: '#3b82f6', type: 'area', visible: true, tradeGroup: 'STRUCTURAL' },
  { id: 'tc2', name: 'Steel Beams', color: '#60a5fa', type: 'linear', visible: true, tradeGroup: 'STRUCTURAL' },
  { id: 'tc3', name: 'Rebar', color: '#1d4ed8', type: 'count', visible: true, tradeGroup: 'STRUCTURAL' },
  // Mechanical
  { id: 'tc4', name: 'HVAC Ductwork', color: '#f97316', type: 'area', visible: true, tradeGroup: 'MECHANICAL' },
  { id: 'tc5', name: 'Piping Run', color: '#ea580c', type: 'linear', visible: true, tradeGroup: 'MECHANICAL' },
  // Architectural
  { id: 'tc6', name: 'Drywall Partition', color: '#22c55e', type: 'area', visible: true, tradeGroup: 'ARCHITECTURAL' },
  { id: 'tc7', name: 'Door Opening', color: '#16a34a', type: 'count', visible: true, tradeGroup: 'ARCHITECTURAL' },
  { id: 'tc8', name: 'Window Frame', color: '#4ade80', type: 'linear', visible: true, tradeGroup: 'ARCHITECTURAL' },
  // Sitework
  { id: 'tc9', name: 'Asphalt Paving', color: '#8b5cf6', type: 'area', visible: true, tradeGroup: 'SITEWORK' },
  { id: 'tc10', name: 'Curb & Gutter', color: '#a78bfa', type: 'linear', visible: true, tradeGroup: 'SITEWORK' },
  { id: 'tc11', name: 'Bollard', color: '#6d28d9', type: 'count', visible: true, tradeGroup: 'SITEWORK' },
];

const tradePolygons: Polygon[] = [
  { id: 'tp1', classificationId: 'tc1', pageNumber: 1, points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }, { x: 0, y: 150 }], area: 30000, linearFeet: 700, isComplete: true, label: 'Foundation A', confidence: 0.92 },
  { id: 'tp2', classificationId: 'tc1', pageNumber: 1, points: [{ x: 220, y: 0 }, { x: 350, y: 0 }, { x: 350, y: 100 }, { x: 220, y: 100 }], area: 13000, linearFeet: 460, isComplete: true, label: 'Foundation B', confidence: 0.88 },
  { id: 'tp3', classificationId: 'tc2', pageNumber: 1, points: [{ x: 10, y: 200 }, { x: 300, y: 200 }], area: 0, linearFeet: 290, isComplete: true, label: 'Beam W12x26' },
  { id: 'tp4', classificationId: 'tc3', pageNumber: 1, points: [{ x: 50, y: 50 }], area: 0, linearFeet: 0, isComplete: true, label: 'Rebar #4' },
  { id: 'tp5', classificationId: 'tc3', pageNumber: 1, points: [{ x: 100, y: 50 }], area: 0, linearFeet: 0, isComplete: true, label: 'Rebar #5' },
  { id: 'tp6', classificationId: 'tc4', pageNumber: 1, points: [{ x: 0, y: 300 }, { x: 180, y: 300 }, { x: 180, y: 380 }, { x: 0, y: 380 }], area: 14400, linearFeet: 520, isComplete: true, label: 'Supply Duct' },
  { id: 'tp7', classificationId: 'tc5', pageNumber: 1, points: [{ x: 200, y: 300 }, { x: 400, y: 350 }], area: 0, linearFeet: 206, isComplete: true, label: 'CW Pipe' },
  { id: 'tp8', classificationId: 'tc6', pageNumber: 1, points: [{ x: 0, y: 400 }, { x: 250, y: 400 }, { x: 250, y: 500 }, { x: 0, y: 500 }], area: 25000, linearFeet: 700, isComplete: true, label: 'Partition Wall' },
  { id: 'tp9', classificationId: 'tc7', pageNumber: 1, points: [{ x: 125, y: 450 }], area: 0, linearFeet: 0, isComplete: true, label: 'Door D-101' },
  { id: 'tp10', classificationId: 'tc7', pageNumber: 1, points: [{ x: 200, y: 450 }], area: 0, linearFeet: 0, isComplete: true, label: 'Door D-102' },
  { id: 'tp11', classificationId: 'tc8', pageNumber: 1, points: [{ x: 50, y: 500 }, { x: 150, y: 500 }], area: 0, linearFeet: 100, isComplete: true, label: 'Window W-1' },
  { id: 'tp12', classificationId: 'tc9', pageNumber: 1, points: [{ x: 0, y: 550 }, { x: 300, y: 550 }, { x: 300, y: 700 }, { x: 0, y: 700 }], area: 45000, linearFeet: 900, isComplete: true, label: 'Parking Lot' },
  { id: 'tp13', classificationId: 'tc10', pageNumber: 1, points: [{ x: 0, y: 700 }, { x: 300, y: 700 }], area: 0, linearFeet: 300, isComplete: true, label: 'Curb North' },
  { id: 'tp14', classificationId: 'tc11', pageNumber: 1, points: [{ x: 50, y: 680 }], area: 0, linearFeet: 0, isComplete: true, label: 'Bollard B-1' },
  { id: 'tp15', classificationId: 'tc11', pageNumber: 1, points: [{ x: 100, y: 680 }], area: 0, linearFeet: 0, isComplete: true, label: 'Bollard B-2' },
  { id: 'tp16', classificationId: 'tc11', pageNumber: 1, points: [{ x: 150, y: 680 }], area: 0, linearFeet: 0, isComplete: true, label: 'Bollard B-3' },
];

/** Grouped by Trade — 11 classifications across structural, mechanical, architectural, sitework groups. */
export const GroupedByTrade: Story = {
  args: {
    classifications: tradeClassifications,
    polygons: tradePolygons,
  },
  render: (args) => {
    useEffect(() => {
      localStorage.setItem('measurex_group_by_trade', 'true');
      return () => {
        localStorage.removeItem('measurex_group_by_trade');
      };
    }, []);
    return <StoreHarness {...args} />;
  },
};

/** Loading state — skeleton placeholder that resolves after 2 seconds. */
export const Loading: Story = {
  args: {
    classifications: [],
    polygons: [],
  },
  render: () => {
    const [ready, setReady] = useState(false);

    useEffect(() => {
      const t = setTimeout(() => setReady(true), 2000);
      return () => clearTimeout(t);
    }, []);

    if (!ready) {
      return (
        <div style={{ padding: 16, minHeight: '80vh', background: '#0a0a0f' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                style={{
                  height: i === 0 ? 32 : 24,
                  width: `${70 + (i % 3) * 10}%`,
                  background: '#27272a',
                  borderRadius: 6,
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        </div>
      );
    }

    return <StoreHarness classifications={[]} polygons={[]} />;
  },
};
