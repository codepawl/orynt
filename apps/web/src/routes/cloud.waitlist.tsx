import { createRoute } from "@tanstack/react-router";

import { CloudWaitlistForm } from "@/components/marketing/cloud-waitlist-form";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "cloud/waitlist",
  head: () => ({
    meta: [
      { title: "CodePawl Cloud Evidence Waitlist" },
      {
        name: "description",
        content:
          "Join the upcoming CodePawl Cloud Evidence waitlist. Current Evidence Hub preview is local/browser-only and does not upload artifact contents.",
      },
    ],
  }),
  component: CloudWaitlistPage,
});

export function CloudWaitlistPage() {
  return (
    <section className="mx-auto grid max-w-[1240px] gap-10 px-6 py-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)]">
      <div>
        <p className="cp-marker mb-6">cloud / waitlist</p>
        <h1 className="cp-h1 max-w-3xl text-fg-1">
          Join the Cloud Evidence waitlist.
        </h1>
        <p className="cp-lead mt-6 max-w-3xl text-fg-2">
          CodePawl Cloud is upcoming. Share how your team wants to review
          Openpawl run evidence, approvals, and traceable agent-change records.
        </p>
        <ul className="border-ink-4 mt-8 grid gap-4 border-y-2 py-6">
          {[
            "Current Evidence Hub preview is local/browser-only.",
            "Artifact contents are not uploaded or stored by CodePawl.",
            "Do not paste source code, prompts, traces, logs, credentials, secrets, or artifacts into the form.",
          ].map((item) => (
            <li key={item} className="cp-body text-fg-2">
              · {item}
            </li>
          ))}
        </ul>
      </div>

      <CloudWaitlistForm defaultSource="cloud_waitlist_page" />
    </section>
  );
}
