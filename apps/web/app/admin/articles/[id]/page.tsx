"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, XCircle, CheckCircle } from "react-bootstrap-icons";
import { getArticle, updateArticle, changeArticleStatus } from "../../lib/api";
import type { Article } from "../../lib/types";
import { toast } from "../../components/Toast";
import { StatusBadge } from "../../components/StatusBadge";

export default function ArticleEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");

  useEffect(() => {
    getArticle(id)
      .then((a) => {
        setArticle(a);
        setTitle(a.title || a.original_title || "");
        setSlug(a.slug || "");
        setSummary(a.summary || "");
        setTags(a.tags || "");
        setImageUrl(a.image_url || "");
        setMetaTitle(a.meta_title || "");
        setMetaDescription(a.meta_description || "");
      })
      .catch((err) => toast(err.message, "error"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateArticle(id, {
        title,
        slug,
        summary,
        tags,
        image_url: imageUrl,
        meta_title: metaTitle,
        meta_description: metaDescription,
      } as any);
      setArticle({ ...article, ...updated } as Article);
      toast("Saved");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const updated = await changeArticleStatus(id, newStatus);
      setArticle({ ...article, ...updated } as Article);
      toast(`Status → ${newStatus}`);
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-neutral-100 rounded-full animate-spin" />
      </div>
    );
  }

  if (!article) {
    return (
      <p className="text-neutral-500 dark:text-neutral-400">Article not found</p>
    );
  }

  const inputClass =
    "w-full px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600";
  const labelClass = "block text-xs text-neutral-500 dark:text-neutral-400 mb-1";
  const cardClass =
    "bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4";

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.push("/admin/articles")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          <ArrowLeft size={13} />
          Back
        </button>
        <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex-1 truncate">
          {title}
        </h1>
        <StatusBadge status={article.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Content */}
        <div className={`${cardClass} space-y-4`}>
          <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            Content
          </h2>
          <div>
            <label className={labelClass}>Title</label>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Slug</label>
            <input
              className={inputClass}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Summary</label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Tags (comma-separated)</label>
            <input
              className={inputClass}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          <div className={`${cardClass} space-y-2`}>
            <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
              Actions
            </h2>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full px-4 py-2 text-sm font-medium bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {(article.status === "draft" || article.status === "review") && (
              <button
                onClick={() => handleStatusChange("published")}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <CheckCircle size={13} />
                Publish
              </button>
            )}
            {article.status === "draft" && (
              <button
                onClick={() => handleStatusChange("review")}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                <CheckCircle size={13} />
                Move to Review
              </button>
            )}
            {article.status !== "rejected" && article.status !== "published" && (
              <button
                onClick={() => handleStatusChange("rejected")}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-sm border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <XCircle size={13} />
                Reject
              </button>
            )}
          </div>

          {/* SEO */}
          <div className={`${cardClass} space-y-3`}>
            <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              SEO
            </h2>
            <div>
              <label className={labelClass}>
                Meta Title ({metaTitle.length}/60)
              </label>
              <input
                className={inputClass}
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                maxLength={60}
              />
            </div>
            <div>
              <label className={labelClass}>
                Meta Description ({metaDescription.length}/155)
              </label>
              <textarea
                className={`${inputClass} resize-none`}
                rows={3}
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                maxLength={155}
              />
            </div>
            <div>
              <label className={labelClass}>Image URL</label>
              <input
                className={inputClass}
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </div>
          </div>

          {/* Source */}
          <div className={cardClass}>
            <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
              Source
            </h2>
            <label className={labelClass}>Original URL</label>
            <a
              href={article.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all block"
            >
              {article.original_url}
            </a>
            {article.original_published_at && (
              <div className="mt-3">
                <label className={labelClass}>Published</label>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  {new Date(article.original_published_at).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
