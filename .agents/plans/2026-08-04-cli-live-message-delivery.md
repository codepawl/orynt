# CLI live message delivery

## Summary

- Keep the TTY composer available while an agent operation is active.
- Present only Send, Next, Stop, and Pending to users.
- Treat Enter contextually: safely restart a fresh read-only coordinator turn,
  but enqueue during clarification, approval, execution, verification, or review.
- Keep a process-local FIFO. Stop pauses it without persisting raw pending text.

## Implementation

- Add live composer submissions for contextual send, forced Next, and Stop.
- Add `/next`, `/stop`, and `/pending [drop <n>|clear|resume]`.
- Serialize activity/output around the live composer so drafts and cursor position
  survive streaming, resize, and phase transitions.
- Protect coordinator restarts with an abort signal and generation check. Hash
  the canonical ordered message transcript before accepting prompt
  understanding or a repository plan.
- Never inject pending messages into an approved repository run.

## Validation

- Focused composer, session, UI, and PTY tests.
- `bun run test:cli`
- `bun run build:cli`
- `bun run e2e:cli`
- One real-model CLI smoke through the existing live E2E gate.

## Defaults

- Enter is contextual, Alt+Enter forces Next, Ctrl+C stops while busy, and Esc
  clears the draft.
- FIFO capacity is 32 messages. Oversized/full submissions are rejected without
  truncating or losing the draft.
- Stop pauses pending work. `/pending resume` is required to drain it.
- Pending raw messages are never stored in `CliSessionSnapshot`.
