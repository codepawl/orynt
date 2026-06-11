import { createRoute } from "@tanstack/react-router";

import { ModernistLanding } from "@/components/marketing/modernist-landing";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "/",
  head: () => ({
    meta: [
      { title: "CodePawl - Coding agents that work together" },
      {
        name: "description",
        content:
          "CodePawl is infrastructure for coordinated agent work. Openpawl is an open runtime for coding-agent coordination, starting in GitHub Actions.",
      },
      {
        property: "og:title",
        content: "CodePawl - Coding agents that work together",
      },
      {
        property: "og:description",
        content:
          "Infrastructure for coordinated agent work - plans, evidence, guardrails, memory, replay, and cloud workflows.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return <ModernistLanding />;
}
