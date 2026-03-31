"use client";

import { useEffect, useState } from "react";
import { Plus, Trash, ArrowRepeat, PlayCircle, PencilSquare } from "react-bootstrap-icons";
import { getFeeds, createFeed, updateFeed, deleteFeed, fetchFeed } from "../lib/api";
import type { Feed } from "../lib/types";
import { toast } from "../components/Toast";
import { ConfirmModal } from "../components/ConfirmModal";

const CATEGORY_OPTIONS = [
  { label: "General", value: "general" },
  { label: "Research", value: "research" },
  { label: "Tools", value: "tools" },
  { label: "Industry", value: "industry" },
  { label: "Tutorials", value: "tutorials" },
  { label: "Hardware", value: "hardware" },
];

interface FeedForm {
  name: string;
  url: string;
  category: string;
}

const EMPTY_FORM: FeedForm = { name: "", url: "", category: "general" };

const inputClass =
  "w-full px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600";
const labelClass = "block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1";

export default function FeedsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  // modal: null = closed, "create" = new, string = edit by id
  const [modal, setModal] = useState<"create" | string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [form, setForm] = useState<FeedForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<FeedForm>>({});

  const loadFeeds = async () => {
    setLoading(true);
    try {
      const data = await getFeeds();
      setFeeds(data);
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFeeds(); }, []);

  const validateForm = (): boolean => {
    const errs: Partial<FeedForm> = {};
    if (!form.name.trim()) errs.name = "Required";
    if (!form.url.trim()) {
      errs.url = "Required";
    } else {
      try { new URL(form.url); } catch { errs.url = "Must be a valid URL"; }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const openCreate = () => { setForm(EMPTY_FORM); setErrors({}); setModal("create"); };
  const openEdit = (feed: Feed) => {
    setForm({ name: feed.name, url: feed.url, category: feed.category });
    setErrors({});
    setModal(feed.id);
  };
  const closeModal = () => { setModal(null); setForm(EMPTY_FORM); setErrors({}); };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      if (modal === "create") {
        await createFeed(form);
        toast("Feed added");
      } else if (modal) {
        await updateFeed(modal, { name: form.name, category: form.category });
        toast("Feed updated");
      }
      closeModal();
      loadFeeds();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (feed: Feed) => {
    try {
      await updateFeed(feed.id, { is_active: !feed.is_active });
      toast(feed.is_active ? "Deactivated" : "Activated");
      loadFeeds();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFeed(id);
      toast("Deleted");
      setConfirmDelete(null);
      loadFeeds();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    }
  };

  const handleFetch = async (feed: Feed) => {
    setFetchingId(feed.id);
    try {
      const result = await fetchFeed(feed.id);
      toast(`${result.feed}: ${result.new_articles} new, ${result.skipped_duplicates} skipped`);
      loadFeeds();
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    } finally {
      setFetchingId(null);
    }
  };

  return (
    <div>
      {confirmDelete && (
        <ConfirmModal
          title="Delete feed?"
          message="This will remove the feed and stop collecting articles from it."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Add / Edit Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              {modal === "create" ? "Add RSS Feed" : "Edit Feed"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  className={`${inputClass} ${errors.name ? "border-red-400" : ""}`}
                  placeholder="e.g. HuggingFace Blog"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>
              <div>
                <label className={labelClass}>RSS URL</label>
                <input
                  className={`${inputClass} ${errors.url ? "border-red-400" : ""}`}
                  placeholder="https://example.com/feed.xml"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  disabled={modal !== "create"}
                />
                {errors.url && <p className="mt-1 text-xs text-red-500">{errors.url}</p>}
              </div>
              <div>
                <label className={labelClass}>Category</label>
                <select
                  className={inputClass}
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
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
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Feeds</h1>
        <div className="flex gap-2">
          <button
            onClick={loadFeeds}
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
            Add Feed
          </button>
        </div>
      </div>

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-neutral-100 rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-28">Category</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-16">Active</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-36">Last Fetched</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 w-16">Errors</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {feeds.map((feed) => (
                <tr key={feed.id} className="bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <td className="px-4 py-2.5 text-neutral-900 dark:text-neutral-100">{feed.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-1.5 py-0.5 rounded text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                      {feed.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      role="switch"
                      aria-checked={feed.is_active}
                      onClick={() => handleToggle(feed)}
                      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${
                        feed.is_active ? "bg-green-500" : "bg-neutral-300 dark:bg-neutral-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform mt-0.5 ${
                          feed.is_active ? "translate-x-3.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">
                    {feed.last_fetched_at ? new Date(feed.last_fetched_at).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      feed.error_count > 0
                        ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                        : "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                    }`}>
                      {feed.error_count}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleFetch(feed)}
                        disabled={fetchingId === feed.id}
                        className="p-1 text-neutral-400 hover:text-blue-500 disabled:opacity-40 transition-colors"
                        title="Fetch now"
                      >
                        <PlayCircle size={14} className={fetchingId === feed.id ? "animate-spin" : ""} />
                      </button>
                      <button
                        onClick={() => openEdit(feed)}
                        className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                        title="Edit"
                      >
                        <PencilSquare size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(feed.id)}
                        className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {feeds.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                    No feeds configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
