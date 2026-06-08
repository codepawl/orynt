# Original User Request

## Initial Request — 2026-06-08T09:54:56+07:00

Deliver a complete Openpawl MVP that can be tested locally and in CI/CD as a server-side coding-agent workflow for GitHub repositories.

Working directory: `/home/annx9/Code/Personal/codepawl`
Integrity mode: `demo`

## Requirements

### R1. Core Agent Engine (`@codepawl/core`)
- Implement a bounded state-machine workflow: `intake`, `repo_scan`, `scope_analysis`, `file_selection`, `patch_plan`, `optional_patch_apply`, `validation`, `trace_export`, `report_export`.
- Maintain Trace and Memory as internal modules inside `@codepawl/core`.
- Maintain typed contracts for `AgentState`, `RunOptions`, `RunResult`, `TraceEvent`, `TraceLedger`, `RepoScanResult`, `FileSelectionResult`, `PatchPlan`, `ValidationResult`, and `ReportResult`.
- Support a provider abstraction for LLMs.
- **LLM Mocking**: Implement an interactive/configurable mock provider that reads from a local config file or fixture to simulate specific test cases without making network or real API calls. Real provider support must be optional and configured via environment variables.

### R2. CLI Runner (`@codepawl/cli`)
- Implement the CLI using `@codepawl/core` without duplicating agent logic.
- Support the following CLI commands:
  - `codepawl run --repo . --task "<task-description>" [--dry-run | --write]`
  - `codepawl trace --input .codepawl/runs/<run-id>/trace.json --format markdown`
  - `codepawl doctor`
  - `codepawl github-comment --report .codepawl/runs/<run-id>/report.md`

### R3. Safety Guardrails & Safety Constraints
- Dry-run mode must never modify files.
- Controlled write mode may only modify files inside the target repository and only after validation boundaries are checked.
- Respect `.gitignore` where practical. Explicitly ignore `.git`, `node_modules`, `.next`, `dist`, `build`, `coverage`, `.venv`, `__pycache__`, lockfile-heavy folders, and binary files.
- Cap scanned file count and byte count. Detect likely secret files (e.g. env files) and avoid reading them by default.
- Never write outside the target repository. Do not modify ignored files, secrets, lockfiles, generated build artifacts, or migration files unless explicitly allowed by config.
- **Safety Violation Behavior**: If write mode attempts to modify a disallowed file, abort the entire run immediately and log a clear safety violation error.
- Write mode must generate and show/save a patch preview (plan) before modifying any files.

### R4. Artifacts, Reports, & Validation
- Every run must produce artifacts under `.codepawl/runs/<run-id>/`:
  - `trace.json` (metadata, node steps, files, commands, decisions, errors, plan, validation, risk notes)
  - `report.md` (task/scope summary, selected files, plan, validation result, timeline, risk notes, next suggested action)
  - `run.json`
  - `patch-plan.json`
  - `selected-files.json`
- Support configurable validation commands (default to auto-detecting package manager and test commands). Capture stdout, stderr, exit code, duration, and failure summary.
- Export trace and report artifacts even if validation fails.
- The exported report must be GitHub-comment-ready.

### R5. CI/CD Integration & Docs
- Provide a reusable GitHub Action workflow example that runs the CLI on pull requests or manual dispatch, uploads run artifacts, and comments on PRs when a token is available.
- Keep `apps/web` and `apps/api` unchanged, unless documentation or root scripts require minimal updates.
- Update `README.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `CLAUDE.md`, and create/update `walkthrough.md`.

## Acceptance Criteria

### Verification Checks
- [ ] Run `bun install` completes successfully.
- [ ] Run `bun run typecheck` passes without errors on all JS/TS projects.
- [ ] Run `bun run build` builds the workspaces successfully.
- [ ] Run `bun run test` passes all TypeScript unit and integration tests.
- [ ] Backend python checks (`cd apps/api && uv run pytest` and linting) pass successfully if affected.

### Behavioral Verification
- [ ] CLI `codepawl run` in `--dry-run` mode runs the state machine, creates the full artifact directory under `.codepawl/runs/<run-id>/` with all 5 files, and does NOT modify any code.
- [ ] CLI `codepawl run` in `--write` mode generates a patch plan, validates boundaries, applies the changes safely, runs the validation tests, captures output, and writes run artifacts.
- [ ] CLI `codepawl trace` converts the trace JSON into a formatted markdown trace timeline.
- [ ] CLI `codepawl doctor` runs checkup checks and prints system status.
- [ ] CLI `codepawl github-comment` accepts mock/real inputs and performs markdown posting/comment generation.
- [ ] Unit tests cover core state transitions, safety limits, file selection, patch generation, dry-run/write-mode guards, command capture, trace/report export, and CLI commands.
