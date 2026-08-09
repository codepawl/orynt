# CLI Font Color Themes

## Summary

- Replace split ANSI palettes with one theme registry shared by the CLI.
- Ship `quiet-studio` as the default and `monochrome` as a selectable theme.
- Keep long-form body text on the terminal default color; theme labels, emphasis,
  state, paths, diffs, and syntax.
- Do not change the frozen desktop adapter or font family.

## Interfaces and state

- Add typed terminal theme IDs, definitions, metadata, and semantic/content
  tokens.
- Pass a resolved theme into rich-text rendering instead of maintaining a
  separate syntax palette.
- Add `appearance.themeId`, migrate preferences to schema v7, and default old
  preferences to `quiet-studio`.
- Add the ephemeral `--theme <quiet-studio|monochrome>` launch override.

## Palette and behavior

- Quiet Studio uses the documented Orynt semantic palette plus the approved
  Studio Spectrum syntax colors.
- Monochrome uses terminal-default text with bold, dim, and underline, while
  preserving semantic success, warning, and error colors.
- Add immediate theme selection to Appearance settings and report saved versus
  effective launch-overridden values.
- Preserve `--plain`, `--no-color`, `NO_COLOR`, non-TTY, terminal-safety, and
  option-terminator behavior.

## Validation

- Cover registry output, rich text and streaming, CLI parsing, state migration,
  settings persistence, presentation updates, and PTY persistence/override.
- Run `bun run test:cli`, `bun run build:cli`, and `bun run test:e2e-cli`.
