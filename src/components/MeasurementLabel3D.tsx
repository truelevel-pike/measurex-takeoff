// src/components/MeasurementLabel3D.tsx
'use client';

import React from 'react';
import { Html } from '@react-three/drei';

// ---------------------------------------------------------------------------
// Props — per the Wave 6 spec
// ---------------------------------------------------------------------------
export interface MeasurementLabel3DProps {
  /** World-space position [x, y, z]. */
  position: [number, number, number];
  /** Top line — typically the classification name. */
  label: string;
  /** Bottom line — the formatted measurement (e.g. "245.3 sq ft"). */
  value?: string;
  /** Accent colour for the border glow. */
  color?: string;
  /** Hide the label without unmounting. */
  visible?: boolean;
}

export default function MeasurementLabel3D({
  position,
  label,
  value,
  color = '#00d4ff',
  visible = true,
}: MeasurementLabel3DProps) {
  if (!visible) return null;

  // Slight lift above the surface so label clears geometry
  const lifted: [number, number, number] = [position[0], position[1] + 0.2, position[2]];

  return (
    <group position={lifted}>
      <Html
        center
        distanceFactor={30}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            background: 'rgba(10, 10, 15, 0.85)',
            border: `1px solid ${color}55`,
            color: '#e5e7eb',
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 11,
            padding: '6px 10px',
            borderRadius: 8,
            boxShadow: `0 0 12px ${color}44`,
            letterSpacing: 0.3,
            whiteSpace: 'nowrap',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column' as const,
            gap: 2,
          }}
        >
          <span
            style={{
              textTransform: 'uppercase',
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            {label}
          </span>
          {value && (
            <span style={{ fontSize: 10, opacity: 0.8 }}>
              {value}
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}
