# Intelligence state

Orynt has one runtime-owned source of truth for agent memory and local
improvements. Product adapters must use `LocalIntelligenceRuntime`; they must
not parse or update these JSON files directly.

## Canonical layout

Given the normal Orynt `stateRoot`, version 2 of the layout is:

```text
stateRoot/
├── intelligence/
│   ├── contextvm/
│   │   ├── db/contextvm.sqlite3
│   │   ├── archive/sha256/
│   │   └── reports/
│   ├── memory/
│   │   └── (legacy JSON migration staging only)
│   ├── improvements/
│   │   ├── store-v2.json
│   │   └── artifacts/
│   └── migrations/
└── runtime/
    └── cognitive-state/
```

`contextvm/db/contextvm.sqlite3` is the only durable memory database and
immutable event index.
`improvements/store-v2.json` is the only improvement ledger and contains
outcomes, shadow candidates, explicit activation targets, rollback state, and
an audit log in one compare-and-swap envelope. Per-run
`memory-extraction-summary.json` files are redacted evidence summaries, not
memory stores.

ContextVM schema v2 stores versioned memory pages, provenance, validity,
relations, supersession, and contradictions. The compatibility `MemoryStore`
envelope is also held transactionally in SQLite so existing retrieval and
lifecycle callers retain their behavior. Runtime code must not dual-write
derived memory or treat ContextVM events as an authorization source.

## Agent context contract

Before a repository run, the intelligence runtime creates a bounded
`AgentIntelligenceContextV1`. Every selected item includes its lifecycle state,
confidence, source revision, run/artifact provenance, namespace, and an
advisory-only marker. The bundle explicitly reports empty/partial state, omitted
items, and gaps so the agent can distinguish missing knowledge from facts.

Agents may call the read-only `intelligence_search` tool for additional
approved, namespace-scoped context. Neither the context nor the tool expands
repository scope, tools, permissions, approval, or destructive authority.
Run artifacts persist `intelligence-context.json` for review.

ContextVM also defines a provider-neutral, bounded `READY` / `NEED_MEMORY`
protocol. A decision may request at most three fault rounds. Every accepted
fault and resolution is stored as an immutable event; malformed, repeated,
unresolved, or over-budget requests end in explicit abstention. Continuation
packs preserve lineage and add only new evidence.

Retrieved pages use a disposable deterministic L2 cache. The CLI default is
64 MiB. Weighted-LRU eviction and bounded prefetch operate only on in-memory
representations and never delete SQLite rows or archive objects. `orynt
intelligence status` reports cache size, hits, misses, evictions, pins, and
prefetch loads.

## Checkpoint and recovery

ContextVM schema v6 adds immutable state checkpoints. Each checkpoint records
the event range it covers, the deterministic reducer version, a canonical state
hash, and the active goal, tasks, constraints, obligations, artifact versions,
and terminal state reconstructed from that range. Checkpoints accelerate
recovery but never replace the event log.

Recovery tries the latest verified checkpoint, then earlier checkpoints, then a
full event replay. Corrupt checkpoints are ignored with explicit warnings.
Missing or non-contiguous canonical events fail closed. An unfinished tool
transaction is reported as `in_doubt`; recovery does not execute it again.

ContextVM schema v7 records conservative consolidation runs and output
generations. Derived summaries, decisions, procedures, and failure patterns use
direct event provenance. Summary-of-summary is disabled, repeated patterns
require three identical sources, and soft-deleted outputs can be regenerated
without changing their source events.

High-risk context assembly reopens the raw event sources behind a consolidated
page. A summary without loadable raw provenance remains insufficient evidence.

## Improvement lifecycle

Verified outcomes may be recorded automatically. Improvement candidates stay in
shadow review and do not affect live behavior until an operator explicitly
approves a candidate. Activation and rollback update the same versioned store;
there is no separate active registry and no automatic promotion path.

Orynt does not synthesize an improvement target or hypothesis from unrelated
memory fields. Candidate creation requires explicit, typed evidence. This
prevents the agent from guessing when lineage is incomplete or ambiguous.

## Migration and operations

Initialization migrates these legacy locations when present:

- `stateRoot/memory/memory-store.json`
- `stateRoot/intelligence/capability-ledger-v1.json`
- `stateRoot/intelligence/improvements/active-v1.json`
- `stateRoot/memory/cognitive-state/`

Canonical stores are validated before legacy data is moved to
`intelligence/migrations/legacy-v1/legacy/`. A journal records staging,
commit, completion, or a blocked migration. Invalid or unsupported state fails
closed; runtime code must not silently create a competing store.

The subsequent `contextvm-memory-v1` migration archives the exact redacted JSON
v3 snapshot, imports every item with provenance, verifies a lossless round-trip,
and moves the JSON store into its migration backup. SQLite authority is exposed
only after this completes.

Operators can inspect state with:

```text
orynt intelligence init [--json]
orynt intelligence status [--json]
orynt intelligence verify [--json]
orynt intelligence inspect <memory-id> [--json]
orynt intelligence checkpoint <session-id> [--json]
orynt intelligence recover <session-id> [--json]
orynt intelligence consolidate <session-id> --namespace <namespace> [--task <id>] [--json]
orynt intelligence backups [--json]
orynt intelligence cleanup <backup-id> --yes
```

Cleanup requires the exact backup directory name and explicit `--yes`.
