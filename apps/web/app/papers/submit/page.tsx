"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise } from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { createPaper, fetchArxivMetadata } from "app/lib/papers";

export default function SubmitPaperPage() {
  const router = useRouter();

  const [arxivUrl, setArxivUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [abstract, setAbstract] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [venue, setVenue] = useState("");
  const [year, setYear] = useState("");
  const [tags, setTags] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleFetchMetadata = async () => {
    if (!arxivUrl.trim()) return;
    setFetching(true);
    setError("");
    try {
      const data = await fetchArxivMetadata(arxivUrl.trim());
      if (data) {
        setTitle(data.title);
        setAuthors(data.authors);
        setAbstract(data.abstract);
        setPdfUrl(data.pdf_url);
        if (data.year) setYear(String(data.year));
      } else {
        setError("Could not fetch metadata. Check the arXiv URL.");
      }
    } catch {
      setError("Failed to fetch arXiv metadata.");
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?redirect=/papers/submit");
        return;
      }

      const paper = await createPaper(session.access_token, {
        title: title.trim(),
        authors: authors.trim(),
        arxiv_url: arxivUrl.trim() || undefined,
        pdf_url: pdfUrl.trim() || undefined,
        venue: venue.trim() || undefined,
        year: year ? parseInt(year, 10) : undefined,
        abstract: abstract.trim() || undefined,
        tags: tags.trim(),
      });

      router.push(`/papers/${paper.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit paper");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm";
  const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5";

  return (
    <div className="max-w-2xl mx-auto w-full py-4">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">Submit a paper</h1>

      {/* ArXiv auto-fetch */}
      <div className="mb-6 p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
        <label className={labelClass}>arXiv URL (optional)</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={arxivUrl}
            onChange={(e) => setArxivUrl(e.target.value)}
            placeholder="https://arxiv.org/abs/2301.00001"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleFetchMetadata}
            disabled={fetching || !arxivUrl.trim()}
            className="shrink-0 px-4 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer bg-transparent flex items-center gap-1.5"
          >
            <ArrowClockwise size={14} className={fetching ? "animate-spin" : ""} />
            Fetch
          </button>
        </div>
        <p className="text-xs text-neutral-400 mt-1.5">Paste an arXiv URL to auto-fill title, authors, and abstract.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Paper title"
            maxLength={500}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Authors</label>
          <input
            type="text"
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder="Author 1, Author 2, ..."
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Venue</label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. ICLR 2026"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2026"
              min="1990"
              max="2030"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>PDF URL</label>
          <input
            type="url"
            value={pdfUrl}
            onChange={(e) => setPdfUrl(e.target.value)}
            placeholder="https://arxiv.org/pdf/..."
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Abstract</label>
          <textarea
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            placeholder="Paper abstract..."
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <label className={labelClass}>Tags</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. quantization, llm, compression"
            className={inputClass}
          />
          <p className="text-xs text-neutral-400 mt-1">Comma-separated, lowercase. Max 5 tags.</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !title.trim()}
          className="w-full px-5 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer border-none"
        >
          {submitting ? "Submitting..." : "Submit paper"}
        </button>
      </div>
    </div>
  );
}
