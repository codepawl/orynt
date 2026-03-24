"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useNavigation } from "./NavigationContext";

function NavigationLoadingBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isNavigating, setNavigating } = useNavigation();
  const { theme, systemTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = theme === "system" ? (systemTheme || "light") : (theme || "light");
  const isDark = currentTheme === "dark";

  // Show loading when navigation starts
  useEffect(() => {
    if (isNavigating) {
      setLoading(true);
    }
  }, [isNavigating]);

  // Hide loading when pathname changes (navigation completes) or when navigation is cancelled
  useEffect(() => {
    if (prevPathnameRef.current !== null && prevPathnameRef.current !== pathname) {
      // Navigation completed, hide loading after a short delay
      const timer = setTimeout(() => {
        setLoading(false);
        setNavigating(false);
      }, 300);

      return () => clearTimeout(timer);
    } else if (prevPathnameRef.current === pathname && isNavigating) {
      // Same pathname but navigation was triggered (likely prevented), hide loading
      const timer = setTimeout(() => {
        setLoading(false);
        setNavigating(false);
      }, 200);

      return () => clearTimeout(timer);
    }
    
    // Update ref
    prevPathnameRef.current = pathname;
  }, [pathname, searchParams, setNavigating, isNavigating]);

  if (!loading || !mounted) return null;

  const gradientColor = isDark 
    ? "rgba(255, 255, 255, 0.3)" 
    : "rgba(0, 0, 0, 0.3)";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "3px",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          background: `linear-gradient(90deg, transparent, ${gradientColor}, transparent)`,
          animation: "shimmer 1.5s infinite",
        }}
      />
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}

export function NavigationLoading() {
  return (
    <Suspense fallback={null}>
      <NavigationLoadingBar />
    </Suspense>
  );
}
