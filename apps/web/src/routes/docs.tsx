import { Outlet, createRoute } from "@tanstack/react-router";

import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "docs",
  component: DocsLayout,
});

function DocsLayout() {
  return <Outlet />;
}
