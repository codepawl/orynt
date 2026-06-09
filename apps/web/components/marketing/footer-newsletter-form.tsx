"use client";

import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

const TURNSTILE_DEV_TOKEN = "1x00000000000000000000AA";

type Status = "idle" | "submitting" | "success" | "error";

export function FooterNewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

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
            import.meta.env.VITE_TURNSTILE_SITE_KEY ?? TURNSTILE_DEV_TOKEN,
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
      className="flex w-full flex-col gap-3"
      aria-describedby="footer-newsletter-help"
      data-hydrated={hydrated ? "true" : "false"}
    >
      <div className="flex w-full flex-col gap-3 sm:flex-row">
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
          className="cp-body border-ink-4 bg-ink-1 text-fg-1 placeholder:text-fg-4 focus:border-ratchet min-w-0 flex-1 border-2 px-3 py-2 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="cp-button bg-ink-4 text-ink-0 hover:bg-ratchet disabled:bg-ink-3 inline-flex items-center justify-center border-2 border-ink-4 px-4 py-2 transition-colors"
        >
          {status === "submitting" ? "Sending..." : "Subscribe"}
        </button>
      </div>
      <p
        id="footer-newsletter-help"
        role="status"
        aria-live="polite"
        className={
          status === "error"
            ? "text-danger cp-small"
            : status === "success"
              ? "text-success cp-small"
              : "text-fg-4 cp-small"
        }
      >
        {message ||
          "We send a confirm link before adding you. No spam, unsubscribe in one click."}
      </p>
    </form>
  );
}
