import type { Metadata } from "next";

import { NewsletterConfirm } from "@/components/marketing/newsletter-confirm";

export const metadata: Metadata = {
  title: "Confirm subscription",
  description: "Confirm your CodePawl newsletter subscription.",
};

type Props = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function NewsletterConfirmPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <section className="mx-auto max-w-xl px-6 py-20">
      <p className="cp-marker mb-6">newsletter · confirm</p>
      <NewsletterConfirm token={token} />
    </section>
  );
}
