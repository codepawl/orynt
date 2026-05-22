import type { Metadata } from "next";

import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Send a message to founder@codepawl.com.",
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-20">
      <p className="cp-marker mb-6">contact · founder@codepawl.com</p>
      <h1 className="cp-h1 text-fg-1">Get in touch.</h1>
      <p className="cp-lead text-fg-2 mt-6">
        Partnerships, early access, security disclosures, bug reports. A human
        reads every message.
      </p>
      <div className="mt-12">
        <ContactForm />
      </div>
    </section>
  );
}
