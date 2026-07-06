---
name: Orynt
description: Brain-like operating system for adaptive AI agents.
style: "Dark Impressionist Minimalism"
creativeNorthStar: "The Quiet Operator Studio"
colors:
  ink-990: "#050607"
  ink-960: "#090b0d"
  ink-920: "#111315"
  ink-860: "#1b1c1d"
  ink-760: "#444542"

  mist-100: "#f2f0ec"
  mist-200: "#dfddd6"
  mist-350: "#c6c4bf"
  mist-500: "#9b9a96"
  mist-650: "#70706d"

  pigment-lavender: "#a98cff"
  pigment-rose: "#e68aaa"
  pigment-sky: "#8fb6e8"
  pigment-gold: "#d4a94f"
  pigment-green: "#78c99b"
  pigment-red: "#df7272"

  surface-base: "rgba(28, 28, 28, 0.78)"
  surface-soft: "rgba(242, 240, 236, 0.055)"
  surface-brush: "rgba(242, 240, 236, 0.075)"
  surface-raised: "rgba(28, 28, 28, 0.94)"
  stroke-quiet: "rgba(242, 240, 236, 0.14)"
  stroke-visible: "rgba(242, 240, 236, 0.25)"
  text-primary: "#f2f0ec"
  text-secondary: "rgba(242, 240, 236, 0.68)"
  text-muted: "rgba(242, 240, 236, 0.56)"

gradients:
  hero-aurora: "radial-gradient(circle at 18% 10%, rgba(242, 240, 236, 0.16), transparent 34%), radial-gradient(circle at 84% 16%, rgba(198, 196, 191, 0.10), transparent 38%)"
  primary-button: "linear-gradient(180deg, #f2f0ec 0%, #c6c4bf 100%)"
  panel-glaze: "linear-gradient(180deg, rgba(242, 240, 236, 0.08), rgba(242, 240, 236, 0.035))"
  brush-wash: "linear-gradient(135deg, rgba(242, 240, 236, 0.16), rgba(198, 196, 191, 0.10), rgba(5, 6, 7, 0.46))"

typography:
  display:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "clamp(52px, 7vw, 92px)"
    fontWeight: 700
    lineHeight: 0.94
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "clamp(32px, 4.4vw, 54px)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.16
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.58
    letterSpacing: "0"
  body-small:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.015em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "-0.01em"

rounded:
  xs: "6px"
  control: "8px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  pill: "999px"

spacing:
  micro: "4px"
  control: "8px"
  row: "10px"
  content: "14px"
  panel: "20px"
  stage: "28px"
  section: "88px"
  page: "clamp(20px, 4vw, 48px)"

effects:
  preview-shadow: "0 32px 120px rgba(0, 0, 0, 0.48)"
  soft-glow: "0 0 42px rgba(242, 240, 236, 0.12)"
  rose-glow: "0 0 42px rgba(198, 196, 191, 0.10)"
  inner-stroke: "inset 0 1px 0 rgba(242, 240, 236, 0.08)"
  blur-panel: "blur(18px)"
  grain-opacity: "0.075"

components:
  button-primary:
    background: "{gradients.primary-button}"
    textColor: "{colors.ink-990}"
    rounded: "{rounded.sm}"
    padding: "0 22px"
    height: "44px"
    typography: "{typography.label}"
    shadow: "none"
  button-secondary:
    background: "rgba(242, 240, 236, 0.035)"
    textColor: "{colors.text-primary}"
    border: "1px solid {colors.stroke-visible}"
    rounded: "{rounded.sm}"
    padding: "0 22px"
    height: "44px"
    typography: "{typography.label}"
  panel:
    background: "{colors.surface-base}"
    backgroundImage: "{gradients.panel-glaze}"
    textColor: "{colors.text-primary}"
    border: "1px solid {colors.stroke-quiet}"
    rounded: "{rounded.md}"
    padding: "24px"
    shadow: "{effects.preview-shadow}"
---

# Design System: Orynt

## 1. Overview

**Creative North Star: “The Quiet Operator Studio”**

