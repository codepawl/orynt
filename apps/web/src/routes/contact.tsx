import { createRoute } from "@tanstack/react-router";

import { ContactForm } from "@/components/marketing/contact-form";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "contact",
  head: () => ({
    meta: [
      { title: "Contact" },
      { name: "description", content: "Send a message to founder@codepawl.com." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-20">
      <p className="cp-marker mb-6">contact · founder@codepawl.com</p>
      <h1 className="cp-h1 text-fg-1">
        Get in <em className="cp-em">touch</em>.
      </h1>
      <p className="cp-lead text-fg-2 mt-6">
        Partnerships, early access, security disclosures, bug reports. A human
        reads every message.
      </p>
      <dl className="border-ink-4 mt-8 grid gap-5 border-y-2 py-5 sm:grid-cols-2">
        <div>
          <dt className="cp-caption text-fg-3">Email</dt>
          <dd className="mt-2">
            <a
              href="mailto:founder@codepawl.com"
              className="cp-link text-fg-1 hover:text-ratchet transition-colors"
            >
              founder@codepawl.com
            </a>
          </dd>
        </div>
        <div>
          <dt className="cp-caption text-fg-3">X</dt>
          <dd className="mt-2">
            <a
              href="https://x.com/codepawl"
              target="_blank"
              rel="noopener noreferrer"
              className="cp-link text-fg-1 hover:text-ratchet transition-colors"
            >
              @codepawl
            </a>
          </dd>
        </div>
      </dl>
      <div className="mt-12">
        <ContactForm />
      </div>
    </section>
  );
}
