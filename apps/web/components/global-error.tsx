"use client";

import { Link } from "@/components/link";
import { useEffect } from "react";

export function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6 py-20">
      <p className="cp-marker text-danger mb-6">500 · something broke</p>
      <h1 className="cp-h1 text-fg-1">We hit an error.</h1>
      <p className="cp-lead text-fg-2 mt-6">
        Sentry has been notified. You can retry, or head back to the homepage.
      </p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="cp-button bg-ratchet text-ink-0 hover:bg-ratchet-hot inline-flex items-center px-4 py-2 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="cp-button border-fg-3 text-fg-1 hover:bg-ink-3 inline-flex items-center border px-4 py-2 transition-colors"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
