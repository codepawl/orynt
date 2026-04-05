"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function AnalyticsWrapper() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const consent = getCookie("codepawl-consent");
    // Enable analytics if accepted OR if user hasn't decided yet (implicit consent until decline)
    setEnabled(consent !== "declined");
  }, []);

  if (!enabled) return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
