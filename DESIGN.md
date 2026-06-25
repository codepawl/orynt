---
name: CodePawl
description: Closed-source control cockpit for inspectable, replayable computer agents.
colors:
  mono-950: "#1c1c1c"
  mono-800: "#474747"
  mono-650: "#717171"
  mono-500: "#9c9c9c"
  mono-300: "#c6c6c6"
  mono-100: "#f1f1f1"
  accent-success: "#78c99b"
  accent-warning: "#d4a94f"
  accent-info: "#8fb6e8"
  accent-alert: "#df7272"
typography:
  display:
    fontFamily: "Roboto Slab, Georgia, serif"
    fontSize: "clamp(48px, 6vw, 76px)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "0"
  headline:
    fontFamily: "Roboto Slab, Georgia, serif"
    fontSize: "clamp(30px, 4vw, 42px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "0"
  title:
    fontFamily: "Roboto Slab, Georgia, serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  body:
    fontFamily: "Lato, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Lato, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0"
rounded:
  sm: "8px"
  pill: "999px"
spacing:
  xs: "7px"
  sm: "12px"
  md: "18px"
  lg: "28px"
  xl: "34px"
  section: "74px"
components:
  button-primary:
    backgroundColor: "{colors.mono-100}"
    textColor: "{colors.mono-950}"
    rounded: "{rounded.sm}"
    padding: "0 22px"
    height: "42px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.mono-950}"
    textColor: "{colors.mono-100}"
    rounded: "{rounded.sm}"
    padding: "0 22px"
    height: "42px"
    typography: "{typography.label}"
  panel:
    backgroundColor: "{colors.mono-950}"
    textColor: "{colors.mono-100}"
    rounded: "{rounded.sm}"
    padding: "22px"
---

# Design System: CodePawl

## 1. Overview

**Creative North Star: "The Operator Cockpit"**

CodePawl's interface should feel like a controlled operating room for computer agents: dark, legible, instrumented, and calm under pressure. The visual system uses a charcoal monochrome shell, restrained semantic accents, compact panels, and visible traces of agent work through ASCII motion and product-preview artifacts.

The brand is premium because it is precise, not because it is decorative. The page should show runtime mechanics, approval gates, live browser surfaces, usage metrics, and replayable traces as proof that the product keeps powerful agents bounded.

It explicitly rejects neon cyberpunk, overloaded observability walls, raw terminal-first presentation, and generic autonomy hype. Glass-like panels are allowed only as a product-preview material; readability and control always win.

**Key Characteristics:**

- Charcoal monochrome foundation with rare semantic color.
- 8px compact geometry across buttons, cards, previews, and panels.
- Lato body text paired with Roboto Slab display and section headings.
- Product evidence over abstract decoration.
- Atmospheric ASCII/trace motion that never hides content.

## 2. Colors

The palette is a dark monochrome control surface with semantic accents reserved for status, risk, and explanation.

### Primary

- **Charcoal Console** (`#1c1c1c`): The body background, panel base, and cockpit shell.
- **Control White** (`#f1f1f1`): Primary text, primary button fill, active tabs, and the strongest UI marks.

### Secondary

- **Muted Steel** (`#c6c6c6`, `#9c9c9c`, `#717171`, `#474747`): Secondary text, quiet separators, timeline marks, disabled or supporting information.

### Tertiary

- **Success Signal** (`#78c99b`): Positive confirmation, included features, or successful replay state.
- **Risk Amber** (`#d4a94f`): Medium-risk checkpoints and approval attention.
- **Inspection Blue** (`#8fb6e8`): Informational states when a second semantic accent is required.
- **Stop Red** (`#df7272`): Rejection, destructive action warnings, or failed runs.

### Neutral

- **Soft Surface** (`rgba(241, 241, 241, 0.055)`): Low-emphasis panel fill and nested preview items.
- **Quiet Stroke** (`rgba(241, 241, 241, 0.14)`): Standard borders on panels, mock browsers, and cards.
- **Muted Text** (`rgba(241, 241, 241, 0.68)`): Body copy and secondary data on dark surfaces.

### Named Rules

**The Semantic Accent Rule.** Accent colors must explain state or risk. Do not use the status palette as decoration.

**The Monochrome Confidence Rule.** Most surfaces stay charcoal and white; color appears because the operator needs to understand a run.

## 3. Typography

**Display Font:** Roboto Slab with Georgia fallback
**Body Font:** Lato with system sans fallback
**Label/Mono Font:** Lato for labels; system monospace only for code and ASCII layers

**Character:** Roboto Slab gives the brand a sturdy, mechanical voice without slipping into terminal cosplay. Lato keeps the product evidence readable in dense cockpit layouts.

