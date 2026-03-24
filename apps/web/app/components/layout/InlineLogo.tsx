"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function InlineLogo({ size = 32 }: { size?: number }) {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const currentTheme = theme === "system" ? (systemTheme || "light") : (theme || "light");
  const isDark = currentTheme === "dark";

  // Before mount: use CSS to handle both themes (no flash)
  if (!mounted) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="100 100 300 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <style>{`
          .logo-bg { fill: white; }
          .logo-fg { stroke: black; fill: black; }
          @media (prefers-color-scheme: dark) {
            .logo-bg { fill: #161616; }
            .logo-fg { stroke: white; fill: white; }
          }
        `}</style>
        <rect x="100" y="100" width="300" height="300" rx="15" className="logo-bg" />
        <line x1="192.675" y1="247.14" x2="215.068" y2="224.746" className="logo-fg" strokeWidth="21.1132" strokeLinecap="round" />
        <line x1="215.069" y1="224.746" x2="192.675" y2="202.352" className="logo-fg" strokeWidth="21.1132" strokeLinecap="round" />
        <line x1="285.269" y1="224.671" x2="316.938" y2="224.671" className="logo-fg" strokeWidth="21.1132" strokeLinecap="round" />
        <circle cx="250.432" cy="286.955" r="15.8349" className="logo-fg" />
      </svg>
    );
  }

  // After mount: use JS-determined theme (matches next-themes toggle)
  const bg = isDark ? "white" : "#161616";
  const fg = isDark ? "black" : "white";

  return (
    <svg
      width={size}
      height={size}
      viewBox="100 100 300 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="100" y="100" width="300" height="300" rx="15" fill={bg} />
      <line x1="192.675" y1="247.14" x2="215.068" y2="224.746" stroke={fg} strokeWidth="21.1132" strokeLinecap="round" />
      <line x1="215.069" y1="224.746" x2="192.675" y2="202.352" stroke={fg} strokeWidth="21.1132" strokeLinecap="round" />
      <line x1="285.269" y1="224.671" x2="316.938" y2="224.671" stroke={fg} strokeWidth="21.1132" strokeLinecap="round" />
      <circle cx="250.432" cy="286.955" r="15.8349" fill={fg} />
    </svg>
  );
}
