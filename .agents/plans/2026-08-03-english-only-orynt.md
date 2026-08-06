# English-Only Orynt Experience

## Summary

- Replace all identified Orynt-authored Vietnamese copy in the CLI and product documentation.
- Establish one shared English-output instruction for every model-authored reply, question, plan, summary, review, and implementation result.
- Add an automated copy gate because the existing documentation check does not cover every Orynt-authored surface.

## Implementation

- Translate CLI picker hints and `docs/productization/skill-manager.md` without changing behavior.
- Export a shared English-output instruction and inject it into CLI and desktop prompt understanding, coordinators, task planners, read-only roles, and repository implementers.
- Preserve user prompts, repository content, proper nouns, quoted evidence, third-party content, multilingual safety patterns, and Unicode compatibility fixtures.
- Add `bun run copy:check` and include it in `release:check`.

## Validation

- Update focused copy and prompt-construction tests.
- Run `bun run copy:check`, `bun run docs:check`, `bun run test:contracts`, `bun run test:cli`, `bun run build:cli`, the coding-apprentice and codex-adapter tests, `bun run check:desktop`, and `bun run release:check`.

## Assumptions

- Orynt accepts prompts and repository content in any language, but Orynt-authored interface text and generated prose use English.
- This change does not add runtime language detection, retry, or input rejection.
- Existing unrelated working-tree changes must be preserved.