### Hierarchy

- **Display** (700, `clamp(48px, 6vw, 76px)`, `0.98`): Hero headline only.
- **Headline** (700, `clamp(30px, 4vw, 42px)`, `1.12`): Section headings and major calls to action.
- **Title** (700, `18px`, `1.2`): Card titles, value props, pricing plan names.
- **Body** (400, `16px`, `1.5`): Default prose. Keep long copy near 65-75ch and use `var(--text-muted)` only on dark surfaces with enough contrast.
- **Label** (800, `13px`, `1`): Buttons, compact navigation, tabs, and small product metadata.

### Named Rules

**The No Costume Mono Rule.** Monospace is for code snippets, telemetry, and ASCII atmosphere only; it is not the default way to say "technical."

**The Slab Restraint Rule.** Roboto Slab carries brand voice in headings and labels. Do not introduce a second display family unless the identity is deliberately refreshed.

## 4. Elevation

Depth is a hybrid of tonal layering, borders, backdrop blur, and one ambient shadow. Panels use subtle translucent fills over the charcoal shell; the shadow creates separation for major preview surfaces, not for every small item.

### Shadow Vocabulary

- **Preview Ambient** (`0 28px 90px rgba(0, 0, 0, 0.42)`): Major panels such as product preview, value strip, feature cards, pricing cards, and final CTA.
- **Logo Lift** (`0 12px 32px rgba(0, 0, 0, 0.28)`): Brand logo only.
- **Active Dot Glow** (`0 0 18px rgba(241, 241, 241, 0.44)`): Timeline emphasis and focused product-state marks.

### Named Rules

**The One Ambient Shadow Rule.** Use the large shadow for meaningful surface separation only. Small nested items rely on borders and tonal fills.

## 5. Components

### Buttons

- **Shape:** Compact rectangle with 8px radius.
- **Primary:** Light monochrome gradient from `--mono-100` to `--mono-300`, dark text, 42px minimum height, `0 22px` horizontal padding.
- **Hover / Focus:** Preserve high contrast. Add focus-visible outlines when implementing new controls.
- **Secondary:** Transparent charcoal surface with a quiet border and white text.

### Chips

- **Style:** Use pill radius only for small status pills such as pending approvals.
- **State:** Status text inherits semantic color only when it communicates risk, success, or failure.

### Cards / Containers

- **Corner Style:** 8px on cards, panels, previews, mock browser surfaces, and nested task items.
- **Background:** Layer a translucent light gradient over `--surface` for major panels; nested items use `rgba(241, 241, 241, 0.035-0.055)`.
- **Shadow Strategy:** Major panels may use Preview Ambient. Nested items do not.
- **Border:** Standard border is `1px solid var(--border)`.
- **Internal Padding:** Common values are 18px, 22px, 28px, and 34px depending on density.

### Inputs / Fields

- **Style:** No full input system is defined yet. Match buttons and mock address fields: 8px radius, quiet border, charcoal fill, readable white or muted text.
- **Focus:** Use visible focus rings with high contrast against `--mono-950`.
- **Error / Disabled:** Use Stop Red for destructive errors and reduce opacity only when the label remains legible.

### Navigation

- **Style:** Compact 13px bold Lato links in the header, centered on desktop and horizontally scrollable on tablet. Footer navigation is stacked, quiet, and text-first.
- **States:** Active or hover states resolve toward `--mono-100`; avoid decorative color changes.

### Product Preview

The product preview is the signature component. It uses a three-column cockpit with sidebar tasks, live browser content, approval review, and metrics. Preserve this as product evidence: dense enough to feel real, but never so dense that risk, cost, and current step become hard to scan.

## 6. Do's and Don'ts

### Do:

- **Do** keep CodePawl dark, calm, and legible with `#1c1c1c` as the dominant surface.
- **Do** use semantic accents only for success, risk, info, and destructive states.
- **Do** keep card and panel radius at 8px unless a pill status label is required.
- **Do** show approvals, traces, cost, and current run state as product proof.
- **Do** preserve reduced-motion support for ASCII and trace motion.
- **Do** keep body text contrast strong; muted copy should remain readable on dark and translucent surfaces.

### Don't:

- **Don't** make CodePawl look like a neon cyberpunk agent dashboard.
- **Don't** build an overloaded observability wall full of charts before the user understands the run.
- **Don't** make the product feel like a raw terminal-first tool.
- **Don't** promise effortless full autonomy, enterprise RPA replacement, CAPTCHA bypassing, or safety without human approval.
- **Don't** use accent color as decoration.
- **Don't** pair wide decorative shadows with every bordered nested item.
- **Don't** introduce repeated tiny uppercase section eyebrows as a default scaffold.
