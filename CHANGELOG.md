# Changelog

All notable changes for Openpawl.

## Openpawl Release History

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

### Scope

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
