import { createRoute } from "@tanstack/react-router";

import { ModernistLanding } from "@/components/marketing/modernist-landing";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "/",
  head: () => ({
    meta: [
      { title: "CodePawl - Infrastructure for AI agents" },
      {
        name: "description",
        content:
          "Debugging, memory, coordination, and optimization infrastructure for AI agents.",
      },
      {
        property: "og:title",
        content: "CodePawl - Infrastructure for AI agents",
      },
      {
        property: "og:description",
        content:
          "Debugging, memory, coordination, and optimization infrastructure for AI agents.",
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
