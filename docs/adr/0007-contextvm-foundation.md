# ADR 0007: ContextVM foundation

## Status

Accepted for Milestone A (ContextVM phases 0 and 1). The derived-memory
authority boundary is superseded by ADR 0008 for Milestone B.

## Decision

ContextVM stays inside Orynt.s Bun 1.3.14 and TypeScript architecture.
Storage-independent contracts live in `@codepawl/shared`, the SQLite/archive
implementation lives in `@codepawl/memory`, and `LocalIntelligenceRuntime`
remains the only composition root used by product adapters.

Canonical state is stored below:

```text
<stateRoot>/intelligence/contextvm/
├── db/contextvm.sqlite3
├── archive/sha256/
└── reports/
```

SQLite uses WAL, foreign keys, strict tables, checksummed migrations, and full
synchronous durability. Evidence is stored in a SHA-256-addressed archive and
is optionally compressed losslessly with Node's built-in Zstd support. Archive
objects are durable before a referencing database transaction commits.

ContextVM uses Orynt's existing redaction policy. Immutable evidence is exact
after mandatory policy redaction; credentials are not retained. Retrieved
memory remains advisory and cannot create repository authority, permissions,
tools, approvals, or destructive scope.

Milestone A does not replace `memory/store-v3.json`. That store remains the
authority for derived episodic, semantic, and procedural memory until Phase 2
can migrate it with a journal, immutable backup, round-trip verification, and
an atomic authority switch. There is no permanent dual-write mode.

## Adaptations from the source design

- No Rust crates, Tantivy, daemon, or new production dependency is introduced.
- State is runtime-owned rather than written into each source repository.
- Operations extend `orynt intelligence`; no overlapping `orynt memory`
  namespace is created.
- Existing bounded context, cognitive checkpoints, and run artifacts are
  retained for later MMU, recovery, and runtime-integration phases instead of
  being duplicated now.

## Failure boundary

Migration checksum mismatch, SQLite corruption, missing archive content,
conflicting duplicate ingestion, and ambiguous legacy authority fail closed.
Verification reports orphan objects but never deletes them automatically.
