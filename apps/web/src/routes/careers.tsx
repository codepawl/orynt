import { createRoute } from "@tanstack/react-router";

import { Link } from "@/components/link";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "careers",
  head: () => ({
    meta: [
      { title: "Careers" },
      { name: "description", content: "Open roles at CodePawl." },
    ],
  }),
  component: CareersIndex,
});

function CareersIndex() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">careers</p>
      <h1 className="cp-h1 text-fg-1">
        No open <em className="cp-em">roles</em> at the moment
      </h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        We hire deliberately around product milestones. The next hiring window
        is planned after the v0.1 launch. If your work is closely aligned with
        agent tooling and production AI systems,{" "}
        <Link href="/contact" className="text-ratchet hover:text-ratchet-hot">
          get in touch
        </Link>{" "}
        and share what you&apos;ve built.
      </p>
    </section>
  );
}
