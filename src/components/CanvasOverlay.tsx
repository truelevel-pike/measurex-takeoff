'use client';

import React, { useRef, useEffect } from 'react';
import { Canvas, Polygon as FabricPolygon } from 'fabric';
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
  }, [polygons, classifications, selectedPolygon, currentTool, setSelectedPolygon, updatePolygon, onPolygonContextMenu, onCanvasPointerDown]);

  return (
    <canvas
      ref={canvasEl}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: currentTool === 'pan' ? 'none' : 'auto',
        zIndex: 10,
      }}
    />
  );
}
