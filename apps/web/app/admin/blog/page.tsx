"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRepeat, Plus, PencilSquare, Trash } from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { fetchAllBlogPosts, updateBlogPostStatus, deleteBlogPost } from "app/lib/blog";
import type { BlogPost } from "@codepawl/shared";
import { toast } from "../components/Toast";
import { StatusBadge } from "../components/StatusBadge";
import { ConfirmModal } from "../components/ConfirmModal";

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Review", value: "review" },
  { label: "Published", value: "published" },
];

const STATUS_TRANSITIONS: Record<string, { label: string; value: "draft" | "review" | "published" }[]> = {
  draft: [{ label: "Submit for Review", value: "review" }, { label: "Publish", value: "published" }],
  review: [{ label: "Publish", value: "published" }, { label: "Back to Draft", value: "draft" }],
  published: [{ label: "Unpublish", value: "draft" }],
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-us", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminBlogPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [token, setToken] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<"delete" | null>(null);

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

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatus = async (postId: string, newStatus: "draft" | "review" | "published") => {
    if (!token) return;
    try {
      await updateBlogPostStatus(token, postId, newStatus);
      toast(`Moved to ${newStatus}`);
      fetchData();
    } catch (err: unknown) {
      toast((err as Error).message ?? "Failed to update status", "error");
    }
  };

  const handleDelete = async (postId: string) => {
    if (!token) return;
    try {
      await deleteBlogPost(token, postId);
      toast("Post deleted");
      setConfirmDelete(null);
      fetchData();
    } catch (err: unknown) {
      toast((err as Error).message ?? "Failed to delete", "error");
    }
  };

  const handleBulkPublish = async () => {
    if (!token || selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map((id) => updateBlogPostStatus(token, id, "published")));
      toast(`Published ${selectedIds.length} posts`);
      setSelectedIds([]);
      fetchData();
    } catch (err: unknown) {
      toast((err as Error).message ?? "Bulk publish failed", "error");
    }
  };

  const handleBulkDelete = async () => {
    if (!token || selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map((id) => deleteBlogPost(token, id)));
      toast(`Deleted ${selectedIds.length} posts`);
      setSelectedIds([]);
      setBulkConfirm(null);
      fetchData();
    } catch (err: unknown) {
      toast((err as Error).message ?? "Bulk delete failed", "error");
    }
  };

  const totalPages = Math.ceil(total / 20) || 1;
  const allSelected = posts.length > 0 && posts.every((p) => selectedIds.includes(p.id));
  const toggleAll = () => setSelectedIds(allSelected ? [] : posts.map((p) => p.id));
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div>
      {confirmDelete && (
        <ConfirmModal
          title="Delete post?"
          message="This will permanently delete the blog post. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {bulkConfirm === "delete" && (
        <ConfirmModal
          title={`Delete ${selectedIds.length} posts?`}
          message="This will permanently delete all selected posts. This cannot be undone."
          confirmLabel="Delete All"
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkConfirm(null)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Blog Posts</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArrowRepeat size={14} />
            Refresh
          </button>
          <Link
            href="/blog/write"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-md hover:bg-neutral-700 dark:hover:bg-neutral-300 transition-colors no-underline"
          >
            <Plus size={14} />
            New Post
          </Link>
        </div>
      </div>

      {/* Filters + bulk actions */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => { setStatus(opt.value); setPage(1); setSelectedIds([]); }}
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

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            {selectedIds.length} selected
          </span>
          <button
            type="button"
            onClick={handleBulkPublish}
            className="px-3 py-1 text-xs rounded border border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
          >
            Publish All
          </button>
          <button
            type="button"
            onClick={() => setBulkConfirm("delete")}
            className="px-3 py-1 text-xs rounded border border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete All
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
              </th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400">Title</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400 hidden md:table-cell">Author</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400 hidden sm:table-cell w-28">Status</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400 hidden lg:table-cell w-28">Updated</th>
              <th className="text-right px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400 w-36">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">Loading…</td>
              </tr>
            ) : posts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">No posts found.</td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr key={post.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(post.id)}
                      onChange={() => toggleOne(post.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline line-clamp-1"
                    >
                      {post.title}
                    </Link>
                    {post.tags && (
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 line-clamp-1">{post.tags}</p>
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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Status dropdown */}
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) handleStatus(post.id, e.target.value as "draft" | "review" | "published");
                        }}
                        className="px-1.5 py-1 text-xs border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400"
                      >
                        <option value="">Status…</option>
                        {(STATUS_TRANSITIONS[post.status] ?? []).map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => router.push(`/blog/edit/${post.id}`)}
                        className="p-1 text-neutral-400 hover:text-blue-500 transition-colors"
                        title="Edit"
                      >
                        <PencilSquare size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(post.id)}
                        className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash size={13} />
                      </button>
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
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Page {page} of {totalPages}</span>
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
