# Adaptive Multi-Model Orchestration

Status: implemented; multi-model default rollout gate remains active

## Objective

Replace Orynt's single-selected-model pipeline with Codex-first adaptive
orchestration while preserving repository isolation, deterministic policy,
single-writer execution, and verifier authority.

## Decisions

- Roll out coordinator to implementer first, with at most two optional
  read-only helpers and one conditional read-only reviewer.
- Support `quality`, `balanced`, `economy`, `auto`, and `custom` profiles.
  Fresh installs remain on the legacy single-model custom profile until the
  evaluation gate below is satisfied; `balanced` is available explicitly.
- Built-in Codex presets:
  - quality: Sol xhigh, Terra high, Luna high, Sol high reviewer;
  - balanced: Sol high, Terra medium, Luna medium, conditional Sol high reviewer;
  - economy: Terra medium, Luna medium, Luna low helper, failure-only Sol high reviewer.
- Use one writer lease, orchestration depth two, one recovery attempt, and no
  recursive model-owned delegation.
- Keep policy, approval, budgets, dispatch, cancellation, artifacts, and final
  verification under deterministic Orynt control.
- Replace `/model` with an inline profile and role editor plus explicit
  subcommands. Old `/model <id>` and `--model` report migration help.
- Ship shared runtime and CLI first; desktop UI and multi-writer execution are
  outside this milestone.

## Interfaces

- Add shared orchestration profile, role binding, orchestration plan, child task,
  resolved topology, and model invocation ledger contracts.
- Persist preferences and resumable sessions as schema v2. Migrate v1
  model/effort into a custom single-model profile once and atomically.
- Add one-shot `--profile`, `--role-model role=id`, and
  `--role-effort role=level` flags.
- Ensure every Codex invocation receives both its resolved `-m` value and
  `model_reasoning_effort`.

## Runtime

- Coordinator returns a typed answer or bounded plan. Orynt validates depth,
  dependencies, role authority, path scope, budgets, and stop conditions.
- Approval precedes child dispatch. Helpers may run in parallel read-only;
  implementer runs after dependencies and owns the only write lease.
- Verifier remains final authority. Reviewer may create one recovery contract
  but cannot edit or override verification.
- Cancellation propagates to all child processes and prevents new dispatches.
- Built-in missing-model fallback omits helpers and uses coordinator for missing
  implementer/reviewer. Missing coordinator or invalid custom bindings block.

## Validation

- Cover schema migration, preset/custom resolution, catalog fallback, CLI
  parsing/editor behavior, DAG validation, one-writer enforcement, child
  ordering, cancellation, effort argv propagation, reviewer recovery, and
  ledger artifacts.
- Compare legacy single-model, economy, balanced, and quality through the
  deterministic eval harness. Do not default-enable balanced until safety is
  unchanged and it matches baseline success while improving success by five
  points or cost by twenty percent; balanced p95 latency may not regress more
  than fifty percent.
- Run affected package tests/builds, CLI tests/build, contract tests, repository
  smoke, diff checks, reviewer, and security audit.

## Implementation result

- Shared profile, role binding, resolution, fallback, plan, child-task, and
  invocation-ledger contracts are implemented.
- CLI preferences and sessions migrate from schema v1 to v2 atomically and
  retain a custom single-model equivalent of previous settings.
- `/model` now edits profiles and individual role models/efforts inline.
  Headless profile and role flags are one-shot and legacy single-model flags
  return migration guidance.
- Interactive actions use a validated fixed topology: read-only coordinator,
  up to two independent read-only helpers after approval, one implementer
  writer inside the isolated worktree, deterministic verifier, and optional
  post-verification read-only reviewer. Headless runs persist the resolved
  topology and use the same implementer/reviewer evidence path.
- The cognitive-kernel scheduler enforces one writer, DAG ordering,
  cancellation checks, verifier authority, and one path-bounded recovery
  attempt. The CLI now wires verifier failure to one reviewer-proposed,
  path-bounded implementer retry in the same sandbox. The original approval
  explicitly covers that retry; a second verifier verdict remains final.
- Every controlled run with orchestration metadata writes
  `model-invocations.json` and `orchestration-attempts.json`; reviewer failure
  cannot change a verifier pass.
- Rollout comparison thresholds remain a release gate rather than fabricated
  deterministic metrics. Multi-model profiles therefore require explicit
  selection for now.
