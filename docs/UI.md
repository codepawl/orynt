# UI

## Design tokens

All tokens are CSS custom properties. Define once in `apps/web/styles/design-tokens.css`, imported by `app/globals.css`. Two-layer approach: raw values in `:root`, semantic mappings in `@theme` so Tailwind generates utility classes.

### Color palette

**Ink neutrals (dark canvas)**

- `--ink-0: #07090C` deepest, page background
- `--ink-1: #0B0E13` primary surface
- `--ink-2: #11151B` card surface
- `--ink-3: #181D25` raised surface, hover state
- `--ink-4: #1F2530` border, low-contrast divider
- `--ink-5: #2A3140` hairline border
- `--ink-6: #3A4253` muted border

**Foreground**

- `--fg-1: #F4F6FA` primary text
- `--fg-2: #C7CDD8` body text
- `--fg-3: #8B95A6` secondary, labels
- `--fg-4: #5A6577` tertiary, disabled
- `--fg-5: #3A4253` placeholder

**Accent (ratchet orange, single accent)**

- `--ratchet: #FF6B1A` primary accent
- `--ratchet-hot: #FF842D` hover
- `--ratchet-deep: #C44A0E` pressed
- `--ratchet-tint: rgba(255, 107, 26, 0.12)` background tint

**Secondary (blueprint blue, technical accent)**

- `--blueprint: #4D7FB8` primary blueprint
- `--blueprint-soft: #6E9BD2` hover
- `--blueprint-deep: #2B4A73` pressed
- `--blueprint-grid: rgba(77, 127, 184, 0.08)` grid overlay

**Semantic**

- `--success: #4FB286`
- `--warning: #E5B341`
- `--danger: #E5524A`
- `--info: var(--blueprint)`

### Typography

- **Display font**: Fraunces (variable, `opsz` 9-144, `wght` 100-900, italic axis). Used for headlines, the cycling product name, hero title.
- **Body font**: Inter Tight (variable, `wght` 100-900). Used for paragraphs, navigation, buttons.
- **Mono font**: JetBrains Mono (variable, `wght` 100-900). Used for code, terminal output, the `001 ·` marker style.

All three are TTF variable fonts loaded via `next/font/local`. Files live in `apps/web/public/fonts/`.

### Type scale

- `--fs-display: clamp(3.5rem, 6vw, 5.5rem)` hero title (56-88px)
- `--fs-h1: clamp(2.5rem, 4vw, 3.75rem)` (40-60px)
- `--fs-h2: clamp(2rem, 3vw, 2.75rem)` (32-44px)
- `--fs-h3: 1.625rem` (26px)
- `--fs-h4: 1.25rem` (20px)
- `--fs-lead: 1.25rem` (20px)
- `--fs-body: 1rem` (16px)
- `--fs-small: 0.875rem` (14px)
- `--fs-caption: 0.75rem` (12px)

### Spacing scale (4px base)

`--sp-1: 4px`, `--sp-2: 8px`, `--sp-3: 12px`, `--sp-4: 16px`, `--sp-5: 20px`, `--sp-6: 24px`, `--sp-8: 32px`, `--sp-10: 40px`, `--sp-12: 48px`, `--sp-16: 64px`, `--sp-20: 80px`, `--sp-24: 96px`.

### Radius

Sharp corners are the brand. All radius tokens are `0` except for tags and pills.

- `--radius-0: 0px`
- `--radius-1: 0px`
- `--radius-pill: 999px` reserved for tags

In Tailwind `@theme`, override `--radius-*` so utilities like `rounded`, `rounded-md`, `rounded-lg`, `rounded-xl` all resolve to `0`. Only `rounded-full` produces a pill.

### Borders

- `--border-1: 1px solid var(--ink-4)`
- `--border-2: 1px solid var(--ink-5)`
- `--border-strong: 1px solid var(--ink-6)`
- `--border-accent: 1px solid var(--ratchet)`
- `--border-blueprint: 1px solid var(--blueprint-deep)`

### Shadows

Flat, mostly inset hairlines. No drop shadows on cards.

- `--shadow-hairline: inset 0 0 0 1px var(--ink-5)`
- `--shadow-1: 0 1px 0 var(--ink-5)`
- `--shadow-2: 0 8px 24px rgba(0,0,0,0.4)` only for modal overlays
- `--shadow-glow: 0 0 0 3px rgba(255, 107, 26, 0.18)` focus ring

### Motion

- `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`
- `--ease-in: cubic-bezier(0.6, 0, 0.8, 0.2)`
- `--dur-fast: 120ms`
- `--dur-base: 200ms`
- `--dur-slow: 360ms`

Honor `prefers-reduced-motion: reduce` by collapsing animation duration to `0.01ms`.

### Layout

- `--container-max: 1240px` page container
- `--content-max: 720px` reading width for blog and docs
- `--grid-gutter: 24px`

## Component library

Marketing route group: **pure Tailwind v4** plus design tokens. No Ant Design imports. No headless UI library. Components built from primitives.

App route group: **Ant Design themed**, wrapped in `AntdConfigProvider`. Out of MVP scope but reserved.

