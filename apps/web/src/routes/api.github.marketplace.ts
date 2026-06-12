import { createRoute } from "@tanstack/react-router";

import { handleGitHubMarketplaceWebhook } from "@/lib/github-marketplace-webhook";
import { Route as rootRoute } from "./__root";

function getSecret(): string | undefined {
  return process.env["GITHUB_MARKETPLACE_WEBHOOK_SECRET"];
}

function methodNotAllowed(): Response {
  return Response.json(
    {
      error: {
        code: "method_not_allowed",
        message: "Method not allowed.",
      },
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
        "Content-Type": "application/json",
      },
    },
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/api/github/marketplace",
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: ({ request }: { request: Request }) =>
        handleGitHubMarketplaceWebhook(request, getSecret()),
      PUT: () => methodNotAllowed(),
      PATCH: () => methodNotAllowed(),
      DELETE: () => methodNotAllowed(),
    },
  },
});
