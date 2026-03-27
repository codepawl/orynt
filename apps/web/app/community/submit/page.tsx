"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "app/lib/supabase/client";
import { createPost } from "app/lib/community";
import { CATEGORIES } from "@codepawl/shared";

const postTypes = [
  { value: "link" as const, label: "Link" },
  { value: "text" as const, label: "Text" },
  { value: "show" as const, label: "Show CodePawl" },
];

const tagOptions = CATEGORIES.filter((c) => c !== "general");

export default function SubmitPage() {
  const router = useRouter();
  const [type, setType] = useState<"link" | "text" | "show">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < 6
          ? [...prev, tag]
          : prev
    );
  };

  const handleSubmit = async () => {
    setError("");

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (type === "link" && !url.trim()) {
      setError("URL is required for link posts");
      return;
    }
    if (type === "link") {
      const testUrl = url.trim().startsWith("http://") || url.trim().startsWith("https://")
        ? url.trim()
        : "https://" + url.trim();
      try {
        const parsed = new URL(testUrl);
        if (!parsed.hostname.includes(".")) {
          setError("Please enter a valid URL (e.g. example.com)");
          return;
        }
      } catch {
        setError("Please enter a valid URL (e.g. example.com)");
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
        url: type === "link" ? url.trim() : undefined,
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
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm"
            />
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

        {/* Tags — clickable pill grid */}
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-2">
            Tags <span className="font-normal text-neutral-400">(optional, max 6)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {tagOptions.map((tag) => {
              const selected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
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

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50 cursor-pointer border-none"
        >
          {loading ? "Submitting..." : "Submit"}
        </button>
      </div>
    </div>
  );
}
