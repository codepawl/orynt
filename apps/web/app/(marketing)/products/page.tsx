import type { Metadata } from "next";
import Link from "next/link";

import {
  getStackProducts,
  productAvailabilityLabel,
  productBadgeClass,
  productStateClass,
} from "@/components/marketing/products";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Products",
  description:
    "CodePawl products: TracePawl, Mempawl, OpenPawl, and CachePawl. Infrastructure for AI agents.",
};

export default async function ProductsIndex() {
  const products = await getStackProducts();

  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">000 · codepawl products</p>
      <h1 className="cp-h1 text-fg-1 max-w-3xl">
        Four products. One <em className="cp-em">platform</em>.
      </h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        CodePawl builds infrastructure for AI agents: debugging,
        memory, coordination, and workload optimization. TracePawl is the
        current focus.
      </p>
      <ul className="mt-12 grid gap-6 md:grid-cols-2">
        {products.map((product) => (
          <li
            key={product.id}
            className={`bg-ink-1 hover:border-ratchet flex flex-col gap-3 border p-6 transition-colors ${productStateClass(product)}`}
          >
            <header className="flex items-center justify-between">
              <p className="cp-caption text-fg-3">{product.language}</p>
              <span className={productBadgeClass(product)}>
                {product.availability === "active" ? (
                  <span className="product-pulse-dot" aria-hidden />
                ) : null}
                {productAvailabilityLabel(product)}
              </span>
            </header>
            <h2 className="cp-h3 text-fg-1">{product.name}</h2>
            <p className="cp-body text-fg-2">{product.tagline}</p>
            <p className="cp-small text-fg-3">{product.description}</p>
            <Link
              href={`/products/${product.slug}`}
              className="text-ratchet hover:text-ratchet-hot cp-small mt-auto"
            >
              {product.availability === "active"
                ? "View product →"
                : "Early access →"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
