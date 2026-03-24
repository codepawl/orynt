"use client";

import { useMemo, forwardRef, useImperativeHandle, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useTheme } from "next-themes";

interface BlobMaterialProps {
  color?: string;
  glowColor?: string;
  intensity?: number;
}

export interface BlobMaterialRef {
  material: THREE.ShaderMaterial;
}

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vViewPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform vec3 uGlowColor;
  uniform float uIntensity;
  uniform float uTime;
  uniform vec3 uCameraPosition;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  
  void main() {
    // Edge detection using normal and view direction (Fresnel)
    vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - dot(viewDirection, vNormal), 1.2);
    
    // Create sharp border effect - only show edges
    // Use tighter range for cleaner border
    float edgeFactor = smoothstep(0.4, 0.6, fresnel);
    
    // Border color - only at edges
    vec3 borderColor = uColor;
    
    // Glow only at the very edges, not spreading outward
    float glowFactor = smoothstep(0.5, 0.8, fresnel) * uIntensity;
    vec3 glow = uGlowColor * glowFactor;
    
    // Combine border and glow - center is transparent
    vec3 finalColor = mix(vec3(0.0), borderColor + glow, edgeFactor);
    
    // Alpha: completely transparent in center, visible only at edges
    float alpha = edgeFactor;
    
    // Ensure no color bleeding outside the shape
    if (alpha < 0.01) {
      discard;
    }
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export const BlobMaterial = forwardRef<BlobMaterialRef, BlobMaterialProps>(
  ({ color, glowColor, intensity = 1.0 }, ref) => {
    const { resolvedTheme } = useTheme();
    const { camera } = useThree();
    const isDark = resolvedTheme === "dark";

    const material = useMemo(() => {
      const baseColor = color || (isDark ? "#ffffff" : "#000000");
      const glow = glowColor || (isDark ? "#e5e5e5" : "#404040");

      return new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(baseColor) },
          uGlowColor: { value: new THREE.Color(glow) },
          uIntensity: { value: intensity },
          uTime: { value: 0 },
          uCameraPosition: { value: new THREE.Vector3() },
        },
        transparent: true,
        side: THREE.DoubleSide,
      });
    }, [color, glowColor, intensity, isDark]);

    // Update camera position uniform
    useEffect(() => {
      if (material && camera) {
        const worldPos = new THREE.Vector3();
        camera.getWorldPosition(worldPos);
        material.uniforms.uCameraPosition.value.copy(worldPos);
      }
    }, [material, camera]);

    // Update colors when theme changes
    useEffect(() => {
      if (material) {
        const baseColor = color || (isDark ? "#ffffff" : "#000000");
        const glow = glowColor || (isDark ? "#e5e5e5" : "#404040");
        material.uniforms.uColor.value.set(baseColor);
        material.uniforms.uGlowColor.value.set(glow);
      }
    }, [material, color, glowColor, isDark]);

    useImperativeHandle(ref, () => ({ material }), [material]);

    return <primitive object={material} />;
  }
);

BlobMaterial.displayName = "BlobMaterial";
