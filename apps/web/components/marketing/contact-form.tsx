"use client";

import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

const TURNSTILE_DEV_TOKEN = "1x00000000000000000000AA";

type Status = "idle" | "submitting" | "success" | "error";

type OptionalField = {
  name: "repoType" | "desiredWorkflow" | "cloudNeeds";
  label: string;
  placeholder: string;
};

type ContactFormProps = {
  sourceTag?: string;
  defaultSubject?: string;
  defaultMessage?: string;
  optionalFields?: ReadonlyArray<OptionalField>;
  submitLabel?: string;
  successTitle?: string;
  successBody?: string;
};

function appendContext(
  message: string,
  sourceTag: string | undefined,
  optionalValues: Record<OptionalField["name"], string>,
) {
  const context = [
    sourceTag ? `source_tag: ${sourceTag}` : null,
    optionalValues.repoType ? `github_org_repo_type: ${optionalValues.repoType}` : null,
    optionalValues.desiredWorkflow ? `desired_workflow: ${optionalValues.desiredWorkflow}` : null,
    optionalValues.cloudNeeds ? `cloud_needs: ${optionalValues.cloudNeeds}` : null,
  ].filter(Boolean);

  if (context.length === 0) return message;

  return `${message.trim()}\n\n---\n${context.join("\n")}`;
}

export function ContactForm({
  sourceTag,
  defaultSubject = "",
  defaultMessage = "",
  optionalFields = [],
  submitLabel = "Send message",
  successTitle = "Thanks - we got your message.",
  successBody = "A human reads every contact form submission. Expect a reply within two business days.",
}: ContactFormProps = {}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: defaultSubject,
    message: defaultMessage,
  });
  const [optionalValues, setOptionalValues] = useState<Record<OptionalField["name"], string>>({
    repoType: "",
    desiredWorkflow: "",
    cloudNeeds: "",
  });
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      const response = await fetch(`${API_BASE}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          subject: sourceTag
            ? `${form.subject || defaultSubject || "CodePawl inquiry"} [${sourceTag}]`
            : form.subject,
          message: appendContext(form.message, sourceTag, optionalValues),
          source: sourceTag,
          turnstile_token:
            import.meta.env.VITE_TURNSTILE_SITE_KEY ?? TURNSTILE_DEV_TOKEN,
        }),
      });
      if (response.status === 201) {
        setStatus("success");
      } else {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setStatus("error");
        setError(body.error?.message ?? "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setError("Network error. Try again.");
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="cp-card border-ink-4 bg-ink-1 border p-6"
      >
        <p className="cp-h4 text-success">{successTitle}</p>
        <p className="cp-body text-fg-3 mt-2">
          {successBody}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4"
      data-hydrated={hydrated ? "true" : "false"}
    >
      <label className="grid gap-2">
        <span className="cp-caption text-fg-3">Name</span>
        <input
          type="text"
          required
          autoComplete="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="cp-control cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
        />
      </label>
      <label className="grid gap-2">
        <span className="cp-caption text-fg-3">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="cp-control cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
        />
      </label>
      <label className="grid gap-2">
        <span className="cp-caption text-fg-3">Subject (optional)</span>
        <input
          type="text"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          className="cp-control cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
        />
      </label>
      <label className="grid gap-2">
        <span className="cp-caption text-fg-3">Message</span>
        <textarea
          required
          rows={6}
          minLength={10}
          maxLength={5000}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="cp-control cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
        />
      </label>
      {optionalFields.map((field) => (
        <label key={field.name} className="grid gap-2">
          <span className="cp-caption text-fg-3">{field.label}</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={optionalValues[field.name]}
            placeholder={field.placeholder}
            onChange={(e) =>
              setOptionalValues({
                ...optionalValues,
                [field.name]: e.target.value,
              })
            }
            className="cp-control cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
          />
        </label>
      ))}
      {sourceTag ? <input type="hidden" name="source" value={sourceTag} /> : null}
      {error ? (
        <p role="alert" className="text-danger cp-small">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="cp-button bg-ratchet text-ink-0 hover:bg-ratchet-hot disabled:bg-ink-4 inline-flex w-fit items-center justify-center px-6 py-3 transition-colors"
      >
        {status === "submitting" ? "Sending..." : submitLabel}
      </button>
    </form>
  );
}
