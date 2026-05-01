# Codepawl Brand and UI System

Single source of truth for visual identity across all Codepawl surfaces:
marketing pages, product dashboards, CLIs, docs sites, and SDK guides.
The first product applying this system is Codepawl Trace.

Version: 0.1
Last updated: 2026-04-30

## Concept

Codepawl is a dev tools studio for engineers shipping AI systems. The design system spans marketing pages, product dashboards, CLIs, and docs. The aesthetic is below.

**"Engineering blueprint meets modern dev tool."** The aesthetic of a precision instrument or technical schematic, executed with the polish of a 2026 dev tool marketing site. Not playful, not corporate. Crafted by someone who respects code and respects design.

Reference points (vibe, not visual copy): Linear's restraint, Vercel's polish, Resend's confidence, Railway's mechanical hints, Phantom's typography. Avoid: generic SaaS gradients, purple-on-white AI startup look, Stripe-clone minimalism, "we're a unicorn" bombast.

## Color system

Dark mode only. No light mode toggle in v1.

```
Base canvas (deep ink, near-black with warmth):
  --bg-base:       #070605
  --bg-elevated:   #0d0c0a
  --bg-card:       rgba(13, 12, 10, 0.4) with backdrop-blur

Foreground (warm parchment, not pure white):
  --fg-primary:    #f5f4f0
  --fg-secondary:  #c7c2b3
  --fg-muted:      #7a7466
  --fg-subtle:     #5a5547

Lines and borders (subtle, like blueprint paper):
  --line-strong:   #2a2820
  --line-faint:    rgba(167, 162, 147, 0.04)

Primary accent (ratchet orange, signals "locked in motion"):
  --accent:        #ff9500
  --accent-soft:   #ffb340
  --accent-deep:   #c25c00

Technical secondary (graph green, used sparingly for "shipping" status):
  --graph:         #5a8e72

Selection / highlight:
  --select-bg:     #ff9500
  --select-fg:     #070605
```

Rules:
- 90% of the page is ink + parchment greys
- Ratchet orange appears in maybe 8-12% of pixels: accents, key CTAs, code highlights, hover states
- Graph green appears <2% of pixels: only for "shipping" / "active" status indicators
- Never combine orange + green next to each other (clashes)
- No purple. No teal. No pink. No blue gradients.

### Light mode planning

v1 is dark mode only, no toggle. Tokens are named semantically (--fg-primary, --bg-base, --accent) rather than literally (--white, --black, --orange) so a light theme can ship later without renaming. When light mode ships:

