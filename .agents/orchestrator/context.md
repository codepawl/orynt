# Project Context - Openpawl MVP

## Monorepo Layout
- `packages/shared`: Shared types, models.
- `packages/core`: Core state machine workflow agent. Uses StateGraph (LangGraph style).
- `packages/cli`: CLI utility commands.
- `apps/web`: Next.js frontend (should remain unchanged unless docs need minimal updates).
- `apps/api`: FastAPI backend (should remain unchanged).

## Technical Requirements
- Bounded state machine steps: `intake`, `repo_scan`, `scope_analysis`, `file_selection`, `patch_plan`, `optional_patch_apply`, `validation`, `trace_export`, `report_export`.
- Safety guards: respect `.gitignore`, cap scanned files/bytes, detect secrets, never write outside target repository or modify forbidden files, patch previews.
- CLI: commands `run`, `trace`, `doctor`, `github-comment`.
- Artifacts: under `.codepawl/runs/<run-id>/` (5 specific files: `trace.json`, `report.md`, `run.json`, `patch-plan.json`, `selected-files.json`).
- Reusable GitHub action workflow.
- Walkthrough documentation and ARCHITECTURE.md updates.
