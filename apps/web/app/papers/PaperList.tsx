"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Paper } from "@codepawl/shared";
import { ChevronLeft, ChevronRight, Journal } from "react-bootstrap-icons";
import { VerificationBadge } from "./[id]/VerificationBadge";

interface PaperListProps {
  papers: Paper[];
  total: number;
  page: number;
  totalPages: number;
  currentSort: string;
  currentStatus?: string;
}

export function PaperList({
  papers,
  total,
  page,
  totalPages,
  currentSort,
  currentStatus,
}: PaperListProps) {
  const router = useRouter();

  const buildUrl = (p: number) => {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    if (currentSort !== "newest") params.set("sort", currentSort);
    if (currentStatus) params.set("status", currentStatus);
    const qs = params.toString();
    return `/papers${qs ? `?${qs}` : ""}`;
  };

  if (papers.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <Journal className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No papers yet. Be the first to submit one.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-4">{total} paper{total !== 1 ? "s" : ""}</p>

      <div className="space-y-3">
        {papers.map((paper) => (
          <Link
            key={paper.id}
            href={`/papers/${paper.id}`}
            className="block rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors no-underline"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <VerificationBadge status={paper.verification_status} />
                  {paper.venue && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                      {paper.venue}{paper.year ? ` ${paper.year}` : ""}
                    </span>
                  )}
                  {!paper.venue && paper.year && (
                    <span className="text-xs text-neutral-400">{paper.year}</span>
                  )}
                </div>
                <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100 mb-1 line-clamp-2">
                  {paper.title}
                </h3>
                <p className="text-sm text-neutral-500 truncate">{paper.authors}</p>
                {paper.tags && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {paper.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 dark:bg-neutral-700 text-neutral-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {paper.reproduction_count}
                </span>
                <p className="text-xs text-neutral-400">
                  reproduction{paper.reproduction_count !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => router.push(buildUrl(page - 1))}
            disabled={page <= 1}
            className="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors cursor-pointer bg-transparent border-none"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-neutral-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => router.push(buildUrl(page + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors cursor-pointer bg-transparent border-none"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
