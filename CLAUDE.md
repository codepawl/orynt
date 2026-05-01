# CLAUDE.md — Codepawl Landing Page

This file is the persistent context for Claude Code when working in this repo. Read it before every task. If anything below conflicts with a one-off prompt, ask before deciding.

## What this repo is

The marketing landing page for Codepawl, a one-person dev studio. Live domain: codepawl.com. This is the public face of the studio and the primary surface for the flagship product, Codepawl Trace.

This repo is NOT the product. The product code lives in a separate repo (codepawl-trace). Do not add product features, dashboards, or app routes here. This is static marketing only.

## Brand and positioning (LOCKED)

Codepawl is a dev tools studio for engineers shipping AI systems. Trace is the first product. Future products use the same design system, brand, and pricing structure.

- Studio name: **Codepawl**
- First product: **Codepawl Trace**
- Studio framing (homepage marker): "Codepawl · dev tools studio for AI builders"
- Trace tagline (homepage hero, locked): "Why did your AI fail? We tell you. In 30 seconds."
- Trace subhead (locked): "Codepawl Trace is a failure-explanation layer for AI agent developers. Plug in your traces from Langfuse, LangSmith, OpenTelemetry, or raw SDK logs. Get structured diagnoses, root causes, and the exact fix to apply. Not another dashboard. A debugger that thinks."

Trace's positioning is failure-explanation, not observability. We complement Langfuse/LangSmith, we do not replace them. The mechanical-pawl metaphor stays as visual brand thesis for the whole studio. The phrase "ratchet engineering forward" lives only on `/about` as origin story, never on the homepage.

Future products go under the same Codepawl brand, design system, and self-host-or-cloud pricing pattern. Adding a product is a content collection entry plus optional product page, not a brand exercise.

Do NOT propose new positioning, taglines, or brand pivots without explicit ask.

## Stack

- **Astro 5** (static site generator, near-zero JS shipped)
- **Tailwind CSS 3** (utility classes only, no CSS modules, no styled-components)
- **MDX** for `/log` content collection
- **TypeScript strict mode**, `any` is forbidden anywhere
- **Bun** for all package management (`bun add`, `bun run`, never `npm install` or `yarn`)
- **Cloudflare Pages** for hosting (framework: astro, auto-deploy from main via git integration)

No React, no Vue, no Svelte islands in v1. No client-side JS on any page. If a feature requires JS, ask first.

## File structure

```
.
├── DESIGN.md                       # visual theme spec, READ FIRST for any UI change
├── CLAUDE.md                       # this file
├── README.md
├── astro.config.mjs
├── package.json
├── tailwind.config.mjs
├── wrangler.toml                   # Cloudflare Pages config
├── public/                         # favicon, og images, static assets
└── src/
    ├── content/
    │   ├── config.ts               # collection schemas (log, products)
    │   ├── log/                    # MDX build log entries
    │   └── products/               # MDX product entries (one per product)
    ├── components/
    │   ├── Header.astro
    │   ├── Footer.astro
    │   ├── Em.astro                # italic-word ratchet emphasis
    │   ├── SectionMarker.astro     # "001 ·" rhythm marker
    │   ├── CodeBlock.astro         # file-tab signature code block
    │   ├── ProductCard.astro       # generic; do not hardcode product names
    │   ├── PricingTier.astro       # generic pricing tier
    │   ├── IntegrationStrip.astro  # adapters strip (replaces customer logos)
    │   └── ComparisonTable.astro
    ├── layouts/
    │   └── Base.astro              # site shell, head, header, footer
    ├── pages/
    │   ├── index.astro             # homepage (studio framing + Trace)
    │   ├── diagnose.astro          # product page (Codepawl Trace)
    │   ├── about.astro
    │   ├── products/index.astro
    │   └── log/
    │       ├── index.astro
    │       └── [...slug].astro
    └── styles/
        └── global.css              # Tailwind base + design tokens
```

Pages that should NOT exist: `/community`, `/papers`, `/projects`, `/blog`, `/team`, `/pricing` (pricing lives on homepage and `/diagnose`), `/docs` (lives at docs.codepawl.com).

