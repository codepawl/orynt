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
    tagline: "Runtime for coordinated AI agents.",
    status: "beta",
    github_repo: "codepawl/openpawl",
    display_order: 3,
    description:
      "OpenPawl runs agent workflows with shared state, task coordination, and recovery hooks. The execution layer for long-horizon software engineering tasks.",
    availability: "announced_soon",
    install: "$ npx openpawl@latest",
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
