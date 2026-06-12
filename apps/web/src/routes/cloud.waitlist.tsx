import { createRoute } from "@tanstack/react-router";

import { CloudWaitlistForm } from "@/components/marketing/cloud-waitlist-form";
import {
  BulletList,
  InfoCard,
  PageShell,
} from "@/components/marketing/marketplace-pages";
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
          "Join the upcoming CodePawl Cloud Evidence waitlist or share hosted review workflow feedback.",
      },
    ],
  }),
  component: CloudWaitlistPage,
});

export function CloudWaitlistPage() {
  return (
    <PageShell
      eyebrow="cloud / waitlist"
      title="Join the Cloud Evidence waitlist."
      lead="CodePawl Cloud is upcoming. Use this form to share contact details and workflow needs only; the current artifact preview is local/browser-only, and no artifact contents are uploaded or stored."
    >
      <InfoCard title="Before you submit">
        <BulletList
          items={[
            "CodePawl Cloud is not live and this is not a production Cloud signup.",
            "Current artifact preview happens locally in your browser.",
            "Do not paste artifact contents, source code, prompts, traces, credentials, logs, or secrets into this form.",
            "Useful context: GitHub org/repo type, desired workflow, and whether you need hosted artifact storage, team review, or trace search.",
          ]}
        />
      </InfoCard>

      <InfoCard title="Waitlist and workflow feedback">
        <CloudWaitlistForm />
      </InfoCard>
    </PageShell>
  );
}