## Commands

```bash
bun install              # first-time setup
bun run dev              # local dev server, http://localhost:4321
bun run build            # production build to dist/
bun run preview          # preview production build locally
bun run lint             # if configured, runs eslint or biome
```

CLI assumes Linux / WSL2 Ubuntu, not Windows.

## Design system

The single source of truth for visuals is `DESIGN.md`. Read it before any UI change. Key rules pulled forward:

- Dark mode only in v1, no light mode toggle
- Color palette is locked: ink (neutral) + ratchet-orange accent. No purple, no blue gradients, no new colors.
- Fonts: **Fraunces** for display headlines, **Inter Tight** for body, **JetBrains Mono** for technical labels and code. No Geist, no Space Grotesk, no Inter Tight Variable substitutions.
- Section pattern is mandatory: every section has a numbered marker (`001 ·`, `002 ·`) + uppercase mono label + Fraunces headline + body
- Code blocks use the file-tab signature: `[•] [•] [●]   FILENAME.PY` with the third dot in ratchet-orange
- Cards use `.blueprint-card` with corner ticks top-left and bottom-right only
- Buttons are sharp-cornered (radius 0 or 2px), never rounded-full, never gradient
- No hover lifts, no scale transforms, no scroll-triggered animations
- Italic emphasis on a single word in headlines is the signature move (e.g. "Why did your *AI* fail?")

If a design choice is not covered in DESIGN.md, ask before inventing.

## Voice and copy rules

- No em dashes (—) or en dashes (–) anywhere. Use commas, periods, or restructure.
- No certainty words: "extremely", "always", "never", "perfect", "guaranteed", "absolutely"
- No hedging: "I think maybe", "perhaps", "it might be that"
- No SaaS-template phrases: "let's dive in", "in today's landscape", "it's worth noting", "unlock the power of", "supercharge your", "join the waitlist", "get started for free"
- No emoji in marketing copy
- CTAs use action verbs in title case: "View on GitHub", "Read the build log", "Notify on launch"
- Headlines take a stand. Direct claims, no qualifiers.
- Body copy stays under 2 lines per paragraph in marketing sections

When writing for `/log`, the voice is honest builder-in-public: first person, specific numbers, decisions and tradeoffs, no triumphalism. Reference the studio as "we" only when the studio acts as the actor; use "I" when the founder acts as the actor.

## Site structure (LOCKED)

```
/                    Homepage: studio framing + Trace hero + how it works + comparison + pricing + CTA
/diagnose            Product page (deeper Trace explanation)
/products            Product index (Trace card + "more coming" placeholder)
/log                 Build log index (MDX collection)
/log/[slug]          Individual log post
/about               Studio bio + origin story
```

Header nav order: `Products` · `Diagnose` · `Log` · `About` · `GitHub` (external). `/changelog` returns when v0.1 ships.

Pages that should NOT exist on the marketing site: `/docs` (lives at docs.codepawl.com), `/pricing` (pricing surfaces on `/` and `/diagnose`), `/community`, `/papers`, `/blog`, `/team`, `/projects`.

## Performance budget

- Lighthouse 100 on Performance, 100 on Accessibility minimum
- LCP under 1.0s on 4G mobile
- Zero render-blocking JavaScript on first load
- Total page weight under 200KB excluding fonts
- Fonts subset to Latin only, woff2 format, preloaded for Fraunces and Inter Tight, JetBrains Mono lazy-loaded

If a change would break the budget, flag it before merging.

## Pricing (LOCKED for v1)

Surface these tiers identically on homepage and `/diagnose`:

- **Self-host**: Free, open source, no limits, user runs infra
- **Hobbyist cloud**: $19/mo, 10k diagnoses, 1 user
- **Team cloud**: $49/mo, 100k diagnoses, 5 users
- Annual: 17% off
- Cloud launches Q3 2026

Do not change pricing copy without explicit ask.

## Hard "do not" list

