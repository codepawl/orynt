import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HERO_PRODUCTS } from "@/components/marketing/products";

export const revalidate = 3600;

export function generateStaticParams(): { path: string[] }[] {
  // Empty array params represents the bare /docs index page.
  return [
    { path: [] as string[] },
    ...HERO_PRODUCTS.map((product) => ({ path: [product.slug] })),
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}): Promise<Metadata> {
  const { path } = await params;
  const slug = path?.[0];
  if (!slug) return { title: "Docs" };
  const product = HERO_PRODUCTS.find((p) => p.slug === slug);
  return {
    title: product ? `${product.name} docs` : "Docs",
    description: product?.tagline,
  };
}

export default async function DocsCatchAll({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  const slug = path?.[0];

  if (!slug) {
    return (
      <section className="mx-auto max-w-[1240px] px-6 py-20">
        <p className="cp-marker mb-6">docs · index</p>
        <h1 className="cp-h1 text-fg-1">Documentation</h1>
        <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
          Pick a product to read its docs. The hosted version mirrors the
          repository&apos;s <code className="cp-code">docs/</code> tree.
        </p>
        <ul className="border-ink-4 mt-12 grid gap-4 border-t pt-12 md:grid-cols-2 lg:grid-cols-3">
          {HERO_PRODUCTS.map((product) => (
            <li key={product.id}>
              <Link
                href={`/docs/${product.slug}`}
                className="border-ink-4 bg-ink-1 hover:border-ratchet block border p-5 transition-colors"
              >
                <p className="cp-h4 text-fg-1">{product.name}</p>
                <p className="cp-small text-fg-3 mt-2">{product.tagline}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const product = HERO_PRODUCTS.find((p) => p.slug === slug);
  if (!product) {
    notFound();
  }
  return (
    <article className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">docs · {product.slug}</p>
      <h1 className="cp-h1 text-fg-1">{product.name} docs</h1>
      <p className="cp-lead text-fg-2 mt-6 max-w-2xl">
        Live docs sync from the {product.github_repo} repository&apos;s{" "}
        <code className="cp-code">docs/</code> tree. Hosted MDX rendering
        with admin-triggered ISR refresh ships in a follow-up — for now this
        page is a placeholder.
      </p>
      <p className="cp-body text-fg-3 mt-8">
        Read the source on{" "}
        <a
          href={`https://github.com/${product.github_repo}`}
          className="text-ratchet hover:text-ratchet-hot"
        >
          GitHub
        </a>
        .
      </p>
    </article>
  );
}
