import { createRoute, notFound } from "@tanstack/react-router";

import { Route as docsRoute } from "./docs";
import { STACK_PRODUCTS } from "@/components/marketing/products";

export const Route = createRoute({
  getParentRoute: () => docsRoute,
  path: "$",
  loader: async ({ params }) => {
    const slug = (params._splat ?? "").split("/")[0];
    const product = STACK_PRODUCTS.find((p) => p.slug === slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.product.name ?? "Docs"} docs` },
      { name: "description", content: loaderData?.product.tagline ?? "" },
    ],
  }),
  component: DocsProductPage,
});

function DocsProductPage() {
  const { product } = Route.useLoaderData();

  return (
    <article className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">docs · {product.slug}</p>
      <h1 className="cp-h1 text-fg-1">
        {product.name} <em className="cp-em">docs</em>
      </h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        Live docs sync from the {product.github_repo} repository&apos;s{" "}
        <code className="cp-inline-code">docs/</code> tree. Hosted MDX rendering
        with admin-triggered ISR refresh ships in a follow-up — for now this
        page is a placeholder.
      </p>
      <p className="cp-body text-fg-3 mt-8">
        Read the source on{" "}
        <a
          href={`https://github.com/${product.github_repo}`}
          className="cp-hover-link inline-block text-ratchet hover:text-ratchet-hot"
        >
          GitHub
        </a>
        .
      </p>
    </article>
  );
}
