// src/components/FloorAreaMesh.tsx
'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

export interface FloorPoint {
  x: number;
  y: number;
}

export interface FloorAreaItem {
  id: string;
  label: string;
  classificationId: string;
  color: string;
  visible?: boolean;
  points: FloorPoint[];
}

interface FloorAreaMeshProps {
  areas: FloorAreaItem[];
  selectedIds?: string[];
  hiddenClassificationIds?: string[];
  onSelect?: (areaId: string, additive?: boolean) => void;
  yOffset?: number;
  opacity?: number;
  strokeColor?: string;
}

function buildShape(points: FloorPoint[]): THREE.Shape | null {
  if (!points || points.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  return shape;
}

function pointArrayToVec3(points: FloorPoint[], y = 0.01) {
  return points.map((p) => new THREE.Vector3(p.x, y, p.y));
}

export default function FloorAreaMesh({
  areas,
  selectedIds = [],
  hiddenClassificationIds = [],
  onSelect,
  yOffset = 0,
  opacity = 0.45,
  strokeColor = '#00d4ff',
}: FloorAreaMeshProps) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hiddenCls = useMemo(() => new Set(hiddenClassificationIds), [hiddenClassificationIds]);

  const prepared = useMemo(() => {
    return areas
      .filter((a) => a.visible !== false)
      .filter((a) => !hiddenCls.has(a.classificationId))
      .map((area) => {
        const shape = buildShape(area.points);
        if (!shape) return null;
        const geometry = new THREE.ShapeGeometry(shape);
        geometry.rotateX(-Math.PI / 2); // XY -> XZ plane
        geometry.translate(0, yOffset, 0);
        return { area, geometry };
      })
      .filter(Boolean) as Array<{ area: FloorAreaItem; geometry: THREE.ShapeGeometry }>;
  }, [areas, hiddenCls, yOffset]);

  return (
    <group name="floor-area-meshes">
      {prepared.map(({ area, geometry }) => {
        const isSelected = selected.has(area.id);
        const fill = new THREE.Color(isSelected ? '#00ff88' : area.color || '#00d4ff');
        const edge = isSelected ? '#00ff88' : strokeColor;

        return (
          <group key={area.id} name={`floor-area-${area.id}`}>
            <mesh
              geometry={geometry}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect?.(area.id, e.shiftKey);
              }}
            >
              <meshStandardMaterial
                color={fill}
                transparent
                opacity={isSelected ? Math.max(opacity, 0.62) : opacity}
                emissive={isSelected ? new THREE.Color('#00ff88') : new THREE.Color('#000000')}
                emissiveIntensity={isSelected ? 0.35 : 0}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* outline */}
            <Line
              points={[...pointArrayToVec3(area.points, yOffset + 0.01), ...pointArrayToVec3(area.points, yOffset + 0.01).slice(0, 1)]}
              color={edge}
              lineWidth={isSelected ? 2.5 : 1.2}
              transparent
              opacity={isSelected ? 0.95 : 0.6}
            />
          </group>
        );
      })}
    </group>
  );
}
