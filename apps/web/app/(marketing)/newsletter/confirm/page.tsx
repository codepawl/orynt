import type { Metadata } from "next";
import { Suspense } from "react";

import { NewsletterConfirm } from "@/components/marketing/newsletter-confirm";

export const metadata: Metadata = {
  title: "Confirm subscription",
  description: "Confirm your Codepawl newsletter subscription.",
};

export default function NewsletterConfirmPage() {
  return (
    <section className="mx-auto max-w-xl px-6 py-20">
      <p className="cp-marker mb-6">newsletter · confirm</p>
      <Suspense fallback={<p className="cp-body text-fg-3">Loading…</p>}>
        <NewsletterConfirm />
      </Suspense>
    </section>
  );
}
