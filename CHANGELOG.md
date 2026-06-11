# Changelog

All notable changes for Openpawl.

## Openpawl Release History

## [0.5.1] - 2026-06-11

### Fixed

- Restored clean-clone reproducibility by adding the missing Clerk UI module declaration used by the web app typecheck.
- Removed the stale `openpawl-install-smoke` gitlink that caused GitHub Actions checkout cleanup warnings because no `.gitmodules` entry existed.
- Updated GitHub workflows and install samples to current checkout/upload/comment action majors and removed the temporary forced Node runtime override.
- Propagated the GitHub Actions run URL through the reusable workflow and sample workflow so report artifacts include the same evidence context as the in-repo workflow.
- Renamed the Evidence Summary schema row to `schemaVersion` to match the JSON artifact contract wording.

### Compatibility

- Artifact JSON schemaVersion remains `"1"`.
- Write safety gates, approval/apply policy, validation precedence, unsafe write rejection, beta create-only guardrails, `.gitignore` scanning, bounded retry behavior, and trace legacy compatibility are unchanged.

## [0.5.0] - 2026-06-11

### Added

- v0.5 Evidence UX Layer:
  - `report.md` now starts with an Evidence Summary derived from existing schema v1 run, trace, patch-plan, selected-files, and applied-files evidence.
  - Evidence Summary includes run ID, GitHub Actions URL when supplied by the workflow, artifact name, artifact directory, report path, trace path, status, readiness, validation, provider-call count, file/chunk counts, and write summary counts.
  - Failure reports include a short Failure Summary with normalized presentation-only categories.
  - GitHub issue/PR comments include run ID, Actions URL, artifact name, artifact directory, report path, and trace path when available.

### Verified

- `bun run typecheck`
- `bun run test`
- `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp024-followup-eval --limit 50`
- live GitHub `workflow_dispatch` dry-run smoke:
  - Run URL: `https://github.com/codepawl/codepawl/actions/runs/27323506270`
  - GitHub run ID: `27323506270`
  - Openpawl run ID: `run_1781151538660_qpej6x`
  - Artifact: `openpawl-artifacts-run_1781151538660_qpej6x`
  - Report: `/home/runner/work/codepawl/codepawl/.codepawl/runs/run_1781151538660_qpej6x/report.md`
  - Trace: `/home/runner/work/codepawl/codepawl/.codepawl/runs/run_1781151538660_qpej6x/trace.json`

### Compatibility

- Artifact JSON schemaVersion remains `"1"`.
- Write safety gates, approval/apply policy, validation precedence, unsafe write rejection, beta create-only guardrails, `.gitignore` scanning, bounded retry behavior, and trace legacy compatibility are unchanged.

## [0.4.0] - 2026-06-11

### Added

- v0.4 Trace/Evidence Layer:
  - Added `schemaVersion: "1"` contracts for machine-readable run artifacts: `run.json`, `trace.json`, `patch-plan.json`, `selected-files.json`, and `applied-files.json`.
  - Added schema-backed patch-quality `metrics.json` output.
  - Added cross-artifact consistency checks for run IDs, trace event correlation, and write summary/applied-file counts.
  - Kept `report.md` human-readable only, with no machine-readable front matter, to preserve GitHub comment readability.

### Verified

- `bun run typecheck`
- `bun run test`
- `bun --filter @codepawl/cli dev -- eval patch-quality --limit 50`
- dry-run and expected-failure smokes with schema-valid artifacts

## [0.3.0] - 2026-06-11

### Added

- `.gitignore`-aware repository scanning:
  - Implemented a dependency-free, robust `.gitignore` parser and matcher (`GitignoreMatcher` and `globToRegex`) supporting wildcard, directory, and negation patterns.
  - Updated `createRepoScanNode` to dynamically read and load local `.gitignore` files relative to their subdirectories during repository traversal.
  - Added `.openpawl-src` to `SCAN_IGNORED_DIRS` to prevent scanning monorepo files during checkout.
