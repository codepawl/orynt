import { createRoute } from "@tanstack/react-router";

import { OpenpawlLanding } from "@/components/marketing/openpawl-landing";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "openpawl",
  head: () => ({
    meta: [
      {
        title: "Openpawl by CodePawl - Reviewable agent work, starting in GitHub",
      },
      {
        name: "description",
        content:
          "Openpawl is an open runtime for coding-agent coordination. It turns agent tasks into plans, validations, guarded changes, and traceable run evidence. The first supported surface is GitHub Actions.",
      },
      {
        property: "og:title",
        content: "Openpawl by CodePawl - Reviewable agent work, starting in GitHub",
      },
      {
        property: "og:description",
        content:
          "Openpawl turns agent tasks into plans, validations, guarded changes, and traceable run evidence.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/openpawl" },
    ],
    links: [{ rel: "canonical", href: "https://codepawl.com/openpawl" }],
  }),
  component: OpenpawlLanding,
});
