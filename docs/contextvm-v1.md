# ContextVM v1

ContextVM is Orynt's only model-context authority. Every active CLI inference
must receive a persisted Context Pack before the provider is called. The
desktop application remains a compatibility adapter and does not own ContextVM
behavior.

## Invocation lifecycle

1. The CLI assigns a stable invocation ID, role, provider, model, session, and
   bounded context budget.
2. `LocalIntelligenceRuntime.resolveInvocationContext` appends the inference
   request to the immutable event stream and assembles a root Context Pack.
3. The readiness decision uses schema v2. It can return only `READY` or a
   bounded `NEED_MEMORY` request; it cannot answer or act for the real model.
4. At most three non-repeating page faults may add delta packs. Failure,
   malformed output, unresolved evidence, or budget exhaustion abstains.
5. The ordered root and delta packs are injected into the actual Codex CLI,
   Codex app-server, or Responses API prompt.
6. The invocation is checkpointed. Recovery replays the event suffix after the
   newest valid checkpoint and keeps in-doubt obligations open.

Context text is separated into `TRUSTED_AUTHORITY` and
`UNTRUSTED_EVIDENCE` envelopes. Evidence never expands tools, paths,
permissions, approvals, or authority.

## Storage and access

The SQLite database at
`<stateRoot>/intelligence/contextvm/db/contextvm.sqlite3` is authoritative.
Schema migrations are append-only. Schema v8 adds memory sensitivity,
owner-scoped access, and the initial invocation tables. Schema v9 adds the
immutable invocation audit projection and provider-dispatch attempts, including
transport/model identity, ordered pack lineage, checkpoint linkage, terminal
reason, and `in_doubt` state.
Schema v10 separates readiness and real-inference attempts, records recovery
parent lineage, and requires explicit audit exemptions for non-agent model
generation.

Derived memory with `secret` or `credential` sensitivity is rejected.
Retrieval defaults to `public` and `internal`. `personal` and `restricted`
memory requires both explicit sensitivity allowance and the matching owner
principal. Secret and credential retrieval is always rejected.

## Budget and provenance

The `utf8-upper-bound-v1` estimator counts UTF-8 bytes as a conservative token
upper bound. Packs must fit the hard budget before provider invocation.
Coverage and page-fault resolution use structured entity, source-type, and
evidence-quality metadata, never substring matching. High-risk consolidated
memory must reopen raw event provenance.

## Operations

Use:

```sh
bun run test:contextvm:correctness
bun run test:contextvm:parity
bun run test:contextvm:scale
bun build:cli
```

`test:contextvm:parity` executes the same recovery and retrieval fixture under
Bun and Node. `test:contextvm:scale` is a performance characterization gate and
must not be used to waive a correctness failure.

For incident recovery, preserve the database and archive together, run the
ContextVM verification command, and recover from the newest valid checkpoint.
Never delete or rewrite migrations 1–10. If verification reports an integrity
failure, stop model execution and retain the state root for inspection.

## Removed legacy paths

The active runtime no longer imports or injects `AgentIntelligenceContextV1`
or `AgentEvidencePacketV1`. Their names remain deprecated type aliases only for
migration decoders and fixtures. Runtime retrieval uses
`ContextVmRetrievalViewV1`; exact-revision source closure uses
`RevisionBoundEvidenceClosureV1` and is assembled into the single persisted
root Context Pack before readiness dispatch. Repository runs persist
`context-pack.json`; legacy JSON artifacts are not context authorities.
