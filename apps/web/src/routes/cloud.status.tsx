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
          "Status and roadmap for CodePawl Cloud Evidence. Waitlist open, browser preview available, hosted Cloud upcoming.",
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
        Cloud Evidence status and roadmap.
      </h1>
      <p className="cp-lead mt-6 max-w-3xl text-fg-2">
        Waitlist is open, the Evidence Hub preview is local/browser-only, and
        hosted Cloud Evidence review is upcoming.
      </p>
      <p className="cp-body mt-4 max-w-3xl text-fg-2">
        This page avoids uptime claims and production reliability claims. There
        is no hosted artifact upload or customer artifact storage.
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
      </div>

      <div className="mt-14">
        <CloudStatusRoadmap />
      </div>
    </section>
  );
}
