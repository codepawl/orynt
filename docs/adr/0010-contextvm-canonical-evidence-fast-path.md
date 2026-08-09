# ADR 0010: ContextVM Canonical Evidence Fast Path v1

## Status

Accepted for the first production milestone.

## Decision

Orynt records each redacted, normalized run event in a per-run append-only
JSONL journal before adding it to the live run stream. The journal is the
canonical replay source. ContextVM SQLite events and memory pages are
idempotent projections, not an independent authority. The compatibility
`run-events.json` file is written only after the journal and live stream have
been checked for identical source IDs and sequences.

The v1 repository identity is local-checkout scoped. It hashes the canonical
real path of the Git common directory; moving a repository may therefore
produce a new identity. Clones and forks do not share memory by default.
Clean revisions bind to HEAD. Dirty revisions bind to HEAD plus a deterministic
digest covering Git status, staged and unstaged binary diffs, and relevant
untracked bytes. Retrieval fails open for repository execution but closed for
revision-bound evidence: an incomplete identity produces an explicit gap and
no path-only fallback.

Canonical events are observations. They do not become preferences, approved
facts, procedural rules, permissions, or authority grants. Existing Memory v2
candidate, review, activation, sensitivity, expiry, Trash, restore, purge,
tombstone, and revision-conflict rules remain authoritative. Legacy unscoped
records remain inspectable but are not automatically injected.

The active CLI builds a deterministic `AgentEvidencePacketV1`. Every injected
item is advisory, exact-revision scoped unless it is an active explicit user
preference, and closed to at least one canonical source event. Rendering is
bounded, redacted, content-addressed, and persisted with the run artifacts.
Canonical evidence cannot expand tools, paths, permissions, approvals, or
authority. The verifier remains the final success authority.

Journal appends use a single complete JSON line followed by `fsync`. Reopening
validates schema, content hashes, strict sequence adjacency, source replay, and
the final newline. Identical replay deduplicates; conflicting replay fails.
Projection lag is retained in the journal and replayed before terminal
completion. A dispatched action is never redispatched to repair evidence.
Unresolved evidence conflicts are excluded from primary items and rendered as
warnings; verified evidence cannot lose merely to a higher lexical model score.

Redaction occurs before journal serialization, evidence hashing, indexing,
excerpt construction, and model rendering. Source excerpts and packet budgets
are hard bounded.

## Deferred work

Dense retrieval, embeddings, vector databases, learned routing, graph
propagation, LSP/AST persistence, test-to-symbol graphs, cross-revision reuse,
cross-clone identity, archive garbage collection, real tokenizer accounting,
and desktop migration are deferred. The frozen desktop compatibility
architecture is unchanged.
