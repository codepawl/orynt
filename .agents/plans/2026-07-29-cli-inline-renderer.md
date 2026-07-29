# Smooth inline CLI renderer

Status: implemented and verified

## Objective

Keep every composer surface inline while eliminating visible full-frame
clear-and-redraw behavior during keyboard navigation and editing.

## Decisions

- Preserve `TtyComposer` public APIs and all existing keyboard semantics.
- Cache the previous inline frame and repaint only changed or removed rows.
- Emit each logical repaint through one ANSI output write.
- Keep slash suggestions, model selection, approvals, history, and exit
  confirmation inline; do not use alternate-screen sequences.
- Reserve full terminal reset for explicit Ctrl+L and `/clear`.

## Validation

- Assert arrow and cursor operations do not repaint unchanged rows.
- Assert each logical render performs at most one output write.
- Cover filtering, viewport scrolling, stale-row cleanup, resize, command
  completion, and exit countdown updates.
- Run CLI tests, CLI build, and an interactive `make cli` smoke.

## Result

- The composer now caches its inline frame and updates only changed rows in one
  terminal write; cursor-only and no-op operations avoid content repainting.
- Slash suggestions, model choices, approvals, history, and exit confirmation
  remain inline. No alternate-screen mode was added.
- Resize starts a fresh controlled inline block so terminal reflow cannot
  corrupt cached row positions.
- Narrow terminals can render zero suggestion rows, and complex emoji are
  measured and traversed as grapheme clusters.
- Verified with 93 CLI tests, the CLI TypeScript build, an interactive
  `make cli` smoke, and an independent renderer review.
