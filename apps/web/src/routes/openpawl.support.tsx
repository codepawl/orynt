import { createRoute } from "@tanstack/react-router";

import {
  OPENPAWL_ACTION_REF,
  BulletList,
  InfoCard,
  InlineLink,
  LinkGrid,
  OPENPAWL_ISSUES,
  OPENPAWL_SECURITY,
  PageShell,
} from "@/components/marketing/marketplace-pages";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "openpawl/support",
  head: () => ({
    meta: [
      { title: "Openpawl Support - Issues and security reports" },
      {
        name: "description",
        content:
          "Support routes for Openpawl issues, documentation questions, and private security reports.",
      },
    ],
  }),
  component: OpenpawlSupportPage,
});

function OpenpawlSupportPage() {
  return (
    <PageShell
      eyebrow="openpawl / support"
      title="Support for Openpawl."
      lead="Openpawl is a public beta project. Use public issues for product questions and private security advisories for vulnerabilities."
    >
      <InfoCard title="Support channels">
        <LinkGrid
          items={[
            {
              href: OPENPAWL_ISSUES,
              label: "GitHub Issues",
              body: "Bug reports, documentation issues, and public support requests.",
              external: true,
            },
            {
              href: OPENPAWL_SECURITY,
              label: "Security advisories",
              body: "Private vulnerability reports. Do not open public issues for security-sensitive reports.",
              external: true,
            },
            {
              href: "/contact",
              label: "Contact CodePawl",
              body: "Partnership, early access, and non-sensitive product inquiries.",
            },
            {
              href: "/openpawl/docs",
              label: "Openpawl docs",
              body: "Install, Action behavior, and artifact documentation.",
            },
          ]}
        />
      </InfoCard>

      <InfoCard title="Before opening a support issue">
        <BulletList
          items={[
            "Remove secrets, tokens, private repository content, and proprietary logs.",
            <>
              Include the workflow event, run mode, current Openpawl ref (
              <code className="cp-inline-code">{OPENPAWL_ACTION_REF}</code>),
              relevant inputs, and sanitized report excerpts.
            </>,
            "For security reports, use the private advisory channel instead of public issues.",
          ]}
        />
      </InfoCard>

      <InfoCard title="Useful links">
        <p>
          Review the <InlineLink href="/security">security page</InlineLink>,{" "}
          <InlineLink href="/privacy">privacy policy</InlineLink>, and{" "}
          <InlineLink href="/terms">terms</InlineLink> before sharing details.
        </p>
      </InfoCard>
    </PageShell>
  );
}
