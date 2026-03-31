"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowRepeat } from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { fetchAllBlogPosts, updateBlogPostStatus } from "app/lib/blog";
import type { BlogPost } from "@codepawl/shared";
import { toast } from "../components/Toast";
import { StatusBadge } from "../components/StatusBadge";

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Review", value: "review" },
  { label: "Published", value: "published" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-us", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? null);
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (token === null) return;
    setLoading(true);
    try {
      const result = await fetchAllBlogPosts(token, status || undefined, page);
      setPosts(result?.posts ?? []);
      setTotal(result?.total ?? 0);
    } catch (err: unknown) {
      toast((err as Error).message ?? "Failed to load posts", "error");
    } finally {
      setLoading(false);
    }
  }, [token, status, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatus = async (postId: string, newStatus: "draft" | "review" | "published") => {
    if (!token) return;
    try {
      await updateBlogPostStatus(token, postId, newStatus);
      toast(`Post ${newStatus === "published" ? "published" : "moved to " + newStatus}`);
      fetchData();
    } catch (err: unknown) {
      toast((err as Error).message ?? "Failed to update status", "error");
    }
  };

  const totalPages = Math.ceil(total / 20) || 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Blog Posts
        </h1>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          <ArrowRepeat size={14} />
          Refresh
        </button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => { setStatus(opt.value); setPage(1); }}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              status === opt.value
                ? "border-neutral-900 dark:border-neutral-100 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                : "border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-500"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-neutral-400 dark:text-neutral-500">
          {total} post{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
              <th className="text-left px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400">Title</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400 hidden md:table-cell">Author</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">Status</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400 hidden lg:table-cell">Updated</th>
              <th className="text-right px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  Loading…
                </td>
              </tr>
            ) : posts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  No posts found.
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr key={post.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline line-clamp-1"
                    >
                      {post.title}
                    </Link>
                    {post.tags && (
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 line-clamp-1">
                        {post.tags}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 hidden md:table-cell">
                    {post.author.display_name ?? post.author.username}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <StatusBadge status={post.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400 hidden lg:table-cell whitespace-nowrap">
                    {formatDate(post.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {post.status !== "published" && (
                        <button
                          type="button"
                          onClick={() => handleStatus(post.id, "published")}
                          className="px-2.5 py-1 text-xs rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                        >
                          Publish
                        </button>
                      )}
                      {post.status !== "draft" && (
                        <button
                          type="button"
                          onClick={() => handleStatus(post.id, "draft")}
                          className="px-2.5 py-1 text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                        >
                          Unpublish
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-600 dark:text-neutral-400 disabled:opacity-40 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-600 dark:text-neutral-400 disabled:opacity-40 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
