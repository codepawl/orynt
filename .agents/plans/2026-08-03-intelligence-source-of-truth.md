# Intelligence Source of Truth

## Summary

- Make `<stateRoot>/intelligence` the only active root for CLI memory and
  improvement state.
- Keep one versioned memory store and one versioned improvement store, with
  content-addressed artifacts beside their owning store.
- Migrate legacy state automatically with a verified, recoverable journal and
  retain the original files as non-authoritative backup evidence.
- Give agents a bounded, provenance-rich context bundle and a namespace-bound
  read-only search tool instead of raw JSON paths or ambiguous summaries.

## Required behavior

- Runtime adapters obtain stores and paths from one intelligence composition
  root; they must not construct canonical paths or parse stores directly.
- Improvement candidates remain shadow-only until explicit operator approval.
- Run artifacts are derived projections and are never inputs to later runs.
- Invalid schemas, active artifact digest failures, and incomplete migrations
  fail closed with an explicit status instead of silently dropping context.

## Validation

- Cover clean initialization, legacy migration and recovery, CAS conflicts,
  context selection/exclusion, read-only search, promotion/rollback, and
  architecture path guards.
- Run contracts, memory, capability, intelligence, coding-apprentice, CLI,
  controlled fixture, full workspace tests, and CLI build.
