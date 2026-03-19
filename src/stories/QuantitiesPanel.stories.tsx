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
