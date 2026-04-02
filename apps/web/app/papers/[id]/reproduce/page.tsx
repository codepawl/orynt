"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { PlusCircle, XCircle } from "react-bootstrap-icons";
import { createClient } from "app/lib/supabase/client";
import { fetchPaper, createReproduction } from "app/lib/papers";
import type { Paper } from "@codepawl/shared";

const RESULT_OPTIONS = [
  { value: "confirmed", label: "Confirmed", desc: "Results match the paper's claims" },
  { value: "partially", label: "Partially Reproduced", desc: "Some results match, some don't" },
  { value: "failed", label: "Failed to Reproduce", desc: "Could not reproduce the results" },
  { value: "different_findings", label: "Different Findings", desc: "Found something different but interesting" },
] as const;

interface ClaimRow {
  metric: string;
  paperValue: string;
  actualValue: string;
}

export default function ReproducePage() {
  const router = useRouter();
  const params = useParams();
  const paperId = params.id as string;

  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);

  const [result, setResult] = useState("");
  const [hardware, setHardware] = useState("");
  const [framework, setFramework] = useState("");
  const [modelTested, setModelTested] = useState("");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [codeUrl, setCodeUrl] = useState("");
  const [claims, setClaims] = useState<ClaimRow[]>([{ metric: "", paperValue: "", actualValue: "" }]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPaper(paperId).then((p) => {
      setPaper(p);
      setLoading(false);
    });
  }, [paperId]);

  const addClaim = () => setClaims([...claims, { metric: "", paperValue: "", actualValue: "" }]);

  const removeClaim = (index: number) => {
    if (claims.length <= 1) return;
    setClaims(claims.filter((_, i) => i !== index));
  };

  const updateClaim = (index: number, field: keyof ClaimRow, value: string) => {
    const updated = [...claims];
    updated[index] = { ...updated[index], [field]: value };
    setClaims(updated);
  };

  const handleSubmit = async () => {
    if (!result) { setError("Please select a result."); return; }
    if (!summary.trim()) { setError("Summary is required."); return; }

    setSubmitting(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push(`/login?redirect=/papers/${paperId}/reproduce`);
        return;
      }

      // Build claims arrays — filter empty rows
      const validClaims = claims.filter((c) => c.metric.trim());
      const paperClaims = validClaims.map((c) => ({ [c.metric]: c.paperValue }));
      const actualResults = validClaims.map((c) => ({ [c.metric]: c.actualValue }));

      await createReproduction(session.access_token, paperId, {
        result,
        hardware: hardware.trim() || undefined,
        framework: framework.trim() || undefined,
        model_tested: modelTested.trim() || undefined,
        summary: summary.trim(),
        details: details.trim() || undefined,
        code_url: codeUrl.trim() || undefined,
        paper_claims: paperClaims.length > 0 ? paperClaims : undefined,
        actual_results: actualResults.length > 0 ? actualResults : undefined,
      });

      router.push(`/papers/${paperId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="h-8 bg-neutral-100 dark:bg-neutral-900 rounded animate-pulse mb-4" />
        <div className="h-32 bg-neutral-100 dark:bg-neutral-900 rounded animate-pulse" />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="max-w-2xl mx-auto py-8 text-center text-neutral-500">Paper not found.</div>
    );
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent text-sm";
  const labelClass = "block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5";

  return (
    <div className="max-w-2xl mx-auto w-full py-4">
      {/* Paper info */}
      <div className="mb-6 p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
        <p className="text-xs text-neutral-400 mb-1">Reproducing</p>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{paper.title}</h2>
        <p className="text-sm text-neutral-500 mt-1">{paper.authors}</p>
      </div>

      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">Submit reproduction report</h1>

      <div className="space-y-6">
        {/* Result */}
        <div>
          <label className={labelClass}>Result *</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RESULT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setResult(opt.value)}
                className={`text-left p-3 rounded-lg border-2 transition-colors cursor-pointer bg-transparent ${
                  result === opt.value
                    ? "border-neutral-900 dark:border-neutral-100"
                    : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500"
                }`}
              >
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{opt.label}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Hardware / Framework / Model */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Hardware</label>
            <input
              type="text"
              value={hardware}
              onChange={(e) => setHardware(e.target.value)}
              placeholder="e.g. RTX 4090 24GB"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Framework</label>
            <input
              type="text"
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
              placeholder="e.g. PyTorch 2.3"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Model tested</label>
            <input
              type="text"
              value={modelTested}
              onChange={(e) => setModelTested(e.target.value)}
              placeholder="e.g. Llama-3-8B"
              className={inputClass}
            />
          </div>
        </div>

        {/* Summary */}
        <div>
          <label className={labelClass}>Summary * (what did you find?)</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Describe your findings in one paragraph..."
            maxLength={500}
            rows={3}
            className={`${inputClass} resize-none`}
          />
          <p className="text-xs text-neutral-400 mt-1 text-right">{summary.length}/500</p>
        </div>

        {/* Claims comparison */}
        <div>
          <label className={labelClass}>Metrics comparison (optional)</label>
          <p className="text-xs text-neutral-400 mb-2">Compare what the paper claims vs. what you measured.</p>
          <div className="space-y-2">
            {claims.map((claim, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  type="text"
                  value={claim.metric}
                  onChange={(e) => updateClaim(i, "metric", e.target.value)}
                  placeholder="Metric name"
                  className={`${inputClass} flex-1`}
                />
                <input
                  type="text"
                  value={claim.paperValue}
                  onChange={(e) => updateClaim(i, "paperValue", e.target.value)}
                  placeholder="Paper claims"
                  className={`${inputClass} flex-1`}
                />
                <input
                  type="text"
                  value={claim.actualValue}
                  onChange={(e) => updateClaim(i, "actualValue", e.target.value)}
                  placeholder="Your result"
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => removeClaim(i)}
                  disabled={claims.length <= 1}
                  className="p-2 text-neutral-400 hover:text-red-500 disabled:opacity-30 cursor-pointer bg-transparent border-none shrink-0"
                >
                  <XCircle size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addClaim}
            className="mt-2 flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer bg-transparent border-none"
          >
            <PlusCircle size={14} />
            Add row
          </button>
        </div>

        {/* Code URL */}
        <div>
          <label className={labelClass}>Code URL (optional)</label>
          <input
            type="url"
            value={codeUrl}
            onChange={(e) => setCodeUrl(e.target.value)}
            placeholder="https://github.com/..."
            className={inputClass}
          />
        </div>

        {/* Full report */}
        <div>
          <label className={labelClass}>Full report (optional, markdown)</label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Detailed reproduction methodology, observations, setup instructions..."
            rows={8}
            className={`${inputClass} resize-y font-mono text-xs`}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !result || !summary.trim()}
          className="w-full px-5 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer border-none"
        >
          {submitting ? "Submitting..." : "Submit reproduction"}
        </button>
      </div>
    </div>
  );
}
