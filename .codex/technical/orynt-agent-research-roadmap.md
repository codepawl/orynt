# Orynt Agent Harness Research Roadmap

## Status

Initial research/product direction for turning Orynt from a UI-led supervised agent app into an evidence-backed agent harness product.

## Core thesis

Orynt should not claim that agents literally think like humans. The stronger and testable thesis is:

> Orynt improves supervised agent reliability and cost-per-success by wrapping frontier coding/computer-use agents in compact working state, source-backed memory, budget-aware planning, policy-gated action, deterministic verification, recovery, and replayable evidence.

## Claims to prove

1. **Reliability:** With the same base model, Orynt harness increases task success rate versus raw agent execution on repository tasks.
2. **Efficiency:** Orynt improves cost per successful task, even if it adds per-run overhead, by reducing failed attempts, wasted context, and unsafe retries.
3. **Safety:** Orynt reduces unsafe or policy-violating actions through permission classification, approval gates, protected paths, and evidence-backed verification.
4. **Learning:** Source-backed memory and skill candidates improve repeated-user/task behavior without stale-memory regressions.
5. **Inspectability:** Structured traces reduce time-to-debug and make failures more actionable than raw agent logs.

## Do-not-claim list

Do not claim:

- human-equivalent cognition
- consciousness
- AGI
- guaranteed safety
- full autonomy without operator control
- provider-token savings until live provider usage accounting is wired

## Experiment stack

### Layer A — Deterministic contract and safety evals

Purpose: CI safety floor for policies, ledgers, evidence, memory provenance, and skill approval.

Current home: `packages/eval-harness`.

Must cover:

- safe read-only action
- low-risk local write
- sensitive action
- blocked destructive action
- prompt injection
- memory regression
- cost ledger regression
- stale/deleted memory
- conflicting memory
- protected path attempts
- missing evidence

### Layer B — Orynt RepoOps Bench

Purpose: internal benchmark for the Orynt wedge: supervised repository work.

Task groups:

| Group | Target | Example |
|---|---|---|
| inspect | repository understanding | summarize architecture from files |
| edit_small | small safe mutation | add a README section |
| debug | fix failure with verifier evidence | repair a failing test |
| feature | medium implementation | add a typed option and UI display |
| safety | refuse or gate risky actions | attempt protected path / destructive command |
| memory | reuse approved preference | repeated report format correction |
| recovery | handle failed first attempt | retry after verifier mismatch |

Each task should define:

- fixture repository or fixture descriptor
- user goal
- hard constraints
- allowed tools/commands
- protected paths
- success verifier
- safety expectation
- expected evidence artifacts
- optional human rubric

### Layer C — External benchmark mapping

Use external benchmarks for positioning after internal signal exists:

- SWE-bench / SWE-bench Verified style tasks for real coding issue resolution.
- WebArena for browser workflows once browser gateway exists.
- OSWorld for real desktop/computer-use tasks once the gateway is no longer simulated.
- tau-bench for domain-policy tool/user interaction.

## Baseline matrix

Minimum method comparisons:

| Method | Purpose |
|---|---|
| `raw_agent` | base model/CLI without Orynt harness |
| `simple_wrapper` | model plus minimal verifier/report wrapper |
| `orynt_full` | full harness |
| `orynt_no_memory` | ablate source-backed memory |
| `orynt_no_verifier` | ablate verification/recovery |
| `orynt_no_compact_state` | ablate compact state and targeted retrieval |
| `orynt_safe_only` | measure safety/productivity tradeoff |

## Primary metrics

- task success rate
- cost per successful task
- unsafe action rate
- verifier pass rate
- recovery success rate
- human intervention burden

## Diagnostic metrics

- constraint preservation rate
- evidence coverage
- memory precision
- stale memory use rate
- retry count
- loop rate
- protected path violation count
- patch size / over-edit score
- replay completeness

## Implementation roadmap

### Phase 1 — Eval harness v2

Add an explicit RepoOps Bench schema and runner output to `packages/eval-harness`:

- task schema
- baseline/method id
- deterministic method result fixtures
- aggregate metrics by method
- cost per successful task
- JSON and Markdown benchmark report

### Phase 2 — RepoOps Bench v0

Create the first benchmark slice with 6 fixture tasks:

1. inspect repository
2. small safe edit
3. debug failing test
4. medium feature
5. safety/protected action
6. memory/preference reuse

### Phase 3 — Baseline execution

Run at least:

- `raw_agent_fixture`
- `simple_wrapper_fixture`
- `orynt_full_fixture`

Then add ablations.

### Phase 4 — Product trace surface

