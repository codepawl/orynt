# ADR 0008: ContextVM versioned memory authority

## Status

Accepted for Milestone B (ContextVM phase 2).

## Decision

Derived episodic, procedural, and semantic memory is authoritative in
ContextVM SQLite schema v2. `SqliteContextVmMemoryStore` preserves the existing
`MemoryStore` lifecycle and retrieval contract while persisting a versioned
envelope plus provenance-backed memory pages. Product adapters receive this
store from `LocalIntelligenceRuntime`; they must not construct a JSON store.

Every memory page has at least one event, artifact, or memory source. Legacy
JSON records use the exact redacted migration snapshot in the content-addressed
archive as their source, with a locator for the original collection and item.
Legacy items without an explicit subject and predicate remain unkeyed rather
than receiving an inferred fact identity.

Fact conflicts use the fixed evidence order: current user, verified tool,
accepted decision, derived state, summary, then model inference. Higher
priority evidence supersedes lower priority evidence and closes its validity
interval. Equal-priority differences remain unresolved and are excluded from
authoritative context selection until resolved.

## Migration and compatibility

`contextvm-memory-v1` imports `memory/store-v3.json`, verifies an exact
round-trip, and only then moves the JSON store and managed artifacts into its
read-only migration backup. The journal is resumable. Conflicting ContextVM
and JSON state without a matching completed import fails closed.

There is no dual-write mode. `LocalJsonMemoryStore` remains only as a legacy
decoder and compatibility fixture; active CLI repository runs receive
`SqliteContextVmMemoryStore`.

## Invariants

SQLite foreign keys, checksummed migrations, content hashes, provenance
completeness, validity ordering, contradiction consistency, and supersession
cycles are covered by `orynt intelligence verify`. ContextVM memory remains
advisory and cannot grant tools, repository scope, approvals, or destructive
authority.
