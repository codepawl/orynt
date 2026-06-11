# CodePawl Rounded-Industrial Design System

## Brand Principles

CodePawl is coordination infrastructure for coding agents. The visual system should feel engineered, public, and reviewable: concrete surfaces, ink borders, ratchet accents, architectural grids, strong type, and visible structure. The site should not become a generic soft SaaS page.

The design migration softens interaction and content surfaces while preserving the brutalist infrastructure identity. Edges should feel machined, not plush.

## Visual Language

- Concrete/ink/ratchet palette remains the source of truth.
- Heavy borders, block shadows, architectural overlays, grid fields, and section dividers remain part of the brand.
- Content surfaces gain controlled radii so cards, controls, forms, and code blocks feel more polished.
- Structural layout remains mostly sharp so the page still reads as industrial infrastructure.
- Product copy continues to position CodePawl as coordination infrastructure, Openpawl as the current open runtime, and CodePawl Cloud as upcoming/waitlist-only.

## Rounded-Industrial Direction

The key rule: round interactive/content surfaces, keep structural architecture mostly sharp.

Rounded surfaces should clarify hierarchy and improve touch ergonomics. They should not erase the grid, flatten the brand, or introduce pill-heavy SaaS decoration.

## Radius Scale

Use centralized radius tokens only:

| Token | Value | Use |
| --- | ---: | --- |
| `sm` | `6px` | inline code, small badges, compact controls |
| `md` | `10px` | buttons, inputs, nav menu items |
| `lg` | `14px` | cards, link panels, contained frames |
| `xl` | `18px` | large content panels, forms |
| `2xl` | `24px` | rare major contained modules |
| `pill` | `999px` | status dots, avatars, true pills only |

CSS source tokens live in `apps/web/styles/design-tokens.css` as `--cp-radius-*`. Tailwind aliases live in `apps/web/app/globals.css`.

## Square vs Rounded

Keep mostly square:

- Page section borders and full-width bands.
- Concrete grid containers.
- Architectural SVG motifs and facade overlays.
- Timeline spines and structural markers.
- Large layout frames where sharpness carries the brand.

Round:

- Buttons and CTA controls.
- Inputs, textareas, select-like controls, and form success/error panels.
- Product cards and repeated content cards.
- Docs/status/legal cards and link grids.
- Dropdown surfaces and nav menu items.
- Badges, status labels, and true pills.
- Code and terminal blocks.
- Newsletter/contact form controls.
- Hover frames and contained frames when they behave like cards or controls.

## Component Rules

- Prefer shared classes: `cp-card`, `cp-panel`, `cp-control`, `cp-button`, `cp-code`, `cp-inline-code`, `cp-hover-frame`, `cp-hover-lift`, and `cp-hover-contained`.
- Do not add one-off radius values in JSX unless a new shared class cannot express the component.
- Keep border weight and block shadows visible on primary cards.
- Badges may use `sm` or `pill`; avoid giant decorative pills.
- Buttons use `md` by default and keep high-contrast borders.
- Code blocks use `lg`; inline code uses `sm`.
- Nested cards are avoided. If a card needs internal grouping, use border lines or spacing instead.

## Accessibility Rules

- Preserve visible focus states and ratchet focus rings.
- Maintain text contrast against concrete and code surfaces.
- Keep touch targets large enough after rounding; do not shrink padding.
- Respect reduced-motion rules already present in global CSS.
- Do not rely on shape alone for status. Keep text labels such as `AVAILABLE`, `UPCOMING`, and `ROADMAP`.
- Ensure rounded clipping does not hide focus outlines, shadows, or overflowing code.

## Anti-Patterns

- Soft SaaS cards with low-contrast borders.
- Gradient blobs, bokeh, or decorative orbs.
- Overusing `pill` for ordinary buttons or cards.
- Rounding structural section bands, grid containers, or architectural motifs.
- Introducing new colors, shadows, or type styles for the migration.
- Obscuring Marketplace-critical Openpawl routes or changing webhook behavior.
- Making Cloud sound generally available.

## Validation Checklist

- `bun --filter @codepawl/web typecheck`
- `bun --filter @codepawl/web test`
- `bun --filter @codepawl/web build`
- Smoke `/`, `/openpawl`, `/products/openpawl`, `/openpawl/install`, `/openpawl/docs`, `/openpawl/support`, `/status`, `/privacy`, `/terms`, `/security`, `/contact`, `/pricing`.
- Confirm `/api/github/marketplace` GET returns `405` and `Allow: POST`.
- `git diff --check`
- Visual review desktop and mobile for no generic SaaS drift, no text overlap, and no broken architectural structure.

## Progress Log

- Checkpoint 1: documented rounded-industrial principles, radius scale, component rules, and validation checklist.
