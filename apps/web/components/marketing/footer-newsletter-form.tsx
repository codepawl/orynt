"use client";

import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const TURNSTILE_DEV_TOKEN = "1x00000000000000000000AA";

type Status = "idle" | "submitting" | "success" | "error";

export function FooterNewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;
    setStatus("submitting");
    try {
      const response = await fetch(`${API_BASE}/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: "landing_footer",
          turnstile_token:
            process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? TURNSTILE_DEV_TOKEN,
        }),
      });
      if (response.status === 202) {
        setStatus("success");
        setMessage("Check your inbox to confirm.");
        setEmail("");
      } else {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setStatus("error");
        setMessage(body.error?.message ?? "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-3 sm:flex-row"
      aria-describedby="footer-newsletter-help"
    >
      <label className="sr-only" htmlFor="footer-newsletter-email">
        Email address
      </label>
      <input
        id="footer-newsletter-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === "submitting"}
        className="border-ink-5 bg-ink-2 text-fg-1 placeholder:text-fg-4 focus:border-ratchet flex-1 border px-3 py-2 text-sm focus:outline-none"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="bg-ratchet text-ink-0 hover:bg-ratchet-hot disabled:bg-ink-4 inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors"
      >
        {status === "submitting" ? "Sending…" : "Subscribe"}
      </button>
      <p
        id="footer-newsletter-help"
        role="status"
        aria-live="polite"
        className={
          status === "error"
            ? "text-danger cp-small basis-full"
            : status === "success"
              ? "text-success cp-small basis-full"
              : "text-fg-4 cp-small basis-full"
        }
      >
        {message ||
          "We send a confirm link before adding you. No spam, unsubscribe in one click."}
      </p>
    </form>
  );
}
