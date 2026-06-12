# CodePawl Rounded-Industrial Design System

## Brand Principles

CodePawl is coordination infrastructure for coding agents. The visual system should feel engineered, public, and reviewable: concrete surfaces, ink borders, ratchet accents, architectural grids, strong type, and visible structure. The site should not become a generic soft SaaS page.

The design migration softens interaction and content surfaces while preserving the brutalist infrastructure identity. Edges should feel machined, not plush.

## Visual Language

- Concrete/ink/ratchet palette remains the source of truth.
- Heavy borders, block shadows, architectural overlays, grid fields, and section dividers remain part of the brand.
- Content surfaces gain controlled radii so cards, controls, forms, and code blocks feel more polished.
- Structural layout remains mostly sharp so the page still reads as industrial infrastructure.
- Product copy continues to position CodePawl as coordination infrastructure, Openpawl as the current open coordination runtime, and CodePawl Cloud as upcoming/waitlist-only.

## Rounded-Industrial Direction

The key rule: round interactive/content surfaces, keep structural architecture mostly sharp.

Rounded surfaces should clarify hierarchy and improve touch ergonomics. They should not erase the grid, flatten the brand, or introduce pill-heavy SaaS decoration.

## Design Priority Hierarchy

Use this order when two rules appear to conflict:

1. **Product truth**: keep CodePawl positioned as coordination infrastructure, Openpawl as the current public runtime, and CodePawl Cloud as upcoming/waitlist-only.
2. **Operational clarity**: users must be able to scan install, docs, support, status, legal, and waitlist paths quickly.
3. **Brand structure**: preserve concrete grids, architectural motifs, sharp section dividers, heavy borders, block shadows, and strong typography.
4. **Surface polish**: soften only content and interactive surfaces with the shared radius scale.
5. **Implementation discipline**: prefer tokens and shared classes over JSX-local radius utilities or one-off CSS.

If a visual change weakens hierarchy, obscures Marketplace-critical routes, or makes the site feel like a generic SaaS template, the brand structure wins over additional rounding.

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

## Component-To-Radius Mapping

Use the existing shared classes and semantic component classes before adding new ones:

| Surface/class | Radius | Notes |
| --- | ---: | --- |
| `.cp-button`, `.cp-hover-button` | `md / 10px` | Primary and secondary CTAs; keep border weight and compact industrial shape. |
| `.cp-control`, form inputs, textareas | `md / 10px` | Applies to newsletter/contact fields and Clerk form fields. |
| `.cp-hover-contained` | `md / 10px` | Compact contained controls such as nav dropdown rows and pricing CTAs. |
| `.cp-card`, `.cp-hover-frame`, `.cp-hover-lift` | `lg / 14px` | Product cards, docs/status/legal cards, link panels, and repeated content surfaces. |
| `.cp-menu` | `lg / 14px` | Dropdown/menu shell; menu rows remain `md` through `.cp-hover-contained`. |
| `.cp-code` | `lg / 14px` | Code and terminal blocks; preserve dark code palette and border. |
| `.cp-inline-code`, `.cp-small-surface`, `.product-badge-*`, `.tracepawl-new-badge` | `sm / 6px` | Small labels, inline code, and status badges. |
| `.cp-panel` | `xl / 18px` | Large contained forms or panels only when a card is visually too small. |
| `.cp-pill`, `.product-pulse-dot`, avatar triggers | `pill / 999px` | Dots, avatars, and true pills only. |
| `section`, `.concrete-grid`, `.facade-reserve`, architectural SVG wrappers, timeline spine | `none / 0px` | Structural architecture remains sharp. |

Tailwind `rounded-*` utilities may resolve through the token system, but prefer the project classes above so radius intent is visible during review.

## Border, Shadow, And Radius Interaction

- Radius must not weaken CodePawl's hard-edge visual weight. Rounded cards still keep visible ink borders.
- Block shadows (`.block-shadow`, `.block-shadow-sm`) pair with `lg` card radius. Do not increase shadow blur or introduce new shadow styles.
- Hover shadows on `.cp-hover-lift`, `.cp-hover-frame`, and `.cp-hover-button` remain square-offset block shadows. The shadow may extend past the rounded surface.
- Use `overflow: hidden` only when content truly needs clipping; do not clip block shadows, focus rings, code overflow, or architectural overlays.
- Dashed roadmap/product states may be rounded when they are cards, but the dashed border must stay visible on every edge.
- Accent glow on active product state remains subtle and tied to the existing ratchet color; do not add new glow colors.
- If a rounded surface sits directly inside a sharp section band, keep enough padding so the contrast reads intentional rather than mismatched.
- Do not round page section borders, full-width bands, concrete-grid backgrounds, or divider lines to match the cards.

## Density Rules

- Preserve the current dense, infrastructure-oriented layout. Do not create oversized SaaS cards or excessive whitespace.
- Buttons and form controls keep existing padding unless text clips or touch targets fall below comfortable size.
- Cards may use `p-5`, `p-6`, or existing responsive padding; do not increase padding solely because corners are rounded.
- Product grids should remain scannable: headings, badge, body, and link must stay visible without tall decorative empty areas.
- Legal/status/docs pages should favor stacked, readable panels over marketing-style hero expansion.
- Mobile layouts should keep vertical rhythm tight enough that primary CTAs and Marketplace-critical links remain near the top.
- Badges and status labels should stay compact; avoid making every label a large pill.

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

## Visual QA Checklist

Homepage:

- Hero section, concrete grid, architectural overlay, and section dividers remain sharp.
- Hero CTAs use `md` radius and retain strong borders/block interaction.
- Product cards use shared card radius, not JSX-local radius utilities.
- Roadmap timeline spine and markers still read as structural elements.
- Openpawl remains the current public product and Cloud remains upcoming/waitlist-only.

Openpawl page:

- Info cards and link grids use `lg` card radius with visible ink borders and block shadows.
- GitHub Actions is described as the first supported surface, not the whole product.
- Install/source/support/status links remain easy to scan.
- Safety model copy remains accurate: dry-run default, guarded writes, reviewable evidence.

Marketplace docs/legal pages:

- `/openpawl/install`, `/openpawl/docs`, `/openpawl/support`, `/status`, `/privacy`, `/terms`, and `/security` keep consistent card radius and density.
- Code blocks use `.cp-code` radius and preserve horizontal scrolling.
- Inline code uses `.cp-inline-code` radius and does not disrupt line height.
- Legal/status content remains clear and restrained, not promotional.
- `/api/github/marketplace` behavior is not affected by visual work.

Mobile nav:

- Header remains compact and sharp at the outer boundary.
- Primary install action remains reachable and does not wrap awkwardly.
- Product dropdown/menu surfaces use `.cp-menu` and `.cp-hover-contained` where present.
- No nav text overlaps, clips, or becomes too small to tap.

Forms:

- Contact and newsletter inputs use `.cp-control`.
- Submit buttons use `.cp-button`/`.cp-hover-button` with `md` radius.
- Success/error panels use card radius and preserve accessible status/alert roles.
- Focus states remain visible against concrete backgrounds.
- Textareas keep enough height for writing without adding decorative whitespace.

## Progress Log

- Checkpoint 1: documented rounded-industrial principles, radius scale, component rules, and validation checklist.
