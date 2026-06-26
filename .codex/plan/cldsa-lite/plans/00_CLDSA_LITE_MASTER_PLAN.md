# CodePawl CLDSA-Lite Master Plan

## 1. Product north star

CodePawl is a personal adaptive agent operating system. It learns a user's context, practices in controlled environments, accumulates verified experience, and operates tools through permissioned surface adapters.

The first sellable product is narrower:

> CodePawl Desktop Early Access: a supervised Coding Apprentice that delegates repository tasks to Codex, operates in an isolated workspace, verifies outcomes, records evidence, controls cost, and converts user corrections into candidate memory and skills.

The architecture must support future capability packs—browser work, research, content, marketing, social, operations—without implementing them in the MVP.

## 2. CLDSA-Lite, not full CLDSA

The MVP implements a minimum viable cognitive loop:

```text
Observe
→ Recall
→ Plan
→ Gate
→ Act
→ Verify
→ Record
→ Propose Learning
```

The full future loop adds simulation, active exploration, consolidation, forgetting, skill promotion, and learned transition models.

## 3. System invariants

These are non-negotiable:

1. `Run` is the central execution primitive.
2. `RunEvent` is append-only.
3. Every action records:
   - intent;
   - expected result;
   - risk;
   - budget estimate;
   - actual result;
   - verifier verdict.
4. The UI does not directly access shell, filesystem, secrets, or model credentials.
5. The Tauri host exposes narrow commands and capabilities.
6. Codex is an executor/provider behind a CodePawl adapter; it is not the system architecture.
7. The learning layer cannot modify:
   - safety policy;
   - sandbox policy;
   - evaluator;
   - secret boundary;
   - immutable core configuration.
8. Memory is candidate-first; no unverified event becomes a trusted rule or skill automatically.
9. Context is built from bounded state and selected evidence, not full transcript replay.
10. Every run has hard budgets for steps, wall time, model usage, edits, and validation.
11. A run cannot be marked successful without a verifier result.
12. Stable and Candidate knowledge are separate.

## 4. Layered architecture

### Layer A — Product shell

- Tauri desktop app;
- React/TypeScript UI;
- Run, Tasks, Dashboard, Permissions, Usage, Settings;
- live event stream;
- approval cards;
- diff and validation review.

### Layer B — Native boundary

- Rust Tauri host;
- capability and permission enforcement;
- sidecar lifecycle;
- secret access via OS keychain;
- local app-data paths;
- signed update and release boundary later.

### Layer C — Runtime sidecar

- long-lived Node/TypeScript process;
- CodePawl run orchestrator;
- Codex adapter;
- repository and browser surface adapters;
- event persistence;
- cognitive loop;
- memory and verification;
- token/cost accounting.

### Layer D — Cognitive kernel

- `TaskState`;
- `ContextWorkspace`;
- `ContextPacketBuilder`;
- `PlannerAdapter`;
- `TransitionPredictor`;
- `ActionGate`;
- `Verifier`;
- `ResourceGovernor`;
- `CapabilityProfile`.

### Layer E — Learning and memory

- episodic events;
- candidate semantic rules;
- candidate procedural skills;
- post-run consolidation;
- promotion and regression evaluation;
- staleness and lifecycle policy.

### Layer F — Capability packs

First:

- `coding-apprentice`.

Later:

- browser operator;
- research;
- content;
- marketing;
- social;
- operations.

Capability packs declare goals, required surfaces, permissions, validators, memory namespaces, routing policy, and evaluation suites. They may not bypass the cognitive kernel or safety governor.

## 5. First vertical slice

The first complete user flow is:

1. User selects a local repository.
2. CodePawl creates an isolated git worktree.
3. User describes a small coding task.
4. CodePawl captures repository state and constraints.
5. CodePawl creates a structured work contract.
6. Codex works in the isolated worktree.
7. CodePawl streams normalized events.
8. Risky commands or protected-file changes require approval.
9. CodePawl runs deterministic validation.
10. The UI shows task status, diff, commands, tests, cost, and verifier evidence.
11. The user accepts, rejects, or corrects the result.
12. CodePawl stores:
    - the raw episode;
    - a candidate project rule;
    - a candidate skill only when appropriate.
13. Nothing is auto-promoted to Stable knowledge in P0.

## 6. P0 modules

Build now:

- contracts and schemas;
- run state machine;
- append-only trace;
- Tauri/sidecar protocol;
- isolated worktree sandbox;
- Codex adapter;
- permission/action gate;
- deterministic verifier;
- bounded context workspace;
- token and resource governor;
- episodic event store;
- candidate memory extraction;
- user review and promotion UI;
- local eval fixtures.

Stub or delay:

- semantic vector retrieval;
- graph memory;
- learned world model;
- real emotion/drive simulation;
- model fine-tuning;
- general desktop control;
- autonomous skill promotion;
- multi-agent teams;
- cloud execution;
- social publishing;
- automatic financial or legal actions.

## 7. Names used in implementation

Prefer engineering names:

```text
CLDSA research name          Implementation name
-------------------------------------------------
GlobalWorkspace              ContextWorkspace
GenomeConfig                 CorePolicy
DriveController              AdaptiveController
ConsolidationDaemon          PostRunConsolidator
ForgettingManager            MemoryLifecycleManager
WorldModel                   TransitionPredictor
SelfModel                    CapabilityProfile
EpisodeStore                 RunEventStore
SemanticStore                ProjectRuleStore
SkillLibrary                 SkillRegistry
```

## 8. Success definition for the first MVP

A user can run one small repository task through Codex and inspect a complete, safe, cost-accounted, verifiable trajectory.

The system succeeds when:

- no privileged action bypasses policy;
- the task is executed in an isolated worktree;
- every state transition is logged;
- test/lint/typecheck/build results are attached;
- success is derived from explicit validation;
- user correction can become a candidate memory item;
- repeated runs use less context when a relevant verified item exists;
- the app remains usable if memory, model, or browser modules are unavailable.
