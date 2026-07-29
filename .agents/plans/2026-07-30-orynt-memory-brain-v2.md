# Orynt Memory and Cognitive Brain v2

Status: phase 1 implemented; phases 2-3 integration remains

## Objective

Unify the CLI and desktop repository agent around one resumable cognitive
runtime with cross-run memory, deterministic policy and budget enforcement,
durable evidence, and user-controlled memory lifecycle. Browser, general
desktop, host filesystem, and autonomous background execution remain blocked.

## Decisions

- Working memory is ephemeral, CLI session summaries remain redacted session
  state, and durable repository memory uses the canonical memory package.
- Explicit user preferences and verifier-backed repository facts may become
  active automatically only when they are non-sensitive, conflict-free, and
  redaction-clean. Model-inferred or procedural memory remains review-gated.
- Trash removes an item from retrieval immediately; restore is available for
  30 days, after which content is purged and only a minimal audit tombstone
  remains.
- Memory is advisory and cannot expand repository paths, commands,
  permissions, budgets, approvals, or destructive authority.
- Cognitive traces contain structured decisions and evidence references, not
  hidden reasoning or raw secrets.

## Delivery order

1. Versioned memory contracts, migration, safe persistence, retrieval, and
   lifecycle.
2. Resumable cognitive checkpoints, events, usage deltas, and budget stops.
3. Coding Apprentice and CLI integration using real cross-run memory.
4. Tauri-backed memory operations, approval continuation, trace evidence, and
   desktop management UI.
5. Artifact-derived evaluation gates, compatibility cleanup, and documentation.

Each phase must pass its package tests and preserve legacy memory stores,
artifact manifests, run snapshots, and CLI session readers before the next
phase becomes default.

## 2026-07-30 implementation checkpoint

- Complete: versioned Memory v2, legacy migration, advisory retrieval,
  constrained auto-activation, revision conflicts, expiry, trash/restore/purge,
  tombstones, hashed observations, and immutable extraction artifacts.
- Complete: resumable cognitive runtime primitives with durable-shaped
  checkpoints/events, approval nonce and revision binding, usage accounting,
  and pre-execution budget stops.
- Complete: Coding Apprentice cross-run retrieval feeds approved memory into
  the Codex contract as advisory context; cognitive trace artifacts and desktop
  budget transport are wired.
- Complete: desktop episode/rule endpoints now use the packaged persistent
  memory sidecar instead of demo objects.
- Remaining: make the resumable runtime the sole executor across CLI and
  desktop, persist checkpoint compare-and-swap across processes, expose the
  full semantic-memory lifecycle UI, schedule purge, and derive eval gates from
  persisted artifacts.