- Optional, bounded validation retry-loop:
  - Added conditional retry logic to the agent execution graph. If validation fails, the agent automatically cleans up and deletes any temporary files created during the failed attempt, increments the retry attempt, and restarts planning from a clean state.
  - Retry behavior is optional (defaults to `0` / disabled) and strictly bounded by the `validationMaxRetries` config parameter.
  - Exposed via the `--validation-max-retries` CLI flag for `codepawl run` and config parsing.

### Fixed

- Mock LLM Provider rule match safety:
  - Fixed a collision bug where repository scans of mock JSON fixtures would leak rule triggers (like `"Scope Context Pack"`) into LLM prompt contexts and falsely match rules. Resolved by stripping the serialized `"context"` block from user messages in the mock provider.

## [0.2.2] - 2026-06-11

### Added

- Trigger command parity:
  - Enabled `/openpawl plan` and `/openpawl fix failing tests` slash commands to resolve as dry-run tasks, bringing full parity to the trigger command set between slash `/` and mention `@` prefixes.
  - Added positive unit tests and updated command resolution specs to assert proper trigger matching.

### Changed

- Reusable workflow ergonomics:
  - Enabled manual triggering of the reusable workflow (`.github/workflows/openpawl-run.yml`) by adding the `workflow_dispatch` trigger event.
  - Aligned input parameters (optionality and defaults) with the standalone copy-pasteable workflow, adding a choice menu for `mode` and defaulting `task` to review changes.
  - Bumped default `openpawl_ref` in workflow definitions to `v0.2.2`.

## [0.2.1] - 2026-06-11

### Fixed

- Post-release external installability patch:
  - Updated copy-paste sample workflow (`docs/samples/openpawl.workflow.yml`) and reusable workflow (`.github/workflows/openpawl-run.yml`) to dynamically checkout `codepawl/codepawl` under `.openpawl-src`.
  - Configured workflows to execute `@codepawl/cli` using `--cwd .openpawl-src` and target the absolute path of the repository, preventing dependency-resolution failures in target repos that do not contain Openpawl.
  - Added automated cleanup steps to delete `.openpawl-src` before PR branches are created or once execution finishes.
  - Updated installation documentation (`docs/OPENPAWL_INSTALL.md`) to reflect the new dynamic repository checkout process.

## [0.2.0] - 2026-06-10

### Added

- v0.2 Reliability Layer released:
  - expanded patch-quality fixture set to 50 cases
  - added reliability metrics and failure-taxonomy reporting to patch-quality eval outputs
  - improved safe-chunk generation mapping for common add-tests intents

### Verified

- `bun run typecheck`
- `bun run test`
- `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp007-eval --limit 50`
  - Run ID: `eval_1781089789811_pw198o`
  - Passed: `50`, Failed: `0`
- write/apply smoke on safe fixture path:
  - `bun --filter @codepawl/cli dev -- run --repo . --task "add unit tests for shared helpers" --write --test-command "echo smoke-ok" --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json --out-dir /tmp/codepawl-cp007-write-smoke`
  - Run ID: `run_1781089801963_u5vppi`
- live GitHub dry-run smoke:
  - `gh workflow run openpawl.yml --ref main`
  - Run URL: `https://github.com/codepawl/codepawl/actions/runs/27273286439`
  - conclusion: `success`

### Release status

- CP-007 closeout decision: `TAG_READY`.
- `v0.2.0` release evidence includes local eval/write smoke artifacts and the 27273286439 run proof.

## [0.1.0-beta.1] - 2026-06-09

### Added

- Approval write mode through maintainer `/openpawl apply` and the `openpawl-approved` label.
- Approved write runs create a fresh Openpawl write run, push an `openpawl/apply-<issue-or-pr-number>-<run-id>` bot branch, and open a PR.
- Patch quality harness exposed as `codepawl eval patch-quality`.
- Deterministic mock fallback now emits a safe generated test create chunk for explicit `add tests for ...` write requests to support beta.1 live apply smoke runs.

### Changed

- Mention-triggered commands remain dry-run only; `@openpawl apply` is not supported.
- External workflow permissions now include `contents: write` for approval write PR creation.
- CLI version output now identifies beta.1.
- Issue #45 failure mode was preserved and documented: docs-only `/openpawl apply` requests without safe create chunks fail with `No safe create chunks available in write mode.`
- Openpawl apply workflow now treats org-policy PR creation denial as a warning path after successful branch push:
  - branch push success + org policy block keeps workflow success with manual PR fallback notes.
  - unexpected PR creation errors still fail the write run.

