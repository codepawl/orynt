"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";

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

  const bg = isDark ? "#161616" : "white";
  const fg = isDark ? "white" : "black";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  if (!mounted) {
    return (
      <div
        className={className}
        style={{ width, height, borderRadius: 15 }}
      />
    );
  }

  // Scale factor from 500x500 viewbox to actual size
  const scale = width / 500;

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
        {/* Background with subtle border */}
        <rect
          x="100" y="100"
          width="300" height="300"
          rx="15"
          fill={bg}
          stroke={borderColor}
          strokeWidth="1"
        />

        {/* > chevron — two lines forming the prompt symbol */}
        <g
          style={{
            transform: isHovered ? "translateX(6px)" : "translateX(0)",
            transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transformOrigin: "200px 225px",
          }}
        >
          {/* Top stroke of > */}
          <line
            x1="192.675" y1="247.14"
            x2="215.068" y2="224.746"
            stroke={fg}
            strokeWidth="21.1132"
            strokeLinecap="round"
          />
          {/* Bottom stroke of > */}
          <line
            x1="215.069" y1="224.746"
            x2="192.675" y2="202.352"
            stroke={fg}
            strokeWidth="21.1132"
            strokeLinecap="round"
          />
        </g>

        {/* Horizontal dash — cursor line */}
        <line
          x1="285.269" y1="224.671"
          x2="316.938" y2="224.671"
          stroke={fg}
          strokeWidth="21.1132"
          strokeLinecap="round"
          style={{
            opacity: isHovered ? 1 : 1,
            animation: isHovered ? "cursorBlink 1s step-end infinite" : "none",
          }}
        />

        {/* Eye (circle) with blink animation */}
        <ellipse
          cx="250.432"
          cy="286.955"
          rx="15.8349"
          ry={isBlinking ? 2 : 15.8349}
          fill={fg}
          style={{
            transition: isBlinking
              ? "ry 0.08s ease-in"
              : "ry 0.12s ease-out",
            transformOrigin: "250.432px 286.955px",
          }}
        />
      </svg>

      <style jsx>{`
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
