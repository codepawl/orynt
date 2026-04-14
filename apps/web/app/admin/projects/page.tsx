"use client";

import { useState } from "react";
import { ArrowClockwise } from "react-bootstrap-icons";

export default function AdminProjectsPage() {
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleRefresh() {
    if (!slug.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/revalidate/project-docs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_REVALIDATE_SECRET || ""}`,
        },
        body: JSON.stringify({ projectSlug: slug.trim() }),
      });

      if (res.ok) {
        setResult({ ok: true, message: `Docs cache refreshed for "${slug.trim()}"` });
      } else {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        setResult({ ok: false, message: data.error || `Failed (${res.status})` });
      }
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">
        Projects
      </h1>

      <div className="max-w-md">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
          Refresh Docs Cache
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Invalidate the ISR cache for a project&apos;s GitHub-sourced documentation.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Project slug (e.g. yeastbook)"
            className="flex-1 px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRefresh();
            }}
          />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || !slug.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowClockwise size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing..." : "Refresh Docs"}
          </button>
        </div>

        {result && (
          <p
            className={`mt-3 text-sm ${
              result.ok
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {result.message}
          </p>
        )}
      </div>
    </div>
  );
}
