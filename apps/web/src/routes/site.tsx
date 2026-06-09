import { Outlet, createRoute } from "@tanstack/react-router";

import { Footer } from "@/components/marketing/footer";
import { Nav } from "@/components/marketing/nav";
import { Route as rootRoute } from "./__root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: "site",
  component: SiteLayout,
});

function SiteLayout() {
  return (
    <>
      <Nav />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
