"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

export const BLOCK_FAST = 0.12;
export const BLOCK_BASE = 0.18;
export const BLOCK_REVEAL = 0.28;
export const BLOCK_MAX = 0.48;

const BLOCK_EASE = "linear";
const VIEWPORT = { once: true, amount: 0.28 };
const HOVER_LIFT = { y: -4 };
const PRESS_NUDGE = { x: 2, y: 2 };

type MotionPrimitiveProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export function BlockReveal({
  children,
  className = "",
  delay = 0,
}: MotionPrimitiveProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{
        duration: BLOCK_REVEAL,
        ease: BLOCK_EASE,
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}

export function BlockMotionItem({
  children,
  className = "",
  delay = 0,
}: MotionPrimitiveProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={HOVER_LIFT}
      whileTap={PRESS_NUDGE}
      viewport={VIEWPORT}
      transition={{
        duration: BLOCK_BASE,
        ease: BLOCK_EASE,
        delay: Math.min(delay, BLOCK_BASE),
      }}
    >
      {children}
    </motion.div>
  );
}

export function BlockMotionListItem({
  children,
  className = "",
  delay = 0,
}: MotionPrimitiveProps) {
  return (
    <motion.li
      className={className}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={HOVER_LIFT}
      whileTap={PRESS_NUDGE}
      viewport={VIEWPORT}
      transition={{
        duration: BLOCK_BASE,
        ease: BLOCK_EASE,
        delay: Math.min(delay, BLOCK_BASE),
      }}
    >
      {children}
    </motion.li>
  );
}

export function BlockRevealListItem({
  children,
  className = "",
  delay = 0,
}: MotionPrimitiveProps) {
  return (
    <motion.li
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{
        duration: BLOCK_REVEAL,
        ease: BLOCK_EASE,
        delay,
      }}
    >
      {children}
    </motion.li>
  );
}

export function BlockPress({
  children,
  className = "",
}: Omit<MotionPrimitiveProps, "delay">) {
  return (
    <motion.span
      className={className}
      whileTap={PRESS_NUDGE}
      transition={{
        duration: BLOCK_FAST,
        ease: BLOCK_EASE,
      }}
    >
      {children}
    </motion.span>
  );
}
