"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 max-w-md px-4 text-center">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 m-0">
          Something went wrong
        </h1>
        <p className="text-base text-neutral-600 dark:text-neutral-400">
          An unexpected error occurred. Don&apos;t worry, it happens to the best of us.
        </p>
        <p className="text-sm text-neutral-500 dark:text-neutral-500">
          Error: {error.message || "Unknown error"}
        </p>
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-medium bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-300 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors no-underline"
          >
            Go home
          </Link>
        </div>
      </div>
    </section>
  );
}
