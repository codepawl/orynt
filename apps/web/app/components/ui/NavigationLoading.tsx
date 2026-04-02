"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";

function NavigationLoadingBar() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const prevPathname = useRef(pathname);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Hide loading when pathname changes (navigation completed)
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      const timer = setTimeout(() => setLoading(false), 150);
      prevPathname.current = pathname;
      return () => clearTimeout(timer);
    }
  }, [pathname]);

  // Detect internal link clicks to show loading bar
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (href === pathname) return;
      setLoading(true);

      // Safety timeout: hide bar after 5s max to prevent stuck state
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setLoading(false), 5000);
    };

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      clearTimeout(timeoutRef.current);
    };
  }, [pathname]);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 0.7 }}
          exit={{ scaleX: 1, opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            zIndex: 9999,
            transformOrigin: "left",
            pointerEvents: "none",
          }}
          className="bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
        />
      )}
    </AnimatePresence>
  );
}

export function NavigationLoading() {
  return (
    <Suspense fallback={null}>
      <NavigationLoadingBar />
    </Suspense>
  );
}
