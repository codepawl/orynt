import { createRoute } from "@tanstack/react-router";

import { Link } from "@/components/link";
import { CloudStatusRoadmap } from "@/components/marketing/cloud-status-roadmap";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "cloud/status",
  head: () => ({
    meta: [
      { title: "CodePawl Cloud Evidence Status and Roadmap" },
      {
        name: "description",
        content:
          "Track what is live, what is local-only, and what is coming next for hosted OpenPawl evidence review.",
      },
    ],
  }),
  component: CloudStatusPage,
});

export function CloudStatusPage() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">cloud / status</p>
      <h1 className="cp-h1 max-w-4xl text-fg-1">
        Cloud Evidence status and roadmap
      </h1>
      <p className="cp-lead mt-6 max-w-3xl text-fg-2">
        Track what is live, what is local-only, and what is coming next for
        hosted OpenPawl evidence review.
      </p>
      <p className="cp-body mt-4 max-w-3xl text-fg-2">
        Waitlist and Resend email are live. Evidence Hub preview remains
        local/browser-only. Hosted review is upcoming, and hosted artifact
        storage is not enabled.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/cloud/waitlist?source=cloud_status"
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
        <Link
          href="/cloud"
          className="cp-hover-button cp-button inline-flex items-center justify-center border-2 border-ink-4 bg-ink-1 px-5 py-3 text-fg-1 transition-colors hover:bg-ink-2"
        >
          Cloud overview
        </Link>
      </div>

      <div className="mt-14">
        <CloudStatusRoadmap />
      </div>
    </section>
  );
}
