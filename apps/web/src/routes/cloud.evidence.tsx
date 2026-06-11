import { createRoute } from "@tanstack/react-router";

import { CloudEvidenceDemo } from "@/components/marketing/cloud-evidence-demo";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "cloud/evidence",
  head: () => ({
    meta: [
      { title: "Cloud Evidence Hub Demo - CodePawl" },
      {
        name: "description",
        content:
          "Read-only CodePawl Cloud Evidence Hub demo for Openpawl artifact review. Cloud is upcoming and waitlist-only.",
      },
    ],
  }),
  component: CloudEvidencePage,
});

function CloudEvidencePage() {
  return <CloudEvidenceDemo />;
}
