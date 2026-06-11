import { createRoute } from "@tanstack/react-router";

import {
  BulletList,
  InfoCard,
  LinkGrid,
  OPENPAWL_SECURITY,
  PageShell,
} from "@/components/marketing/marketplace-pages";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "security",
  head: () => ({
    meta: [
      { title: "CodePawl Security" },
      {
        name: "description",
        content:
          "Security reporting and safety boundaries for CodePawl and Openpawl.",
      },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <PageShell
      eyebrow="security"
      title="Security reporting."
      lead="Use private reporting for vulnerabilities. Do not disclose secrets or sensitive production data in public issues."
    >
      <InfoCard title="Report a vulnerability">
        <LinkGrid
          items={[
            {
              href: OPENPAWL_SECURITY,
              label: "Openpawl private advisory",
              body: "Report Openpawl vulnerabilities through GitHub's private advisory flow.",
              external: true,
            },
            {
              href: "/openpawl/support",
              label: "Openpawl support",
              body: "Use public support only for non-sensitive reports.",
            },
          ]}
        />
      </InfoCard>

      <InfoCard title="Safety boundaries">
        <BulletList
          items={[
            "Treat agent output as untrusted until reviewed.",
            "Keep API keys, tokens, private code, and production logs out of public issues.",
            "Use least-privilege GitHub Actions permissions for Openpawl workflows.",
            "CodePawl Cloud is upcoming and not generally available from this website.",
          ]}
        />
      </InfoCard>
    </PageShell>
  );
}

