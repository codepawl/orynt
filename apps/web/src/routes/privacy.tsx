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
  path: "privacy",
  head: () => ({
    meta: [
      { title: "CodePawl Privacy Policy" },
      {
        name: "description",
        content:
          "Privacy policy for CodePawl website, Openpawl support, newsletter, waitlist, and Marketplace webhook interactions.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageShell
      eyebrow="legal / privacy"
      title="Privacy policy."
      lead="This policy covers the CodePawl website, public support channels, newsletter and waitlist forms, and GitHub Marketplace webhook handling."
    >
      <InfoCard title="Self-managed Openpawl runs">
        <p>
          Openpawl runs in your own terminal or GitHub Actions workflow.
          CodePawl does not receive your repository code, prompts, model
          responses, traces, reports, workflow artifacts, environment variables,
          or API keys from self-managed Openpawl runs.
        </p>
      </InfoCard>

      <InfoCard title="Website data">
        <BulletList
          items={[
            "Newsletter and waitlist forms collect the email address and context you submit.",
            "Contact forms collect your name, email address, subject, and message.",
            "Product analytics may collect page views and high-level conversion events.",
            "Session recording is not required for this public Marketplace route work.",
          ]}
        />
      </InfoCard>

      <InfoCard title="Marketplace webhook">
        <p>
          The GitHub Marketplace webhook is used for Marketplace event handling
          only. It must not store repository code, prompts, traces, reports, or
          workflow artifacts.
        </p>
      </InfoCard>

      <InfoCard title="Cloud Evidence Hub demo">
        <p>
          The public Cloud Evidence Hub page is a read-only demo with an
          optional browser-local preview for Openpawl
          openpawl-evidence-bundle.json files and synthetic artifact fixtures.
          Pasted or selected preview artifacts are validated in your browser and
          are not transmitted to CodePawl servers, uploaded, or stored by
          CodePawl. CodePawl does not currently enable real artifact intake,
          customer artifact upload, or hosted storage for Openpawl reports,
          traces, prompts, source code, or workflow artifacts through that page.
        </p>
      </InfoCard>

      <InfoCard title="Third parties">
        <p>
          CodePawl uses external services for source hosting, website delivery,
          analytics, email, and abuse prevention. Your use of Openpawl with an
          LLM provider is governed by the provider you configure.
        </p>
      </InfoCard>

      <InfoCard title="Contact">
        <p>
          For privacy questions, use <InlineLink href="/contact">contact</InlineLink>.
          For security-sensitive reports, use{" "}
          <InlineLink href="/security">security reporting</InlineLink>.
        </p>
      </InfoCard>
    </PageShell>
  );
}
