"use client";

import React, { Suspense, useState, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useTheme } from "next-themes";
import { BlobGeometry } from "./BlobGeometry";
import * as THREE from "three";

interface MorphingBlob3DProps {
  width?: number;
  height?: number;
  className?: string;
}

function BlobScene({
  reducedMotion,
  isHovering,
  isClicked,
  onReady,
}: {
  reducedMotion: boolean;
  isHovering: boolean;
  isClicked: boolean;
  onReady?: () => void;
}) {
  const timeRef = useRef(0);
  const { resolvedTheme } = useTheme();
  const blobGroupRef = useRef<THREE.Group>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowOpacityRef = useRef(0);
  const hasNotifiedReady = useRef(false);
  
  const segments = 4;
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (onReady && !hasNotifiedReady.current) {
      const timer = setTimeout(() => {
        hasNotifiedReady.current = true;
        onReady();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [onReady]);

  useFrame((state, delta) => {
    if (reducedMotion) return;
    timeRef.current += delta;

    // Cursor-follow when hovering; otherwise ease back to rest pose.
    // state.pointer is normalized to [-1, 1] in both axes.
    const group = blobGroupRef.current;
    if (!group) return;

    const stiffness = 10; // higher = snappier
    const t = 1 - Math.exp(-delta * stiffness);

    const targetX = isHovering ? state.pointer.y * 0.35 : 0; // up/down
    const targetY = isHovering ? state.pointer.x * 0.35 : 0; // left/right

    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetX, t);
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetY, t);

    // Click glow: animate a second additive wireframe layer
    const glowTarget = isClicked ? (isDark ? 0.32 : 0.24) : 0;
    const glowT = 1 - Math.exp(-delta * 16);
    glowOpacityRef.current = THREE.MathUtils.lerp(
      glowOpacityRef.current,
      glowTarget,
      glowT
    );
    if (glowMaterialRef.current) {
      glowMaterialRef.current.opacity = glowOpacityRef.current;
    }
  });

  const lineColor = isDark ? "#ffffff" : "#000000";

  return (
    <>
      <group ref={blobGroupRef}>
        {/* additive glow layer (only opacity animates) */}
        <mesh scale={1.03}>
          <BlobGeometry
            radius={1.2}
            segments={segments}
            speed={1.0}
            timeRef={timeRef}
          />
          <meshBasicMaterial
            ref={glowMaterialRef}
            color={lineColor}
            wireframe={true}
            transparent={true}
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh>
          <BlobGeometry
            radius={1.2}
            segments={segments}
            speed={1.0}
            timeRef={timeRef}
          />
          <meshBasicMaterial
            color={lineColor}
            wireframe={true}
            transparent={true}
            opacity={0.9}
          />
        </mesh>
      </group>
      
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableRotate={false}
        autoRotate={!reducedMotion && !isHovering}
        autoRotateSpeed={0.3}
        rotateSpeed={0.5}
      />
    </>
  );
}

export function MorphingBlob3D({
  width = 400,
  height = 400,
  className = "",
}: MorphingBlob3DProps) {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<number | null>(null);
  const readyTriggeredRef = useRef(false);

  const handleSceneReady = () => {
    if (readyTriggeredRef.current) return;
    readyTriggeredRef.current = true;
    setIsFadingOut(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 300);
  };

  useEffect(() => {
    setMounted(true);
    
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("webgl2");
      if (!gl) {
        setHasError(true);
        return;
      }
    } catch (e) {
      setHasError(true);
      return;
    }
    
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    
    const handleChange = () => setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    
    setIsVisible(true);
    
    if (containerRef.current) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          setIsVisible(entry.isIntersecting);
        },
        { threshold: 0.1 }
      );
      observer.observe(containerRef.current);
      
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
        observer.disconnect();
        if (clickTimerRef.current) {
          window.clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
      };
    }
  }, []);

  if (!mounted) {
    return null;
  }

  if (hasError) {
    return (
      <div
        ref={containerRef}
        className={`relative ${className} flex items-center justify-center`}
        style={{ width, height }}
      >
        <div className="w-48 h-48 rounded-full bg-gradient-to-br from-neutral-400 to-neutral-600 dark:from-neutral-500 dark:to-neutral-700 opacity-50 blur-3xl" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ width, height }}
    >
      {isLoading && (
        <div 
          className={`absolute inset-0 flex items-center justify-center z-10 transition-opacity duration-300 ${
            isFadingOut ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full border-4 border-neutral-200 dark:border-neutral-800" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-neutral-600 dark:border-t-neutral-400 animate-spin" style={{ animationDuration: "1s" }} />
            <div className="absolute inset-2 rounded-full border-2 border-transparent border-r-neutral-400 dark:border-r-neutral-500 animate-spin" style={{ animationDirection: "reverse", animationDuration: "0.8s" }} />
            <div className="absolute inset-4 rounded-full bg-neutral-100 dark:bg-neutral-900 animate-pulse" style={{ animationDuration: "1.5s" }} />
            <div className="absolute inset-6 rounded-full border border-neutral-300 dark:border-neutral-700 animate-ping" style={{ animationDuration: "2s" }} />
          </div>
        </div>
      )}
      {isVisible && (
        <Canvas
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
          }}
          camera={{ position: [0, 0, 5], fov: 50 }}
          dpr={[1, 2]}
          style={{ background: "transparent" }}
          onPointerEnter={() => setIsHovering(true)}
          onPointerLeave={() => setIsHovering(false)}
          onPointerDown={() => {
            setIsClicked(true);
            if (clickTimerRef.current) {
              window.clearTimeout(clickTimerRef.current);
            }
            clickTimerRef.current = window.setTimeout(() => {
              setIsClicked(false);
              clickTimerRef.current = null;
            }, 500);
          }}
        >
          <Suspense fallback={null}>
            <BlobScene
              reducedMotion={reducedMotion}
              isHovering={isHovering}
              isClicked={isClicked}
              onReady={handleSceneReady}
            />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
