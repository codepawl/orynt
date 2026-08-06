---
name: Orynt
description: CLI-first supervised agent with a frozen desktop compatibility adapter.
style: Dark Impressionist Minimalism
creativeNorthStar: The Quiet Operator Studio
scope: Shared foundation and frozen desktop compatibility surfaces.
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

Use Outfit for product body, labels, controls, and dense operational content. Reserve Lora for sparse editorial headings; use system mono only for commands, logs, IDs, paths, and other technical content. Keep dense product text sharply legible and do not use mono as decoration.

### Spacing and shape

Use the shared spacing values to separate stages and compact controls. Controls use an 8px radius; compact buttons may use 10px; panels use 16px; 24px is for large marketing framing. Reserve pill radii for compact status indicators or circular controls, never general panels.

### Components and states

Every framed surface represents a bounded object, such as a run, approval, verifier result, task, or artifact. Reuse owned components first. Each interactive component MUST provide complete idle, hover, focus, active, disabled, pending, success, and error states when those states apply; focus uses the implemented information blue.

Use the installed `lucide-react` family for icons in the desktop adapter. Icons clarify actions and states; they do not replace labels for unfamiliar or consequential actions.

### Accessibility and motion

Text and control contrast MUST remain readable against the active surface. Keyboard focus MUST be visible, and keyboard interactions MUST remain usable. Respect reduced-motion preferences; pause or remove nonessential decorative movement and never make motion the only carrier of state or meaning.

## Desktop application surfaces

### Operator hierarchy

The Tauri workbench is a first-class adapter. Keep workspace, task, and run
hierarchy legible, and keep capability authority in the shared package runtime.

### Safety and evidence

Keep approval boundaries adjacent to the action, risk, or cost they govern. Show
evidence, verifier outcomes, and recovery paths near their corresponding task or
run. New capability controls must remain adapters over shared contracts.

### Dense UI behavior

Favor clear grouping, stable labels, explicit selection, and readable metadata over decorative cards. Preserve keyboard operation for navigation, controls, dialogs, and recovery. Pending work, verified success, errors, disabled actions, and required approvals must be distinguishable without relying on color alone.

### Desktop responsiveness

Desktop layouts may adapt to smaller windows by collapsing secondary regions, but must retain the active workspace, task, run, next action, approval boundary, evidence, and recovery state. Do not hide consequential controls or state solely to preserve visual symmetry.

## Implementation sources

The compatibility UI source is `apps/desktop/src/styles.css`, with shared fonts
under `assets/fonts`. `lucide-react` is the installed icon family. Extend the
existing adapter stylesheet and React component rather than creating a parallel
UI layer; see `AGENTS.md` for repository-wide rules.

## Preflight

- **Shared:** hierarchy is clear; semantic states are meaningful; focus, contrast, and reduced motion work; existing owned UI is reused or extended.
- **Desktop compatibility:** active workspace, task, run, next action, approval
  boundary, evidence, recovery state, and keyboard behavior remain visible.
