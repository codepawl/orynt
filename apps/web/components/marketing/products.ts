/**
 * Static product data used by the Hero cycler and product chips. Mirrors
 * docs/DATA.md and apps/api/seed/products.py. This is design copy, not DB
 * state — live stars come from `GET /api/v1/products/{slug}/stats`.
 */

import type { Product } from "@codepawl/shared";

export interface HeroProduct extends Product {
  readonly description: string;
  readonly install: string;
  readonly language: string;
}

export const HERO_PRODUCTS: ReadonlyArray<HeroProduct> = [
  {
    id: "openpawl",
    name: "OpenPawl",
    slug: "openpawl",
    tagline: "A team of agents in your terminal.",
    status: "beta",
    github_repo: "codepawl/openpawl",
    display_order: 1,
    description:
      "Run a swarm of specialized agents from your shell. Orchestrates tools, files, and remote APIs without leaving the terminal.",
    install: "$ npx openpawl@latest",
    language: "TypeScript",
  },
  {
    id: "featcat",
    name: "Featcat",
    slug: "featcat",
    tagline: "Feature flags and config for agent workflows.",
    status: "alpha",
    github_repo: "codepawl/featcat",
    display_order: 2,
    description:
      "Type-safe feature flags with offline evaluation. Roll out new prompts, models, and tools without redeploying.",
    install: "$ bun add featcat",
    language: "TypeScript",
  },
  {
    id: "hebbmem",
    name: "HebbMem",
    slug: "hebbmem",
    tagline: "Continual associative memory for long-running agents.",
    status: "pre-alpha",
    github_repo: "codepawl/hebbmem",
    display_order: 3,
    description:
      "Sparse, Hebbian memory primitives so agents accumulate context without dragging the conversation along.",
    install: "$ pip install hebbmem",
    language: "Python",
  },
  {
    id: "turboquant",
    name: "TurboQuant",
    slug: "turboquant",
    tagline: "Quantization toolkit for production inference.",
    status: "alpha",
    github_repo: "codepawl/turboquant",
    display_order: 4,
    description:
      "Per-layer post-training quantization with calibration data, designed for production latency budgets.",
    install: "$ uv add turboquant",
    language: "Python",
  },
  {
    id: "cachepawl",
    name: "Cachepawl",
    slug: "cachepawl",
    tagline: "Prompt and KV cache for the Claude API and friends.",
    status: "beta",
    github_repo: "codepawl/cachepawl",
    display_order: 5,
    description:
      "Drop-in cache layer that exploits Anthropic prompt caching and serializes KV state for self-hosted models.",
    install: "$ bun add cachepawl",
    language: "TypeScript",
  },
  {
    id: "kstudio",
    name: "KStudio",
    slug: "kstudio",
    tagline: "The closed-product studio for shipping agents.",
    status: "private",
    github_repo: "codepawl/kstudio",
    display_order: 6,
    description:
      "Web studio for designing, evaluating, and observing production agents. Closed beta — request access.",
    install: "$ open https://kstudio.codepawl.com",
    language: "Hosted",
  },
];
