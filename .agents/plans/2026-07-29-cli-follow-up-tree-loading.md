# CLI Follow-up, Tree Hierarchy, and Inline Loading

Status: implemented

## Decisions

- A failed verifier may trigger one reviewer-proposed recovery implementer in
  the same sandbox and original approved path scope.
- The original action approval covers this bounded retry; policy, setup,
  provider, and cancellation failures are not retried.
- Structured CLI blocks use reusable `├─`, `└─`, and `│` hierarchy symbols.
- Operator-visible waits use one inline `◜ ◝ ◞ ◟` activity row after a short
  anti-flicker delay; Orynt remains inline and never enters fullscreen mode.
- `--no-color` and `NO_COLOR` retain motion without color. `--plain`, non-TTY,
  and JSONL output do not emit animation controls.

## Evidence

- Shared recovery validation enforces one writer, depth, dependencies, and
  approved-path containment.
- Controlled recovery preserves both verifier attempts and the final verdict in
  the run artifacts.
- CLI tests cover tree output, activity timers, permanent-output interleaving,
  no-motion mode, and creation of a bounded recovery task.
