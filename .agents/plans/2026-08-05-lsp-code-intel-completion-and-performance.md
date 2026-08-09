# Complete Orynt LSP and code intelligence before performance optimization

## Decisions

- Continue the existing Bun/TypeScript CLI-first architecture. Do not add a
  Rust daemon or new desktop capability.
- Keep `orynt.code-intel` as the Orynt-owned protocol. External LSAP remains a
  design reference only.
- The npm CLI is the complete code-intelligence target. Native builds must
  report an explicit degraded state until a separately designed companion
  runtime exists.
- TypeScript/JavaScript, Python, and Rust are Tier A languages and must pass the
  same semantic and mutation contract suite. Bundled configuration languages
  are Tier B. Externally installed toolchain servers are Tier C.
- Complete correctness and safety gates before doing performance work.
- Support read-only intelligence, semantic rename, and edit-producing code
  actions. Resource operations and arbitrary language-server commands remain
  unsupported.
- Every mutation is preview-first, bound to a snapshot and file hashes, and
  requires approval for the exact preview digest.

## Functional phases

1. Freeze the protocol, ADR, language tiers, permission flow, and verification
   map.
2. Replace per-adapter workspace revision/watch state with one repository
   revision authority and ordered per-session document mirrors.
3. Finish persistent-session supervision, readiness, normalized capabilities,
   diagnostics, cancellation, backpressure, restart/replay, and protocol-safe
   inbound handling.
4. Finish selectors, ambiguity, outline, inspection, relations, diagnostics,
   context packing, budgets, pagination, provenance, renderers, and structured
   errors.
5. Pass the same core semantic fixtures for TypeScript, Pyright, and
   rust-analyzer. Secondary adapters must expose their support tier and degrade
   independently.
6. Add a repository-owned mutation transaction boundary, durable preview and
   recovery stores, workspace-edit validation, rename/code-action preview,
   per-preview approval, transactional apply, synchronization, verification,
   and rollback.
7. Integrate read and mutation capabilities with CLI status, doctor, package
   smoke, PTY/headless approval paths, CI, and release checks.

## Public tool surface

- Existing read-only tools remain: `code_status`, `code_search`,
  `code_inspect`, `code_relations`, `code_diagnostics`, and `code_context`.
- `code_refactor` is read-only and supports `rename_preview`,
  `list_code_actions`, and `preview_code_action`.
- `code_refactor_apply` is the only side-effect tool. It accepts an exact
  `previewId` and `previewDigest`; approval is supplied by the product adapter,
  never by model-authored arguments.
- Schema v1 may receive additive optional fields. Breaking changes require a
  new schema version.

## Mutation safety

- Normalize only text edits from `changes` and text-document
  `documentChanges`; reject create, delete, and resource rename operations.
- Reject outside-workspace paths, symlinks, protected paths, stale snapshots,
  changed file hashes, malformed ranges, overlapping edits, excessive file or
  byte counts, and unknown commands.
- A command-bearing code action is supported only when an adapter policy owns
  the exact command identifier, validates its arguments, and deterministically
  materializes it into a previewable edit. The generic runtime never executes
  arbitrary server commands.
- Store private, bounded transaction recovery material outside the repository.
  Partial application must roll back. Incomplete rollback enters
  `RECOVERY_REQUIRED` and blocks later mutations.
- After apply, publish one revision batch, wait for the sync barrier, compare
  diagnostics, and run only verification argv already authorized by repository
  task policy.

## Functional completion gate

The feature is not complete until host stdio, contracts, LSP/runtime, CLI,
build, deterministic E2E, npm packaging, package smoke, Tier A compatibility,
mutation approval, rollback, and recovery tests all pass. Native package tests
must prove explicit degradation rather than semantic fallback.

## Performance phase

Only after the functional gate:

1. Correct the benchmark so cold, warm uncached, and cache-hit queries are
   distinct and report p50/p95 plus resource usage.
2. Profile duplicate starts/watchers/reads, batching, in-flight deduplication,
   queueing, caching, invalidation, and warm-up behavior.
3. Optimize only measured bottlenecks without changing snapshot, provenance,
   approval, or mutation guarantees.
4. Require no warm-query spawn, at least 5x warm speedup over a measured
   spawn/index-per-call baseline, cache-hit p95 overhead below 20 ms, one
   downstream request for identical concurrent queries, bounded output, and a
   bounded 30-minute mixed query/edit/restart soak.

## Constraints

- Preserve unrelated dirty work. Do not reset, stash, commit, or push unless
  separately requested.
- Keep the desktop adapter frozen.
- Do not install or execute servers or commands from repository-controlled
  configuration.
- Do not call a model from the code-intelligence core.
- Do not log source payloads, secrets, or raw high-cardinality paths by
  default.
