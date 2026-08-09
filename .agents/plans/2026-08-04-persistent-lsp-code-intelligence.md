# Persistent LSP and agent-native code intelligence

## Decisions

- Implement in the existing Node.js 26 and TypeScript architecture.
- Own persistent language-server processes for one CLI process lifetime; do not
  introduce a background daemon.
- Ship TypeScript support first and bundle pinned server/runtime resources.
- Deliver a read-only MVP before semantic mutations or worktree synchronization.
- Treat external LSAP as a design reference only. Expose Orynt-owned typed
  contracts under `orynt.code-intel`, with structured JSON as the canonical
  representation.

## Phases

1. Add an ADR/integration map and prove packaged TypeScript language-server
   startup and shutdown.
2. Add `@codepawl/lsp-runtime` with supervised stdio JSON-RPC sessions,
   capabilities, cancellation, bounded restart, document synchronization,
   freshness, diagnostics, cache, and TypeScript adapter.
3. Add `@codepawl/code-intel-runtime` with snapshot-bound selectors, ambiguity,
   budgets, provenance, pagination, and the read-only `code_status`,
   `code_search`, `code_inspect`, `code_relations`, `code_diagnostics`, and
   `code_context` tools.
4. Create one CLI-owned code-intelligence host, attach it through the existing
   capability router for coordinators/helpers/reviewers, expose status in
   `/status` and `/doctor`, and shut it down through the existing CLI lifecycle.
5. Add hermetic protocol tests, real bundled TypeScript server fixtures, CLI
   PTY coverage, package smoke coverage, and warm-query performance evidence.

## Safety boundaries

- Never execute a language-server command supplied by repository content.
- Deny unsolicited `workspace/applyEdit` and all code-intelligence mutations.
- Keep paths inside the canonical workspace; label stale, warming, partial,
  fallback, and unsupported evidence explicitly.
- Keep prompt understanding tool-free and fail closed.
- Do not add new capability work to the frozen desktop adapter.

## Gates

- Same process serves multiple semantic requests and exits without leaks.
- Ordered document notifications and Unicode coordinate property tests pass.
- Same-name symbols return ambiguity rather than silent selection.
- Every result includes revision, epoch, fingerprint, freshness, provenance,
  truncation, and bounded output.
- External edits become visible after a sync barrier.
- `code_context` composes multiple semantic/file operations without an LLM call.
- Package, CLI unit, deterministic E2E, PTY, and native/npm smoke gates pass.
