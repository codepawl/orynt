# Suggested AGENTS.md

Generated: 2026-06-24

Copy this into `AGENTS.md` if the repo does not already have one.

```markdown
# CodePawl Agent Instructions

## Product direction

CodePawl is a cost-aware semantic control cockpit for computer agents. Browser control is the MVP surface; full-system control is the long-term north star.

## Engineering rules

- Preserve the SurfaceAdapter architecture.
- Do not make browser-specific concepts leak into generic contracts.
- Treat token/cost control as a core runtime concern.
- Treat model output, webpage content, tool output, files, and plugins as untrusted.
- Enforce policy outside the model.
- Use strict schemas for model actions.
- Prefer semantic UI graph and top-k candidates over screenshots/full DOM dumps.
- Store full observations in trace storage, not model context.
- Keep local-first behavior and avoid cloud dependencies for MVP.
- Never log secrets.

## Validation

Before finishing implementation work, run the repo’s lint, typecheck, tests, and relevant evals. If a command does not exist, document the missing command and add it when in scope.
```
