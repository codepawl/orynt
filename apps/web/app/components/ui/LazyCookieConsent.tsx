"use client";

import dynamic from "next/dynamic";

const CookieConsent = dynamic(
  () => import("./CookieConsent").then((m) => ({ default: m.CookieConsent })),
  { ssr: false }
);

export function LazyCookieConsent() {
  return <CookieConsent />;
}
