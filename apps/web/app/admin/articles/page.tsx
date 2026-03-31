"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trash, ArrowRepeat, PencilSquare } from "react-bootstrap-icons";
import { getArticles, bulkChangeStatus, deleteArticle } from "../lib/api";
import type { Article, PaginatedResponse } from "../lib/types";
import { toast } from "../components/Toast";
import { StatusBadge } from "../components/StatusBadge";

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Review", value: "review" },
  { label: "Published", value: "published" },
  { label: "Rejected", value: "rejected" },
  { label: "Archived", value: "archived" },
];

export default function ArticlesPage() {
  const router = useRouter();
  const [data, setData] = useState<PaginatedResponse<Article>>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getArticles({ status, search, page, page_size: 20 });
      setData(result);
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBulkStatus = async (newStatus: string) => {
    if (selectedIds.length === 0) return;
    try {
      await bulkChangeStatus(selectedIds, newStatus);
      toast(`Updated ${selectedIds.length} articles`);
      setSelectedIds([]);
      fetchData();
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this article?")) return;
    try {
      await deleteArticle(id);
      toast("Deleted");
      fetchData();
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const allSelected =
    data.items.length > 0 && data.items.every((a) => selectedIds.includes(a.id));
  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : data.items.map((a) => a.id));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Articles
        </h1>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
        >
          <ArrowRepeat size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            setPage(1);
          }}
          className="flex gap-1"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search articles…"
            className="px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 w-56"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Search
          </button>
        </form>
        {selectedIds.length > 0 && (
          <>
            <button
              onClick={() => handleBulkStatus("review")}
              className="px-3 py-1.5 text-sm border border-blue-500 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              Move to Review ({selectedIds.length})
            </button>
            <button
              onClick={() => handleBulkStatus("rejected")}
              className="px-3 py-1.5 text-sm border border-red-500 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Reject ({selectedIds.length})
            </button>
          </>
        )}
      </div>

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-neutral-100 rounded-full animate-spin" />
          </div>
        )}
        {!loading && (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Title
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-24">
                  Status
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-48">
                  Tags
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-28">
                  Created
                </th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.items.map((a) => (
                <tr
                  key={a.id}
                  className="bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(a.id)}
                      onChange={() => toggleOne(a.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-2.5 max-w-0">
                    <button
                      onClick={() => router.push(`/admin/articles/${a.id}`)}
                      className="text-neutral-900 dark:text-neutral-100 hover:underline truncate block text-left w-full"
                    >
                      {a.title || a.original_title}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 truncate">
                    {a.tags
                      ? a.tags
                          .split(",")
                          .slice(0, 3)
                          .map((t) => t.trim())
                          .join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">
                    {new Date(a.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const params = new URLSearchParams();
                          if (a.title || a.original_title) params.set("title", (a.title || a.original_title)!);
                          if (a.original_url) params.set("url", a.original_url);
                          if (a.tags) params.set("tags", a.tags);
                          router.push(`/blog/write?${params.toString()}`);
                        }}
                        className="p-1 text-neutral-400 hover:text-blue-500 transition-colors"
                        title="Write blog post"
                      >
                        <PencilSquare size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500"
                  >
                    No articles found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {data.total_pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {data.total} total · page {data.page} of {data.total_pages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
              disabled={page >= data.total_pages}
              className="px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