Animation: **motion/react** for sequenced or stateful animations (hero cycling, scroll reveals). CSS keyframes for simple loops (pawl-spin, pawl-pulse, pawl-blink in `globals.css`).

Icons: **react-bootstrap-icons** only. No Lucide. No Heroicons.

## Breakpoints

Tailwind defaults are fine.

- `sm: 640px`
- `md: 768px`
- `lg: 1024px`
- `xl: 1280px`
- `2xl: 1536px`

The `--container-max: 1240px` lands between `lg` and `xl`. Marketing layouts target `lg` as the primary breakpoint.

## Screens

### Landing `/`

- **Purpose**: Pitch the product family in 30 seconds. Drive newsletter signup and product page clicks.
- **Sections** (top to bottom): Nav, Hero with cycling product showcase, TrustedBy logo row, Formats, Features grid, SDKDemo terminal, Pricing teaser, Testimonials, Final CTA, Footer.
- **States**: static, no async data on first paint. Hero cycler is client-side animation; product detail data is bundled in TS const.
- **Auth**: public

### Products index `/products`

- **Purpose**: Grid of all six product cards. Each card shows name, tagline, language badge, stars count, status.
- **Data**: `GET /api/v1/products` plus `GET /api/v1/products/{slug}/stats` for each (parallel fetch). ISR 1 hour.
- **States**: loading (server-rendered, no client loading state needed), error (ISR fallback to last successful render).
- **Auth**: public

### Product detail `/products/[slug]`

- **Purpose**: Deep page per product. Hero, features, install instructions, code samples, link to GitHub.
- **Data**: `GET /api/v1/products/{slug}` plus stats. Static product content lives in MDX at `apps/web/content/products/{slug}.mdx`.
- **States**: loading (server-rendered), error (404 if slug unknown), success.
- **Auth**: public

### Research `/research`

- **Purpose**: Index of curated AI/ML research notes.
- **Data**: MDX files in `apps/web/content/research/*.mdx`. Frontmatter contains title, date, tags, paper URL.
- **States**: success only at MVP (empty state never seen, founder seeds content).
- **Auth**: public

### Blog index `/blog`

- **Purpose**: Reverse-chronological list of blog posts.
- **Data**: MDX files in `apps/web/content/blog/*.mdx`.
- **Auth**: public

### Blog post `/blog/[slug]`

- **Purpose**: Read a blog post.
- **Data**: MDX. Custom components: code block with copy button, RepoCard, KaTeX math, YouTube embed.
- **Auth**: public

### Docs `/docs/[[...path]]`

- **Purpose**: Catch-all rendering MDX docs fetched from internal product repos.
- **Data**: GitHub API fetch of `docs/` folder per repo. ISR with manual refresh button (admin).
- **States**: loading, error, success.
- **Auth**: public read, admin refresh via API key in admin UI

### Careers `/careers`

- **Purpose**: List of open roles, link to job posts.
- **Data**: MDX files in `apps/web/content/careers/*.mdx`.
- **States**: success or empty (with a "no open roles right now" message).
- **Auth**: public

### Pricing `/pricing`

- **Purpose**: Three-tier price comparison. CTAs go to KStudio waitlist or contact.
- **Data**: static.
- **Auth**: public

### Contact `/contact`

- **Purpose**: Send a message to hello@codepawl.com.
- **Data**: form posts to `POST /api/v1/contact`. Turnstile widget rendered.
- **States**: idle, submitting, success (show thank-you), error.
- **Auth**: public

### Newsletter confirm `/newsletter/confirm`

- **Purpose**: Land here after clicking confirm link in email. Hits `GET /api/v1/newsletter/confirm`.
- **States**: loading (during API call), success, error (expired or invalid token with re-subscribe CTA).
- **Auth**: public, token in URL

### 404, 500 pages

- **Purpose**: Branded error states. Same nav and footer as marketing.
- **States**: static.
- **Auth**: public

## User flow

```mermaid
graph TD
  Landing[/] --> Products[/products]
  Landing --> Blog[/blog]
  Landing --> Newsletter{Newsletter form}
  Landing --> Pricing[/pricing]
  Products --> ProductDetail[/products/openpawl]
  ProductDetail --> GitHub((GitHub repo))
  Blog --> BlogPost[/blog/:slug]
  Pricing --> Contact[/contact]
  Newsletter -->|submit| ConfirmPending[Check inbox state]
  ConfirmPending -->|click email link| Confirmed[/newsletter/confirm]
```

## Accessibility bar

- WCAG AA contrast minimum: foreground colors against `--ink-0` background, all `--fg-*` tokens tested at body size
- Keyboard nav: every interactive element reachable, visible focus ring using `--shadow-glow`
- Screen reader: meaningful `alt` on every image, semantic HTML over div soup, ARIA labels on icon-only buttons
- Reduced motion: respect `prefers-reduced-motion`, hero cycler pauses on focus or reduced-motion
- Form errors: `aria-invalid` plus inline error text, never color-only signals
- Skip link to main content from the top nav