Orynt should feel like a dark, disciplined agent operating system placed inside a painter’s studio at night. The product is technical, supervised, adaptive, and evidence-driven, but the landing page uses impressionist atmosphere to make the system feel calm, premium, and human.

The visual style is **Impressionist Minimalism**: soft painterly light, blurred atmospheric depth, visible brush-wash textures, and restrained composition. It should not become decorative fantasy art. Impressionism appears as atmosphere, lighting, texture, and color temperature. Minimalism controls layout, density, hierarchy, and interface discipline.

The user should understand the product quickly:

Orynt is a brain-like operating system for adaptive AI agents from CodePawl. It gives agents structured memory, reusable skills, verification, self-improvement loops, and safe tool use so they can perceive, remember, plan, act, verify, and improve under human supervision.

## 2. Brand Character

Orynt is:

- Calm, dark, and controlled.
- Technical without looking like a raw terminal.
- Painterly without becoming ornamental.
- Premium through restraint, not luxury decoration.
- Safety-forward without feeling bureaucratic.
- Agentic, but never recklessly autonomous.

The landing page should communicate supervision first, intelligence second, and autonomy last.

### Style Formula

**Dark cockpit UI + impressionist light + minimal product proof.**

Use painterly effects as a surrounding atmosphere. Use clean geometry for product surfaces. Do not let brush texture interfere with text, charts, controls, or run evidence.

## 3. Visual Principles

### The Brush Behind the Interface Rule

Painterly texture belongs behind or around the interface, not inside dense UI text. Use it in hero backgrounds, section washes, large illustration areas, footer atmosphere, and empty spatial fields.

### The Minimal Frame Rule

Every framed surface must have a job. A card should represent a bounded object: a run, approval, verifier result, memory candidate, cost state, or artifact. Do not use repeated cards as decoration.

### The Evidence Before Abstraction Rule

Show product proof before conceptual claims. Use cockpit previews, event timelines, verifier states, worktree isolation, cost meters, and memory review examples.

### The Human-Supervised Agent Rule

The product must never imply uncontrolled autonomy. The interface should visibly contain approval gates, budget controls, protected paths, replay logs, and review states.

### The Quiet Color Rule

Color should behave like reflected light in a dark painting. Most of the landing page stays monochrome: ink-dark surfaces, warm off-white text, and soft grayscale wash. Pigments appear only as state indicators inside product proof, not as decorative CTA color.

## 4. Colors

The palette is a dark impressionist cockpit palette. It replaces pure black with deep blue-black ink tones and replaces stark white with warm museum-light neutrals.

### Core Surfaces

- **Night Ink** (`#050607`): Page background and deepest empty space.
- **Cockpit Ink** (`#090b0d`): Main application shell and hero body.
- **Raised Ink** (`#111315`): Major panels, cockpit preview, and navigation surfaces.
- **Soft Charcoal** (`#1b1c1d`): Hover states, secondary surfaces, and nested product regions.
- **Muted Graphite** (`#444542`): Dividers, inactive controls, and low-contrast UI structure.

### Text

- **Warm Museum White** (`#f2f0ec`): Primary text, major headings, active controls.
- **Canvas Mist** (`#dfddd6`): Secondary headings and softer large text.
- **Muted Linen** (`rgba(242, 240, 236, 0.68)`): Body copy.
- **Smoke Text** (`rgba(242, 240, 236, 0.56)`): Metadata and secondary labels.

### Pigments

- **Lavender Signal** (`#a98cff`): Memory intelligence and selected product state only.
- **Rose Signal** (`#e68aaa`): Attention moments and product state only.
- **Inspection Blue** (`#8fb6e8`): Informational states, replay preview, trace inspection.
- **Success Green** (`#78c99b`): Passed checks, completed runs, safe confirmation.
- **Risk Gold** (`#d4a94f`): Approval attention, cost warning, medium-risk checkpoints.
- **Stop Red** (`#df7272`): Failed verifier, rejected action, destructive warning.

### Surface Materials

