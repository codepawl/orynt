# ADR 0006: Persistent LSP code intelligence

## Status

Accepted for the complete npm CLI code-intelligence system.

## Context

Orynt's CLI needs semantic repository context without repeatedly launching
language servers or exposing raw LSP payloads to models. The desktop
application remains a frozen compatibility adapter.

The LSAP orchestration design was used as a lifecycle and synchronization
reference, but Orynt does not adopt its wire protocol or external runtime. The
owned model-facing protocol is `orynt.code-intel`.

## Decision

- `@codepawl/lsp-runtime` owns supervised language-server processes, JSON-RPC,
  capability negotiation, document synchronization, diagnostics, cancellation,
  timeouts, restart-safe epochs, and workspace file boundaries.
- Adapters are detected from bounded, ignored-directory-aware project-root
  discovery and activated only when a semantic tool needs them. At most eight
  sessions are retained; nested project roots are supported.
- The npm distribution bundles pinned servers for TypeScript/JavaScript,
  Python, JSON, YAML, HTML, CSS, and Bash. Rust, Go, C/C++, Java, C#, and Lua
  adapters are detect-only and report missing or broken system executables
  without installing software.
- Operators may register controlled custom adapters through `orynt lsp add`.
  Custom commands must be absolute executable paths and use bounded structured
  arguments; shell expansion is never used.
- `@codepawl/code-intel-runtime` translates LSP results into bounded,
  snapshot-bound envelopes with provenance, freshness, ambiguity, pagination,
  stable handles, and cache metrics.
- Models receive six focused semantic read tools: `code_status`,
  `code_search`, `code_inspect`, `code_relations`, `code_diagnostics`, and
  `code_context`, plus read-only `code_refactor` preview operations.
- `code_refactor_apply` is a separate side-effect capability. It is exposed
  only when the CLI can show the exact unified diff and preview digest, obtain
  explicit approval for that digest, and execute a journaled repository
  transaction with stale-hash checks and rollback material.
- Non-interactive mutation uses an exact two-step operator flow:
  `orynt lsp refactor rename-preview` persists the preview, and
  `orynt lsp refactor apply` requires the matching id, digest, and
  `--approve-once`. A general headless run approval never substitutes for the
  exact preview approval.
- The CLI capability layer shares the service across normal turns and read-only
  orchestration roles. `/status` reports whether the service is ready,
  degraded, or not started.
- File changes are observed through a workspace watcher. Open documents use
  full-content `didChange`; unopened files use watched-file notifications.
- Crashed sessions have a bounded restart budget and replay synchronized
  documents before returning to ready. Requests use bounded concurrency and
  queue sizes. Diagnostics support baseline/delta reads, and pagination cursors
  are opaque, expiring, query- and snapshot-bound tokens.
- One repository-scoped revision authority owns watcher events and publishes
  Orynt mutations to every active language session. All paths are canonicalized
  and jailed to the selected repository.
- Preview files and consumed-approval markers use durable atomic replacement.
  Approval consumption is a cross-process create-if-absent operation. Abort,
  timeout, or failed verification rolls the repository back and publishes the
  restored revision before the next semantic result is served.
- Server-initiated workspace edits and arbitrary `workspace/executeCommand`
  requests remain rejected. Rename and edit-bearing code actions are normalized
  into Orynt-owned previews; resource operations, snippets, overlapping edits,
  symlinks, outside-root paths, and mixed edit/command actions fail closed.
- Tier A is TypeScript/JavaScript, Python, and Rust. CI exercises bundled
  TypeScript and Pyright plus the rustup-provided `rust-analyzer`. Tier B
  adapters provide supported read subsets; Tier C external adapters are
  detect-only until compatibility evidence promotes them.
- Release qualification runs a source-bound 30-minute mixed Tier A soak and
  retains its JSON report. The npm package smoke performs real TypeScript and
  Python semantic work; native packages must report degradation without
  starting a language server.

## Consequences

Semantic inspection is warm after the first request and deterministic enough to
cache against a workspace revision and content hash. Failure to initialize the
adapter degrades code intelligence without taking down the CLI.

Formatting, resource create/delete/rename edits, and arbitrary command-bearing
actions remain out of scope. The system does not implement a cross-process
daemon or install external language servers. Additional adapters must conform
to the owned runtime boundary and receive separate compatibility and packaging
evidence.

The npm distribution carries the pinned server as package dependencies. Native
standalone packaging needs a separate companion-runtime design before native
LSP support can be claimed; the CLI must continue to report this as degraded
rather than silently falling back to textual guesses.