### Verified

- Issue #46 apply run verification (beta.1):
  - Run `27225431860` completed as expected after successful agent/write workflow:
    - `run_1781027825358_wl6vup` pushed to branch `openpawl/apply-46-run_1781027825358_wl6vup`
    - validation passed
    - branch push succeeded
    - `gh pr create` was blocked by org policy: `GitHub Actions is not permitted to create or approve pull requests.`
    - fallback path produced compare link and manual `gh pr create` command in report/comment
    - manual PR #47 was used as a concrete fallback example
  - `main` was not pushed directly; apply changes were only pushed to the bot branch
- Previous run outcomes:
  - `27222113779`: rejected before write due `No safe create chunks available in write mode.` for docs-only task.
  - `27223304290`: write/validation/branch push passed, `main` not directly updated, PR auto-create blocked by org policy.
  - `27224486041`: branch push passed, fallback was attempted with a heredoc bug which has since been fixed.

## [0.1.0-alpha.10] - 2026-06-09

### Added

- Exact `@openpawl` mention-trigger UX for maintainer comments.
- Mention commands for `review`, `plan`, `add tests`, and `fix failing tests`.
- GitHub Actions workflow now invokes `@codepawl/cli` directly so runtime arguments bypass the root Turbo script.
- Live mention-trigger verification for issue and PR comment paths.

### Changed

- Mention-triggered runs are dry-run only.
- Report comment recursion guard now ignores Openpawl report bodies explicitly.
- Slash-command behavior remains unchanged for `/openpawl review` and `/openpawl add tests`.
- Current workflow invocations use `bun --filter @codepawl/cli dev -- openpawl-trigger ...` and `bun --filter @codepawl/cli dev -- run ...`.

### Verified

- Issue `@openpawl review`: GitHub Actions run `27208458149` passed.
- PR opened baseline: GitHub Actions run `27208687623` passed.
- PR `@openpawl add tests`: GitHub Actions runs `27208690487` and `27208692054` passed.
- Pre-fix failure `27206619272` was caused by workflow runtime arguments being routed through Turbo via `bun run dev:cli`; the workflow now invokes `@codepawl/cli` directly.

## [0.1.0-alpha.9] - 2026-06-09

### Added

- Repo-root `openpawl.config.json` discovery for write-mode validation defaults.
- Copyable external install docs and sample workflow/config files.
- Reusable GitHub Actions workflow template for Openpawl execution jobs.

### Changed

- GitHub workflow no longer hardcodes validation commands; repo config controls write-mode safety defaults.
- CLI version output and release docs now identify alpha.9 as the current cut.
- Manual workflow dispatch remains the only path that can select write mode.

### Security

- Dry-run remains the default path.
- Exact slash commands stay limited to `/openpawl review` and `/openpawl add tests`.
- Workflow permissions and fork/comment safeguards are documented for external installs.

## [0.1.0-alpha.3] - 2026-06-08

### Added

- DeepInfra/Nemotron `json_schema` strict mode for OpenAI-compatible providers.
- Context compaction with conservative default budgets for real-provider smoke safety.
- Provider output grounding for scope analysis and patch planning.
- Rejection and surfacing of ungrounded provider paths.
- Report traceability improvements for compacted context and provider diagnostics.
- Scope fallback behavior in dry-run for ungrounded provider proposals.
- Safe write-mode v0 guardrails:
  - explicit `--test-cmd` is mandatory for write runs,
  - only new test-file creation chunks are applied,
  - disallowed paths and existing files are rejected before or during apply.

### Changed

- `scope_analysis` and `patch_plan` now require JSON schema-aligned structured output.
- Patch planning remains metadata-only (`rationale`, `chunks`).
- Real-provider dry-run validated with default budgets and grounding safety.
- `applied-files.json` artifact added for safe write-mode auditability.

## [0.1.0-alpha.2] - 2026-06-08

### Added

