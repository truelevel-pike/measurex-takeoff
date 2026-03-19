import React, { useEffect, useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@turf/turf', () => ({}));

import LeftToolbar from '@/components/LeftToolbar';
import CanvasOverlay from '@/components/CanvasOverlay';
import DrawingTool from '@/components/DrawingTool';
import { ToastProvider } from '@/components/Toast';
import * as api from '@/lib/api-client';
import { useStore } from '@/lib/store';
import type { Polygon, ProjectState, ScaleCalibration } from '@/lib/types';

function DrawHarness() {
  const currentTool = useStore((s) => s.currentTool);
  const polygons = useStore((s) => s.polygons);
  const projectId = useStore((s) => s.projectId);
  const knownPolygonIds = useRef<Set<string>>(new Set(useStore.getState().polygons.map((p) => p.id)));

  useEffect(() => {
    if (!projectId) return;
    const newPolygons = polygons.filter((p) => !knownPolygonIds.current.has(p.id));
    for (const polygon of newPolygons) {
      knownPolygonIds.current.add(polygon.id);
      void api.createPolygon(projectId, polygon);
    }
    const currentIds = new Set(polygons.map((p) => p.id));
    for (const id of knownPolygonIds.current) {
      if (!currentIds.has(id)) knownPolygonIds.current.delete(id);
    }
  }, [projectId, polygons]);

  return React.createElement(
    ToastProvider,
    null,
    React.createElement(
      'div',
      null,
      React.createElement(LeftToolbar),
      React.createElement(
        'div',
        { 'data-testid': 'draw-root', style: { position: 'relative', width: 1000, height: 1000 } },
        React.createElement(CanvasOverlay),
        currentTool === 'draw' ? React.createElement(DrawingTool) : null
      )
    )
  );
}

function seedStore() {
  const scale: ScaleCalibration = {
    pixelsPerUnit: 100,
    unit: 'ft',
    label: '1"=1\'',
    source: 'manual',
    pageNumber: 1,
  };
  const initial: ProjectState = {
    classifications: [
      { id: 'cls-1', name: 'Room', color: '#22c55e', type: 'area', visible: true },
    ],
    polygons: [],
    annotations: [],
    scale,
    scales: { 1: scale },
    currentPage: 1,
    totalPages: 1,
  };
  useStore.getState().hydrateState(initial);
  useStore.setState({
    currentTool: 'select',
    selectedClassification: 'cls-1',
    selectedPolygon: null,
    selectedPolygonId: null,
    selectedPolygons: [],
    projectId: 'proj-123',
    pageBaseDimensions: { 1: { width: 1000, height: 1000 } },
  });
}

describe('draw tool integration', () => {
  beforeEach(() => {
    if (typeof globalThis.structuredClone !== 'function') {
      globalThis.structuredClone = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;
    }
    localStorage.clear();
    seedStore();
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1000,
        bottom: 1000,
        width: 1000,
        height: 1000,
        toJSON: () => ({}),
      }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('supports draw activation, polygon creation, label rendering, POST persistence, and delete + DELETE API', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ polygon: { id: 'server-poly' }, ok: true }),
      },
    );
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(React.createElement(DrawHarness));

    await user.click(screen.getByRole('button', { name: /Draw Area/i }));
    expect(useStore.getState().currentTool).toBe('draw');
    const drawingLayer = document.querySelector('.cursor-crosshair') as HTMLElement | null;
    expect(drawingLayer).toBeTruthy();
    if (!drawingLayer) throw new Error('draw layer missing');

    const drawRoot = screen.getByTestId('draw-root');

    await user.pointer([{ target: drawingLayer, coords: { clientX: 100, clientY: 100 }, keys: '[MouseLeft]' }]);
    expect(await screen.findByText(/1 points/i)).toBeInTheDocument();

    await user.pointer([{ target: drawingLayer, coords: { clientX: 300, clientY: 100 }, keys: '[MouseLeft]' }]);
    await user.pointer([{ target: drawingLayer, coords: { clientX: 320, clientY: 180 } }]);
    expect(drawRoot.querySelector('line[stroke-dasharray="6 3"]')).toBeTruthy();

    await user.pointer([{ target: drawingLayer, coords: { clientX: 300, clientY: 300 }, keys: '[MouseLeft]' }]);
    await user.pointer([{ target: drawingLayer, coords: { clientX: 102, clientY: 102 }, keys: '[MouseLeft]' }]);

    await waitFor(() => {
      expect(useStore.getState().polygons).toHaveLength(1);
      expect(useStore.getState().currentTool).toBe('select');
    });

    expect(screen.getByLabelText('Room')).toBeInTheDocument();
    expect(screen.getByText(/\d+\.\d SF$/)).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/proj-123/polygons',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/projects/proj-123/polygons' &&
        typeof init === 'object' &&
        init !== null &&
        'method' in init &&
        init.method === 'POST'
    );
    expect(postCall).toBeTruthy();
    const postPayload = JSON.parse(String((postCall?.[1] as RequestInit).body));
    expect(postPayload.points).toHaveLength(3);
    expect(postPayload.classificationId).toBe('cls-1');

    const polygon = useStore.getState().polygons[0] as Polygon;
    await user.click(screen.getByLabelText('Room'));
    await user.keyboard('{Delete}');

    await waitFor(() => {
      expect(useStore.getState().polygons).toHaveLength(0);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/proj-123/polygons/${polygon.id}`,
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
