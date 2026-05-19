"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

type Status = "loading" | "success" | "error";

export function NewsletterConfirm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setStatus("error");
        setErrorMessage("Missing confirmation token.");
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE}/newsletter/confirm?token=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        if (response.status === 200) {
          const body = (await response.json()) as { email?: string };
          setStatus("success");
          setEmail(body.email ?? "");
        } else {
          const body = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          setStatus("error");
          setErrorMessage(
            body.error?.message ?? "This confirmation link is no longer valid.",
          );
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Network error. Try again.");
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "loading") {
    return <p className="cp-body text-fg-3">Confirming…</p>;
  }
  if (status === "success") {
    return (
      <div>
        <p className="cp-h3 text-fg-1">You&apos;re on the list.</p>
        <p className="cp-body text-fg-3 mt-3">
          {email
            ? `${email} is now confirmed. Watch for the next release note.`
            : "Your subscription is confirmed. Watch for the next release note."}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="cp-h3 text-fg-1">That link didn&apos;t work.</p>
      <p className="cp-body text-fg-3 mt-3">{errorMessage}</p>
      <p className="cp-small text-fg-4 mt-4">
        You can{" "}
        <Link href="/" className="text-ratchet hover:text-ratchet-hot">
          subscribe again from the homepage footer
        </Link>
        .
      </p>
    </div>
  );
}
