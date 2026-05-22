import type { Metadata } from "next";
import Link from "next/link";

import { STACK_PRODUCTS } from "@/components/marketing/products";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Stack",
  description:
    "The CodePawl stack: TracePawl, Mempawl, OpenPawl, and CachePawl. Infrastructure for autonomous coding agents.",
};

export default function ProductsIndex() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">000 · the codepawl stack</p>
      <h1 className="cp-h1 text-fg-1 max-w-3xl">
        Four modules. One <em className="cp-em">stack</em>.
      </h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        CodePawl builds infrastructure for autonomous coding agents: debugging,
        memory, coordination, and workload optimization. TracePawl is the
        current focus.
      </p>
      <ul className="mt-12 grid gap-6 md:grid-cols-2">
        {STACK_PRODUCTS.map((product) => (
          <li
            key={product.id}
            className={
              product.current_focus
                ? "border-ratchet bg-ink-1 hover:border-ratchet-hot flex flex-col gap-3 border p-6 transition-colors"
                : "border-ink-4 bg-ink-1 hover:border-ratchet flex flex-col gap-3 border p-6 transition-colors"
            }
          >
            <header className="flex items-center justify-between">
              <p className="cp-caption text-fg-3">{product.language}</p>
              {product.current_focus ? (
                <span className="bg-ratchet-tint text-ratchet cp-caption px-2 py-1">
                  current focus
                </span>
              ) : (
                <span className="bg-ink-2 text-fg-3 cp-caption px-2 py-1">
                  {product.status}
                </span>
              )}
            </header>
            <h2 className="cp-h3 text-fg-1">{product.name}</h2>
            <p className="cp-body text-fg-2">{product.tagline}</p>
            <p className="cp-small text-fg-3">{product.description}</p>
            <Link
              href={`/products/${product.slug}`}
              className="text-ratchet hover:text-ratchet-hot cp-small mt-auto"
            >
              Read the notes →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
