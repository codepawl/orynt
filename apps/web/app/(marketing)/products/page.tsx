import type { Metadata } from "next";
import Link from "next/link";

import { HERO_PRODUCTS } from "@/components/marketing/products";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Products",
  description:
    "All six Codepawl open-source products at a glance: OpenPawl, Featcat, HebbMem, TurboQuant, Cachepawl, and KStudio.",
};

export default function ProductsIndex() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">000 · the catalog</p>
      <h1 className="cp-h1 text-fg-1 max-w-3xl">
        Six libraries. One <em className="cp-em">studio</em>.
      </h1>
      <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {HERO_PRODUCTS.map((product) => (
          <li
            key={product.id}
            className="border-ink-4 bg-ink-1 hover:border-ratchet flex flex-col gap-3 border p-6 transition-colors"
          >
            <header className="flex items-center justify-between">
              <p className="cp-caption text-fg-3">{product.language}</p>
              <span className="bg-ratchet-tint text-ratchet cp-caption px-2 py-1">
                {product.status}
              </span>
            </header>
            <h2 className="cp-h3 text-fg-1">{product.name}</h2>
            <p className="cp-body text-fg-2">{product.tagline}</p>
            <Link
              href={`/products/${product.slug}`}
              className="text-ratchet hover:text-ratchet-hot cp-small mt-auto"
            >
              Read the docs →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
