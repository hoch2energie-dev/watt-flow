"use client";

import { useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { buildScene } from "@/lib/roof/scene";
import type { RoofFaceInput } from "@/lib/pvgis/types";

export function RoofScene({ faces }: { faces: RoofFaceInput[] }) {
  const model = useMemo(() => buildScene(faces), [faces]);
  if (model.roofs.length === 0) {
    return (
      <p className="rounded-xl bg-[#d5e3da] px-4 py-16 text-center text-sm text-muted">
        Sobald eine Dachfläche gezeichnet ist, erscheint hier das Gebäude. Drehen können Sie die Ansicht mit der Maus.
      </p>
    );
  }
  const distance = Math.max(14, model.span * 1.4);
  return (
    <div id="roof-scene" className="h-[420px] w-full overflow-hidden rounded-xl bg-[#d5e3da]">
      <Canvas camera={{ position: [distance * 0.35, distance * 0.95, distance * 0.7], fov: 38 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#d5e3da"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[14, 22, 8]} intensity={1.25} />
        <Meshes arrays={model.walls} color="#efe8dc" />
        <Meshes arrays={model.roofs} color="#d7c4ae" />
        <Meshes arrays={model.modules} color="#1e4d6b" offset />
        {model.obstacles.map((obstacle, index) => (
          <mesh key={index} position={obstacle.position}>
            <boxGeometry args={obstacle.size} />
            <meshStandardMaterial color="#5c6b64" />
          </mesh>
        ))}
        <gridHelper args={[Math.max(24, model.span * 2), 12, "#9bb0a6", "#c5d4cc"]} />
        <OrbitControls target={[0, 1.2, 0]} />
      </Canvas>
    </div>
  );
}

function Meshes({ arrays, color, offset = false }: { arrays: number[][]; color: string; offset?: boolean }) {
  return (
    <>
      {arrays.map((values, index) => (
        <Solid key={`${color}-${index}`} values={values} color={color} offset={offset} />
      ))}
    </>
  );
}

function Solid({ values, color, offset }: { values: number[]; color: string; offset: boolean }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(new Float32Array(values), 3));
    next.computeVertexNormals();
    return next;
  }, [values]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} polygonOffset={offset} polygonOffsetFactor={offset ? -2 : 0} />
    </mesh>
  );
}
