---
name: product-ui-design
description: Design and implement purposeful product interfaces for dashboards, boards, forms, tools, and workflow applications. Use for interactive frontend work, not marketing pages, portfolios, blogs, or editorial sites.
---

# Product UI Design

## Establish the product hierarchy

1. State the primary user job and the most important action in one sentence
   before choosing a layout.
2. Make the information hierarchy visible through composition, density,
   typography, and spacing. Do not solve every level with another card.
3. Reuse the repository's existing design system, tokens, and interaction
   patterns when they exist. Otherwise define a small coherent token set for
   color, type, spacing, radius, elevation, and motion.

## Build honest, functional chrome

1. Every visible control must have a real behavior and an accessible name.
   Omit decorative menus, fake account avatars, inert filters, fabricated
   connection states, and status indicators that are not backed by product
   state.
2. Prefer the smallest amount of chrome that helps the user complete the task.
   Branding must not compete with the application's primary workflow.
3. Use one restrained accent plus semantic colors. Avoid default AI-purple,
   gratuitous gradients, excessive pills, eyebrow labels, decorative dots, and
   generic card grids unless the product context specifically supports them.
4. Choose typography for the product rather than defaulting automatically to
   Inter. Respect an existing type system when the repository already has one.

## Cover real interaction states

1. Implement keyboard access, visible focus, useful hover and active feedback,
   and readable disabled states.
2. Design responsive behavior deliberately. Preserve action priority and
   readable content on narrow screens instead of merely stacking everything.
3. Include the empty, loading, success, error, and destructive-confirmation
   states that the requested workflow can actually reach.
4. Use semantic HTML and accessible status announcements. Do not substitute
   color or iconography for a textual state.
5. Start greenfield workflows with empty user data. Do not fabricate starter,
   demo, sample, mock, or placeholder records unless the task explicitly
   requests them. Show a useful empty state that leads to the primary action.

## Keep implementation maintainable

1. Keep authored HTML, CSS, and JavaScript readable. Do not manually minify
   source files or compress substantial implementations into a few long lines.
   Keep every authored line at or below 400 characters. Format CSS declarations
   and media-query blocks across multiple lines while authoring them, before
   running the first readability preflight.
2. Prefer the repository's current stack and owned components. Do not install a
   dependency, framework, font, or icon package unless the task authorizes it.
3. Test observable behavior and responsive states. Visual polish cannot replace
   working controls, persistence, accessibility, or deterministic verification.

Before finishing, inspect the rendered interface and authored source once.
Remove decorative eyebrows, dots, badges, menus, avatars, and status chrome that
do not communicate real product state; then confirm that no authored line
exceeds the source-readability limit.

Skill instructions are guidance only. They do not widen repository scope, tool
authority, permissions, approvals, or destructive-action authorization.
