"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  generateSphereVertices,
  generateTetrahedronVertices,
  generateCubeVertices,
  generateOctahedronVertices,
  generateDodecahedronVertices,
  generateIcosahedronVertices,
  findNearestVertex,
  lerpVertex,
  easeInOutCubic,
  type Vertex,
} from "../../lib/utils/polyhedra";

interface BlobGeometryProps {
  radius?: number;
  segments?: number;
  speed?: number;
  timeRef: React.MutableRefObject<number>;
}

const SHAPE_NAMES = ["tetrahedron", "octahedron", "cube", "icosahedron", "dodecahedron", "sphere"] as const;
const CYCLE_DURATION = 18;
const SHAPE_DURATION = CYCLE_DURATION / SHAPE_NAMES.length;

export function BlobGeometry({
  radius = 1.2,
  segments = 4,
  speed = 1.0,
  timeRef,
}: BlobGeometryProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const sphereVerticesRef = useRef<Vertex[]>([]);
  const polyhedraVerticesRef = useRef<Vertex[][]>([]);

  const geometry = useMemo(() => {
    return new THREE.SphereGeometry(radius, segments, segments);
  }, [radius, segments]);

  const { sphereVertices, polyhedraVertices } = useMemo(() => {
    const sphereVerts = generateSphereVertices(radius, segments);
    const polyVerts = [
      generateTetrahedronVertices(radius),
      generateOctahedronVertices(radius),
      generateCubeVertices(radius),
      generateIcosahedronVertices(radius),
      generateDodecahedronVertices(radius),
      generateSphereVertices(radius, segments),
    ];
    
    sphereVerticesRef.current = sphereVerts;
    polyhedraVerticesRef.current = polyVerts;
    
    return { sphereVertices: sphereVerts, polyhedraVertices: polyVerts };
  }, [radius, segments]);

  useFrame(() => {
    const geom = geometryRef.current || geometry;
    if (!geom || sphereVerticesRef.current.length === 0) return;

    const positions = geom.attributes.position.array as Float32Array;
    const time = timeRef.current * speed;
    
    const cycleTime = time % CYCLE_DURATION;
    const shapeIndex = Math.floor(cycleTime / SHAPE_DURATION);
    const shapeProgress = (cycleTime % SHAPE_DURATION) / SHAPE_DURATION;
    
    const currentShapeIndex = Math.min(shapeIndex, SHAPE_NAMES.length - 1);
    const nextShapeIndex = (currentShapeIndex + 1) % SHAPE_NAMES.length;
    
    const currentShapeVertices = polyhedraVerticesRef.current[currentShapeIndex];
    const nextShapeVertices = polyhedraVerticesRef.current[nextShapeIndex];
    
    const easedProgress = easeInOutCubic(shapeProgress);
    
    const vertexCount = positions.length / 3;
    const sphereVerts = sphereVerticesRef.current;
    
    for (let i = 0; i < vertexCount; i += 1) {
      const sphereVertex: Vertex = 
        sphereVerts[i] || { x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2] };
      
      const currentNearest = findNearestVertex(sphereVertex, currentShapeVertices);
      const nextNearest = findNearestVertex(sphereVertex, nextShapeVertices);
      
      const morphedVertex = lerpVertex(currentNearest, nextNearest, easedProgress);
      
      const posIndex = i * 3;
      positions[posIndex] = morphedVertex.x;
      positions[posIndex + 1] = morphedVertex.y;
      positions[posIndex + 2] = morphedVertex.z;
    }

    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();
  });

  return <primitive ref={geometryRef} object={geometry} />;
}
