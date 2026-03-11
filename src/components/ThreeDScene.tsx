// src/components/ThreeDScene.tsx — Composition layer for 3D view
'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { generateSampleRoom } from '@/lib/takeoff-to-3d';
import ThreeDViewer from './ThreeDViewer';
import WallMesh, { type WallSegment } from './WallMesh';
import FloorAreaMesh, { type FloorAreaItem } from './FloorAreaMesh';
import MeasurementLabel3D from './MeasurementLabel3D';

interface ThreeDSceneProps {
  /** Wall segments from takeoff data */
  walls?: WallSegment[];
  /** Floor area polygons from takeoff data */
  areas?: FloorAreaItem[];
  /** Measurement labels */
  labels?: Array<{
    id: string;
    position: [number, number, number];
    areaSq?: number;
    length?: number;
    label?: string;
    unit?: 'ft' | 'in' | 'm' | 'mm';
  }>;
  className?: string;
  pdfTextureUrl?: string | null;
}

export default function ThreeDScene({
  walls = [],
  areas = [],
  labels = [],
  className,
  pdfTextureUrl,
}: ThreeDSceneProps) {
  const { walls: effectiveWalls, areas: effectiveAreas, labels: effectiveLabels } = React.useMemo(() => {
    if (walls.length === 0 && areas.length === 0) {
      return generateSampleRoom();
    }
    return { walls, areas, labels };
  }, [walls, areas, labels]);

  const { show3D, setShow3D } = useStore();
  const selectedPolygon = useStore((s) => s.selectedPolygon);
  const hiddenClassificationIds = useStore((s) => s.hiddenClassificationIds);
  const classifications = useStore((s) => s.classifications);

  const visibilityHiddenIds = React.useMemo(() => {
    const hiddenByVisibleFlag = classifications.filter((c) => c.visible === false).map((c) => c.id);
    const merged = new Set<string>([...hiddenClassificationIds, ...hiddenByVisibleFlag]);
    return Array.from(merged);
  }, [hiddenClassificationIds, classifications]);

  return (
    <ThreeDViewer
      className={className}
      show3D={show3D}
      onToggle3D={setShow3D}
      pdfTextureUrl={pdfTextureUrl}
    >
      {/* Wall extrusions */}
      {effectiveWalls.length > 0 && (
        <WallMesh
          segments={effectiveWalls}
          defaultHeight={8}
          defaultThickness={0.5}
        />
      )}

      {/* Floor area polygons */}
      {effectiveAreas.length > 0 && (
        <FloorAreaMesh
          areas={effectiveAreas}
          selectedIds={selectedPolygon ? [selectedPolygon] : []}
          hiddenClassificationIds={visibilityHiddenIds}
          opacity={0.45}
        />
      )}

      {/* Measurement labels */}
      {effectiveLabels.map((label) => (
        <MeasurementLabel3D
          key={label.id}
          position={label.position}
          areaSq={label.areaSq}
          length={label.length}
          label={label.label}
          unit={label.unit}
        />
      ))}
    </ThreeDViewer>
  );
}