- --fg-primary becomes near-black (#1a1a18, not pure black)
- --bg-base becomes warm parchment (#f5f4f0, not pure white)
- --accent stays #ff9500 (the orange works on both)
- --graph stays the same forest green
- Recheck contrast against new backgrounds before shipping

## Typography

Three families, each doing one job. No overlap.

```
Display / wordmark / hero:
  Fraunces (serif, opsz 144 for huge sizes, opsz 36 for h2)
  Weight: 300 light, occasional 400 regular
  Italic: used for emphasis on single words ("ratchet", "AI", "fix")
  Tracking: -0.04em on display sizes, -0.02em on h2/h3

Body / UI:
  Inter Tight (sans, weight 400 default, 500 for buttons, 300 for large body)
  Tracking: 0 default, 0.01em for small body
  Avoid Inter Tight bold. Use Fraunces if heavier emphasis needed.

Technical / code / labels:
  JetBrains Mono (weight 400 default, 500 for code highlights)
  Always uppercase + tracking 0.18-0.22em for labels
  Default case + 0 tracking for code blocks
```

Type scale (mobile / desktop):

```
Hero h1:        4xl (40px) / 7rem (112px)
Section h2:     3xl (30px) / 5xl (48px)
Subhead h3:     2xl (24px) / 3xl (30px)
Body large:     lg (18px) / xl (20px)
Body:           base (16px)
Small / meta:   sm (14px)
Technical lbl:  10px uppercase tracked
Code:           13px monospace
```

Hierarchy rule: huge type drops fast. Hero is 7rem, section h2 is 3rem, body is 18-20px. The contrast itself becomes the design.

## Layout

```
Container: max-w-container (1280px, matches Tailwind max-w-7xl), centered
Side padding: 24px mobile, 48px desktop (lg:px-12), 32px on extra-wide (xl:px-8) since the container is doing the centering work
Section spacing: 128px between major sections (mt-32)
Hero padding: 96px top, 128px bottom on mobile / 128px top, 160px bottom desktop
```

Use a 12-column grid for split content (text + visual). Default split: 7 cols text, 5 cols visual. Asymmetric, never 50/50.

Header: sticky-eligible, but in v1 it's static. Border-bottom subtle (border-ink-800/60). Logo left, nav right. Nav items uppercase mono tracked. Active state in ratchet orange.

Footer: minimal, single row on desktop. Mono uppercase. No newsletter signup down here (signup is in the body).

## Spacing scale

Use these tokens consistently across marketing and product surfaces. Maps cleanly to Tailwind defaults.

```
--space-1:  4px    (tight inline spacing)
--space-2:  8px    (label-to-input, icon-to-text)
--space-3:  12px   (button padding y)
--space-4:  16px   (card inner padding mobile, paragraph spacing)
--space-6:  24px   (card inner padding desktop, side padding mobile)
--space-8:  32px   (section subdivision spacing)
--space-12: 48px   (side padding desktop, between cards)
--space-16: 64px   (between content blocks within a section)
--space-32: 128px  (between major sections)
```

Never invent off-scale values (17px, 23px). If you need something between, use the closer value or restructure.

## Visual signature elements

These three details make it FEEL like Codepawl, not generic-dark-tool.

**1. Blueprint grid background (whole page)**

```css
background-image:
  linear-gradient(to right, rgba(167, 162, 147, 0.04) 1px, transparent 1px),
  linear-gradient(to bottom, rgba(167, 162, 147, 0.04) 1px, transparent 1px);
background-size: 48px 48px;
```

Almost invisible. Adds engineering paper feel. Skip on mobile if it costs perf.

**2. Noise overlay (subtle, fixed position)**

SVG fractal noise at opacity 0.5, mix-blend-mode: overlay. Adds analog warmth. Use the data URI approach, don't load an image file.

**3. Blueprint card corners**

Cards have 1px borders + small ratchet-orange L-shaped corner ticks at top-left and bottom-right. NOT all four corners (too symmetrical, too cute). Just two opposite corners, like an architect's drawing reference mark.

```css
.blueprint-card {
  @apply relative border border-ink-700 bg-ink-900/40 backdrop-blur-sm;
}
.blueprint-card::before {
  content: "";
  position: absolute;
  top: -1px;
  left: -1px;
  width: 8px;
  height: 8px;
  border-top: 1px solid var(--accent);
  border-left: 1px solid var(--accent);
}
.blueprint-card::after {
  /* same but bottom-right */
  content: "";
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 8px;
  height: 8px;
  border-bottom: 1px solid var(--accent);
  border-right: 1px solid var(--accent);
}
```

## Code blocks (this is critical, the product IS code)

Code blocks are first-class visual elements across all our surfaces, not decoration. Codepawl ships dev tools, so SDK examples, CLI snippets, and config samples appear in marketing pages, product dashboards, docs sites, and SDK guides. Treat them as hero-quality content.

```
Background:    --bg-elevated (#0d0c0a)
Border:        1px solid --line-strong
Padding:       20px (lg:24px)
Font:          JetBrains Mono 13px
Line-height:   1.7
Border-radius: 2px (sharp, not rounded)
```

Syntax colors (only 5 swatches, NOT a full theme):

```
Default text:     --fg-secondary
Keywords:         --fg-muted (deemphasized, "from", "import", "def", "async", "return")
Strings:          --graph (#5a8e72)
Decorators/tags:  --accent (#ff9500), this is the @trace, @diagnose, etc.
Numbers:          --accent-soft (#ffb340)
Comments:         --fg-subtle, italic
```

Above each code block: a faux file header with three dots + filename in mono uppercase. The third dot is ratchet orange (the active "tab"), other two are ink-700. This is THE codepawl visual signature. It says "this is real code, in a real editor."

```
[•] [•] [●]   AGENT.PY
─────────────────────
from codepawl_trace import diagnose
...
```

Example shown above is from Codepawl Trace. Replace `codepawl_trace` and `diagnose` with the relevant SDK and function for other products.

## Buttons / CTAs

Two only. No tertiary, no ghost variations.

**Primary (ratchet outline button):**

```
Border:     1px solid --accent
Bg:         rgba(255, 149, 0, 0.10)
Text:       --accent-soft, mono uppercase, tracking 0.1em
Padding:    12px 20px
Hover:      bg fills to --accent solid, text becomes --bg-base
Transition: 200ms ease-out
```

**Secondary (ghost):**

```
Border:  1px solid --line-strong
Bg:      transparent
Text:    --fg-secondary, mono uppercase, tracking 0.1em
Padding: 12px 20px
Hover:   border becomes --fg-muted, text becomes --fg-primary
```

Buttons are sharp-cornered (radius: 0 or 2px). Never rounded-full. Never gradient. Never icon-only.

CTA wording: action verbs in title case. "View on GitHub", "Read the docs", "Notify me on launch". NOT "Get started for free" or "Join the waitlist" or any SaaS template phrase.

## Forms

Used in /log subscribe, contact, dashboard auth, and dashboard settings. Sharp corners, mono labels, no floating placeholders.

**Input field:**
- Border: 1px solid --line-strong
- Bg: --bg-elevated
- Text: --fg-primary, Inter Tight 16px
- Padding: 12px 14px
- Border-radius: 2px
- Placeholder: --fg-subtle

**Focus state:**
- Border becomes --accent
- Outline: 2px solid rgba(255, 149, 0, 0.20), offset 2px
- No box-shadow

**Label:**
- Above the input, mono uppercase, tracking 0.18em, --fg-muted
- 8px gap between label and input

**Error state:**
- Border becomes --accent-deep (#c25c00)
- Helper text below in mono, --accent-deep, 12px

**Helper text (default):**
- 12px, --fg-muted, regular weight (Inter Tight, not mono)

**Submit button:**
- Use the primary CTA spec from the Buttons section
- Disabled state: opacity 0.4, cursor not-allowed, no hover transition

## Tables

Used for comparison tables (marketing) and data tables (dashboard). Same visual rules.

**Table:**
- Border-collapse: collapse
- Border-top, border-bottom: 1px solid --line-strong (no side borders, no inner verticals)

**Thead:**
- Mono uppercase, tracking 0.18em, --fg-muted, 12px
- Padding: 12px 16px
- Border-bottom: 1px solid --line-strong

**Tbody td:**
- Inter Tight 14px, --fg-secondary
- Padding: 14px 16px
- Border-bottom: 1px solid --line-faint
- Last row: no border-bottom

**Hover row (dashboard only, NOT marketing):**
- Bg: --bg-elevated
- Transition: 150ms

**Comparison table cell symbols:**
- Supported: ✓ (--accent)
- Not supported: — (--fg-subtle)
- Partial: · (--fg-muted)
- Never use red X marks. The em-dash is the negative.

## Hover and motion

Devs hate spinners and hate slide-in-from-everywhere. Restraint:

- Links: 200ms color transition, no underline jumping
- Arrows after links: translate-x 4px on hover
- Cards: NO hover lift, NO scale, NO shadow change
- Page load: ONE staggered reveal in the hero (fadeUp, 0.8s, delays 0/100/200ms)
- The pawl/cog logo: subtle 6s rotation animation on the pawl arm only (engages, holds, releases). Optional, can be CSS-only.

No scroll-triggered animations in v1. They feel cheap on dev sites.

## Iconography

Custom mechanical SVGs for hero/section accents. NEVER use Lucide/Heroicons/Feather defaults uncustomized.

The codepawl logo: 28x28 SVG showing a cogwheel (8 teeth as line marks, no fill) with a pawl arm pointing into it. Stroke weight 1.25 for the wheel, 2 for the pawl. Color: ratchet orange.

For section markers, use 40x40 SVG corner brackets like blueprint trim:

```
─┐
 │   (top-right corner of section)
```

For checkmarks in feature lists: use `›` (single right angle quote, mono, ratchet-500). Not check icons. Not bullets.

For comparison tables: `✓` for supported, `—` for not, `·` for partial.

## Logo usage

The codepawl mark is a 28x28 SVG cogwheel (8 teeth as line marks, no fill) with a pawl arm pointing into it. Stroke 1.25 for the wheel, 2 for the pawl. Color: --accent.

**Minimum size:** 20x20 pixels. Below this, the wheel teeth disappear and it reads as a blob.

**Clear space:** Reserve one cogwheel-width of empty space on all sides. No tight crops against text or borders.

**Do not:**
- Recolor the logo (always --accent on dark, --bg-base on light if light mode ships later)
- Rotate the cogwheel arbitrarily (only the pawl-arm rotation animation is allowed, defined in the Hover and motion section)
- Separate the pawl from the wheel
- Add drop shadows, glows, or gradients
- Place on busy backgrounds. The blueprint grid background is fine. Photography is not.

**Wordmark pairing:** "codepawl" set in Fraunces lowercase, light weight, tracking -0.02em, sized so the cap-height matches the cogwheel diameter.

## Section pattern (use this rhythm)

Every section follows the same structure. Predictability becomes a design feature.

```
[001]  · SECTION LABEL (uppercase mono, tracked, ink-300)

       Big serif headline that takes a stand.
       (Fraunces, 3-5xl, light, tracking-tight)

       Body paragraph in calm sans, max 2 lines.
       Body paragraph 2 lines if needed.

       [optional visual: code block, table, or card]

       [→ optional ratchet-orange link]
```

The numbered section markers (001, 002, 003) are critical. They give the page rhythm and signal "this is engineered, not assembled." Like chapter numbers in a technical spec.

## Brand voice paragraph

A reusable one-paragraph identity statement. Paste this into briefs, copywriting prompts, design tool descriptions, and Claude Code sessions to lock voice consistency.

> Codepawl is a dark, blueprint-inspired dev tools studio with deep ink
> neutrals and a single ratchet-orange accent, sharp corners only, and a
> type system pairing Fraunces serif headlines (italic emphasis on a
> single word as our signature move) with Inter Tight body and JetBrains
> Mono for code. Sections follow a numbered marker rhythm (001 ·, 002 ·)
> like a technical document, and code blocks render with a faux file-tab
> header so they look like a real editor. The voice is direct and
> engineering-minded, takes a stand without hedging, and writes for devs
> who know the difference between a dashboard and a debugger.

## Voice and copy rules

Apply these to ALL copy on the site:

- No em dashes anywhere. Use commas, periods, or restructure.
- No "in today's landscape", "let's dive in", "it's worth noting"
- No certainty words: "perfect", "guaranteed", "always", "extremely"
- No hedging: "I think maybe", "perhaps", "it could be argued"
- Lead with the answer, not the setup
- Specific numbers > vague claims. "30 seconds" beats "fast"
- Direct address. "Your AI failed. We tell you why." Not "Users can leverage Codepawl Trace to..."
- Lowercase ok in body. Title case for buttons and headlines.
- Code in copy: wrap in `<code>` with mono font + ratchet-300 color

## What to NEVER do

Hard NOs that kill the aesthetic:

- Purple gradients
- Glassmorphism (frosted glass cards everywhere)
- Generic stock SVG illustrations (the floating geometric shapes thing)
- Rounded-full buttons (radius > 4px)
- Drop shadows on cards
- Gradient text (like `bg-clip-text`)
- Animated mesh / particle backgrounds
- "Trusted by" customer logos in v1 (you have zero customers, don't fake)
- Testimonial cards in v1 (same reason)
- Shiny tech-bro typography (Space Grotesk especially, also Geist Mono)
- Circle avatars
- Hero videos
- "Get started" CTAs
- Newsletter popups
- Cookie banners more elaborate than a 1-line bottom bar
- Animated counters
- Comic Sans (joking, but also: ANY playful font would kill this aesthetic)

## Mood test

If the site evokes: a precision tool catalog, a 1960s engineering manual reissued for 2026, a senior dev's terminal at 2am, a Berlin hardware store for AI engineers, the design is right.

If the site evokes: a generic SaaS template, a startup pitch deck, a no-code-tool homepage, a crypto landing page, a Webflow showcase, go back and remove visual noise.

## Performance budget

- Lighthouse 100 on Performance, 100 on Accessibility minimum
- LCP under 1.0s on 4G mobile
- Zero render-blocking JavaScript on first load
- Total page weight under 200KB (excluding fonts)
- Fonts: subset to Latin only, woff2, preloaded for Fraunces display + Inter Tight body, JetBrains Mono can be lazy

This is a static Astro site. No client-side JS unless absolutely needed. The aesthetic is "respect the user's time and bandwidth."

## Accessibility

Targets, not aspirations.

- Body text contrast: minimum 4.5:1 against background
- Large headlines and UI elements: minimum 3:1
- Focus rings: always visible, 2px --accent, offset 2px from element
- No color-only state indicators. Always pair color with text or icon.
- All interactive elements: minimum 44x44px tap target on mobile
- Skip-to-content link as first focusable element on every page
- Semantic HTML before ARIA. Use <button>, <nav>, <main>, <article>, etc.
- prefers-reduced-motion: disables the pawl rotation animation and any fade-up reveals

## Changelog

### 2026-04-30: Generalized to studio-wide design system
- Added file header positioning Codepawl as a dev tools studio
- Reframed Code blocks section to cover SDKs, CLIs, dashboards, docs
- Added Brand voice paragraph as reusable identity statement
- Added Forms, Tables, Accessibility, Logo usage, Spacing scale sections
- Added Light mode planning note (v1 still dark only)

### 2026-04: Initial design system
- Locked Fraunces + Inter Tight + JetBrains Mono
- Locked color palette: ink neutrals + ratchet-orange accent, graph-green sparingly
- Locked section pattern (numbered markers, Fraunces headlines)
- Locked file-tab signature for code blocks
- Locked blueprint-card with opposite-corner ticks