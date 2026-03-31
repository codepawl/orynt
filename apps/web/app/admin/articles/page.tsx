"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trash, ArrowRepeat, PencilSquare, Plus } from "react-bootstrap-icons";
import {
  getArticles,
  createArticle,
  updateArticle,
  bulkChangeStatus,
  deleteArticle,
} from "../lib/api";
import type { Article, PaginatedResponse } from "../lib/types";
import { toast } from "../components/Toast";
import { StatusBadge } from "../components/StatusBadge";
import { ConfirmModal } from "../components/ConfirmModal";

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Review", value: "review" },
  { label: "Published", value: "published" },
  { label: "Rejected", value: "rejected" },
  { label: "Archived", value: "archived" },
];

interface ArticleForm {
  original_title: string;
  original_url: string;
  tags: string;
  status: string;
}

const EMPTY_FORM: ArticleForm = { original_title: "", original_url: "", tags: "", status: "draft" };

const inputClass =
  "w-full px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600";
const labelClass = "block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1";

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<"delete" | "reject" | null>(null);
  // Modal: null = closed, "create" = new, string = edit by id
  const [modal, setModal] = useState<"create" | string | null>(null);
  const [form, setForm] = useState<ArticleForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getArticles({ status, search, page, page_size: 20 });
      setData(result);
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => { setForm(EMPTY_FORM); setModal("create"); };
  const openEdit = (a: Article) => {
    setForm({
      original_title: a.original_title ?? a.title ?? "",
      original_url: a.original_url ?? "",
      tags: a.tags ?? "",
      status: a.status,
    });
    setModal(a.id);
  };
  const closeModal = () => { setModal(null); setForm(EMPTY_FORM); };

  const handleSubmit = async () => {
    if (!form.original_title.trim() || !form.original_url.trim()) {
      toast("Title and URL are required", "error");
      return;
    }
    setSubmitting(true);
    try {
      if (modal === "create") {
        await createArticle(form as Parameters<typeof createArticle>[0]);
        toast("Article created");
      } else if (modal) {
        await updateArticle(modal, {
          title: form.original_title,
          tags: form.tags || undefined,
        });
        toast("Article updated");
      }
      closeModal();
      fetchData();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteArticle(id);
      toast("Deleted");
      setConfirmDelete(null);
      fetchData();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    }
  };

  const handleBulkStatus = async (newStatus: string) => {
    if (selectedIds.length === 0) return;
    try {
      await bulkChangeStatus(selectedIds, newStatus);
      toast(`Updated ${selectedIds.length} articles`);
      setSelectedIds([]);
      setBulkConfirm(null);
      fetchData();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    }
  };

  const handleBulkDelete = async () => {
    try {
      await Promise.all(selectedIds.map((id) => deleteArticle(id)));
      toast(`Deleted ${selectedIds.length} articles`);
      setSelectedIds([]);
      setBulkConfirm(null);
      fetchData();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    }
  };

  const allSelected = data.items.length > 0 && data.items.every((a) => selectedIds.includes(a.id));
  const toggleAll = () => setSelectedIds(allSelected ? [] : data.items.map((a) => a.id));
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div>
      {confirmDelete && (
        <ConfirmModal
          title="Delete article?"
          message="This will permanently delete the article. This cannot be undone."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {bulkConfirm === "delete" && (
        <ConfirmModal
          title={`Delete ${selectedIds.length} articles?`}
          message="This will permanently delete all selected articles. This cannot be undone."
          confirmLabel="Delete All"
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkConfirm(null)}
        />
      )}

      {/* Add / Edit Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              {modal === "create" ? "Add Article" : "Edit Article"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Title</label>
                <input
                  className={inputClass}
                  placeholder="Article title"
                  value={form.original_title}
                  onChange={(e) => setForm((f) => ({ ...f, original_title: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>URL</label>
                <input
                  className={inputClass}
                  placeholder="https://example.com/article"
                  value={form.original_url}
                  onChange={(e) => setForm((f) => ({ ...f, original_url: e.target.value }))}
                  disabled={modal !== "create"}
                />
              </div>
              <div>
                <label className={labelClass}>Tags (comma-separated)</label>
                <input
                  className={inputClass}
                  placeholder="ai, machine-learning"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </div>
              {modal === "create" && (
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    className={inputClass}
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Saving…" : modal === "create" ? "Add" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Articles</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
          >
            <ArrowRepeat size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-300 transition-colors"
          >
            <Plus size={14} />
            Add Article
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
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
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">{selectedIds.length} selected</span>
          <button
            onClick={() => handleBulkStatus("review")}
            className="px-3 py-1 text-xs rounded border border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            Move to Review
          </button>
          <button
            onClick={() => handleBulkStatus("rejected")}
            className="px-3 py-1 text-xs rounded border border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={() => setBulkConfirm("delete")}
            className="px-3 py-1 text-xs rounded border border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete All
          </button>
        </div>
      )}

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-neutral-100 rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2.5 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Title</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-24">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-48">Tags</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-28">Created</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.items.map((a) => (
                <tr key={a.id} className="bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900">
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
                  <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 truncate">
                    {a.tags ? a.tags.split(",").slice(0, 3).map((t) => t.trim()).join(", ") : "—"}
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
                        onClick={() => openEdit(a)}
                        className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                        title="Edit"
                      >
                        <ArrowRepeat size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(a.id)}
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
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
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
