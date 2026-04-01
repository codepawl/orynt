"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "app/lib/supabase/client";
import { createPost } from "app/lib/community";
import { TagInput } from "../TagInput";

const postTypes = [
  { value: "link" as const, label: "Link" },
  { value: "text" as const, label: "Text" },
  { value: "show" as const, label: "Show CodePawl" },
];

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return "https://" + trimmed;
}

function validateUrl(raw: string): string | null {
  if (!raw.trim()) return "URL is required for link posts";
  const normalized = normalizeUrl(raw);
  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname.includes(".")) return "Please enter a valid URL (e.g. example.com)";
    if (["javascript:", "data:", "file:"].includes(parsed.protocol)) return "This URL scheme is not allowed";
  } catch {
    return "Please enter a valid URL";
  }
  return null;
}

export default function SubmitPage() {
  const router = useRouter();
  const [type, setType] = useState<"link" | "text" | "show">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // URL preview state
  const [urlPreview, setUrlPreview] = useState<{ valid: boolean; error?: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleUrlBlur = async () => {
    if (type !== "link" || !url.trim()) {
      setUrlError("");
      setUrlPreview(null);
      return;
    }
    const err = validateUrl(url);
    if (err) {
      setUrlError(err);
      setUrlPreview(null);
      return;
    }
    setUrlError("");

    // Auto-prepend https:// in the input
    const normalized = normalizeUrl(url);
    if (normalized !== url.trim()) setUrl(normalized);

    // Check URL reachability
    setPreviewLoading(true);
    setUrlPreview(null);
    try {
      const API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/api/community/url-preview?url=${encodeURIComponent(normalized)}`);
      if (res.ok) {
        const data = await res.json();
        setUrlPreview(data);
      } else {
        setUrlPreview(null);
      }
    } catch {
      setUrlPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError("");

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (type === "link") {
      const err = validateUrl(url);
      if (err) {
        setUrlError(err);
        setError(err);
        return;
      }
    }
    if (type !== "link" && !content.trim()) {
      setError("Content is required");
      return;
    }

    setLoading(true);
    try {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setError("Auth not configured");
        return;
      }
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?redirect=/community/submit");
        return;
      }

      const post = await createPost(session.access_token, {
        type,
        title: title.trim(),
        url: type === "link" ? normalizeUrl(url) : undefined,
        content: type !== "link" ? content.trim() : undefined,
        tags: selectedTags.join(", "),
      });

      router.push(`/community/post/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  };

  const hasUrlError = type === "link" && !!urlError;

  return (
    <div className="max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">
        Submit to Community
      </h1>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-5">
        {/* Post type selector */}
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-2">
            Post type
          </label>
          <div className="flex gap-2">
            {postTypes.map((pt) => (
              <button
                key={pt.value}
                onClick={() => setType(pt.value)}
                className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer ${
                  type === pt.value
                    ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 border-neutral-900 dark:border-neutral-100"
                    : "bg-transparent text-neutral-600 dark:text-neutral-400 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {pt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-2">
            Title
          </label>
          <input
            type="text"
            placeholder="What's interesting?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm"
          />
          <span className="text-xs text-neutral-400 mt-1 block text-right">
            {title.length}/300
          </span>
        </div>

        {/* URL or Content */}
        {type === "link" ? (
          <div>
            <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-2">
              URL
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError("");
                setUrlPreview(null);
              }}
              onBlur={handleUrlBlur}
              className={`w-full px-3 py-2.5 rounded-lg border bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm ${
                urlError
                  ? "border-red-400 dark:border-red-600"
                  : "border-neutral-300 dark:border-neutral-700"
              }`}
            />
            {urlError && (
              <p className="text-xs text-red-500 mt-1">{urlError}</p>
            )}
            {/* URL preview status */}
            {previewLoading && (
              <p className="text-xs text-neutral-400 mt-1.5">Checking link…</p>
            )}
            {urlPreview && !urlError && (
              <div className={`text-xs mt-1.5 flex items-center gap-1 ${
                urlPreview.valid
                  ? "text-green-600 dark:text-green-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}>
                {urlPreview.valid ? (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
                    <span>Link verified</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9-3a1 1 0 11-2 0 1 1 0 012 0zM8 6.5a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 018 6.5z"/></svg>
                    <span>{urlPreview.error || "This URL may not be accessible"}</span>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-2">
              Content
            </label>
            <textarea
              rows={6}
              placeholder={
                type === "show"
                  ? "Tell the community about what you've built..."
                  : "Share your thoughts..."
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={10000}
              className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm resize-y"
            />
          </div>
        )}

        {/* Tags — autocomplete input */}
        <TagInput value={selectedTags} onChange={setSelectedTags} />

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || hasUrlError}
          className="w-full py-3 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50 cursor-pointer border-none"
        >
          {loading ? "Submitting..." : "Submit"}
        </button>
      </div>
    </div>
  );
}
