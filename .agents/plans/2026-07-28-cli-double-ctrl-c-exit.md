# CLI timed double-Ctrl+C exit

Status: implemented and validated

## Objective

At the main interactive composer, make the first Ctrl+C clear the draft and
show a three-second exit confirmation countdown. A second Ctrl+C during that
window exits Orynt cleanly. If the window expires, remove the confirmation and
restore the main prompt.

## Boundaries

- Ctrl+C during a repository run continues to request controlled cancellation.
- Ctrl+C in approval questions and model selection continues to cancel only
  that prompt.
- Non-TTY and headless behavior remains unchanged.
- `/exit` and Ctrl+D remain immediate explicit exits.

## State machine

1. `idle`: ordinary composer behavior.
2. First Ctrl+C in `compose`: clear the draft and palette, enter `exit-armed`
   with three seconds remaining.
3. Timer tick: redraw the confirmation with the remaining whole seconds.
4. Second Ctrl+C in `exit-armed`: cancel the timer and resolve the composer as
   `/exit`.
5. Any other key or timer expiry: cancel the timer and resume the clean main
   prompt.
6. Composer close: cancel every outstanding timer before restoring terminal
   mode.

## Implementation

- `packages/cli/src/composer.ts`: countdown state, rendering, key routing, and
  timer cleanup.
- `packages/cli/src/composer.test.ts`: fake-timer coverage for arming, expiry,
  second press, other-key cancellation, and unchanged ask/select behavior.
- `README.md`: document the double-Ctrl+C exit gesture.

## Validation

- Focused composer tests and TypeScript check.
- Full `pnpm test:cli`.
- Production `pnpm build:cli`.
- Real TTY smoke via `make cli`.
- Final regression review.

Validated on 2026-07-28: 75 CLI tests passed, the production CLI build
completed, and a real TTY run confirmed both countdown expiry and graceful exit
on a second Ctrl+C.
