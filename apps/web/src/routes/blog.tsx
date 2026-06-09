import { createRoute } from "@tanstack/react-router";

import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "blog",
  head: () => ({
    meta: [
      { title: "Blog" },
      { name: "description", content: "Engineering notes from the CodePawl team." },
    ],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">blog</p>
      <h1 className="cp-h1 text-fg-1">
        Notes from the <em className="cp-em">team</em>
      </h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        First posts are queued for the production deploy. Subscribe to the
        newsletter for the launch.
      </p>
    </section>
  );
}
