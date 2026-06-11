import { createRoute } from "@tanstack/react-router";

import {
  BulletList,
  InfoCard,
  InlineLink,
  LinkGrid,
  OPENPAWL_ACTION_METADATA,
  OPENPAWL_INSTALL_DOC,
  OPENPAWL_MAIN_DOCS,
  OPENPAWL_MARKETPLACE_DOC,
  OPENPAWL_REPO,
  OPENPAWL_RELEASE,
  OPENPAWL_RELEASE_URL,
  PageShell,
} from "@/components/marketing/marketplace-pages";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "openpawl/docs",
  head: () => ({
    meta: [
      { title: "Openpawl Docs - Inputs, artifacts, and safety gates" },
      {
        name: "description",
        content:
          "Openpawl documentation for GitHub Action inputs, artifacts, dry-run behavior, and support links.",
      },
    ],
  }),
  component: OpenpawlDocsPage,
});

function OpenpawlDocsPage() {
  return (
    <PageShell
      eyebrow="openpawl / docs"
      title="Openpawl documentation."
      lead="Use the verified v0.5.1 public Action release for installs. The default branch remains available for current development docs."
    >
      <InfoCard title="Start here">
        <LinkGrid
          items={[
            {
              href: OPENPAWL_REPO,
              label: "Source repository",
              body: "Public Openpawl source and README.",
              external: true,
            },
            {
              href: OPENPAWL_ACTION_METADATA,
              label: "Action metadata",
              body: "Release-locked root action.yml inputs, outputs, branding, and runtime.",
              external: true,
            },
            {
              href: OPENPAWL_INSTALL_DOC,
              label: "Install guide",
              body: "Release-locked workflow setup, permissions, safety model, and artifacts.",
              external: true,
            },
            {
              href: OPENPAWL_MARKETPLACE_DOC,
              label: "Marketplace readiness",
              body: "Release-locked Marketplace candidate fields and copy guardrails.",
              external: true,
            },
            {
              href: OPENPAWL_MAIN_DOCS,
              label: "Docs tree",
              body: "Current docs from the public repository default branch.",
              external: true,
            },
          ]}
        />
      </InfoCard>

      <InfoCard title="Action behavior">
        <BulletList
          items={[
            "The Action is dry-run-first and reports findings before any write path is considered.",
            "Inputs include task, mode, repo path, config path, test command, mock fixture, output directory, and bounded validation retries.",
            "Reports and JSON artifacts are schema-versioned where applicable.",
            "Write mode remains explicit and safety-gated; it is not broad autonomous code modification.",
          ]}
        />
      </InfoCard>

      <InfoCard title="Marketplace status">
        <p>
          Openpawl has a public{" "}
          <InlineLink href={OPENPAWL_RELEASE_URL}>{OPENPAWL_RELEASE}</InlineLink>{" "}
          Action release and is being prepared for GitHub Marketplace. This page
          does not claim a live Marketplace listing. Check{" "}
          <InlineLink href="/status">status</InlineLink> for current readiness.
        </p>
      </InfoCard>
    </PageShell>
  );
}
