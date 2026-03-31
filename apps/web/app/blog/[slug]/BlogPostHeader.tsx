"use client";

import Link from "next/link";
import { formatDate } from "app/lib/utils";

interface BlogPostHeaderProps {
  title: string;
  publishedAt: string;
  readingTimeMinutes?: number;
}

export function BlogPostHeader({
  title,
  publishedAt,
  readingTimeMinutes,
}: BlogPostHeaderProps) {
  return (
    <>
      <Link
        href="/blog"
        className="inline-flex items-center text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors mb-6 text-sm"
      >
        <span className="mr-2">←</span>
        <span>Back to Blog</span>
      </Link>
      <h1
        className="text-neutral-900 dark:text-neutral-100 font-medium"
        style={{ marginBottom: 12 }}
      >
        {title}
      </h1>
      <div className="flex justify-between items-center mt-2 mb-8">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {formatDate(publishedAt)}
          {typeof readingTimeMinutes === "number" && (
            <span aria-hidden="true">{` · ${readingTimeMinutes} min read`}</span>
          )}
        </span>
      </div>
    </>
  );
}
