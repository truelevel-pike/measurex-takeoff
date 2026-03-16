'use client';

import React, { useRef, useEffect } from 'react';
import { Canvas, Polygon as FabricPolygon, Circle, Line } from 'fabric';
import { useStore } from '@/lib/store';
import type { Point } from '@/lib/types';

export interface PolygonContextMenuPayload {
  polygonId: string;
  x: number;
  y: number;
}

interface CanvasOverlayProps {
  onPolygonContextMenu?: (payload: PolygonContextMenuPayload) => void;
  onCanvasPointerDown?: () => void;
}

export default function CanvasOverlay({ onPolygonContextMenu, onCanvasPointerDown }: CanvasOverlayProps = {}) {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);

  const polygons = useStore((s) => s.polygons);
  const classifications = useStore((s) => s.classifications);
  const selectedPolygon = useStore((s) => s.selectedPolygon);
  const setSelectedPolygon = useStore((s) => s.setSelectedPolygon);
  const updatePolygon = useStore((s) => s.updatePolygon);
  const currentTool = useStore((s) => s.currentTool);

  // Calibration state
  const calibrationMode = useStore((s) => s.calibrationMode);
  const calibrationPoints = useStore((s) => s.calibrationPoints);
  const addCalibrationPoint = useStore((s) => s.addCalibrationPoint);

  useEffect(() => {
    if (!canvasEl.current) return;
    const canvasNode = canvasEl.current;
    const parent = canvasNode.parentElement as HTMLElement | null;
    if (!parent) return;

    const fc = new Canvas(canvasNode, {
      width: parent.clientWidth,
      height: parent.clientHeight,
      selection: currentTool === 'select',
      backgroundColor: 'transparent',
    });
    fabricRef.current = fc;

    const preventNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    canvasNode.addEventListener('contextmenu', preventNativeContextMenu);

    const resize = () => {
      fc.setDimensions({ width: parent.clientWidth, height: parent.clientHeight });
      fc.renderAll();
    };

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(parent);

    const onOrientation = () => resize();
    window.addEventListener('orientationchange', onOrientation);

    return () => {
      canvasNode.removeEventListener('contextmenu', preventNativeContextMenu);
      window.removeEventListener('orientationchange', onOrientation);
      ro.disconnect();
      fc.dispose();
      fabricRef.current = null;
    };
  }, []);

  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;

    fc.clear();

    polygons.forEach((poly) => {
      const cls = classifications.find((c) => c.id === poly.classificationId);
      if (cls && !cls.visible) return;
      const isSelected = selectedPolygon === poly.id;
      const color = cls?.color || '#93c5fd';

      const fp = new FabricPolygon(poly.points as Point[], {
        fill: color + '22',
        stroke: isSelected ? '#00ff88' : '#00d4ff',
        strokeWidth: isSelected ? 3 : 1,
        shadow: isSelected ? '0 0 8px rgba(0,255,136,0.5)' : '0 0 6px rgba(0,212,255,0.3)',
        selectable: currentTool === 'select',
        hasControls: isSelected,
        hasBorders: isSelected,
        cornerColor: '#00d4ff',
        cornerSize: 8,
        transparentCorners: false,
        objectCaching: false,
      } as any);
      (fp as any)._polygonId = poly.id;
      fc.add(fp);
    });

    // Draw calibration overlays
    if (calibrationPoints.length > 0) {
      calibrationPoints.forEach((pt) => {
        const dot = new Circle({
          left: pt.x - 5,
          top: pt.y - 5,
          radius: 5,
          fill: '#ef4444',
          stroke: '#ffffff',
          strokeWidth: 1,
          selectable: false,
          evented: false,
        });
        (dot as any)._calibrationOverlay = true;
        fc.add(dot);
      });

      if (calibrationPoints.length === 2) {
        const [p1, p2] = calibrationPoints;
        const line = new Line([p1.x, p1.y, p2.x, p2.y], {
          stroke: '#ef4444',
          strokeWidth: 2,
          strokeDashArray: [6, 4],
          selectable: false,
          evented: false,
        });
        (line as any)._calibrationOverlay = true;
        fc.add(line);
      }
    }

    fc.off('selection:created');
    fc.off('selection:updated');
    fc.off('mouse:up');
    fc.off('mouse:down');
    fc.off('object:modified');

    fc.on('selection:created', (e: any) => {
      const obj = e.selected?.[0];
      if (obj && (obj as any)._polygonId) setSelectedPolygon((obj as any)._polygonId);
    });

    fc.on('selection:updated', (e: any) => {
      const obj = e.selected?.[0];
      if (obj && (obj as any)._polygonId) setSelectedPolygon((obj as any)._polygonId);
    });

    fc.on('mouse:up', (e: any) => {
      if (!e.target) setSelectedPolygon(null);
    });

    fc.on('mouse:down', (e: any) => {
      onCanvasPointerDown?.();

      const nativeEvent = e.e as MouseEvent | undefined;
      if (!nativeEvent) return;

      // Calibration mode: capture clicks as calibration points
      if (calibrationMode && calibrationPoints.length < 2) {
        const pointer = fc.getScenePoint(nativeEvent);
        addCalibrationPoint({ x: pointer.x, y: pointer.y });
        return; // Don't process as polygon interaction
      }

      const isRightClick = nativeEvent.button === 2;
      const targetPolygonId = (e.target as any)?._polygonId as string | undefined;

      if (!isRightClick || !targetPolygonId) return;

      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      setSelectedPolygon(targetPolygonId);
      onPolygonContextMenu?.({
        polygonId: targetPolygonId,
        x: nativeEvent.clientX,
        y: nativeEvent.clientY,
      });
    });

    fc.on('object:modified', (e: any) => {
      const obj = e.target;
      if (!(obj as any)?._polygonId) return;
      if (obj instanceof FabricPolygon) {
        const matrix = obj.calcTransformMatrix();
        const pts: Point[] = (obj.points || []).map((p: any) => {
          const x = p.x - (obj.pathOffset?.x || 0);
          const y = p.y - (obj.pathOffset?.y || 0);
          return {
            x: matrix[0] * x + matrix[2] * y + matrix[4],
            y: matrix[1] * x + matrix[3] * y + matrix[5],
          };
        });
        updatePolygon((obj as any)._polygonId, { points: pts });
      }
    });

    fc.renderAll();
  }, [polygons, classifications, selectedPolygon, currentTool, setSelectedPolygon, updatePolygon, onPolygonContextMenu, onCanvasPointerDown, calibrationMode, calibrationPoints, addCalibrationPoint]);

  return (
    <canvas
      ref={canvasEl}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: currentTool === 'pan' ? 'none' : 'auto',
        cursor: calibrationMode ? 'crosshair' : undefined,
        zIndex: 10,
      }}
    />
  );
}
