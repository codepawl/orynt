# Orynt Brain Completion Roadmap

Status: implementation-ready

## Objective

Finish the repository-only Orynt agent stack by making the resumable cognitive
runtime the sole executor for state-changing repository runs, making runtime
and memory state durable across processes and restarts, completing operator
memory and learned-skill workflows, and gating releases with persisted
artifact evidence.

Read-only chat remains outside the execution runtime. Browser automation,
general desktop control, host-wide filesystem access, autonomous background
execution, implicit skill attachment, and memory-derived authority remain out
of scope.

## Locked decisions

- Deliver all four phases below in order. A phase becomes the default only
  after its acceptance gate passes.
- Use a small Node-only `@codepawl/local-state` workspace package for atomic
  JSON writes, compare-and-swap revisions, fsync, and bounded cross-process
  file locks. Do not introduce an external database or daemon.
- Persist private checkpoints separately from redacted cognitive trace
  artifacts. Approval nonces never enter UI events or reader-facing artifacts.
- `CognitiveRuntimeV1` owns policy gating, budget enforcement, execution,
  verification, and learning for repository mutations. CLI preview policy may
  explain a proposal, but it cannot authorize or execute outside the runtime.
- Desktop repository runs are asynchronous and event-driven. `run_create`
  returns after durable run creation; approval, cancel, status, and recovery
  are separate operations.
- Memory purge is foreground maintenance performed when the memory manager is
  opened or queried after the retention deadline. There is no autonomous
  background agent.
- Package skills and learned skills remain separate stores and contracts.
  Learned-skill candidates are created only by an explicit operator action
  from accepted rules plus verifier-pass evidence.
- Roll out runtime v1 as the default after Phase 2 gates pass. Keep
  `ORYNT_RUNTIME_ENGINE=legacy` as an explicit rollback for one private-beta
  cycle; never silently fall back after a v1 error.

## Phase 1 — Durable runtime and local state

### Local-state substrate

- Add `packages/local-state` with:
  - atomic write-to-temp, file fsync, rename, and parent-directory fsync;
  - versioned JSON envelope loading with strict schema validation;
  - compare-and-swap writes using `expectedRevision`;
  - an exclusive adjacent lock file containing PID and acquisition time;
  - bounded retry, explicit lock-timeout errors, and stale-lock recovery only
    when the recorded process is absent.
- Refactor `LocalJsonMemoryStore` to use this substrate. Preserve automatic
  legacy-to-v2 migration and all current memory contracts.
- Use the same substrate later for checkpoint and learned-skill stores so CLI
  and per-operation desktop sidecars cannot lose concurrent writes.

### Checkpoint contracts and persistence

- Extend the cognitive-kernel public API with:
  - `CognitiveRuntimeCheckpointSinkV1.create(checkpoint)` and
    `compareAndSwap(checkpoint, expectedRevision)`;
  - terminal status `cancelled` and recovery status `execution_in_doubt`;
  - `CognitiveRuntimeRecoveryInputV1` for safe continuation after restart;
  - persisted execution attempt/idempotency metadata.
- Persist after every runtime event and before crossing observe, gate, execute,
  verify, and learn boundaries. Reject stale revisions before consuming an
  approval or invoking the gateway.
- Generate approval nonces with cryptographic randomness. A resume operation
  atomically changes a pending approval before gateway execution, making it
  single-use across processes and restarts.
- Add `LocalJsonCognitiveCheckpointStore` in Coding Apprentice under
  `<stateRoot>/runs/<runId>/checkpoint.json`. Store immutable request/context
  references beside it; keep raw secrets out of both.
- A crash before gateway execution is recoverable. A crash after gateway
  dispatch but before durable evidence becomes `execution_in_doubt`; it never
  re-executes automatically and requires operator review.

### Phase 1 gate

- Concurrent-process memory and checkpoint tests prove no lost update.
- Stale approval, replayed approval, stale revision, budget overrun, cancel,
  clean restart, and execution-in-doubt tests all fail closed.
- Existing Memory v1/v2 files and current run artifacts remain readable.

## Phase 2 — One repository execution runtime

### Coding Apprentice adapters

- Replace the post-verification `DeterministicCognitiveKernel` call with a
  `RepositoryCognitiveRuntime` built from real adapters:
  - observer: repository inspection, selected immutable skill snapshot, and
    bounded run context;
  - memory provider: deterministic advisory retrieval from approved semantic
    items, accepted rules, and unexpired episodes;
  - planner: one supervised Codex repository action bound to exact repository,
    sandbox, expected paths, commands, and budget;
  - gateway: controlled Codex execution/import using a stable idempotency key;
  - verifier: `LocalRepositoryVerifier` over the actual sandbox diff;
  - learner: verifier-backed memory extraction after a pass.
- The runtime creates the Codex contract before execution and performs policy
  gating before any repository mutation. Cognitive trace generation becomes a
  redacted projection of persisted runtime events, not a post-hoc simulation.
- Keep the existing high-level Coding Apprentice entry point as a compatibility
  wrapper. It returns a terminal result or a `waiting_for_approval` snapshot;
  it does not auto-approve.

### CLI and desktop integration

- CLI read-only chat remains unchanged. A proposed repository mutation is
  handed to `RepositoryCognitiveRuntime`; CLI renders its policy decision,
  checkpoint revision, budget, and approval prompt, then calls resume.
- Upgrade `desktop-repository-run.mjs` to a versioned operation protocol:
  `start`, `resume`, `cancel`, `status`, and `recover`. Continue accepting the
  current request shape as a v1 `start` during the compatibility window.
