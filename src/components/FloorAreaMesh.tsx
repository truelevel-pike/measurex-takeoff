// src/components/FloorAreaMesh.tsx
'use client';

import React, { useMemo, useEffect } from 'react';
import { Shape, ShapeGeometry, Vector3, Color, DoubleSide } from 'three';
import type { Event as ThreeEvent } from 'three';
import { Line } from '@react-three/drei';

/** 2D point used by takeoff data and the conversion layer. */
export interface FloorPoint {
  x: number;
  y: number;
}

/**
 * Batch-level item kept for backward compat with takeoff-to-3d imports.
 * ThreeDScene maps these into individual <FloorAreaMesh /> elements.
 */
export interface FloorAreaItem {
  id: string;
  label: string;
  classificationId: string;
  color: string;
  visible?: boolean;
  points: FloorPoint[];
}

// ---------------------------------------------------------------------------
// Props — per the Wave 6 spec
// ---------------------------------------------------------------------------
export interface FloorAreaMeshProps {
  /** Polygon vertices — 2D {x,y} or 3-tuples [x,y,z]. */
  points: FloorPoint[] | [number, number, number][];
  /** Fill colour (hex string). Falls back to cyan. */
  color?: string;
  /** Whether this polygon is currently selected. */
  selected?: boolean;
  /** Numeric measurement value (used only for aria / future tooltip). */
  measurement?: number;
  /** Classification display name (used only for aria / future tooltip). */
  classificationName?: string;
  /** Click handler */
  onClick?: (e: ThreeEvent) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise either point format into FloorPoint[]. */
function normalizePoints(pts: FloorPoint[] | [number, number, number][]): FloorPoint[] {
  if (pts.length === 0) return [];
  const first = pts[0];
  if (Array.isArray(first)) {
    return (pts as [number, number, number][]).map(([x, , z]) => ({ x, y: z }));
  }
  return pts as FloorPoint[];
}

function buildShape(points: FloorPoint[]): Shape | null {
  if (!points || points.length < 3) return null;
  const shape = new Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  return shape;
}

function pointsToVec3(points: FloorPoint[], y: number): Vector3[] {
  return points.map((p) => new Vector3(p.x, y, p.y));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FloorAreaMesh({
  points: rawPoints,
  color = '#00d4ff',
  selected = false,
  measurement,
  classificationName,
  onClick,
}: FloorAreaMeshProps) {
  const points = useMemo(() => normalizePoints(rawPoints), [rawPoints]);

  const geometry = useMemo(() => {
    const shape = buildShape(points);
    if (!shape) return null;
    const geo = new ShapeGeometry(shape);
    // Rotate from XY plane onto XZ ground plane
    geo.rotateX(-Math.PI / 2);
    // Slight lift to avoid z-fighting with ground
    geo.translate(0, 0.01, 0);
    return geo;
  }, [points]);

  // Dispose GPU buffer memory when geometry is replaced or component unmounts.
  // Three.js does not automatically GC GPU resources, so without this every
  // points change (e.g. during AI takeoff) leaks vertex/index buffers.
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) return null;

  const fillColor = new Color(selected ? brighten(color) : color);
  const opacity = selected ? 0.8 : 0.5;
  const outlineY = 0.02; // slightly above fill

  const outlinePoints = [
    ...pointsToVec3(points, outlineY),
    ...pointsToVec3(points, outlineY).slice(0, 1),
  ];

  return (
    <group
      name={classificationName ? `floor-${classificationName}` : 'floor-area'}
      userData={{ measurement, classificationName }}
    >
      <mesh
        geometry={geometry}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClick?.(e as unknown as ThreeEvent);
        }}
      >
        <meshStandardMaterial
          color={fillColor}
          transparent
          opacity={opacity}
          emissive={selected ? new Color(color) : new Color('#000000')}
          emissiveIntensity={selected ? 0.35 : 0}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* Outline */}
      <Line
        points={outlinePoints}
        color={selected ? brighten(color) : color}
        lineWidth={selected ? 2.5 : 1.2}
        transparent
        opacity={selected ? 0.95 : 0.6}
      />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Simple brightening by blending toward white. */
function brighten(hex: string, factor = 0.35): string {
  const c = new Color(hex);
  c.lerp(new Color('#ffffff'), factor);
  return '#' + c.getHexString();
}
