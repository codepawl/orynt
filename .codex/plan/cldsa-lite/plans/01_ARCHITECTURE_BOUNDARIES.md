# Architecture Boundaries

## Minimal physical structure

Do not create one package for every brain analogy. Start with a small number of stable boundaries.

```text
apps/
  desktop/
    src/                       # React UI
    src-tauri/                 # Rust host, commands, capabilities

  runtime/
    src/
      api/                     # sidecar request/event protocol
      orchestrator/            # run state machine
      cognition/               # workspace, planning, gating, budgets
      providers/               # Codex and future model adapters
      surfaces/                # repository first; browser next
      sandbox/                 # worktree/process/network policies
      verification/            # tests, lint, diff and policy checks
      memory/                  # episodic and candidate memory
      storage/                 # SQLite repositories and migrations

packages/
  contracts/                   # canonical schemas and shared types
  ui/                          # optional shared UI components only

capabilities/
  coding-apprentice/
    manifest.ts
    prompts/
    validators/
    policies/
    evals/

fixtures/
  repositories/
  browser-pages/
  evals/
```

If the audit shows the repo is currently a single Tauri project, preserve it and create these as logical folders first. Split into workspace packages only when imports, build times, or independent testing justify it.

## Dependency direction

```text
UI
  → typed desktop client
  → Tauri commands/events
  → runtime API
  → orchestrator
  → abstract ports

Capability pack
  → cognitive kernel interfaces
  → surface/provider/verifier ports

Adapters
  → implement ports

Safety governor
  → may inspect/block all actions

Learning
  → may propose memory/skills
  → may not mutate core policy or evaluator
```

Forbidden dependencies:

- UI → raw shell command;
- UI → direct secret storage;
- capability pack → provider-specific internals;
- Codex adapter → UI state;
- memory/consolidation → safety policy mutation;
- model response → direct tool execution without action validation;
- verifier → model-generated result as sole source of truth.

## Process model

### Desktop renderer

Responsibilities:

- render state;
- send typed user intents;
- receive normalized events;
- show approvals;
- never execute agent tools directly.

### Tauri Rust host

Responsibilities:

- validate commands;
- own local paths and keychain access;
- start/stop the runtime sidecar;
- expose only scoped capabilities;
- relay events;
- prevent arbitrary command construction from renderer input.

### Runtime sidecar

Responsibilities:

- run the cognitive loop;
- launch Codex adapter;
- manage worktrees and child processes;
- write events;
- perform validation;
- build context;
- enforce runtime budgets.

## Codex integration boundary

Preferred progression:

1. `MockCodingProvider`;
2. `CodexContractProvider` that generates work contracts;
3. `CodexAppServerProvider` using a pinned local Codex runtime and JSON-RPC event stream;
4. optional Codex MCP/SDK integrations later.

CodePawl normalizes provider events into its own contracts. Provider-specific events are retained only as raw artifacts for debugging.
