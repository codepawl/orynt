import { createRoute } from "@tanstack/react-router";

import { handleCloudWaitlistRequest, methodNotAllowed } from "@/lib/cloud-waitlist";
import { Route as rootRoute } from "./__root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/api/cloud/waitlist",
  server: {
    handlers: {
      GET: () => methodNotAllowed(),
      POST: ({ request }: { request: Request }) => handleCloudWaitlistRequest(request),
      PUT: () => methodNotAllowed(),
      PATCH: () => methodNotAllowed(),
      DELETE: () => methodNotAllowed(),
    },
  },
});
