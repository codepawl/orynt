"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "app/lib/supabase/client";
import { createWikiPage } from "app/lib/wiki";
import { MarkdownRenderer } from "app/components/ui/MarkdownRenderer";

export default function NewWikiPage() {
  const router = useRouter();
  const params = useParams();
  const projectSlug = params.slug as string;

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const autoSlug = (t: string) =>
    t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (!slug || slug === autoSlug(title)) {
      setSlug(autoSlug(v));
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required.");
      return;
    }
    if (!slug.trim()) {
      setError("Slug is required.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push(`/login?redirect=/projects/${projectSlug}/wiki/new`);
        return;
      }

      const page = await createWikiPage(session.access_token, projectSlug, {
        title: title.trim(),
        slug: slug.trim(),
        content: content.trim(),
      });

      router.push(`/projects/${projectSlug}/wiki/${page.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create page");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm";
  const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5";

  return (
    <div className="max-w-3xl mx-auto w-full py-4">
      <nav className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        <Link href="/projects" className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline">Projects</Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${projectSlug}`} className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline">{projectSlug}</Link>
        <span className="mx-2">/</span>
        <Link href={`/projects/${projectSlug}/wiki`} className="hover:text-neutral-700 dark:hover:text-neutral-300 no-underline">Wiki</Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-900 dark:text-neutral-100">New page</span>
      </nav>

      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">Create wiki page</h1>

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Page title"
            maxLength={200}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="page-slug"
            maxLength={100}
            className={inputClass}
          />
          <p className="text-xs text-neutral-400 mt-1">URL: /projects/{projectSlug}/wiki/{slug || "..."}</p>
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
              placeholder="Write your documentation in Markdown..."
              rows={16}
              className={`${inputClass} resize-y font-mono text-xs`}
            />
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !title.trim() || !content.trim()}
          className="w-full px-5 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer border-none"
        >
          {submitting ? "Creating..." : "Create page"}
        </button>
      </div>
    </div>
  );
}
