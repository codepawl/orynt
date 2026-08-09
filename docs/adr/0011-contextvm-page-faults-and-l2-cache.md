# ADR 0011: ContextVM bounded page faults and deterministic L2 cache

## Status

Accepted for Milestone E (ContextVM phases 6 and 7).

## Decision

ContextVM exposes a provider-neutral `READY` / `NEED_MEMORY` decision
protocol. Missing-memory requests are strictly bounded and normalized before
retrieval. A decision may perform at most three fault rounds. Repeated faults,
malformed requests, unresolved evidence, and exhausted budgets produce an
explicit abstention rather than an inferred answer.

Each accepted fault and its resolution is appended to the immutable event log.
Continuation context packs reference their root and previous packs, contain
only newly loaded evidence, and retain the same hard per-pack token budget.
The cumulative fault budget is at most three times that budget and never more
than 12,000 estimated tokens.

The local memory store owns a process-local deterministic weighted-LRU cache.
Its default limit is 64 MiB, prefetch is limited to 16 related pages and one
quarter of the cache, and scoped pins protect pages during active resolution.
Access ordinals, not wall-clock time, drive eviction. Per-retrieval cache
metrics are separate from stable candidate load reasons, cache hits never
affect ranking, and eviction never mutates SQLite, indexes, or the archive.

## Consequences

- The protocol can be tested without a live provider and later attached to
  Responses or Codex adapters in Phase 12.
- Summary and model-inferred pages cannot independently satisfy a verified
  evidence request.
- Cache state is disposable after restart; metrics and retrieval reasons make
  its behavior inspectable.
- Page-fault evidence remains advisory and cannot expand repository scope,
  tools, permissions, approval, or execution authority.
