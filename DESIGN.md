---
name: Orynt
description: Supervised, repository-only desktop product and its marketing surfaces.
style: Dark Impressionist Minimalism
creativeNorthStar: The Quiet Operator Studio
scope: Shared foundation, marketing surfaces, and desktop product surfaces.
colors:
  ink: ["#050607", "#090b0d", "#111315", "#1b1c1d", "#444542"]
  mist: ["#f2f0ec", "#dfddd6", "#c6c4bf", "#9b9a96", "#70706d"]
  semantic:
    success: "#78c99b"
    warning: "#d4a94f"
    info: "#8fb6e8"
    error: "#df7272"
  surface: "rgba(28, 28, 28, 0.78)"
  strokeQuiet: "rgba(242, 240, 236, 0.14)"
  strokeVisible: "rgba(242, 240, 236, 0.25)"
typography:
  display: "Lora, Georgia, serif"
  body: "Outfit, ui-sans-serif, system-ui, sans-serif"
  label: "Outfit, ui-sans-serif, system-ui, sans-serif"
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
rounded: ["8px", "10px", "16px", "24px"]
spacing: ["4px", "8px", "10px", "14px", "18px", "24px", "28px", "44px"]
---

# Orynt Design System

## Purpose and precedence

Orynt uses **Dark Impressionist Minimalism** under **The Quiet Operator Studio** direction: calm, dark, technical, and evidence-led. Product requirements take precedence over this contract; `AGENTS.md` governs repository placement and dependency policy.

Before changing UI, inspect the relevant application and owned implementation. Implementers MUST reuse or extend the relevant React component and stylesheet before introducing another token namespace, component library, or icon family.

## Shared foundation

### Brand character

Painterly light frames the experience; clean geometry carries work. The product is supervised and agentic without implying uncontrolled autonomy. Color is reflected light in a dark studio, not decorative neon.

### Color and surfaces

Use the ink and mist palette for hierarchy, warm primary text, quiet strokes, and conservative neutral surfaces. Panels use the documented neutral ink and surface variables. Semantic colors explain state only: success for verified completion, warning for attention or approvals, information blue for inspection and focus, and error for failures or blocked work.

### Typography

Use Outfit for product body, labels, controls, and dense operational content. Reserve Lora for marketing display moments and sparse editorial headings; use system mono only for commands, logs, IDs, paths, and other technical content. Keep dense product text sharply legible and do not use mono as decoration.

### Spacing and shape

Use the shared spacing values to separate stages and compact controls. Controls use an 8px radius; compact buttons may use 10px; panels use 16px; 24px is for large marketing framing. Reserve pill radii for compact status indicators or circular controls, never general panels.

### Components and states

Every framed surface represents a bounded object, such as a run, approval, verifier result, task, or artifact. Reuse owned components first. Each interactive component MUST provide complete idle, hover, focus, active, disabled, pending, success, and error states when those states apply; focus uses the implemented information blue.

Use the installed `lucide-react` family for icons in both applications. Icons clarify actions and states; they do not replace labels for unfamiliar or consequential actions.

### Accessibility and motion

Text and control contrast MUST remain readable against the active surface. Keyboard focus MUST be visible, and keyboard interactions MUST remain usable. Respect reduced-motion preferences; pause or remove nonessential decorative movement and never make motion the only carrier of state or meaning.

## Marketing surfaces

### Composition

Marketing presents a clear value proposition: supervised, local-first agent work with inspectable evidence. Use spacious editorial composition, one dominant visual anchor, and painterly atmosphere behind—not beneath—reading-critical content. Lora may carry hero and section moments; Outfit carries navigation, body copy, and actions.

### Brain visual

Use `assets/pictures/brain-ascii-monochrome.svg` as the primary brain visual. It is the dominant illustration, not a repeating decoration. `assets/landing/section-halftone-cool.svg` is a marketing-only texture and MUST stay subordinate to legibility.

### Navigation and calls to action

Current primary navigation labels are `Product`, `Docs`, `Contact`, and `Pricing`. Current CTA labels are `Start Here` and `Read Docs`; preserve route intent and accessible labels when changing their presentation.

### Responsive behavior

At narrow widths, preserve the value proposition, dominant brain visual, navigation access, CTA clarity, readable line lengths, and hierarchy. Decorative washes, texture, and animation may simplify before content, controls, or evidence do.

## Desktop product surfaces

### Operator hierarchy

The desktop workbench serves supervised repository-only work in private beta. Make workspace, task, and run hierarchy immediately legible; expose the next operator action at the point it is needed. Dense UI remains quiet, conservative, and operational rather than atmospheric.

### Safety and evidence

Keep approval boundaries adjacent to the action, risk, or cost they govern. Show evidence, verifier outcomes, and recovery paths near their corresponding task or run. Do not represent arbitrary filesystem, terminal, browser, cloud, billing, hosted-account, or desktop-wide execution capabilities unless verified product behavior supports them.

### Dense UI behavior

Favor clear grouping, stable labels, explicit selection, and readable metadata over decorative cards. Preserve keyboard operation for navigation, controls, dialogs, and recovery. Pending work, verified success, errors, disabled actions, and required approvals must be distinguishable without relying on color alone.

### Desktop responsiveness

Desktop layouts may adapt to smaller windows by collapsing secondary regions, but must retain the active workspace, task, run, next action, approval boundary, evidence, and recovery state. Do not hide consequential controls or state solely to preserve visual symmetry.

## Implementation sources

The implementation sources are `apps/marketing-site/src/styles.css`, `apps/desktop/src/styles.css`, `assets/fonts/Outfit`, and `assets/fonts/Lora`. `lucide-react` is the installed icon family in both application manifests. Extend the relevant app stylesheet and existing React component rather than creating a parallel UI layer; see `AGENTS.md` for repository-wide rules.

## Preflight

- **Shared:** hierarchy is clear; semantic states are meaningful; focus, contrast, and reduced motion work; existing owned UI is reused or extended.
- **Marketing:** value proposition and supervised/local-first positioning are clear; one brain visual dominates; current routes and CTAs remain accurate; the composition is responsive.
- **Desktop:** active workspace, task, run, next action, approval boundary, evidence, recovery state, and keyboard behavior remain visible; private-beta, repository-only claims remain truthful.
