# CLI slash-command argument assist

## Summary

- Make `/tier` without an argument open an Auto/Light/Medium/Heavy picker.
- Extend the existing inline slash palette to complete finite command arguments.
- Preserve free-form arguments, current command semantics, terminal safety, and
  the CLI-only product boundary.

## Implementation

- Add recursive argument-assist metadata and cursor-aware completion candidates
  to the slash-command registry.
- Cover `/tier`, the direct `/settings` grammar, `/skills` operations,
  `/goal --clear`, and `/resume latest`; leave paths, text, runtime IDs, model
  IDs, shortcut bindings, and broad numeric ranges free-form.
- Generalize composer rendering and key handling so Tab completes without
  executing, partial Enter completes first, exact terminal Enter submits, and
  valid parent commands keep their existing behavior.
- Reuse one `/tier` application helper for direct arguments and the interactive
  picker. The chosen tier remains a one-request minimum and is never persisted.

## Validation

- Add registry, composer, session, and PTY regressions.
- Run `bun run test:cli`, `bun run build:cli`, `bun run test:e2e-cli`, and
  `git diff --check`.

## Defaults

- Static enums and small explicit numeric choice lists receive suggestions.
- Free-form/dynamic values and the `256-4000` token-budget range do not.
- Hidden legacy `/model` and `/effort` commands remain absent from the palette.
