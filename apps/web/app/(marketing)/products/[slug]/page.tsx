import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { STACK_PRODUCTS } from "@/components/marketing/products";

export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return STACK_PRODUCTS.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = STACK_PRODUCTS.find((p) => p.slug === slug);
  if (!product) return { title: "Not found" };
  return { title: product.name, description: product.tagline };
}

async function fetchStats(slug: string): Promise<{ stars: number } | null> {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
  try {
    const response = await fetch(`${base}/products/${slug}/stats`, {
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { stars: number };
    return { stars: body.stars };
  } catch {
    return null;
  }
}

export default async function ProductDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = STACK_PRODUCTS.find((p) => p.slug === slug);
  if (!product) {
    notFound();
  }
  const stats = await fetchStats(slug);
  return (
    <article className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">
        {String(product.display_order).padStart(3, "0")} · {product.language}
      </p>
      <h1 className="cp-h1 text-fg-1">{product.name}</h1>
      <p className="cp-lead text-fg-2 mt-4 max-w-2xl">{product.tagline}</p>

      <section className="border-ink-4 mt-12 grid gap-6 border-t pt-12 md:grid-cols-3">
        <div>
          <p className="cp-caption text-fg-3">Status</p>
          <p className="cp-h4 text-fg-1 mt-2">{product.status}</p>
        </div>
        <div>
          <p className="cp-caption text-fg-3">GitHub</p>
          <a
            href={`https://github.com/${product.github_repo}`}
            className="cp-h4 text-ratchet hover:text-ratchet-hot mt-2 block"
          >
            {product.github_repo}
          </a>
        </div>
        <div>
          <p className="cp-caption text-fg-3">Stars</p>
          <p
            className="cp-h4 text-fg-1 mt-2"
            data-testid="product-stars"
          >
            {stats ? stats.stars.toLocaleString() : "—"}
          </p>
        </div>
      </section>

      <section className="mt-12">
        <p className="cp-caption text-fg-3 mb-3">Install</p>
        <pre className="border-ink-5 bg-code-bg cp-code overflow-x-auto border p-4">
          <code>{product.install}</code>
        </pre>
      </section>

      <p className="cp-body text-fg-2 mt-12 max-w-2xl">{product.description}</p>
    </article>
  );
}
