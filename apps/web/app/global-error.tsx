"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "1rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#666", marginBottom: "1.5rem", maxWidth: 400 }}>
            An unexpected error occurred. We&apos;ve been notified and will look into it.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 500, background: "#111", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 500, border: "1px solid #ddd", borderRadius: 8, textDecoration: "none", color: "#444" }}
            >
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
