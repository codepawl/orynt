"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { CATEGORIES } from "@codepawl/shared";
import { createClient } from "app/lib/supabase/client";
import { createBlogPost, updateBlogPost, updateBlogPostStatus } from "app/lib/blog";
import type { BlogPost } from "@codepawl/shared";

// Dynamic import to avoid SSR issues with Tiptap DOM APIs
const BlogEditor = dynamic(
  () => import("app/components/features/blog-editor/BlogEditor").then((m) => m.BlogEditor),
  { ssr: false, loading: () => <div className="h-80 rounded-lg border border-neutral-200 dark:border-neutral-800 animate-pulse bg-neutral-50 dark:bg-neutral-900" /> }
);

const tagOptions = CATEGORIES.filter((c) => c !== "general");
const AUTOSAVE_KEY = "blog-write-draft";

export default function WritePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState("");
  const [content, setContent] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [savedPost, setSavedPost] = useState<BlogPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auth check on mount
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login?redirect=/blog/write");
        return;
      }
      setToken(session.access_token);
    });
  }, [router]);

  // Restore autosave from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          title?: string; summary?: string; tags?: string[];
          coverUrl?: string; contentMarkdown?: string;
        };
        if (parsed.title) setTitle(parsed.title);
        if (parsed.summary) setSummary(parsed.summary);
        if (parsed.tags) setTags(parsed.tags);
        if (parsed.coverUrl) setCoverUrl(parsed.coverUrl);
        if (parsed.contentMarkdown) setContentMarkdown(parsed.contentMarkdown);
      }
    } catch {
      // ignore malformed
    }
  }, []);

  // Pre-fill from ?title=&url=&tags= query params (e.g. from admin articles shortcut)
  useEffect(() => {
    const qTitle = searchParams.get("title");
    const qUrl = searchParams.get("url");
    const qTags = searchParams.get("tags");
    if (qTitle) setTitle(qTitle);
    if (qTags) {
      const parsed = qTags.split(",").map((t) => t.trim()).filter(Boolean);
      setTags(parsed);
    }
    if (qUrl) {
      setContentMarkdown((prev) => prev || `Source: ${qUrl}\n\n`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave to localStorage every 30s
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      localStorage.setItem(
        AUTOSAVE_KEY,
        JSON.stringify({ title, summary, tags, coverUrl, contentMarkdown })
      );
    }, 30_000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [title, summary, tags, coverUrl, contentMarkdown]);

  const handleEditorChange = useCallback((html: string, md: string) => {
    setContent(html);
    setContentMarkdown(md);
  }, []);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < 6 ? [...prev, tag] : prev
    );
  };

  const validate = () => {
    if (!title.trim()) { setError("Title is required"); return false; }
    if (!content || content === "<p></p>") { setError("Content is required"); return false; }
    return true;
  };

  const saveDraft = async () => {
    if (!token) { router.push("/login?redirect=/blog/write"); return; }
    if (!validate()) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        content,
        content_markdown: contentMarkdown || undefined,
        summary: summary.trim() || undefined,
        cover_image_url: coverUrl.trim() || undefined,
        tags: tags.join(", "),
        status: "draft" as const,
      };
      const post = savedPost
        ? await updateBlogPost(token, savedPost.id, payload)
        : await createBlogPost(token, payload);
      setSavedPost(post);
      localStorage.removeItem(AUTOSAVE_KEY);
      setSaveMsg("Draft saved");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const submitForReview = async () => {
    if (!token) { router.push("/login?redirect=/blog/write"); return; }
    if (!validate()) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        content,
        content_markdown: contentMarkdown || undefined,
        summary: summary.trim() || undefined,
        cover_image_url: coverUrl.trim() || undefined,
        tags: tags.join(", "),
      };
      const post = savedPost
        ? await updateBlogPost(token, savedPost.id, payload)
        : await createBlogPost(token, { ...payload, status: "review" });

      if (savedPost) {
        await updateBlogPostStatus(token, post.id, "review");
      }
      localStorage.removeItem(AUTOSAVE_KEY);
      router.push("/blog/drafts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full py-8 px-4">
      {/* Mobile notice */}
      <div className="sm:hidden mb-4 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
        Desktop is recommended for writing. Some features may be limited on mobile.
      </div>

      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">
        Write a post
      </h1>

      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="Give your post a title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm"
          />
          <span className="text-xs text-neutral-400 mt-1 block text-right">{title.length}/300</span>
        </div>

        {/* Summary */}
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            Summary <span className="font-normal text-neutral-400">(optional, shown in listings)</span>
          </label>
          <textarea
            placeholder="A short description of your post…"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={500}
            rows={2}
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm resize-none"
          />
        </div>

        {/* Cover image URL */}
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            Cover image URL <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <input
            type="url"
            placeholder="https://…"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            Tags <span className="font-normal text-neutral-400">(optional, max 6)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {tagOptions.map((tag) => {
              const selected = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer ${
                    selected
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-transparent text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            Content <span className="text-red-500">*</span>
          </label>
          <BlogEditor
            initialContent={content}
            initialMarkdown={contentMarkdown}
            onChange={handleEditorChange}
            uploadToken={token ?? undefined}
            placeholder="Start writing your post…"
          />
        </div>

        {/* Error / save feedback */}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {saveMsg && <p className="text-sm text-green-600 dark:text-green-400">{saveMsg}</p>}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={saveDraft}
            disabled={saving || submitting}
            className="px-5 py-2.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={submitForReview}
            disabled={saving || submitting}
            className="px-5 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer"
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </button>
        </div>
      </div>
    </div>
  );
}
