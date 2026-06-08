# Scope: E2E Testing Track

## Objective
Design and implement a comprehensive, opaque-box, requirement-driven E2E test suite for Openpawl MVP and publish `TEST_READY.md` and `TEST_INFRA.md`.

## Architecture
- The CLI binary `packages/cli/src/bin.ts` is run via `bun --filter @codepawl/cli dev` or directly.
- The test harness will run the CLI in a separate process, verifying its exit codes, stdout/stderr, and produced file artifacts.
- Mocks: An interactive/configurable LLM mock provider will read mock completion fixtures from files/directories specified via options or environment variables, allowing deterministic tests of agent behavior.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Test Infra Setup | Setup tests directory, vitest/testing config, run helpers, and mock fixtures | None | PLANNED |
| 2 | Tier 1: Feature Coverage | Implement >=25 tests (5 per feature) for happy path isolated features | Milestone 1 | PLANNED |
| 3 | Tier 2: Boundary Cases | Implement >=25 tests (5 per feature) for edge cases, limits, errors, secrets | Milestone 2 | PLANNED |
| 4 | Tier 3: Cross-Feature | Implement >=5 tests for feature combinations and CLI subcommands | Milestone 3 | PLANNED |
| 5 | Tier 4: Real-world Scenarios | Implement >=5 tests for full end-to-end agent workflows on mock repos | Milestone 4 | PLANNED |
| 6 | Verification & Docs | Verify all tests pass, and generate TEST_INFRA.md and TEST_READY.md | Milestone 5 | PLANNED |

## Features to Test (N=5)
1. **Core State Machine Workflow**: intake -> repo_scan -> scope_analysis -> file_selection -> patch_plan -> optional_patch_apply -> validation -> trace_export -> report_export.
2. **LLM Mock Provider Configuration**: simulate completions and token counts via files/fixtures.
3. **CLI Runner Commands**: `run` dry-run/write, `trace` markdown format, `doctor` healthcheck, `github-comment` PR reporting.
4. **Safety Guardrails**: gitignore, secret prevention, write guards, dry-run safety, violation abort.
5. **Run Artifacts & Validation**: generate `trace.json`, `report.md`, `run.json`, `patch-plan.json`, `selected-files.json`, execute and capture test commands.

## Test Case Strategy
- **Tier 1 (Feature Coverage)**: >=25 tests (5 per feature). Happy path, isolated features.
- **Tier 2 (Boundary & Corner Cases)**: >=25 tests (5 per feature). Edge limits, empty queries, secrets, non-repo paths.
- **Tier 3 (Cross-Feature Combinations)**: >=5 tests. CLI run + validation + artifacts + mock provider.
- **Tier 4 (Real-world Application Scenarios)**: >=5 tests. Full repo run with mock configs, dry-run, then write mode, validating and trace format.
