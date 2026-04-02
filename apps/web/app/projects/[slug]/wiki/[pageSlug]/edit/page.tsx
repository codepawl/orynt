"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "app/lib/supabase/client";
import { fetchWikiPage, updateWikiPage, deleteWikiPage } from "app/lib/wiki";
import { MarkdownRenderer } from "app/components/ui/MarkdownRenderer";
import type { WikiPage } from "@codepawl/shared";

export default function EditWikiPage() {
  const router = useRouter();
  const params = useParams();
  const projectSlug = params.slug as string;
  const pageSlug = params.pageSlug as string;

  const [page, setPage] = useState<WikiPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    fetchWikiPage(projectSlug, pageSlug).then((p) => {
      if (p) {
        setPage(p);
        setTitle(p.title);
        setContent(p.content);
      }
      setLoading(false);
    });
  }, [projectSlug, pageSlug]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push(`/login?redirect=/projects/${projectSlug}/wiki/${pageSlug}/edit`);
        return;
      }

      await updateWikiPage(session.access_token, projectSlug, pageSlug, {
        title: title.trim(),
        content: content.trim(),
      });

      setSuccess("Page updated.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await deleteWikiPage(session.access_token, projectSlug, pageSlug);
      router.push(`/projects/${projectSlug}/wiki`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="h-8 bg-neutral-100 dark:bg-neutral-900 rounded animate-pulse mb-4" />
        <div className="h-64 bg-neutral-100 dark:bg-neutral-900 rounded animate-pulse" />
      </div>
    );
  }

  if (!page) {
    return <div className="max-w-3xl mx-auto py-8 text-center text-neutral-500">Page not found.</div>;
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm";
  const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5";

  return (
    <div className="max-w-3xl mx-auto w-full py-4">
      <nav className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        <Link href={`/projects/${projectSlug}`} className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline">{projectSlug}</Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${projectSlug}/wiki/${pageSlug}`} className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline">{page.title}</Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-900 dark:text-neutral-100">Edit</span>
      </nav>

      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">Edit page</h1>

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelClass}>Content (Markdown)</label>
            <button
              type="button"
              onClick={() => setPreview(!preview)}
              className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer bg-transparent border-none"
            >
              {preview ? "Edit" : "Preview"}
            </button>
          </div>
          {preview ? (
            <div className="min-h-[320px] p-4 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
              <MarkdownRenderer content={content} repo={{ owner: "codepawl", name: projectSlug }} />
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              className={`${inputClass} resize-y font-mono text-xs`}
            />
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !content.trim()}
            className="px-5 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer border-none"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>

          <p className="text-xs text-neutral-400 ml-auto">
            Last updated {new Date(page.updated_at).toLocaleDateString()}
          </p>
        </div>

        {/* Delete */}
        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          {showDelete ? (
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 space-y-3">
              <p className="text-sm text-red-700 dark:text-red-300">
                Are you sure you want to delete this page? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 cursor-pointer border-none"
                >
                  Delete page
                </button>
                <button
                  onClick={() => setShowDelete(false)}
                  className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 cursor-pointer bg-transparent border-none"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDelete(true)}
              className="text-sm text-red-500 hover:text-red-700 cursor-pointer bg-transparent border-none"
            >
              Delete this page
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
