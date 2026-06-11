import { createRoute } from "@tanstack/react-router";

import {
  getStackProducts,
  productAvailabilityLabel,
  productBadgeClass,
  productStateClass,
} from "@/components/marketing/products";
import { Link } from "@/components/link";
import { Route as productsRoute } from "./products";

export const Route = createRoute({
  getParentRoute: () => productsRoute,
  path: "/",
  loader: async () => getStackProducts(),
  head: () => ({
    meta: [
      { title: "Products" },
      {
        name: "description",
        content:
          "CodePawl architecture map: Openpawl is an open runtime for coding-agent coordination, while TracePawl, Mempawl, and CachePawl are roadmap layers.",
      },
    ],
  }),
  component: ProductsIndexPage,
});

function ProductsIndexPage() {
  const products = Route.useLoaderData();

  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">000 · codepawl products</p>
      <h1 className="cp-h1 text-fg-1 max-w-3xl">
        CodePawl makes coding agents work together. Future layers on the{" "}
        <em className="cp-em">roadmap</em>.
      </h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        Openpawl is the current open runtime for coding-agent coordination. The
        first supported surface is GitHub Actions. TracePawl, Mempawl, and
        CachePawl are future layers around evidence, memory, and optimization.
      </p>
      <ul className="mt-12 grid gap-6 md:grid-cols-2">
        {products.map((product) => (
          <li
            key={product.id}
            className={`cp-hover-lift bg-ink-1 hover:border-ratchet flex flex-col gap-3 border p-6 transition-colors ${productStateClass(product)}`}
          >
            <header className="flex items-center justify-between">
              <p className="cp-caption text-fg-3">{product.language}</p>
              <span className={productBadgeClass(product)}>
                {product.availability === "available" || product.availability === "beta" ? (
                  <span className="product-pulse-dot" aria-hidden />
                ) : null}
                {productAvailabilityLabel(product)}
              </span>
            </header>
            <h2 className="cp-h3 text-fg-1">{product.name}</h2>
            <p className="cp-body text-fg-2">{product.tagline}</p>
            <Link
              href={product.slug === "openpawl" ? "/openpawl" : `/products/${product.slug}`}
              className="cp-hover-link text-ratchet hover:text-ratchet-hot cp-small mt-auto w-fit"
            >
              {product.availability === "available"
                ? "View product →"
                : "View roadmap →"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
