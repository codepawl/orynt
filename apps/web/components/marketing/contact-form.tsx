"use client";

import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const TURNSTILE_DEV_TOKEN = "1x00000000000000000000AA";

type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
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
          turnstile_token:
            process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? TURNSTILE_DEV_TOKEN,
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
        className="border-ink-4 bg-ink-1 border p-6"
      >
        <p className="cp-h4 text-success">Thanks — we got your message.</p>
        <p className="cp-body text-fg-3 mt-2">
          A human reads every contact form submission. Expect a reply within
          two business days.
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
          className="cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
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
          className="cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
        />
      </label>
      <label className="grid gap-2">
        <span className="cp-caption text-fg-3">Subject (optional)</span>
        <input
          type="text"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          className="cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
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
          className="cp-body border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet border px-3 py-2 focus:outline-none"
        />
      </label>
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
        {status === "submitting" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
