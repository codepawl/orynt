/**
 * Static product data for the CodePawl stack. Mirrors docs/DATA.md and
 * apps/api/seed/products.py. Live stars come from `GET /api/v1/products/{slug}/stats`.
 */

import type { Product } from "@codepawl/shared";

export interface StackProduct extends Product {
  readonly availability: "available" | "beta" | "upcoming" | "roadmap";
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
    id: "openpawl",
    name: "Openpawl",
    slug: "openpawl",
    tagline: "Reviewable agent work, starting in GitHub.",
    status: "beta",
    github_repo: "codepawl/openpawl",
    display_order: 1,
    description:
      "Openpawl is an open runtime for coding-agent coordination. It turns agent tasks into plans, validations, guarded changes, and traceable run evidence. The first supported surface is GitHub Actions.",
    availability: "available",
    install: "Use codepawl/openpawl@v0.5.1 for the public Action release",
    language: "TypeScript",
    current_focus: true,
  },
  {
    id: "trace",
    name: "TracePawl",
    slug: "trace",
    tagline: "Roadmap coordination evidence and replay layer.",
    status: "pre-alpha",
    github_repo: "codepawl/tracepawl",
    display_order: 2,
    description:
      "TracePawl is a future architecture layer for coordination evidence, failure diagnosis, replay, and review. It is not presented as a generally installable product yet.",
    availability: "roadmap",
    install: "Roadmap layer; no public install path yet",
    language: "Python",
    current_focus: false,
  },
  {
    id: "mempawl",
    name: "Mempawl",
    slug: "mempawl",
    tagline: "Roadmap memory layer for agent handoffs.",
    status: "pre-alpha",
    github_repo: "codepawl/mempawl",
    display_order: 3,
    description:
      "Mempawl is a planned architecture layer for persistent operational memory across agent runs and handoffs. It remains roadmap work, not an equal ready product.",
    availability: "roadmap",
    install: "Roadmap layer; no public install path yet",
    language: "Python",
    current_focus: false,
  },
  {
    id: "cachepawl",
    name: "CachePawl",
    slug: "cachepawl",
    tagline: "Roadmap optimization layer for repeated coordination work.",
    status: "beta",
    github_repo: "codepawl/cachepawl",
    display_order: 4,
    description:
      "CachePawl is a planned optimization layer for repeated, memory-heavy, and replay-heavy agent execution. It is roadmap infrastructure, not a public product surface today.",
    availability: "roadmap",
    install: "Roadmap layer; no public install path yet",
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
  switch (product.availability) {
    case "available":
      return "AVAILABLE";
    case "beta":
      return "BETA";
    case "upcoming":
      return "UPCOMING";
    case "roadmap":
      return "ROADMAP";
  }
}

export function productStateClass(product: StackProduct): string {
  return product.availability === "available" || product.availability === "beta"
    ? "product-state-active"
    : "product-state-soon";
}

export function productBadgeClass(product: StackProduct): string {
  return product.availability === "available" || product.availability === "beta"
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