- **Soft Surface**: `rgba(242, 240, 236, 0.055)`
- **Brush Surface**: `rgba(242, 240, 236, 0.075)`
- **Quiet Stroke**: `rgba(242, 240, 236, 0.14)`
- **Visible Stroke**: `rgba(242, 240, 236, 0.25)`

### Named Color Rules

**The Semantic Pigment Rule.** Success, warning, info, and failure colors must explain product state. Do not use them as random decoration.

**The Impressionist Glow Rule.** Lavender, rose, and blue may appear as soft atmospheric light, but only outside reading-critical areas.

**The No Neon Rule.** Pigments should be dusty, diffused, and painterly. Avoid cyberpunk saturation, hard glow edges, and RGB-like gradients.

## 5. Typography

Orynt uses a split typographic system.

**Display Font:** Lora with Georgia fallback
**Body Font:** Outfit with system sans fallback
**Code Font:** System monospace only for commands, logs, event IDs, and code snippets

Lora gives the brand an editorial, human, painterly quality. Outfit keeps dense product information legible and modern.

### Type Scale

- **Display:** Hero headline only. Use `clamp(52px, 7vw, 92px)`, weight `700`, line-height `0.94`, letter-spacing `-0.035em`.
- **Headline:** Section headings and major CTA text. Use `clamp(32px, 4.4vw, 54px)`, weight `700`, line-height `1.04`.
- **Title:** Product preview headings, card titles, and important object labels. Use `22px`, weight `700`, line-height `1.16`.
- **Body:** Main copy. Use `16px`, line-height `1.58`.
- **Body Small:** UI explanations, metadata, compact details. Use `14px`, line-height `1.5`.
- **Label:** Navigation, buttons, tags, pills. Use `13px`, weight `700`.
- **Mono:** Commands, trace IDs, event names, code paths. Use `13px`, line-height `1.45`.

### Typography Rules

**The Gallery Wall Rule.** Large headings may feel editorial and spacious. Dense UI must stay plain, sharp, and readable.

**The No Costume Mono Rule.** Do not use monospace to make copy feel technical. Use it only when the content itself is technical.

**The Short Line Rule.** Marketing body copy should usually stay between `58ch` and `72ch`. Hero copy may be shorter.

## 6. Layout

The layout should be minimal and spacious, with one strong landing animation as the center of gravity.

### Page Structure

1. Header
2. Hero with impressionist background and product promise
3. Landing animation
4. Core value strip
5. Architecture / trust model
6. Local MVP walkthrough
7. MVP sequence
8. Final CTA
9. Footer

### Spacing

Use generous vertical spacing between sections and compact spacing inside product UI.

- Page padding: `clamp(20px, 4vw, 48px)`
- Section spacing: `88px`
- Major stage spacing: `28px`
- Panel padding: `20px–28px`
- Control spacing: `8px`
- Row spacing: `10px`
- Micro spacing: `4px`

### Composition Rules

**The One Hero Object Rule.** The hero should have one dominant product or atmospheric object. Do not split attention across many decorative illustrations.

**The Wide Quiet Field Rule.** Empty dark space is part of the brand. Do not fill every region with charts, icons, or cards.

**The Left Brain / Right Atmosphere Rule.** On desktop, product claims and CTA can sit left while painterly atmosphere or the landing animation sits right. The interface itself remains sharp.

## 7. Impressionist Minimalism

Impressionism should be translated into interface design through light, atmosphere, and surface texture.

### Use

- Soft brush-wash backgrounds.
- Blurred pigment clouds behind hero objects.
- Diffused lavender, rose, blue, and gold light.
- Low-opacity canvas grain.
- Painterly landscape fragments in footer or hero background.
- Soft edge transitions between sections.

### Avoid

- Literal museum-painting clutter.
- Decorative figures that compete with the product.
- Heavy canvas texture over readable text.
- Bright neon vaporwave gradients.
- Over-rendered fantasy illustration.
- Excessive blur on product UI.

### Brush Texture Specification

Use texture sparingly:

