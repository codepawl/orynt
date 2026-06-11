/**
 * Static product data for the CodePawl stack. Mirrors docs/DATA.md and
 * apps/api/seed/products.py. Live stars come from `GET /api/v1/products/{slug}/stats`.
 */

import type { Product } from "@codepawl/shared";

export interface StackProduct extends Product {
  readonly availability: "active" | "announced_soon";
  readonly description: string;
  readonly install: string;
  readonly language: string;
  readonly current_focus: boolean;
}

type ProductsResponse = {
  readonly products: ReadonlyArray<Product>;
};

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
const API_FETCH_TIMEOUT_MS = 2500;

export const STACK_PRODUCTS: ReadonlyArray<StackProduct> = [
  {
    id: "trace",
    name: "TracePawl",
    slug: "trace",
    tagline: "Failure diagnosis and replay for AI agents.",
    status: "pre-alpha",
    github_repo: "codepawl/tracepawl",
    display_order: 1,
    description:
      "TracePawl analyzes agent runs to identify where execution drifted, which tool call caused failure, and what recovery action should be attempted next.",
    availability: "active",
    install: "$ pip install tracepawl",
    language: "Python",
    current_focus: true,
  },
  {
    id: "mempawl",
    name: "Mempawl",
    slug: "mempawl",
    tagline: "Persistent memory for agentic systems.",
    status: "pre-alpha",
    github_repo: "codepawl/mempawl",
    display_order: 2,
    description:
      "Mempawl stores operational knowledge for long-running agents: previous failures, workflow preferences, and recovery patterns.",
    availability: "announced_soon",
    install: "$ pip install mempawl",
    language: "Python",
    current_focus: false,
  },
  {
    id: "openpawl",
    name: "OpenPawl",
    slug: "openpawl",
    tagline: "Dry-run-first AI code review workflow for GitHub.",
    status: "beta",
    github_repo: "codepawl/openpawl",
    display_order: 3,
    description:
      "OpenPawl reviews repositories from GitHub Actions, writes schema-versioned artifacts, and keeps beta write mode gated behind explicit maintainer approval.",
    availability: "active",
    install: "Use codepawl/openpawl@v0.5.1 for the public Action release",
    language: "TypeScript",
    current_focus: false,
  },
  {
    id: "cachepawl",
    name: "CachePawl",
    slug: "cachepawl",
    tagline: "Optimization for long-horizon agent workloads.",
    status: "beta",
    github_repo: "codepawl/cachepawl",
    display_order: 4,
    description:
      "CachePawl reduces cost and latency for repeated, memory-heavy, and replay-heavy agent execution. Optimization layer, not an inference platform.",
    availability: "announced_soon",
    install: "$ bun add cachepawl",
    language: "TypeScript",
    current_focus: false,
  },
];

export async function getStackProducts(): Promise<ReadonlyArray<StackProduct>> {
  const apiProducts = await fetchApiProducts();
  if (!apiProducts) {
    return STACK_PRODUCTS;
  }

  const fallbackBySlug = new Map(
    STACK_PRODUCTS.map((product) => [product.slug, product]),
  );
  const merged = apiProducts
    .map((product) => {
      const fallback = fallbackBySlug.get(product.slug);
      return fallback ? { ...fallback, ...product } : null;
    })
    .filter((product): product is StackProduct => product !== null)
    .sort((a, b) => a.display_order - b.display_order);

  return merged.length > 0 ? merged : STACK_PRODUCTS;
}

export async function getStackProduct(
  slug: string,
): Promise<StackProduct | null> {
  const products = await getStackProducts();
  return products.find((product) => product.slug === slug) ?? null;
}

export function productAvailabilityLabel(product: StackProduct): string {
  return product.availability === "active" ? "DEVELOPING" : "COMING SOON";
}

export function productStateClass(product: StackProduct): string {
  return product.availability === "active"
    ? "product-state-active"
    : "product-state-soon";
}

export function productBadgeClass(product: StackProduct): string {
  return product.availability === "active"
    ? "product-badge-active"
    : "product-badge-soon";
}

async function fetchApiProducts(): Promise<ReadonlyArray<Product> | null> {
  try {
    const response = await fetch(`${API_BASE}/products`, {
      signal: AbortSignal.timeout(API_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as ProductsResponse;
    return Array.isArray(body.products) ? body.products : null;
  } catch {
    return null;
  }
}
