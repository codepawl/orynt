"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { NewsArticle, NewsTag } from "app/lib/news";
import { getBackendApiUrl } from "@codepawl/shared";

const API_URL = getBackendApiUrl();

interface Props {
  initialArticles: NewsArticle[];
  initialTotalPages: number;
  tags: NewsTag[];
  activeTag?: string;
}

export function NewsListClient({
  initialArticles,
  initialTotalPages,
  tags,
  activeTag,
}: Props) {
  const [articles, setArticles] = useState(initialArticles);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [selectedTag, setSelectedTag] = useState(activeTag || "");
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(async (newPage: number, tag?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(newPage),
        per_page: "12",
      });
      if (tag) params.set("tag", tag);
      const res = await fetch(`${API_URL}/api/news?${params}`);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles);
        setTotalPages(data.total_pages);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePageChange = (p: number) => {
    setPage(p);
    loadPage(p, selectedTag);
  };

  const handleTagClick = (tagSlug: string) => {
    const newTag = tagSlug === selectedTag ? "" : tagSlug;
    setSelectedTag(newTag);
    setPage(1);
    loadPage(1, newTag);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div>
      {/* Tag filters */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {tags.map((tag) => (
            <button
              key={tag.slug}
              type="button"
              onClick={() => handleTagClick(tag.slug)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                selectedTag === tag.slug
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              {tag.name} ({tag.article_count})
            </button>
          ))}
        </div>
      )}

      {/* Article grid */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          opacity: loading ? 0.6 : 1,
          transition: "opacity 200ms",
        }}
      >
        {articles.map((article) => (
          <Link
            key={article.slug}
            href={`/news/${article.slug}`}
            className="no-underline block"
          >
            <div className="card-shadow-offset h-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent p-3 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex flex-col gap-2" style={{ minHeight: 120 }}>
                <span
                  className="font-semibold text-neutral-900 dark:text-neutral-100 leading-snug overflow-hidden"
                  style={{
                    fontSize: 15,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {article.title}
                </span>
                {article.summary && (
                  <span
                    className="text-neutral-600 dark:text-neutral-400 overflow-hidden"
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {article.summary}
                  </span>
                )}
                <div className="mt-auto">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-wrap gap-1">
                      {article.tags &&
                        article.tags
                          .split(",")
                          .slice(0, 3)
                          .map((t) => (
                            <span
                              key={t.trim()}
                              className="px-1.5 py-0.5 rounded text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800"
                              style={{ fontSize: 11 }}
                            >
                              {t.trim()}
                            </span>
                          ))}
                    </div>
                    <span className="text-neutral-500 dark:text-neutral-400 flex-shrink-0 text-xs">
                      {formatDate(article.published_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {articles.length === 0 && !loading && (
        <div className="text-center py-16">
          <p className="text-neutral-500 dark:text-neutral-400">
            No news articles yet. Check back soon.
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-8">
          <button
            onClick={() => handlePageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors"
          >
            Prev
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                onClick={() => handlePageChange(p)}
                className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                  page === p
                    ? "border-neutral-900 dark:border-neutral-100 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                    : "border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                }`}
              >
                {p}
              </button>
            );
          })}
          <button
            onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