- Do NOT add testimonials, customer logos, or fake social proof (zero customers, don't fake)
- Do NOT add fake production stats (uptime numbers, team counts, p50 latencies) until real telemetry exists
- Do NOT add a sticky/floating header. Header is static, border-bottom only.
- Do NOT use blue accents or blue gradients anywhere. The accent is ratchet-orange. Period.
- Do NOT use purple. Code syntax follows DESIGN.md exactly.
- Do NOT hardcode product names into reusable components. ProductHero, ProductCard, PricingTier accept props; Trace-specific copy lives in pages or content collection entries.
- Do NOT add a Discord, Slack, or community section (community comes after the product has users)
- Do NOT add a "team" or "founders" section beyond the brief bio on `/about`
- Do NOT add stock illustrations, gradient blobs, or generic SaaS imagery
- Do NOT add tracking pixels, analytics scripts, or third-party widgets in v1
- Do NOT add a newsletter popup, exit-intent modal, or any modal-based capture
- Do NOT add `<form>` elements. The "Notify on launch" CTA links to GitHub for now.
- Do NOT introduce React, Vue, or Svelte components
- Do NOT add cookie banners (no tracking means no banner needed)
- Do NOT push to remote without local review with `bun run dev` and `bun run build`
- Do NOT touch the codepawl-trace product repo

## Workflow expectations

For any change:

1. Read `DESIGN.md` and the relevant page file before writing code
2. Make focused commits, not one giant one (one commit per logical change)
3. After each batch of changes, run `bun run build` and verify dist/ output
4. Show diff summaries after commits
5. Do NOT push to remote, do NOT deploy. Wait for explicit confirmation.

## Founder context

Solo dev based in Southeast Asia. Plans an EU relocation within 12-18 months via a self-employment visa. Cash floor comes from freelance challenge work (hourly reviews + per-challenge fees). Building Codepawl Trace on the remaining time. Goal: reach a sustainable monthly income target by month 18.

GitHub: founder personal handle (redacted)
X: founder personal handle (redacted), `@codepawl` org

## Decision log

When making non-obvious choices, append to this section instead of opening issues. Format: `### YYYY-MM-DD: short title` followed by 1-3 sentences of reasoning.

### 2026-04: Astro over Next.js for the marketing site
The dashboard at `app.codepawl.com` (future) will be Next.js. The marketing site is mostly static, needs Lighthouse 100, and benefits from Astro's zero-JS-by-default model. Two separate apps, right tool for each.

### 2026-04: Pivot positioning from "studio of tools" to "failure-explanation layer"
The original Codepawl framing was a studio brand with multiple future tools, with Trace as the first one. We narrowed the homepage to a single product pitch because solo founders win on focus. The studio framing survives only on `/about` as origin story.

### 2026-04: Kill /community, /papers, /projects from old site
Zero members, zero papers, generic projects. Devs see through fake community instantly. Surfaces come back when there is real content to put on them.

### 2026-04-30: Pivoted positioning from single-product to studio-framing after design output
Reverses the earlier 2026-04 decision to narrow to a single-product pitch. Trace remains the only shipped product in v1. Routes added: `/products`, `/changelog`. Reusable components (`ProductHero`, `ProductCard`, `PricingTier`) and content collections (`products`, `changelog`) make adding product #2 mechanical when it ships. Rejected design elements: customer logos strip, testimonial quotes, fake production stats (47 teams / 99.97% uptime), sticky nav with backdrop blur, "Open dashboard" / "Sign in" header buttons, blueprint blue accent (`#4D7FB8`), purple in code syntax (`#B89BD8`), the design's cooler ink scale (kept our warm `#070605..`), the design's `#FF6B1A` ratchet (kept our `#FF9500`). Pricing tiers stay locked at Self-host / Hobbyist $19 / Team $49 (rejected the design's Solo $0 / Team $20-seat / Enterprise model).

### 2026-05-01: Removed `/changelog` routes and content collection until v0.1 ships
The empty changelog collection was producing build-time warnings and the index page rendered a "pre-release" placeholder, which signaled emptiness rather than progress. Schema, both pages, header nav item, and notify.astro link removed. Reinstate together with the first real release entry when Trace v0.1 ships; the products collection pattern is the template.