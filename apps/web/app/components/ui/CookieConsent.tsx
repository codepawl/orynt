"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const COOKIE_NAME = "codepawl-consent";
const ONE_YEAR = 365 * 24 * 60 * 60;

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};samesite=lax`;
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookie(COOKIE_NAME)) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = (value: "accepted" | "declined") => {
    setCookie(COOKIE_NAME, value, ONE_YEAR);
    setVisible(false);

    if (value === "declined") {
      // Disable Vercel Analytics & Speed Insights by opting out
      // Vercel's scripts check `window.va` / `window.si` — removing them
      // isn't possible after mount, but we set the flag so the *next*
      // page load (layout.tsx) can read the cookie and skip rendering them.
      window.location.reload();
    }
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 border-t border-neutral-200 dark:border-neutral-700 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-4 py-3 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-sm">
        <p className="flex-1 text-center sm:text-left text-neutral-600 dark:text-neutral-400 m-0">
          We use cookies for authentication and analytics.{" "}
          <Link href="/cookies" className="underline hover:text-neutral-900 dark:hover:text-neutral-200">Cookie Policy</Link>
          {" · "}
          <Link href="/privacy" className="underline hover:text-neutral-900 dark:hover:text-neutral-200">Privacy</Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => dismiss("declined")}
            className="px-4 py-1.5 text-sm font-medium rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer bg-transparent"
            type="button"
          >
            Decline
          </button>
          <button
            onClick={() => dismiss("accepted")}
            className="px-4 py-1.5 text-sm font-medium rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-80 transition-opacity cursor-pointer border-none"
            type="button"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
