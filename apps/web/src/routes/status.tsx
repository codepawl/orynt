import { createRoute } from "@tanstack/react-router";

import {
  BulletList,
  InfoCard,
  LinkGrid,
  OPENPAWL_ACTION_METADATA,
  OPENPAWL_ACTIONS,
  OPENPAWL_REPO,
  OPENPAWL_STATUS_WORKFLOW,
  PageShell,
} from "@/components/marketing/marketplace-pages";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "status",
  head: () => ({
    meta: [
      { title: "CodePawl Status" },
      {
        name: "description",
        content:
          "Public status links for Openpawl, Marketplace readiness, and CodePawl public endpoints.",
      },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  return (
    <PageShell
      eyebrow="status"
      title="Public status."
      lead="This page lists public status surfaces only. It intentionally avoids private deployment, billing, database, and infrastructure details."
    >
      <InfoCard title="Openpawl public source">
        <LinkGrid
          items={[
            {
              href: OPENPAWL_REPO,
              label: "Openpawl repository",
              body: "Public source repository for the Action candidate.",
              external: true,
            },
            {
              href: OPENPAWL_ACTION_METADATA,
              label: "Root action.yml",
              body: "Action metadata required for GitHub Marketplace publication.",
              external: true,
            },
            {
              href: OPENPAWL_ACTIONS,
              label: "GitHub Actions",
              body: "CI, CodeQL, and Action smoke workflow history.",
              external: true,
            },
            {
              href: OPENPAWL_STATUS_WORKFLOW,
              label: "Openpawl workflow",
              body: "Public workflow status for Openpawl Action runs.",
              external: true,
            },
          ]}
        />
      </InfoCard>

      <InfoCard title="Marketplace readiness">
        <BulletList
          items={[
            "Openpawl has a public source repository and root Action metadata.",
            "The website support, install, docs, status, privacy, terms, and security pages are available for review.",
            "This page does not claim that a GitHub Marketplace listing is live.",
            "Use release-tagged install snippets only after the GitHub Release and listing are verified.",
          ]}
        />
      </InfoCard>

      <InfoCard title="Webhook endpoint">
        <p>
          <code className="cp-inline-code">/api/github/marketplace</code> is a
          POST-only GitHub Marketplace webhook endpoint. A GET request should
          return <code className="cp-inline-code">405</code> with{" "}
          <code className="cp-inline-code">Allow: POST</code>.
        </p>
      </InfoCard>

      <InfoCard title="Cloud status">
        <p>
          CodePawl Cloud is upcoming and waitlist-only. It is not generally
          available, and this website does not offer Cloud billing or
          provisioning.
        </p>
      </InfoCard>
    </PageShell>
  );
}