```css
.painterly-wash {
  background:
    radial-gradient(ellipse at 72% 18%, rgba(242, 240, 236, 0.18), transparent 32%),
    radial-gradient(ellipse at 82% 42%, rgba(198, 196, 191, 0.11), transparent 38%),
    radial-gradient(ellipse at 48% 6%, rgba(242, 240, 236, 0.08), transparent 30%);
  filter: blur(0.2px);
}

.canvas-grain {
  opacity: 0.075;
  mix-blend-mode: soft-light;
  pointer-events: none;
}
````

Do not place grain above small UI text unless it is masked or reduced.

## 8. Components

### Header

The header should feel light, minimal, and stable.

* Transparent or deep ink background.
* Small paw mark or compact wordmark.
* Center navigation on desktop.
* Right-aligned CTA group.
* No heavy border unless the header is sticky.
* Use quiet hover states that resolve toward warm white.

Recommended navigation:

* Product
* Features
* Security
* Architecture
* Docs

Primary CTA:

* `Start Local Walkthrough`
* or `Get Early Access`

Secondary CTA:

* `View Demo`
* or `Read Docs`

### Buttons

Buttons are compact but not cramped.

#### Primary Button

* Background: warm off-white to canvas-gray monochrome gradient.
* Text: deep ink.
* Height: `44px`.
* Radius: `10px`.
* Padding: `0 22px`.
* Font: Outfit label.
* Shadow: none by default; rely on contrast, border, and placement.

#### Secondary Button

* Background: translucent warm white.
* Border: quiet warm stroke.
* Text: warm white.
* Height: `44px`.
* Radius: `10px`.

#### Button Rules

* Primary buttons should be rare.
* Secondary buttons should not overpower the page.
* Hover states may brighten the stroke or shift the monochrome gradient slightly.
* Focus states must be visible and high contrast.

### Panels

Panels are dark glass-cockpit surfaces, not glossy glassmorphism.

* Background: `rgba(11, 17, 28, 0.88)`.
* Border: `1px solid rgba(242, 240, 236, 0.14)`.
* Radius: `16px`.
* Shadow: one large ambient shadow for major previews only.
* Inner fill: subtle warm gradient glaze.

Panel content must remain crisp. Do not blur text or critical UI.

### Cards

Cards should represent bounded product objects.

Valid card uses:

* A run summary.
* A verifier result.
* A memory candidate.
* A permission request.
* A budget warning.
* A replay artifact.
* A protected path notice.

Invalid card uses:

* Generic marketing fluff.
* Decorative icon grids.
* Repeated stats without product context.
* Layout filler.

### Chips and Status Pills

Use pill radius only for compact state.

Examples:

* `Completed`
* `Approval required`
* `Dry-run`
* `Protected path`
* `Budget safe`
* `Memory candidate`

Status colors:

* Success: green.
* Warning: gold.
* Info: blue.
* Failure: red.
* Brand/selected: lavender.

### Landing Animation

The landing animation is the signature visual object. It should show the working brain metaphor directly, not a generic SaaS dashboard or an implementation architecture diagram.

Required visible elements:

* A single visual-only brain image treatment representing the working brain.
* No copy, loop labels, capability cards, dashboard chrome, or mock conversation inside the preview frame.
* The animation should act as an atmospheric product signal while the surrounding sections carry the explanatory text.

Image treatment:

* Use `assets/pictures/landing-brain-rotation-00.png` as the stable transparent brain source.
* Keep the baked black-and-white halftone treatment sparse, low-resolution, transparent, and borderless.
* Add runtime motion with lightweight CSS halftone-dot layers over the brain area, not with canvas, shader runtime, glow, vignette, panel background, or border.
* Support reduced motion by freezing the brain and halftone drift without hiding the visual.

### Brain Section

The brain section should explain product value, not internal implementation.

Show this behavior:

`Perceive → Remember → Plan → Act → Verify → Improve`

Each block should explain a user-visible agent capability.

* Perceive and remember: goals, workspace state, constraints, and evidence become working context.
* Act with gates: tool use stays behind permission, budget, and connector boundaries.
* Verify and improve: verifier evidence, approvals, and successful corrections become reviewed memory and skills.

Use sparse panels and direct product copy. Avoid low-level stack diagrams on the landing page unless the visitor is already in docs.

### Command Block

Commands should appear in a compact, readable mono block.

```bash
pnpm install
pnpm --filter @codepawl/marketing-site test
pnpm --filter @codepawl/marketing-site build
pnpm test:contracts
pnpm test:desktop
pnpm test:tauri
pnpm walkthrough:smoke
pnpm build:desktop
pnpm --filter @codepawl/desktop exec tauri dev
```

Use command blocks as product credibility, not as the main aesthetic.

### MVP Sequence

The MVP sequence should be shown as a calm roadmap, not a busy project board.

Use ten compact steps:

1. Architecture reconciliation.
2. Run state machine and append-only event spine.
3. Safety policy, action gate, budgets, isolated git worktree sandbox.
4. Codex adapter with event normalization, cancellation, and timeout handling.
5. Deterministic verifier for tests, lint, typecheck, build, diff, protected paths.
6. Bounded context workspace and resource governor.
7. Episodic event store, candidate memory, and user review flow.
8. Post-run consolidation and lifecycle policy.
9. Adaptive control and lightweight transition prediction.
10. Browser operator and future capability packs.

Each item should be short. Do not over-explain inside the card.

## 9. Motion

Motion should feel like slow light, not like a dashboard animation.

### Allowed Motion

* Slow background pigment drift.
* Soft brush-wash movement.
* Subtle timeline progress.
* Gentle hover lift on primary product panels.
* Phase indicator transitions.
* Reduced-motion fallback.

### Avoid

* Fast particle effects.
* Cyberpunk scanning lines.
* Constant terminal typing.
* Excessive parallax.
* Animated elements near dense text.

### Motion Timing

* UI transitions: `140ms–220ms`.
* Background atmosphere: `12s–28s`.
* Product state transitions: `240ms–420ms`.
* Hover transitions: `160ms`.

Always support `prefers-reduced-motion`.

## 10. Content Voice

The voice should be clear, technical, and restrained.

### Brand Messaging

Use direct claims:

* “Give AI agents a working brain.”
* “Brain-like operating system for adaptive AI agents.”
* “Structured memory, reusable skills, and safe tool use.”
* “Delegate repository tasks without giving up control.”
* “Verify outcomes before trust.”
* “Every run leaves append-only evidence.”
* “Candidate memory from user corrections, reviewed before use.”
* “Local-first supervision for coding agents.”

Avoid vague claims:

* “Autonomous AI employees.”
* “Set it and forget it.”
* “Unlimited automation.”
* “Magic productivity.”
* “Agents that do everything.”

### Hero Copy

Recommended hero headline:

**Give AI agents a working brain.**

Recommended hero body:

Orynt is a brain-like operating system for adaptive AI agents from CodePawl. It gives them structured memory, reusable skills, verification, self-improvement loops, and safe tool use so successful work can become reusable behavior only after review.

### CTA Labels

Primary:

* Start Local Walkthrough
* Get Early Access
* Review the MVP

Secondary:

* View Architecture
* Watch Demo
* Read Docs

## 11. Accessibility

The design must remain readable before it becomes atmospheric.

Requirements:

* Body text contrast must remain strong on dark surfaces.
* Do not place text directly over high-variation brush texture.
* Use visible focus states for every interactive element.
* Do not rely on color alone for run status.
* Pair status color with text labels and icons.
* Support reduced motion.
* Keep tap targets at least `40px` high on mobile.
* Preserve readable command blocks on small screens.

## 12. Responsive Behavior

### Desktop

* Spacious hero with split content and atmospheric product art.
* Brain-loop preview can be wide and detailed.
* Brain proof panels may use horizontal flow.
* Header nav can be centered.

### Tablet

* Stack hero content above the landing animation.
* Keep navigation scrollable or collapse into a compact menu.
* Reduce brain preview density.
* Keep CTA group visible.

### Mobile

* Hero headline remains large but not oversized.
* Landing animation remains a single visual-only halftone brain object.
* Do not add capability metadata inside the animation on mobile.
* Use single-column sections.
* Reduce painterly texture behind text.
* Preserve core proof: memory, skills, verification, safe tool use, and reviewed improvement.

## 13. Implementation Notes

Suggested CSS variables:

```css
:root {
  --ink-990: #050607;
  --ink-960: #090b0d;
  --ink-920: #111315;
  --ink-860: #1b1c1d;
  --ink-760: #444542;

  --mist-100: #f2f0ec;
  --mist-200: #dfddd6;
  --mist-350: #c6c4bf;
  --mist-500: #9b9a96;

  --lavender: #a98cff;
  --rose: #e68aaa;
  --sky: #8fb6e8;
  --gold: #d4a94f;
  --green: #78c99b;
  --red: #df7272;

  --surface-base: rgba(28, 28, 28, 0.78);
  --surface-soft: rgba(242, 240, 236, 0.055);
  --surface-brush: rgba(242, 240, 236, 0.075);
  --stroke-quiet: rgba(242, 240, 236, 0.14);
  --stroke-visible: rgba(242, 240, 236, 0.25);

  --text-primary: var(--mist-100);
  --text-secondary: rgba(242, 240, 236, 0.68);
  --text-muted: rgba(242, 240, 236, 0.56);

  --gradient-hero:
    radial-gradient(circle at 18% 10%, rgba(242, 240, 236, 0.16), transparent 34%),
    radial-gradient(circle at 84% 16%, rgba(198, 196, 191, 0.10), transparent 38%);

  --gradient-primary: linear-gradient(180deg, var(--mist-100), var(--mist-350));
  --gradient-panel: linear-gradient(180deg, rgba(242, 240, 236, 0.08), rgba(242, 240, 236, 0.035));

  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-pill: 999px;

  --shadow-preview: 0 32px 120px rgba(0, 0, 0, 0.48);
  --shadow-glow: 0 0 42px rgba(242, 240, 236, 0.12);
}
```

Recommended background layering:

```css
.page-shell {
  min-height: 100vh;
  color: var(--text-primary);
  background:
    var(--gradient-hero),
    linear-gradient(180deg, var(--ink-990), var(--ink-960) 42%, var(--ink-990));
}