- Change Tauri run commands to return
  `{ runId, status, checkpointRevision, approval? }`.
  `approval_respond` additionally requires `expectedRevision`; Tauri loads the
  private nonce and never sends it to the webview.
- Run the Node operation in a managed background task, stream redacted NDJSON
  events to `run_event`, and retain cancellation handles in `AppState`.
  Restarted apps discover nonterminal checkpoints and expose explicit Recover
  or Mark failed actions.
- Add optional checkpoint fields to persisted run records with Serde defaults,
  preserving every existing snapshot. Artifact manifests advance one version
  and retain existing artifact keys.

### Phase 2 gate

- CLI and desktop integration tests prove no gateway execution occurs before
  approval and that approve, reject, cancel, restart, and stale responses
  converge on the same durable state.
- Controlled-Codex fixtures produce ordered runtime events, verifier evidence,
  memory extraction, usage totals, and a redacted cognitive trace.
- Legacy artifacts and run snapshots open successfully; runtime v1 then becomes
  the default with explicit legacy rollback only.

## Phase 3 — Complete memory and learned skills

### Semantic Memory Manager

- Extend shared `MemorySummary` with semantic status counts, trash count,
  tombstone count, and next purge time.
- Expose the existing semantic list, review, edit, trash, restore, purge,
  retrieve, and summary operations through Tauri and `oryntClient`.
  Every mutation carries actor, reason, and `expectedRevision`.
- Move the current memory review UI into a dedicated Memory Manager with
  Episodes, Rules, Semantic, and Trash & audit views. Display provenance,
  confidence, sensitivity, activation basis, conflicts, expiry, and the runs
  in which an item was retrieved.
- Opening or refreshing the manager purges only items whose 30-day deadline is
  due, preserving minimal tombstones. Explicit early purge remains blocked.

### Persistent learned skills

- Add a versioned `learned-skill-store.json` under the shared Orynt skill state
  root using the local-state CAS layer. Extend `LocalSkillRegistry` with a
  persistent implementation while retaining its current in-memory constructor
  for tests.
- Add learned-skill sidecar operations for list, create candidate, status
  transition, summary, and replay planning. Rewire the existing Tauri
  `skill_*` command names to these real operations and remove mock state.
- `skill_create_candidate` requires a candidate rule ID and run ID. The host
  supplies the accepted rule and verified persisted evidence; the builder
  rejects missing, failed, corrupted, or cross-namespace evidence.
- Learned candidates remain non-executable. Promotion, rejection, supersede,
  archive, and replay are durable, revision-checked, audited, and manually
  initiated. Active learned skills may be suggested but are never implicitly
  attached.

### Phase 3 gate

- Desktop tests cover semantic review/edit/trash/restore/due-purge and
  provenance display, including keyboard and error states.
- Restart and concurrent-writer tests prove learned-skill decisions persist.
- End-to-end tests prove package skills cannot overwrite learned skills and a
  learned skill cannot bypass repository policy or approval.

## Phase 4 — Artifact gates, CI, and release proof

### Artifact-derived evaluation

- Keep the deterministic synthetic eval suite, then add an artifact reader that
  validates real manifest, runtime trace, verifier, usage, memory, and skill
  snapshot artifacts from controlled repository runs.
- Gate on: valid event/revision ordering, zero blocked executions, complete
  approval-before-use evidence, verifier-backed learning only, no deleted or
  sensitive memory retrieval, budget compliance, exact skill snapshot digest,
  and complete artifact provenance.
- Commit redacted controlled-run fixtures. Never commit private checkpoints,
  approval nonces, credentials, or raw model logs.

### CI and packaged E2E

- Add a required quality workflow covering contracts, skill registry, memory,
  cognitive kernel, Coding Apprentice, verifier, eval harness, CLI, desktop
  tests/build, Tauri tests, release contract, and `git diff --check`.
  Keep Playwright as a separate required workflow.
- Add a release/manual workflow for `package:desktop:internal`, packaged-runner
  smoke, and artifact upload; do not publish or deploy automatically.
- Add one packaged E2E path:
  select a built-in skill → start run → approval pause/resume → controlled
  execution → verifier pass → memory candidate → restart → evidence reopen.
- Forward-test all five built-in skills in fresh disposable repositories and
  record observed results in release documentation.

### Final acceptance

- All required CI jobs pass from a clean checkout.
- The packaged desktop and CLI produce equivalent checkpoint, approval,
  verifier, memory, and skill evidence for the same controlled task.
- No mutation can occur from memory, a skill, stale approval, crash recovery,
  or UI state without a current policy decision and valid repository scope.
- Remove the legacy runtime only after one private-beta cycle with no rollback
  blocker; record that removal as a separate follow-up change.

## Ownership and stop conditions

- Phase 1 owner: local-state, memory, and cognitive-kernel contracts/store.
- Phase 2 owner: Coding Apprentice integration, then disjoint CLI and
  Tauri/desktop adapters; the coordinator owns shared contract reconciliation.
- Phase 3 owner: memory UI/Tauri lane and learned-skill registry/sidecar lane.
- Phase 4 owner: eval/fixtures and CI/release lane.
- Use an independent read-only verifier for checkpoint CAS, approval,
  repository authorization, memory redaction, learned-skill promotion, and
  purge changes.
- Stop a phase instead of weakening acceptance when a lock cannot prove
  ownership, a checkpoint is stale/corrupt, execution outcome is uncertain,
  evidence crosses a managed root, or a migration cannot round-trip existing
  data.
