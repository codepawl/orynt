import { createRoute } from "@tanstack/react-router";

import {
  STACK_PRODUCTS,
  productAvailabilityLabel,
  productBadgeClass,
  productStateClass,
} from "@/components/marketing/products";
import { Link } from "@/components/link";
import { Route as docsRoute } from "./docs";

export const Route = createRoute({
  getParentRoute: () => docsRoute,
  path: "/",
  head: () => ({
    meta: [
      { title: "Docs" },
      {
        name: "description",
        content: "Product documentation for the CodePawl stack.",
      },
    ],
  }),
  component: DocsIndex,
});

function DocsIndex() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">docs</p>
      <h1 className="cp-h1 text-fg-1">
        <em className="cp-em">Documentation</em>
      </h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        Pick a product to read its documentation.
      </p>
      <ul className="border-ink-4 mt-12 grid gap-4 border-t pt-12 md:grid-cols-2 lg:grid-cols-3">
        {STACK_PRODUCTS.map((product) => (
          <li key={product.id}>
            <Link
              href={`/docs/${product.slug}`}
              className={`cp-hover-lift bg-ink-1 hover:border-ratchet block border p-5 transition-colors ${productStateClass(product)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="cp-h4 text-fg-1">{product.name}</p>
                <span className={productBadgeClass(product)}>
                  {product.availability === "active" ? (
                    <span className="product-pulse-dot" aria-hidden />
                  ) : null}
                  {productAvailabilityLabel(product)}
                </span>
              </div>
              <p className="cp-small text-fg-3 mt-2">{product.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
