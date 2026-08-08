---
name: Orynt
description: CLI-first supervised agent with a frozen desktop compatibility adapter.
style: Warm Hand-Drawn Operational Minimalism
creativeNorthStar: The Clear Local Workbench
scope: Shared foundation and frozen desktop compatibility surfaces.
colors:
  ink: ["#241f1a", "#4f463e", "#776d64"]
  canvas: ["#f7f3ed", "#efe8de", "#e5dbcf"]
  semantic:
    success: "#78c99b"
    warning: "#d4a94f"
    info: "#8fb6e8"
    error: "#df7272"
  surface: "rgba(36, 31, 26, 0.055)"
  strokeQuiet: "rgba(36, 31, 26, 0.14)"
  strokeVisible: "rgba(36, 31, 26, 0.25)"
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

Orynt uses **Warm Hand-Drawn Operational Minimalism** under **The Clear Local Workbench** direction: approachable, precise, local-first, and evidence-led. Orynt is the product brand; CodePawl is the company brand and appears as a restrained endorsement. Product requirements take precedence over this contract; `AGENTS.md` governs repository placement and dependency policy.

Before changing UI, inspect the relevant application and owned implementation. Implementers MUST reuse or extend the relevant React component and stylesheet before introducing another token namespace, component library, or icon family.

## Shared foundation

### Brand character

The five-ray Orynt bulb is the primary product mark. The CodePawl `>.-` mark identifies the company and must not displace Orynt in product navigation. Warm canvas, ink drawing, and simple geometry make supervised work feel legible without implying uncontrolled autonomy.

### Color and surfaces

Use `#241f1a` ink and `#f7f3ed` canvas as the canonical pair. The desktop adapter supports both canvas-first light presentation and an ink-first inverse presentation from the same system. Panels use derived warm neutrals and quiet strokes. Semantic colors explain state only: success for verified completion, warning for attention or approvals, information blue for inspection and focus, and error for failures or blocked work.

### Marketing theme

The public site uses a light warm-editorial hierarchy. Its canvas stack is
`#f7f3ed`, `#f1e9de`, `#e9ddcf`, and `#ded0c0`; its text stack is `#302821`,
`#5f5146`, and `#7c6b5d`, anchored by the brand ink `#241f1a`. Ochre `#9d5e2b`
is the only decorative and interactive accent, with `#824a20` for hover and
`#e8c9a8` for soft emphasis. Marketing shadows, textures, and gradients must be
derived from these warm tokens rather than pure white, black, or cool gray.
Semantic colors remain reserved for actual success, information, warning, and
error states.

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

The canonical brand source is `assets/brand/codepawl-orynt`; generated favicons,
social images, and application icons are synchronized into consumer surfaces.
The compatibility UI source is `apps/desktop/src/styles.css`, with shared fonts
under `assets/fonts`. `lucide-react` is the installed icon family. Extend the
existing adapter stylesheet and React component rather than creating a parallel
UI layer; see `AGENTS.md` for repository-wide rules.

## Preflight

- **Shared:** hierarchy is clear; semantic states are meaningful; focus, contrast, and reduced motion work; existing owned UI is reused or extended.
- **Desktop compatibility:** active workspace, task, run, next action, approval
  boundary, evidence, recovery state, and keyboard behavior remain visible.