- Experimental OpenAI-compatible provider support.
- DeepInfra/Nemotron smoke coverage.
- Structured-output retry and improved diagnostics.
- Safe trace metadata and provider failure classifications.
- GitHub pull-request comment workflow hardening and PR reporting.

### Changed

- Improved provider failure categories for malformed/non-JSON output.
- Trace/report surface made safer for token accounting and redacted preview content.

## [0.1.0-alpha.1] - 2026-06-08

### Added

- Bun monorepo foundation with `@codepawl/core` and `@codepawl/cli`.
- Deterministic mock provider and local dry-run mode.
- Core artifact pipeline (trace, run, report, patch-plan, selected-files, and applied-files outputs).
- Workflow and PR smoke capabilities:
  - `workflow_dispatch` dry-run
  - pull_request dry-run
  - artifact upload and PR comment reporting
- Metadata-only patch plan output.

### Changed

- No production write-mode patch generation in this milestone.

## [Unreleased]

### Added

- Added v0.5 Evidence UX presentation work:
  - `report.md` now starts with a compact Evidence Summary derived from existing run, trace, patch-plan, selected-files, and applied-files evidence.
  - Failure reports include normalized presentation-only failure categories and a short Failure Summary.
  - GitHub issue/PR comments include run ID, Actions URL, artifact name, and report/trace artifact paths when available.

### Scope

- Issue/PR readiness gate added to core runner before scope analysis:
  - new readiness status classes (`ready`, `needs_clarification`, `unsafe`, `unsupported`)
  - checks for task clarity, repository/path/context signal, task type support, and destructive intent
  - `needs_clarification` and `unsafe` tasks now always fail before planning in both dry-run and write mode
  - unsafe intent now includes deletion/cleanup patterns for env/secret/token/lock-like targets and repo-wide destructive actions
  - readiness result persisted in trace, `run.json`, and report
  - rejected runs report blockers and note that no provider calls were made due readiness gate
- Scoped validation intelligence added for command selection:
  - explicit `--test-cmd` remains highest priority
  - inferred scoped defaults for:
    - `packages/core/*` -> `bun --filter @codepawl/core test`
    - `packages/cli/*` -> `bun --filter @codepawl/cli test`
    - `packages/shared/*` -> `bun --filter @codepawl/shared typecheck`
    - `apps/web/*` -> `bun --filter @codepawl/web typecheck`
  - decision metadata persisted as `{source,confidence,reason,command}` in validation/result artifacts
  - dry-runs fallback to placeholder validation if no scoped command is inferred
  - write mode fails before validation when no safe command can be inferred
- Scoped command inference now uses only actual target files (created files, patch-plan chunks, selected files), not broad context candidates.
- CLI outputs readiness status on run completion, including rejected run summary lines.
- Safe Write Mode v1 scaffolding:
  - write-mode now generates deterministic TypeScript/Vitest test scaffolds when grounded create chunks contain only intent metadata.
  - scaffold creation includes a clear `Generated by Openpawl` marker and preserves write safety constraints.
  - successful creation runs still execute validation with artifacts preserved on failures.
  - no-op write failures still fail early and preserve `applied-files.json` with attempt/reason counts.
- Keep refining context compaction, grounding policies, and provider compatibility.
- Stabilize and document a guarded write-mode path before v0.1.0.

## Release Maturity Milestones

### Alpha

- Verified: CLI + dry-run + trace + CI
- Limitation: no production write mode (v0 write mode is create-only and test-safe)

### Beta

- Add safe write-mode v0 (dry-run-first fallback behavior preserved for scope grounding only)
- Require explicit test command and avoid source overwrite
- Validate PR workflow end-to-end with write-mode guardrails

### RC

- Validate against multiple real repositories.
- Publish provider compatibility matrix (including DeepInfra, Nemotron, and additional OpenAI-compatible hosts).
- Demonstrate stable error handling and bounded retry behavior under structured-output failure modes.

### v0.1.0 Stable

- Publishable CLI path for external users (`npm` package or GitHub release binary).
- Verified installation docs and packaging metadata.
- Security and safety guardrails complete with auditable behavior.
- Full CI green and documented release checklist completion.
