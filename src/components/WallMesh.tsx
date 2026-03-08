// skills/togal-takeoff/src/components/WallMesh.tsx
'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from "@react-three/drei";
export type XY = { x: number; y: number };

export interface WallSegment {
  start: XY;
  end: XY;
  height?: number;
  thickness?: number;
  color?: string;
  opacity?: number;
}

export interface WallMeshProps {
  segments: WallSegment[];
  defaultHeight?: number; // fallback height (e.g., 8)
  defaultThickness?: number; // fallback wall thickness (e.g., 0.5)
  defaultColor?: string; // fallback color
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * WallMesh
 * Renders extruded wall meshes from 2D centerline segments.
 * Approach:
 * - For each segment, build a 2D quad (rectangle) around the line using thickness/2 offset (left/right normals)
 * - Extrude that quad by depth=height (along +Z in local), then rotate so Z->Y to stand vertically
 * - Translate up by height/2 so the base sits at y=0
 */
export default function WallMesh({
  segments,
  defaultHeight = 8,
  defaultThickness = 0.5,
  defaultColor = '#7dd3fc',
  castShadow = true,
  receiveShadow = false,
}: WallMeshProps) {
  // Build instanced-like data: geometry per unique (length, thickness, height). For simplicity, generate per wall.
  const meshes = useMemo(() => {
    return segments.map((seg, idx) => {
      const a = new THREE.Vector2(seg.start.x, seg.start.y);
      const b = new THREE.Vector2(seg.end.x, seg.end.y);
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len === 0) {
        return { key: idx, geometry: null as THREE.BufferGeometry | null, position: new THREE.Vector3(), color: defaultColor, opacity: seg.opacity ?? 0.85 };
      }

      const h = seg.height ?? defaultHeight;
      const t = seg.thickness ?? defaultThickness;
      const color = seg.color ?? defaultColor;

      // Compute perpendicular unit normal (left of AB)
      const n = new THREE.Vector2(-dir.y, dir.x).normalize();
      const half = n.multiplyScalar(t / 2);

      // Quad corners around centerline (A->B), in XY plane
      const p1 = a.clone().add(half); // left of A
      const p2 = b.clone().add(half); // left of B
      const p3 = b.clone().sub(half); // right of B
      const p4 = a.clone().sub(half); // right of A

      const shape = new THREE.Shape([
        new THREE.Vector2(p1.x, p1.y),
        new THREE.Vector2(p2.x, p2.y),
        new THREE.Vector2(p3.x, p3.y),
        new THREE.Vector2(p4.x, p4.y),
      ]);

      const extrude = new THREE.ExtrudeGeometry(shape, {
        depth: h, // extrudes along +Z
        bevelEnabled: false,
        steps: 1,
      });

      // Rotate so +Z becomes +Y (stand wall up), and lift by h/2 so base at y=0
      extrude.rotateX(-Math.PI / 2);
      extrude.translate(0, h / 2, 0);

      // Compute a nominal position (not strictly necessary since geometry already positioned)
      const center = new THREE.Vector3((a.x + b.x) / 2, h / 2, (a.y + b.y) / 2);

      // Optimize: compute vertex normals for proper lighting
      extrude.computeVertexNormals();

      return { key: idx, geometry: extrude as THREE.BufferGeometry, position: center, color, opacity: seg.opacity ?? 0.85 };
    });
  }, [segments, defaultHeight, defaultThickness, defaultColor]);

  return (
    <group>
      {meshes.map(({ key, geometry, position, color, opacity }) =>
        geometry ? (
          <group key={key}>
            <mesh
              geometry={geometry}
              position={position}
              castShadow={castShadow}
              receiveShadow={receiveShadow}
            >
              <meshStandardMaterial
                color={color}
                transparent
                opacity={opacity}
                roughness={0.6}
                metalness={0.05}
              />
            </mesh>
            <Html position={[position.x, position.y + 1, position.z]} center style={{ pointerEvents: "none" }}>
              <div style={{ background: "rgba(10,10,15,0.85)", border: "1px solid rgba(0,212,255,0.3)", color: "#e5e7eb", fontFamily: "monospace", fontSize: 10, padding: "3px 6px", borderRadius: 6, whiteSpace: "nowrap" }}>
                {segments[key]?.height ?? defaultHeight} FT
              </div>
            </Html>
          </group>
        ) : null
      )}
    </group>
  );
}
