# Interactive clarification workspace

## Goal

Replace passive clarification copy with one keyboard-driven TTY modal that
supports single and multiple selection, per-selection notes, compatible model
recommendations, a 120-second fallback, and a durable final summary.

## Contract

- New prompt questions declare single or multiple selection.
- Options expose symmetric conflicts and a bounded recommendation reason.
- Single questions recommend exactly one option; multiple questions may
  recommend a compatible set.
- Answers preserve selected ids and notes in the immutable prompt basis while
  legacy singular fields remain readable.

## Lifecycle

- Pause the live composer and active-turn timer while the modal owns input.
- Preserve partial choices at timeout and fill only unanswered questions from
  recommendations.
- Persist the summary and automatically resume prompt understanding.
- Keep headless clarification fail-closed and prevent duplicate Agent replies.

## Validation

- Contract, prompt-understanding, composer, state, and session tests.
- `bun test:contracts`
- `bun test:cli`
- `bun build:cli`
- `bun e2e:cli`
- `bun copy:check`
- `git diff --check`
