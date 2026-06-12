import { createRoute } from "@tanstack/react-router";

import {
  BulletList,
  InfoCard,
  InlineLink,
  LinkGrid,
  PageShell,
} from "@/components/marketing/marketplace-pages";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "cloud",
  head: () => ({
    meta: [
      { title: "CodePawl Cloud - Upcoming" },
      {
        name: "description",
        content:
          "Upcoming CodePawl Cloud Evidence Hub waitlist and local browser-only artifact preview.",
      },
    ],
  }),
  component: CloudPage,
});

export function CloudPage() {
  return (
    <PageShell
      eyebrow="cloud / upcoming"
      title="CodePawl Cloud Evidence is upcoming."
      lead="The current Cloud Evidence surface is a local/browser-only artifact preview and waitlist funnel. CodePawl Cloud is not live, and no artifact contents are uploaded or stored."
    >
      <InfoCard title="Current status">
        <BulletList
          items={[
            "CodePawl Cloud is upcoming and waitlist-only.",
            "The current artifact preview runs locally in your browser.",
            "No artifact contents are uploaded, transmitted to CodePawl servers, or stored by CodePawl.",
            "Hosted artifact storage, team review, and trace search are being scoped from waitlist feedback.",
          ]}
        />
      </InfoCard>

      <InfoCard title="Evidence Hub preview">
        <p>
          The Cloud Evidence demo uses static fixtures and browser-side
          validation for Openpawl evidence bundles. It is intended to show the
          review workflow, not to receive production artifacts.
        </p>
        <LinkGrid
          items={[
            {
              href: "/cloud/evidence",
              label: "View local evidence preview",
              body: "Inspect the read-only demo and validate synthetic or local-only Openpawl evidence bundle JSON in your browser.",
            },
            {
              href: "/cloud/waitlist?source=cloud_waitlist&intent=waitlist",
              label: "Join Cloud Evidence waitlist",
              body: "Share your team context and the hosted review workflow you want CodePawl Cloud to support.",
            },
          ]}
        />
      </InfoCard>

      <InfoCard title="What we are learning">
        <p>
          We are collecting workflow feedback only: GitHub org/repo type,
          desired review workflow, and whether teams need hosted artifact
          storage, team review, or trace search. Do not submit secrets,
          repository source, prompts, traces, logs, or artifact contents through
          the waitlist form.
        </p>
        <p>
          Read the <InlineLink href="/privacy">privacy policy</InlineLink> and{" "}
          <InlineLink href="/terms">terms</InlineLink> for current website and
          waitlist handling.
        </p>
      </InfoCard>
    </PageShell>
  );
}
