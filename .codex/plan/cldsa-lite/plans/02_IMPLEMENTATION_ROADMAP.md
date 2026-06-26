# Low-to-High Implementation Roadmap

## Current position

The repo audit prompt has already been run. Do not restart from a generic scaffold. Use the audit output to map the current files into this roadmap.

## Stage 0 — Architecture reconciliation

Purpose:

- compare the completed audit with CLDSA-Lite;
- decide whether to preserve a single-project structure or create workspaces;
- produce a repo-specific plan;
- write architecture decisions before implementation.

Exit criteria:

- implementation sequence references actual files;
- P0 boundaries and non-goals are explicit;
- the first executable slice is selected.

## Stage 1 — Run and event spine

Build:

- canonical schemas;
- `RunState` machine;
- append-only `RunEvent`;
- event store interface;
- mock runtime;
- desktop event rendering.

Do not add:

- Codex;
- browser automation;
- memory retrieval;
- learned planning.

Exit criteria:

- mock run moves through valid states;
- invalid transitions fail;
- all events validate;
- UI can display the run.

## Stage 2 — Safety and sandbox foundation

Build:

- `CorePolicy`;
- `ActionGate`;
- protected paths;
- command classification;
- hard budgets;
- isolated git worktree manager;
- child-process allowlist;
- redaction.

Exit criteria:

- destructive commands are blocked;
- protected-file changes produce approval requests;
- cleanup and rollback work;
- policy decisions are logged.

## Stage 3 — Codex adapter

Build:

- provider interface;
- mock provider;
- pinned Codex App Server integration or a narrow contract-generation adapter first;
- JSON-RPC/event normalization;
- thread/run mapping;
- cancellation and timeout;
- explicit sandbox/approval configuration.

Exit criteria:

- a small fixture task can be sent to Codex;
- progress is streamed into CodePawl events;
- Codex cannot escape the isolated workspace;
- the run can be paused or cancelled.

## Stage 4 — Deterministic verification

Build:

- validation plan;
- repo command discovery;
- tests/lint/typecheck/build adapters;
- git diff checks;
- protected-path checks;
- expected vs actual outcomes;
- failure taxonomy.

Exit criteria:

- CodePawl never marks success from provider text alone;
- verifier evidence is persisted and displayed;
- silent tool success with no meaningful state change is detected.

## Stage 5 — Bounded cognitive workspace

Build:

- `TaskState`;
- goal and subgoal stack;
- active constraints;
- recent verifier outcomes;
- selected repository facts;
- `ContextPacketBuilder`;
- context and token estimates.

Exit criteria:

- full transcript is not required for the next model turn;
- completed subgoals are summarized;
- context packet is inspectable;
- budget breach blocks or downgrades the next call.

## Stage 6 — Episodic memory and capability profile

Build:

- SQLite event persistence;
- retrieval by run, task, repo, entity, time and error class;
- `CapabilityProfile`;
- tool reliability;
- repeated-error tracking;
- confidence vs actual success logging.

Exit criteria:

- a later run can retrieve one relevant prior episode;
- raw evidence remains accessible;
- secrets are redacted;
- stale or irrelevant episodes are not blindly injected.

## Stage 7 — Candidate semantic memory and skills

Build:

- candidate project rules with evidence;
- candidate skills with preconditions/postconditions/verifier;
- user approve/reject/edit;
- Stable vs Candidate namespaces;
- versioning and supersession.

Exit criteria:

- no item auto-promotes;
- a user correction can create a candidate rule;
- a successful repeated procedure can create a candidate skill;
- provenance links back to raw events.

## Stage 8 — Post-run consolidation and lifecycle

Build:

- deterministic consolidation first;
- duplicate merge;
- contradiction detection;
- staleness;
- archive and tombstone;
- replay-based regression checks for candidate skills.

Exit criteria:

- repeated equivalent memories are merged;
- superseded rules remain auditable;
- skill promotion requires evaluation;
- live-run latency is not increased by consolidation.

## Stage 9 — Adaptive control and lightweight transition prediction

Build:

- `AdaptiveController` using resource pressure, uncertainty, risk, progress and repeated failure;
- heuristic `TransitionPredictor`;
- routing between skill, low-cost model, strong model, ask-user, or stop;
- recovery policy.

Exit criteria:

- uncertainty increases verification or asks the user;
- resource pressure narrows context or stops;
- repeated failure changes strategy;
- every modulation is logged.

## Stage 10 — Browser and future surfaces

Only after the Coding Apprentice loop is reliable:

- browser observe-first adapter;
- semantic UI graph;
- browser action compiler and verifier;
- desktop/filesystem/terminal surfaces behind the same contracts.

## Research track after product evidence

- learned digital world model;
- JEPA-style state transition model;
- local model fine-tuning;
- automated curriculum generation;
- full global-workspace bidding;
- multi-capability transfer;
- ablation matrix across task families.
