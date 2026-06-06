"use client";

import { motion } from "motion/react";

type ArchitecturalOverlayProps = {
  className?: string;
};

export function ArchitecturalOverlay({
  className = "",
}: ArchitecturalOverlayProps) {
  const rectTransition = (index: number) => ({
    duration: 0.2,
    ease: "linear" as const,
    delay: index * 0.04,
  });

  return (
    <div
      className={`pointer-events-none absolute hidden select-none md:block ${className}`}
      aria-hidden="true"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 520 560"
        fill="none"
        focusable="false"
      >
        <motion.rect
          x="34"
          y="42"
          width="188"
          height="188"
          className="stroke-ink-4"
          strokeWidth="4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={rectTransition(0)}
        />
        <motion.rect
          x="286"
          y="22"
          width="168"
          height="104"
          className="stroke-ink-4"
          strokeWidth="4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={rectTransition(1)}
        />
        <motion.rect
          x="110"
          y="282"
          width="116"
          height="180"
          className="stroke-ink-4"
          strokeWidth="4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={rectTransition(2)}
        />
        <motion.rect
          x="322"
          y="252"
          width="132"
          height="132"
          className="stroke-ink-4"
          strokeWidth="4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={rectTransition(3)}
        />
        <motion.rect
          x="252"
          y="438"
          width="214"
          height="62"
          className="stroke-ink-4"
          strokeWidth="4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={rectTransition(4)}
        />
        <motion.rect
          x="56"
          y="248"
          width="328"
          height="14"
          className="fill-ratchet"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.24,
            ease: "linear",
            delay: 0.18,
          }}
        />
      </svg>
    </div>
  );
}
