import { createRoute } from "@tanstack/react-router";

import { Link } from "@/components/link";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "cloud",
  head: () => ({
    meta: [
      { title: "CodePawl Cloud Evidence" },
      {
        name: "description",
        content:
          "CodePawl Cloud Evidence is upcoming. Join the waitlist for hosted review workflows while the current Evidence Hub preview remains local/browser-only.",
      },
    ],
  }),
  component: CloudPage,
});

export function CloudPage() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">cloud / evidence</p>
      <h1 className="cp-h1 max-w-4xl text-fg-1">
        Hosted evidence review for agent work is <em className="cp-em">upcoming</em>.
      </h1>
      <p className="cp-lead mt-6 max-w-3xl text-fg-2">
        CodePawl Cloud Evidence is the planned hosted layer for reviewing
        Openpawl run evidence, team approval workflows, and traceable change
        records. It is not generally available yet.
      </p>
      <p className="cp-body mt-4 max-w-3xl text-fg-2">
        The current Evidence Hub preview is local/browser-only. Artifact
        contents are not uploaded, stored, or processed by CodePawl.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/cloud/waitlist?source=cloud_page_primary"
          className="cp-hover-button cp-button inline-flex items-center justify-center border-2 border-ink-4 bg-ratchet px-5 py-3 text-ink-0 transition-colors hover:bg-ratchet-hot"
        >
          Join Cloud Evidence waitlist
        </Link>
        <Link
          href="/cloud/evidence"
          className="cp-hover-button cp-button inline-flex items-center justify-center border-2 border-ink-4 bg-ink-1 px-5 py-3 text-fg-1 transition-colors hover:bg-ink-2"
        >
          Open browser-only Evidence Hub
        </Link>
      </div>

      <section className="mt-14 grid gap-6 md:grid-cols-3">
        {[
          {
            title: "Reviewable runs",
            body: "Turn Openpawl outputs into evidence summaries for maintainers and reviewers.",
          },
          {
            title: "Guarded workflow",
            body: "Discuss approval, audit, and rollout needs before hosted intake opens.",
          },
          {
            title: "Privacy first",
            body: "The public preview avoids artifact upload and keeps evaluation local in your browser.",
          },
        ].map((item) => (
          <article key={item.title} className="cp-card border-ink-4 bg-ink-1 border-2 p-6">
            <h2 className="cp-h4 text-fg-1">{item.title}</h2>
            <p className="cp-body mt-3 text-fg-2">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="border-ink-4 mt-14 border-t-2 pt-10">
        <p className="cp-marker mb-5">availability</p>
        <h2 className="cp-h2 max-w-3xl text-fg-1">
          Waitlist-only. No hosted artifact intake yet.
        </h2>
        <p className="cp-body mt-4 max-w-3xl text-fg-2">
          Join the waitlist to share your review workflow needs. Do not send
          artifact contents, private source, prompts, traces, credentials, logs,
          or secrets.
        </p>
        <Link
          href="/cloud/waitlist?source=cloud_page_secondary"
          className="cp-hover-link cp-link mt-6 inline-flex text-ratchet hover:text-ratchet-hot"
        >
          Share workflow needs
        </Link>
      </section>
    </section>
  );
}
