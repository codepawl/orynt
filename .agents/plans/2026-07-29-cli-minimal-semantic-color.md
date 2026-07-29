# Minimal semantic color for the inline CLI

Status: implemented and verified

## Objective

Centralize terminal styling and use color only for focus and semantic state
without changing the inline renderer's layout or plain-text behavior.

## Decisions

- Keep RGB and SGR styling in one CLI-owned terminal theme.
- Color only prompt/selection focus, approvals/countdown, verified success, and
  failure markers.
- Keep descriptions, paths, metadata, and agent output at the terminal default;
  use dim only for nonessential hierarchy.
- Preserve `--plain`, `--no-color`, `NO_COLOR`, non-TTY, and JSONL output.
- Do not add dependencies, theme selection, background colors, or fullscreen.

## Validation

- Assert colored output strips to the exact plain output.
- Protect width, cursor, resize, and differential-render invariants.
- Verify terminal-control sanitization and every color-disable path.
- Run CLI tests, CLI build, raw ANSI search, and an interactive CLI smoke.

## Result

- Added a dependency-free semantic terminal theme with focus, verified success,
  attention, danger, muted, and strong treatments.
- Kept color limited to prompt/selection markers, approval labels, countdown
  keys, and state icons; descriptions and operational content remain neutral.
- Centralized color capability handling across interactive and headless TTY
  output, including `NO_COLOR` and the `--` option terminator.
- Added plain/color equivalence, injection, C1 control, JSON-safe, headless,
  composer-layout, and semantic-role regression coverage.
- Verified with 103 CLI tests, the CLI build, an interactive `make cli` smoke,
  and independent correctness and security reviews.
