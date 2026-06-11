import { createRoute, notFound } from "@tanstack/react-router";

import {
  getStackProduct,
  productAvailabilityLabel,
  productBadgeClass,
  productStateClass,
} from "@/components/marketing/products";
import { OpenpawlLanding } from "@/components/marketing/openpawl-landing";
import { Route as productsRoute } from "./products";

const API_FETCH_TIMEOUT_MS = 2500;
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const Route = createRoute({
  getParentRoute: () => productsRoute,
  path: "$slug",
  loader: async ({ params }) => {
    const product = await getStackProduct(params.slug);
    if (!product) throw notFound();
    const stats = await fetchStats(params.slug);
    return { product, stats };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title:
          loaderData?.product.slug === "openpawl"
            ? "Openpawl by CodePawl - Coordination runtime for coding agents"
            : (loaderData?.product.name ?? "Product"),
      },
      { name: "description", content: loaderData?.product.tagline ?? "" },
    ],
    links:
      loaderData?.product.slug === "openpawl"
        ? [{ rel: "canonical", href: "https://codepawl.com/openpawl" }]
        : undefined,
  }),
  component: ProductDetailPage,
});

async function fetchStats(slug: string): Promise<{ stars: number } | null> {
  try {
    const response = await fetch(`${API_BASE}/products/${slug}/stats`, {
      signal: AbortSignal.timeout(API_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { stars: number };
    return { stars: body.stars };
  } catch {
    return null;
  }
}

function ProductDetailPage() {
  const { product, stats } = Route.useLoaderData();

  if (product.slug === "openpawl") {
    return <OpenpawlLanding />;
  }

  if (product.availability === "upcoming" || product.availability === "roadmap") {
    return (
      <article className="mx-auto max-w-[1240px] px-6 py-20">
        <p className="cp-marker mb-6">
          {String(product.display_order).padStart(3, "0")} · {product.language}
        </p>
        <h1 className="cp-h1 text-fg-1">{product.name}</h1>
        <p className="cp-lead text-fg-2 mt-4 max-w-2xl">{product.tagline}</p>

        <section
          className={`border-ink-4 mt-12 border p-6 ${productStateClass(product)}`}
        >
          <span className={productBadgeClass(product)}>
            {productAvailabilityLabel(product)}
          </span>
          <p className="cp-body text-fg-2 mt-5 max-w-2xl">
            {product.description}
          </p>
          <a
            href={`https://github.com/${product.github_repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="cp-button bg-ratchet text-ink-0 hover:bg-ratchet-hot mt-8 inline-flex border-2 border-ratchet px-5 py-3 transition-colors"
          >
            View roadmap source
          </a>
        </section>
      </article>
    );
  }

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
          <p className="mt-2">
            <span className={productBadgeClass(product)}>
              <span className="product-pulse-dot" aria-hidden />
              {productAvailabilityLabel(product)}
            </span>
          </p>
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
          <p className="cp-h4 text-fg-1 mt-2" data-testid="product-stars">
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
