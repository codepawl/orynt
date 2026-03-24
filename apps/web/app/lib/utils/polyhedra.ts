import * as THREE from "three";

export interface Vertex {
  x: number;
  y: number;
  z: number;
}

function extractUniqueVertices(geometry: THREE.BufferGeometry): Vertex[] {
  const positions = geometry.attributes.position;
  const uniqueVertices = new Map<string, Vertex>();
  const tolerance = 0.0001;
  
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    
    const key = `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`;
    
    if (!uniqueVertices.has(key)) {
      uniqueVertices.set(key, { x, y, z });
    }
  }
  
  return Array.from(uniqueVertices.values());
}

export function generateSphereVertices(radius: number = 1, segments: number = 4): Vertex[] {
  const geom = new THREE.SphereGeometry(radius, segments, segments);
  const positions = geom.attributes.position.array as Float32Array;
  const vertices: Vertex[] = [];
  
  for (let i = 0; i < positions.length; i += 3) {
    vertices.push({
      x: positions[i],
      y: positions[i + 1],
      z: positions[i + 2],
    });
  }
  
  return vertices;
}

export function generateOctahedronVertices(radius: number = 1): Vertex[] {
  const geom = new THREE.OctahedronGeometry(radius, 0);
  return extractUniqueVertices(geom);
}

export function generateTetrahedronVertices(radius: number = 1): Vertex[] {
  const geom = new THREE.TetrahedronGeometry(radius, 0);
  return extractUniqueVertices(geom);
}

export function generateCubeVertices(radius: number = 1): Vertex[] {
  const geom = new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2, 1, 1, 1);
  return extractUniqueVertices(geom);
}

export function generateIcosahedronVertices(radius: number = 1): Vertex[] {
  const geom = new THREE.IcosahedronGeometry(radius, 0);
  return extractUniqueVertices(geom);
}

export function generateDodecahedronVertices(radius: number = 1): Vertex[] {
  const geom = new THREE.DodecahedronGeometry(radius, 0);
  return extractUniqueVertices(geom);
}

export function findNearestVertex(
  sourceVertex: Vertex,
  targetVertices: Vertex[]
): Vertex {
  let nearest = targetVertices[0];
  let maxDot = -Infinity;
  
  const sourceLength = Math.sqrt(
    sourceVertex.x * sourceVertex.x +
    sourceVertex.y * sourceVertex.y +
    sourceVertex.z * sourceVertex.z
  );
  
  if (sourceLength === 0) return nearest;
  
  const normalizedSource = {
    x: sourceVertex.x / sourceLength,
    y: sourceVertex.y / sourceLength,
    z: sourceVertex.z / sourceLength,
  };
  
  for (const target of targetVertices) {
    const targetLength = Math.sqrt(
      target.x * target.x + target.y * target.y + target.z * target.z
    );
    if (targetLength === 0) continue;
    
    const normalizedTarget = {
      x: target.x / targetLength,
      y: target.y / targetLength,
      z: target.z / targetLength,
    };
    
    const dot =
      normalizedSource.x * normalizedTarget.x +
      normalizedSource.y * normalizedTarget.y +
      normalizedSource.z * normalizedTarget.z;
    
    if (dot > maxDot) {
      maxDot = dot;
      nearest = target;
    }
  }
  
  return nearest;
}

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerpVertex(
  a: Vertex,
  b: Vertex,
  t: number
): Vertex {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}
