"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { motion } from "motion/react";

interface AnimatedLogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export function AnimatedLogo({ width = 300, height = 300, className }: AnimatedLogoProps) {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Random blink interval
  useEffect(() => {
    if (!mounted) return;

    const scheduleBlink = () => {
      const delay = 2000 + Math.random() * 4000; // 2-6s between blinks
      return setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150); // blink duration
        timerId = scheduleBlink();
      }, delay);
    };

    let timerId = scheduleBlink();
    return () => clearTimeout(timerId);
  }, [mounted]);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  const currentTheme = theme === "system" ? (systemTheme || "light") : (theme || "light");
  const isDark = currentTheme === "dark";

  // Logo inverts against page: dark page gets light logo, light page gets dark logo
  const bg = isDark ? "white" : "#161616";
  const fg = isDark ? "black" : "white";

  if (!mounted) {
    return (
      <div
        className={className}
        style={{ width, height, borderRadius: 15 }}
      />
    );
  }

  return (
    <div
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ width, height, cursor: "default" }}
    >
      <svg
        width={width}
        height={height}
        viewBox="0 0 500 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible" }}
        aria-hidden="true"
      >
        {/* Background */}
        <rect
          x="100" y="100"
          width="300" height="300"
          rx="15"
          fill={bg}
        />

        {/* Top arm of > — flattens to horizontal dash on hover */}
        <motion.g
          animate={{
            rotate: isHovered ? 45 : 0,
            translateY: isHovered ? -11.2 : 0,
          }}
          transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ transformOrigin: "203.87px 235.94px" }}
        >
          <line
            x1="192.675" y1="247.14"
            x2="215.068" y2="224.746"
            stroke={fg}
            strokeWidth="21.1132"
            strokeLinecap="round"
          />
        </motion.g>

        {/* Bottom arm of > — flattens to horizontal dash on hover */}
        <motion.g
          animate={{
            rotate: isHovered ? -45 : 0,
            translateY: isHovered ? 11.2 : 0,
          }}
          transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ transformOrigin: "203.87px 213.55px" }}
        >
          <line
            x1="215.069" y1="224.746"
            x2="192.675" y2="202.352"
            stroke={fg}
            strokeWidth="21.1132"
            strokeLinecap="round"
          />
        </motion.g>

        {/* Right horizontal dash — existing "eye" */}
        <line
          x1="285.269" y1="224.671"
          x2="316.938" y2="224.671"
          stroke={fg}
          strokeWidth="21.1132"
          strokeLinecap="round"
        />

        {/* Eye (circle) with blink animation */}
        <motion.ellipse
          cx="250.432"
          cy="286.955"
          rx="15.8349"
          animate={{ ry: isBlinking ? 2 : 15.8349 }}
          transition={{ duration: isBlinking ? 0.08 : 0.12, ease: isBlinking ? "easeIn" : "easeOut" }}
          fill={fg}
          style={{ transformOrigin: "250.432px 286.955px" }}
        />
      </svg>

    </div>
  );
}
