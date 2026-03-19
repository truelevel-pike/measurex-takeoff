import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import QuantitiesPanel from '@/components/QuantitiesPanel';
import { useStore } from '@/lib/store';
import type { Classification, Polygon } from '@/lib/types';

const mockClassifications: Classification[] = [
  { id: 'c1', name: 'Walls', color: '#3b82f6', type: 'area', visible: true },
  { id: 'c2', name: 'Baseboard', color: '#22c55e', type: 'linear', visible: true },
  { id: 'c3', name: 'Doors', color: '#f59e0b', type: 'count', visible: true },
];

const mockPolygons: Polygon[] = [
  {
    id: 'p1',
    classificationId: 'c1',
    pageNumber: 1,
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    area: 120,
    linearFeet: 44,
    isComplete: true,
    label: 'East wall area',
  },
  {
    id: 'p2',
    classificationId: 'c2',
    pageNumber: 1,
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 2 },
      { x: 0, y: 2 },
    ],
    area: 40,
    linearFeet: 22,
    isComplete: true,
    label: 'Perimeter run',
  },
  {
    id: 'p3',
    classificationId: 'c3',
    pageNumber: 2,
    points: [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
    ],
    area: 1,
    linearFeet: 0,
    isComplete: true,
    label: 'Door tag A',
  },
];

function StoreHarness({
  classifications,
  polygons,
}: {
  classifications: Classification[];
  polygons: Polygon[];
}) {
  useEffect(() => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query: string): MediaQueryList => {
      const matches = query.includes('min-width: 769px') && query.includes('max-width: 1024px');
      return {
        matches,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      };
    };

    useStore.setState({
      classifications,
      polygons,
      scale: { pixelsPerUnit: 1, unit: 'ft', label: 'feet', source: 'manual' },
      showQuantitiesDrawer: true,
      selectedClassification: classifications[0]?.id ?? null,
      currentPage: 1,
      totalPages: 3,
    });

    return () => {
      window.matchMedia = originalMatchMedia;
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

const meta = {
  title: 'MeasureX/QuantitiesPanel',
  component: StoreHarness,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof StoreHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyState: Story = {
  args: {
    classifications: [],
    polygons: [],
  },
};

export const WithClassificationsAndPolygons: Story = {
  args: {
    classifications: mockClassifications,
    polygons: mockPolygons,
  },
};
