"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { CATEGORIES } from "@codepawl/shared";
import { createClient } from "app/lib/supabase/client";
import { updateBlogPost, updateBlogPostStatus } from "app/lib/blog";
import type { BlogPost } from "@codepawl/shared";

const BlogEditor = dynamic(
  () => import("app/components/features/blog-editor/BlogEditor").then((m) => m.BlogEditor),
  { ssr: false, loading: () => <div className="h-80 rounded-lg border border-neutral-200 dark:border-neutral-800 animate-pulse bg-neutral-50 dark:bg-neutral-900" /> }
);

const tagOptions = CATEGORIES.filter((c) => c !== "general");

export default function EditPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState("");
  const [content, setContent] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace(`/login?redirect=/blog/edit/${id}`);
        return;
      }
      setToken(session.access_token);

      // Fetch post from my-posts (includes drafts)
      try {
        const { fetchMyPosts } = await import("app/lib/blog");
        const list = await fetchMyPosts(session.access_token);
        const found = list?.posts.find((p) => p.id === id);
        if (!found) {
          router.replace("/blog/drafts");
          return;
        }
        setPost(found);
        setTitle(found.title);
        setSummary(found.summary ?? "");
        setTags(found.tags ? found.tags.split(",").map((t) => t.trim()).filter(Boolean) : []);
        setCoverUrl(found.cover_image_url ?? "");
        setContent(found.content);
        setContentMarkdown(found.content_markdown ?? "");
      } catch {
        router.replace("/blog/drafts");
      } finally {
        setLoading(false);
      }
    });
  }, [id, router]);

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

  const savePost = async () => {
    if (!token || !post) return;
    if (!validate()) return;
    setSaving(true);
    setError("");
    try {
      await updateBlogPost(token, post.id, {
        title: title.trim(),
        content,
        content_markdown: contentMarkdown || undefined,
        summary: summary.trim() || undefined,
        cover_image_url: coverUrl.trim() || undefined,
        tags: tags.join(", "),
      });
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const submitForReview = async () => {
    if (!token || !post) return;
    if (!validate()) return;
    setSubmitting(true);
    setError("");
    try {
      await updateBlogPost(token, post.id, {
        title: title.trim(),
        content,
        content_markdown: contentMarkdown || undefined,
        summary: summary.trim() || undefined,
        cover_image_url: coverUrl.trim() || undefined,
        tags: tags.join(", "),
      });
      await updateBlogPostStatus(token, post.id, "review");
      router.push("/blog/drafts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto w-full py-8 px-4">
        <div className="h-8 w-48 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-neutral-100 dark:bg-neutral-900 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Edit post
        </h1>
        {post && (
          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
            post.status === "published"
              ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
              : post.status === "review"
              ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
          }`}>
            {post.status}
          </span>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            Summary
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={500}
            rows={2}
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            Cover image URL
          </label>
          <input
            type="url"
            placeholder="https://…"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            Tags <span className="font-normal text-neutral-400">(max 6)</span>
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

        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            Content <span className="text-red-500">*</span>
          </label>
          {content !== undefined && (
            <BlogEditor
              initialContent={content}
              initialMarkdown={contentMarkdown}
              onChange={handleEditorChange}
              uploadToken={token ?? undefined}
            />
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {saveMsg && <p className="text-sm text-green-600 dark:text-green-400">{saveMsg}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={savePost}
            disabled={saving || submitting}
            className="px-5 py-2.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {post?.status !== "published" && (
            <button
              type="button"
              onClick={submitForReview}
              disabled={saving || submitting}
              className="px-5 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer"
            >
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
