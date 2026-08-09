# ADR 0012: ContextVM checkpoint, recovery, and conservative consolidation

## Status

Accepted for Milestone F (ContextVM phases 8 and 9).

## Decision

ContextVM SQLite and its immutable event stream remain the recovery authority.
State checkpoints are immutable, content-hashed projections of ordered events;
they are acceleration points, not replacement evidence. Recovery validates the
latest checkpoint and its source range, falls back to an earlier checkpoint or
full replay when necessary, and never redispatches an unfinished tool
transaction. Such transactions remain explicit `in_doubt` obligations for a
later runtime or operator decision.

The state reducer is deterministic and provider-independent. Its v1 projection
contains the active goal, task states, constraints, unresolved obligations,
artifact versions, terminal status, and the event sequence through which the
state was reconstructed. Checkpoint and recovery actions append audit events.

Consolidation produces new advisory memory pages from exact structured claims.
Every claim has direct raw-event provenance. Session and task summaries,
accepted decisions, repeated procedures, and repeated failure patterns are
idempotent for the same input. Summary-of-summary is disabled. Discarding a
derived output is a soft deletion; the next run creates a new generation while
the raw events and older lineage remain intact.

High-risk context assembly reopens the raw event sources of consolidated pages.
If those sources cannot be loaded within the context budget, the pack reports a
gap instead of treating the summary as verified evidence.

## Compatibility boundary

The existing JSON cognitive checkpoint and CLI session snapshot remain
compatibility state for their current consumers. They are not ContextVM
recovery authority and are not duplicated into another JSON store. Milestone G
will attach safe-boundary checkpoint creation and process restart continuation
after runtime parity is demonstrated.

## Defaults

- repeated patterns require three identical structured sources;
- event-threshold consolidation requires 250 source events;
- checkpoint history and raw evidence are retained;
- no LLM, embedding provider, or remote service participates in recovery or
  consolidation.
