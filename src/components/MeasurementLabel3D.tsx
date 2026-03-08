"use client";

import React, { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";

export interface MeasurementLabel3DProps {
  position: [number, number, number];
  areaSq?: number; // in real units squared (already converted)
  length?: number; // in real units (already converted)
  unit?: "ft" | "in" | "m" | "mm";
  label?: string; // custom override (when provided, area/length are ignored)
  color?: string; // CSS color for label text/border glow
  alwaysFaceCamera?: boolean; // defaults true via Html billboard
  visible?: boolean;
  className?: string;
}

function formatFeetInches(feetValue: number) {
  // Format to ft with one decimal place, optionally expand later to ft'-in" if desired
  return `${feetValue.toFixed(1)} ft`;
}

function formatMetric(metersValue: number, unit: "m" | "mm") {
  if (unit === "mm") return `${(metersValue * 1000).toFixed(0)} mm`;
  return `${metersValue.toFixed(2)} m`;
}

function formatLength(value: number, unit: "ft" | "in" | "m" | "mm") {
  switch (unit) {
    case "ft":
      return formatFeetInches(value);
    case "in":
      return `${value.toFixed(1)} in`;
    case "mm":
    case "m":
      return formatMetric(unit === "mm" ? value / 1000 : value, unit);
    default:
      return `${value.toFixed(2)} ${unit}`;
  }
}

function formatArea(value: number, unit: "ft" | "in" | "m" | "mm") {
  switch (unit) {
    case "ft":
      return `${value.toFixed(1)} SF`;
    case "in":
      return `${value.toFixed(1)} in²`;
    case "mm":
      return `${(value * 1_000_000).toFixed(0)} mm²`; // m² -> mm²
    case "m":
    default:
      return `${value.toFixed(2)} m²`;
  }
}

export default function MeasurementLabel3D({
  position,
  areaSq,
  length,
  unit = "ft",
  label,
  color = "#00d4ff",
  alwaysFaceCamera = true,
  visible = true,
  className,
}: MeasurementLabel3DProps) {
  const text = useMemo(() => {
    if (label) return label;
    const parts: string[] = [];
    if (typeof areaSq === "number") parts.push(formatArea(areaSq, unit));
    if (typeof length === "number") parts.push(formatLength(length, unit));
    return parts.join("  /  ");
  }, [label, areaSq, length, unit]);

  if (!visible) return null;

  // Slight lift above surface to avoid z-fighting
  const lifted: [number, number, number] = [position[0], position[1] + 0.2, position[2]];

  return (
    <group position={lifted}>
      {/* Optional helper sprite glow under label */}
      <mesh position={[0, -0.02, 0]}> 
        <planeGeometry args={[1.6, 0.6]} />
        <meshBasicMaterial
          color={new THREE.Color(color)}
          transparent
          opacity={0.12}
        />
      </mesh>

      <Html
        position={[0, 0, 0]}
        center
        occlude
        transform={!alwaysFaceCamera}
        style={{ pointerEvents: "none" }}
      >
        <div
          className={className}
          style={{
            background: "rgba(10,10,15,0.85)",
            border: `1px solid ${color}55`,
            color: "#e5e7eb",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 11,
            padding: "6px 10px",
            borderRadius: 8,
            boxShadow: `0 0 12px ${color}44`,
            letterSpacing: 0.3,
            whiteSpace: "nowrap",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {text || "MEASURE"}
        </div>
      </Html>
    </group>
  );
}
