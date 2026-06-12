import { createRoute } from "@tanstack/react-router";

import {
  BulletList,
  InfoCard,
  InlineLink,
  PageShell,
} from "@/components/marketing/marketplace-pages";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "terms",
  head: () => ({
    meta: [
      { title: "CodePawl Terms" },
      {
        name: "description",
        content:
          "Terms for the CodePawl website and self-managed Openpawl public beta surfaces.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PageShell
      eyebrow="legal / terms"
      title="Terms."
      lead="These terms describe the public CodePawl website and self-managed Openpawl beta surfaces. CodePawl Cloud is upcoming and not generally available."
    >
      <InfoCard title="Openpawl self-managed use">
        <p>
          Openpawl is provided as self-managed open source software through its
          public repository and license. You are responsible for configuring
          workflows, permissions, model providers, and artifact retention in
          your own environment.
        </p>
      </InfoCard>

      <InfoCard title="Beta limitations">
        <BulletList
          items={[
            "Openpawl is dry-run-first and beta write behavior is constrained.",
            "Review AI-generated output before applying it to production systems.",
            "No broad autonomous write behavior is promised by this website.",
            "No hosted Cloud service, billing plan, or production SLA is offered from these pages.",
            "The Cloud Evidence Hub page is a read-only demo and does not currently accept or store real customer artifacts.",
          ]}
        />
      </InfoCard>

      <InfoCard title="Website use">
        <p>
          Do not misuse the website, support channels, forms, or webhook
          endpoints. Do not submit secrets, credentials, private source code, or
          sensitive production data through public support channels.
        </p>
      </InfoCard>

      <InfoCard title="Security and privacy">
        <p>
          Read the <InlineLink href="/privacy">privacy policy</InlineLink> and
          use <InlineLink href="/security">security reporting</InlineLink> for
          vulnerability reports.
        </p>
      </InfoCard>
    </PageShell>
  );
}
