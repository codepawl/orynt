import { createRoute } from "@tanstack/react-router";

import { NewsletterConfirm } from "@/components/marketing/newsletter-confirm";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "newsletter/confirm",
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Confirm subscription" },
      {
        name: "description",
        content: "Confirm your CodePawl newsletter subscription.",
      },
    ],
  }),
  component: NewsletterConfirmPage,
});

function NewsletterConfirmPage() {
  const { token } = Route.useSearch();

  return (
    <section className="mx-auto max-w-xl px-6 py-20">
      <p className="cp-marker mb-6">newsletter · confirm</p>
      <NewsletterConfirm token={token} />
    </section>
  );
}
