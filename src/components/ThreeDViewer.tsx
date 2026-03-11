// skills/togal-takeoff/src/components/ThreeDViewer.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  Plane,
  PerspectiveCamera,
  OrthographicCamera,
} from '@react-three/drei';
import * as THREE from 'three';
import { Box, Layers3 } from 'lucide-react';

type CameraMode = 'perspective' | 'orthographic';

interface ThreeDViewerProps {
  className?: string;
  show3D: boolean;
  onToggle3D: (value: boolean) => void;
  pdfTextureUrl?: string | null;
  children?: React.ReactNode;
}

function GroundPlane({ textureUrl }: { textureUrl?: string | null }) {
  const groundSize = 100;
  const [aspectRatio, setAspectRatio] = useState(1);

  useEffect(() => {
    if (!textureUrl) setAspectRatio(1);
  }, [textureUrl]);

  const texture = useMemo(() => {
    if (!textureUrl) return null;
    const loader = new THREE.TextureLoader();
    const t = loader.load(textureUrl, (loadedTexture) => {
      const image = loadedTexture.image as { width?: number; height?: number } | undefined;
      const width = image?.width ?? 0;
      const height = image?.height ?? 0;
      if (width > 0 && height > 0) {
        setAspectRatio(width / height);
      }
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    return t;
  }, [textureUrl]);

  return (
    <Plane
      args={[aspectRatio * groundSize, groundSize]}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    >
      <meshStandardMaterial
        color={texture ? '#ffffff' : '#1a1a2e'}
        map={texture ?? undefined}
        transparent
        opacity={texture ? 0.9 : 1}
        metalness={0.05}
        roughness={0.95}
      />
    </Plane>
  );
}

function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.45} color="#ffffff" />
      <directionalLight
        position={[40, 60, 20]}
        intensity={1}
        color="#dff8ff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-20, 30, -20]} intensity={0.35} color="#8ad9ff" />
      <pointLight position={[0, 25, 0]} intensity={0.18} color="#00d4ff" />
    </>
  );
}

export default function ThreeDViewer({
  className,
  show3D,
  onToggle3D,
  pdfTextureUrl,
  children,
}: ThreeDViewerProps) {
  const [cameraMode, setCameraMode] = useState<CameraMode>('perspective');
  const [showGrid, setShowGrid] = useState(true);

  return (
    <div
      className={`relative w-full h-full bg-[#0a0a0f] border border-[#00d4ff]/20 rounded-lg overflow-hidden ${
        className ?? ''
      }`}
    >
      {/* Mode Controls */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-[rgba(18,18,26,0.9)] backdrop-blur-sm border border-[#00d4ff]/20 rounded-lg p-1 shadow-[0_0_20px_rgba(0,212,255,0.15)]">
        <button
          onClick={() => onToggle3D(false)}
          className={`h-9 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition ${
            !show3D
              ? 'bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#00d4ff]'
              : 'bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white hover:border-[#00d4ff]/35'
          }`}
        >
          2D
        </button>
        <button
          onClick={() => onToggle3D(true)}
          className={`h-9 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition inline-flex items-center gap-1.5 ${
            show3D
              ? 'bg-[#00ff88]/15 border-[#00ff88]/50 text-[#00ff88]'
              : 'bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white hover:border-[#00d4ff]/35'
          }`}
        >
          <Layers3 size={14} />
          3D
        </button>
      </div>

      {show3D && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-[rgba(18,18,26,0.9)] backdrop-blur-sm border border-[#00d4ff]/20 rounded-lg p-1 shadow-[0_0_20px_rgba(0,212,255,0.15)]">
          <button
            onClick={() => setCameraMode('perspective')}
            className={`h-9 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition ${
              cameraMode === 'perspective'
                ? 'bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#00d4ff]'
                : 'bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white hover:border-[#00d4ff]/35'
            }`}
          >
            Perspective
          </button>
          <button
            onClick={() => setCameraMode('orthographic')}
            className={`h-9 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition ${
              cameraMode === 'orthographic'
                ? 'bg-[#a855f7]/20 border-[#a855f7]/50 text-[#d5b7ff]'
                : 'bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white hover:border-[#00d4ff]/35'
            }`}
          >
            Orthographic
          </button>
        </div>
      )}

      <div className="absolute top-14 right-3 z-20 bg-[rgba(18,18,26,0.9)] backdrop-blur-sm border border-[#00d4ff]/20 rounded-lg p-1">
        <button onClick={() => setShowGrid(!showGrid)} className={`h-9 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition ${showGrid ? "bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#00d4ff]" : "bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white"}`}>Grid</button>
      </div>

      {/* 3D Canvas */}
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', background: '#0a0a0f' }}
      >
        {cameraMode === 'perspective' ? (
          <PerspectiveCamera
            makeDefault
            fov={45}
            position={[70, 60, 70]}
            near={0.1}
            far={3000}
          />
        ) : (
          <OrthographicCamera
            makeDefault
            position={[80, 80, 80]}
            zoom={7}
            near={0.1}
            far={3000}
          />
        )}

        <color attach="background" args={['#0a0a0f']} />
        <fog attach="fog" args={['#0a0a0f', 180, 380]} />

        <SceneLighting />
        <GroundPlane textureUrl={pdfTextureUrl} />

        {showGrid && <Grid
          args={[300, 300]}
          sectionSize={20}
          sectionThickness={1}
          sectionColor="#00d4ff"
          cellSize={4}
          cellThickness={0.5}
          cellColor="#223244"
          fadeDistance={250}
          fadeStrength={1}
          infiniteGrid
          position={[0, 0.01, 0]}
        />}

        {/* Origin marker */}
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.8, 0.4, 0.8]} />
          <meshStandardMaterial
            color="#00ff88"
            emissive="#00ff88"
            emissiveIntensity={0.2}
          />
        </mesh>

        {/* injected child meshes (walls / floors / labels) */}
        {children}

        <OrbitControls
          makeDefault
          enablePan
          enableZoom
          enableRotate
          dampingFactor={0.08}
          rotateSpeed={0.7}
          zoomSpeed={0.9}
          panSpeed={0.8}
          minDistance={8}
          maxDistance={500}
          target={[0, 0, 0]}
        />
      </Canvas>

      {show3D && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-[rgba(18,18,26,0.9)] backdrop-blur-sm border border-[#00d4ff]/20 rounded-lg p-1 shadow-[0_0_20px_rgba(0,212,255,0.15)]">
          <button className="h-9 px-3 rounded-md text-xs font-mono uppercase tracking-wider border bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white hover:border-[#00d4ff]/35 transition">Combine</button>
          <button className="h-9 px-3 rounded-md text-xs font-mono uppercase tracking-wider border bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white hover:border-[#00d4ff]/35 transition">Merge Lines</button>
          <button className="h-9 px-3 rounded-md text-xs font-mono uppercase tracking-wider border bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white hover:border-[#00d4ff]/35 transition">Rotate</button>
          <button className="h-9 px-3 rounded-md text-xs font-mono uppercase tracking-wider border bg-[#12121a] border-[#00d4ff]/15 text-[#8892a0] hover:text-white hover:border-[#00d4ff]/35 transition">Snap</button>
          <div className="w-px h-6 bg-[#00d4ff]/20 mx-1"></div>
          <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8892a0] flex items-center gap-2">
            <Box size={12} className="text-[#00d4ff]" />
            3D Active
          </div>
        </div>
      )}
    </div>
  );
}
