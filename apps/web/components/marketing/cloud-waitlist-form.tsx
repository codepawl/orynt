"use client";

import { useEffect, useState } from "react";

import { CLOUD_WAITLIST_SOURCE_TAGS, type CloudWaitlistResponse } from "@/lib/cloud-waitlist";

type Status = "idle" | "submitting" | "success" | "error";

type CloudWaitlistFormProps = {
  defaultSource?: string;
};

export function CloudWaitlistForm({
  defaultSource = "cloud_waitlist_page",
}: CloudWaitlistFormProps) {
  const [form, setForm] = useState({
    email: "",
    roleUseCase: "",
    workflowNeed: "",
    notes: "",
  });
  const [source, setSource] = useState(defaultSource);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const urlSource = new URLSearchParams(window.location.search).get("source");
    if (urlSource && CLOUD_WAITLIST_SOURCE_TAGS.has(urlSource)) {
      setSource(urlSource);
    }
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/cloud/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          source,
        }),
      });

      if (response.status === 202) {
        const body = (await response.json().catch(() => ({}))) as Partial<CloudWaitlistResponse>;
        setStatus("success");
        setForm({ email: "", roleUseCase: "", workflowNeed: "", notes: "" });
        setMessage(
          body.emailStatus === "skipped_missing_env"
            ? "You are queued locally for this preview. Email confirmation is disabled in this environment."
            : "You are on the Cloud Evidence waitlist. Check your inbox for confirmation.",
        );
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      setStatus("error");
      setMessage(body.error?.message ?? "Something went wrong.");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="cp-card border-ink-4 bg-ink-1 block-shadow-sm grid gap-5 border-2 p-6"
      aria-describedby="cloud-waitlist-privacy"
    >
      <input type="hidden" name="source" value={source} data-testid="cloud-waitlist-source" />
      <label className="grid gap-2">
        <span className="cp-caption text-fg-3">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          className="cp-control cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
        />
      </label>

      <label className="grid gap-2">
        <span className="cp-caption text-fg-3">Role or use case</span>
        <input
          type="text"
          required
          maxLength={160}
          placeholder="Maintainer, platform engineer, AI tooling lead..."
          value={form.roleUseCase}
          onChange={(event) => setForm({ ...form, roleUseCase: event.target.value })}
          className="cp-control cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
        />
      </label>

      <label className="grid gap-2">
        <span className="cp-caption text-fg-3">Workflow need</span>
        <select
          required
          value={form.workflowNeed}
          onChange={(event) => setForm({ ...form, workflowNeed: event.target.value })}
          className="cp-control cp-body border-ink-5 bg-ink-2 text-fg-1 focus:border-ratchet border px-3 py-2 focus:outline-none"
        >
          <option value="">Choose one</option>
          <option value="review_openpawl_run_evidence">Review Openpawl run evidence</option>
          <option value="team_approval_workflow">Team approval workflow</option>
          <option value="audit_trail_for_agent_changes">Audit trail for agent changes</option>
          <option value="marketplace_action_rollout">GitHub Action rollout support</option>
          <option value="other">Other evidence workflow</option>
        </select>
      </label>

      <label className="grid gap-2">
        <span className="cp-caption text-fg-3">Optional notes</span>
        <textarea
          rows={5}
          maxLength={1000}
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="Share process needs only. Do not paste artifacts, prompts, traces, logs, credentials, secrets, or source code."
          className="cp-control cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
        />
      </label>

      <p id="cloud-waitlist-privacy" className="cp-small text-fg-3">
        CodePawl Cloud is upcoming. The current preview is local/browser-only,
        and this form must not include artifact contents, prompts, traces, logs,
        credentials, secrets, or source code.
      </p>

      {message ? (
        <p
          role={status === "error" ? "alert" : "status"}
          aria-live="polite"
          className={status === "error" ? "cp-small text-danger" : "cp-small text-success"}
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="cp-button bg-ratchet text-ink-0 hover:bg-ratchet-hot disabled:bg-ink-4 inline-flex w-fit items-center justify-center px-6 py-3 transition-colors"
      >
        {status === "submitting" ? "Joining..." : "Join Cloud Evidence waitlist"}
      </button>
    </form>
  );
}