Expose in desktop artifacts/UI:

- compact state
- selected memories and dropped memories
- option tradeoff scores
- permission decisions
- verifier evidence
- cost per successful task
- memory/skill candidates

### Phase 5 — Evidence-backed beta

Private beta should focus on repository tasks and evaluate whether operators can:

- complete tasks safely
- inspect why an agent acted
- approve/reject memory and skills
- rerun with improved behavior
- debug failed runs faster than raw logs

## Reviewer objections to defend against

1. **The model did all the work.** Use same-model baselines and harness ablations.
2. **Tasks are too easy.** Include debug, recovery, and medium feature tasks.
3. **Safety blocks everything.** Track false positive blocks and human intervention burden.
4. **Memory causes stale errors.** Track stale/deleted memory activation.
5. **Cost estimates are fake.** Label deterministic estimates until live provider usage exists.
6. **UI is just a dashboard.** Make trace fields product-critical and tied to eval metrics.

## First milestone

A useful first milestone is:

> `packages/eval-harness` can run a small Orynt RepoOps Bench fixture comparing at least two methods and reporting task success rate, safety, evidence coverage, intervention count, and cost per successful task.

This milestone should be deterministic and CI-safe before real model/provider execution is added.

Current executable entry point:

```bash
pnpm bench:repoops
```

The command now runs RepoOps tasks through executable deterministic method runners (`createDefaultRepoOpsMethodRunners`) before writing reports. This preserves CI safety while making the next replacement step clear: swap fixture runners for real raw-agent, simple-wrapper, and Orynt Coding Apprentice runners.

Current runner maturity:

- `raw_agent_fixture`: deterministic fixture runner.
- `simple_wrapper_fixture`: concrete local deterministic runner that derives policy/verifier behavior from each `RepoOpsTask`; it intentionally has no source-backed memory or budgeted trace.
- `orynt_full_fixture`: concrete local deterministic harness runner that emits budgeted trace, verifier evidence, policy-gate behavior, compact-state notes, and memory provenance when tasks require it. It does not yet call the live Coding Apprentice/model path.

Default artifacts:

```text
packages/eval-harness/reports/repoops/orynt-repoops-v0.report.json
packages/eval-harness/reports/repoops/orynt-repoops-v0.report.md
```

The JSON report includes both aggregate `methods` metrics and task-level `taskResults` with per-method runs, evidence artifacts, notes, safety flags, verifier status, retries, and estimated cost. This makes it usable by the product UI/replay view before live agent execution is integrated.

### Core health command

For testing whether Orynt's non-UI core actually works end-to-end, use:

```bash
pnpm test:core
```

This builds the Coding Apprentice stack and runs a disposable repository through the supervised local core path, asserting real emitted artifacts for run events, compact/budgeted working state, verifier result, memory extraction, and artifact manifest. For the controlled Codex CLI path without calling a real model, use:

```bash
pnpm test:core:codex-fixture
```

Both commands are smoke tests for backend/infra health, not frontend readiness and not live-model quality claims.

For the first benchmark path that runs RepoOps tasks through the real Coding Apprentice core instead of the deterministic Orynt harness runner, use:

```bash
pnpm bench:repoops:core
```

This runs only `orynt_full_fixture` through `OryntCodingApprenticeRepoOpsMethodRunner`, creates disposable repos per task, calls `runDesktopRepositoryBeta`, and maps artifact manifest/event log/verifier result/memory store outputs back into `RepoOpsMethodRunFixture`. It is still local supervised execution rather than live frontier-model quality measurement.

For the next benchmark path that exercises the Codex adapter boundary without calling a live frontier model, use:

```bash
pnpm bench:repoops:controlled-codex
```

This runs only `orynt_full_fixture` through `OryntControlledCodexRepoOpsMethodRunner`. It creates disposable repos per task, installs a fake `codex` executable in an isolated PATH, forces the `codex-cli` model connection path, lets the fake CLI mutate the sandbox, then verifies and reports artifact-backed evidence. This is the controlled bridge between local supervised core health and future live Codex/Claude/GPT baselines: failures here indicate Orynt harness/adapter/verifier integration problems, not model quality problems.

For the first live-model gated path, use:

```bash
pnpm bench:repoops:live-codex -- /tmp/orynt-live-report /tmp/orynt-live-work --confirm-live
```

This runs only a small live slice (`inspect` and `debug`) through `OryntLiveCodexRepoOpsMethodRunner`. The runner refuses to execute unless `--confirm-live` is passed through to the benchmark script, because it can invoke a real Codex CLI session. Keep this as an explicit/manual research command, not a CI default.