.page-shell::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.075;
  mix-blend-mode: soft-light;
  background-image: url("../../../assets/landing/section-halftone-cool.svg");
}

.hero-wash {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 72% 18%, rgba(242, 240, 236, 0.18), transparent 32%),
    radial-gradient(ellipse at 82% 42%, rgba(198, 196, 191, 0.11), transparent 38%),
    radial-gradient(ellipse at 48% 6%, rgba(242, 240, 236, 0.08), transparent 30%);
  filter: blur(26px) grayscale(1);
}
```

## 14. Do’s and Don’ts

### Do

* Do keep the page dark, quiet, and spacious.
* Do use impressionist effects as atmosphere, not decoration over content.
* Do make the halftone landing animation the strongest proof object.
* Do show memory, skills, verification, safe tool use, and reviewed improvement.
* Do use semantic colors only when they explain state.
* Do use Lora for large brand moments and Outfit for product clarity.
* Do keep cards sparse and purposeful.
* Do preserve local-first and controlled-execution messaging.
* Do make reduced-motion behavior first-class.

### Don’t

* Don’t turn the style into neon vaporwave or cyberpunk.
* Don’t cover text with heavy canvas texture.
* Don’t make the landing animation look like a generic analytics dashboard.
* Don’t replace product value with low-level implementation architecture on the landing page.
* Don’t imply full unsupervised autonomy.
* Don’t use accent color as random ornament.
* Don’t overload the page with repeated card grids.
* Don’t make logs, terminals, or ASCII the main visual language.
* Don’t hide safety, cost, and approval states behind vague marketing copy.

## 15. Final Design Test

A page follows this design system if a visitor can answer these questions within ten seconds:

1. What is Orynt?
2. What does it supervise?
3. How does it keep agent work inspectable?
4. How does the user stay in control?
5. Where are verification, cost, replay, and memory review represented?

If those answers are not visible, simplify the page and make the product proof clearer.
