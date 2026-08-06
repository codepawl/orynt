# CLI live model picker

Status: implemented and validated

## Objective

Make bare `/model` open a keyboard model picker while preserving `/model <id>`,
`--model/-m`, session persistence, run approvals, non-TTY input, and JSONL.

## Decisions

- Read selectable models from the installed Codex CLI with
  `codex debug models`; do not hard-code a volatile catalog.
- Show only entries whose provider visibility is `list`, sorted by provider
  priority and label.
- TTY picker supports filtering, Up/Down or Tab navigation, Enter selection,
  Escape/Ctrl+C cancellation, current-model marking, and resize redraw.
- Direct `/model <id>` remains an unvalidated escape hatch for hidden, custom,
  or newly released model IDs.
- If a selected catalog model does not support the current effort, use its
  advertised default or first supported Orynt effort.
- Discovery failures preserve current state and offer a free-form ID fallback.
  Non-TTY sessions consume no additional input and show `/model <id>` guidance.

## Implementation

- `packages/cli/src/runtime.ts`: bounded model catalog subprocess and parser.
- `packages/cli/src/composer.ts`: reusable filtered selector.
- `packages/cli/src/ui.ts`: optional `/model [id]` command.
- `packages/cli/src/session.ts`, `app.ts`, `main.ts`: picker behavior and wiring.
- CLI tests and README documentation.

## Validation

- `bun run --filter @codepawl/cli test`
- `bun run --filter @codepawl/cli build`
- Real TTY picker smoke using `make cli`
- `git diff --check`

Validated on 2026-07-28: 69 CLI tests passed, the production CLI build
completed, and a real TTY run confirmed that `/model` opens the live picker
with one Enter and Escape cancels without changing the current model.
