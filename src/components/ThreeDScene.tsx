// src/components/ThreeDScene.tsx — Composition layer for 3D view
'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { convertTakeoffTo3D, generateSampleRoom } from '@/lib/takeoff-to-3d';
import ThreeDViewer from './ThreeDViewer';
import WallMesh, { type WallSegment } from './WallMesh';
import FloorAreaMesh, { type FloorAreaItem } from './FloorAreaMesh';
import MeasurementLabel3D from './MeasurementLabel3D';
import type { MeasurementLabel3DData } from '@/lib/takeoff-to-3d';

interface ThreeDSceneProps {
  /**
   * Optional explicit wall segments. When provided and non-empty, they override
   * the store-derived geometry from convertTakeoffTo3D.
   */
  walls?: WallSegment[];
  /**
   * Optional explicit floor area items. When provided and non-empty, they override
   * the store-derived geometry.
   */
  areas?: FloorAreaItem[];
  /**
   * Optional explicit measurement labels. Used together with walls/areas overrides.
   */
  labels?: MeasurementLabel3DData[];
  className?: string;
  pdfTextureUrl?: string | null;
  /** PDF page dimensions in pixels — forwarded to ThreeDViewer for ground plane aspect ratio */
  pageDimensions?: { width: number; height: number } | null;
}

export default function ThreeDScene({
  walls: wallsProp,
  areas: areasProp,
  labels: labelsProp,
  className,
  pdfTextureUrl,
  pageDimensions,
}: ThreeDSceneProps) {
  // Pull takeoff data from the global store
  const polygons = useStore((s) => s.polygons);
  const classifications = useStore((s) => s.classifications);
  const scale = useStore((s) => s.scale);
  const { show3D, setShow3D } = useStore();

  // selectedPolygon from store is the shared selection state.
  // QuantitiesPanel writes to it via setSelectedPolygon; we read it here to highlight in 3D.
  const selectedPolygon = useStore((s) => s.selectedPolygon);
  const hiddenClassificationIds = useStore((s) => s.hiddenClassificationIds);
  const storeClassifications = useStore((s) => s.classifications);

  // If caller passed explicit walls/areas (non-empty), use them directly.
  // Otherwise, derive geometry from the store via convertTakeoffTo3D,
  // falling back to the sample room when no real takeoff data exists.
  const { walls, areas, labels } = React.useMemo<{
    walls: WallSegment[];
    areas: FloorAreaItem[];
    labels: MeasurementLabel3DData[];
  }>(() => {
    const hasExplicit = (wallsProp && wallsProp.length > 0) || (areasProp && areasProp.length > 0);

    if (hasExplicit) {
      return {
        walls: wallsProp ?? [],
        areas: areasProp ?? [],
        labels: labelsProp ?? [],
      };
    }

    // Derive from store — convertTakeoffTo3D already includes its own fallback to
    // generateSampleRoom when polygons are empty, but we add an explicit guard too.
    const result = convertTakeoffTo3D(polygons, classifications);

    if (result.walls.length === 0 && result.areas.length === 0) {
      return generateSampleRoom();
    }

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallsProp, areasProp, labelsProp, polygons, classifications, scale]);

  // Build visibility filter: hide areas whose classification is toggled off
  const visibilityHiddenIds = React.useMemo(() => {
    const hiddenByVisibleFlag = storeClassifications
      .filter((c) => c.visible === false)
      .map((c) => c.id);
    const merged = new Set<string>([...hiddenClassificationIds, ...hiddenByVisibleFlag]);
    return Array.from(merged);
  }, [hiddenClassificationIds, storeClassifications]);

  // selectedId drives 3D highlight and is sourced from the store so that
  // clicking a row in QuantitiesPanel (which calls setSelectedPolygon) automatically
  // highlights the corresponding mesh in 3D — no extra state needed here.
  const selectedIds = selectedPolygon ? [selectedPolygon] : [];

  return (
    <ThreeDViewer
      className={className}
      show3D={show3D}
      onToggle3D={setShow3D}
      pdfTextureUrl={pdfTextureUrl}
      pageDimensions={pageDimensions}
    >
      {/* Wall extrusions */}
      {walls.length > 0 && (
        <WallMesh
          segments={walls}
          defaultHeight={8}
          defaultThickness={0.5}
        />
      )}

      {/* Floor area polygons — selectedIds synced from store.selectedPolygon */}
      {areas
        .filter((a) => a.visible !== false)
        .filter((a) => !visibilityHiddenIds.includes(a.classificationId))
        .map((area) => (
          <FloorAreaMesh
            key={area.id}
            points={area.points}
            color={area.color}
            selected={selectedIds.includes(area.id)}
            classificationName={area.label}
          />
        ))}

      {/* Measurement labels */}
      {labels.map((lbl) => (
        <MeasurementLabel3D
          key={lbl.id}
          position={lbl.position}
          label={lbl.label ?? ''}
          value={
            lbl.areaSq != null
              ? `${lbl.areaSq.toFixed(1)} ${lbl.unit === 'ft' ? 'sq ft' : (lbl.unit ?? 'sq ft')}`
              : lbl.length != null
                ? `${lbl.length.toFixed(1)} ${lbl.unit === 'ft' ? 'LF' : (lbl.unit ?? 'LF')}`
                : undefined
          }
        />
      ))}
    </ThreeDViewer>
  );
}
