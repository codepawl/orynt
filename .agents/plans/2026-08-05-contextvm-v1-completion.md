# ContextVM V1 completion before performance optimization

## Objective

Make ContextVM the single runtime memory authority for every Orynt agent
inference. Complete correctness, lifecycle, recovery, audit, deterministic
evaluation, and both supported provider integrations before tuning latency or
throughput.

## Locked decisions

- Context packs replace `AgentEvidencePacketV1` and
  `AgentIntelligenceContextV1` in production runtime paths.
- Codex CLI/app-server and the Responses API must both pass the same
  provider-neutral memory protocol.
- Deterministic gates are always required. Source-bound live evidence for both
  providers is required before declaring ContextVM production-ready.
- The desktop adapter remains frozen.
- Semantic retrieval and LLM-assisted extraction remain optional until a
  correctness-preserving benchmark proves their value.

## Correctness work

1. Add strict invocation and readiness contracts. A memory readiness result is
   only `READY` or bounded `NEED_MEMORY`; it cannot grant execution authority.
2. Extend persisted context packs with structured coverage, selection and
   exclusion reasons, sensitivity, principal scope, invocation lineage, and a
   conservative token upper bound.
3. Add forward-only migrations after schema v7 for invocation traces,
   candidate decisions, and sensitivity metadata. Keep old records readable
   and never edit applied migrations.
4. Fix recovery so obligations are isolated per task. Reopen raw provenance
   recursively for high-risk use and fail closed on missing, cyclic,
   unauthorized, or over-budget evidence.
5. Add one `LocalIntelligenceRuntime` inference coordinator. It appends the
   invocation request, builds the root pack, resolves at most three memory
   faults through an injected provider decision driver, returns the ordered
   root and delta context, and persists the result.
6. Route prompt understanding, coordinator, planner, helper, implementer,
   reviewer, and recovery calls through that coordinator. Prompt understanding
   receives a policy/current-user-only pack. Non-agent generation must record
   an explicit memory exemption.
7. Use the CLI session ID as the ContextVM session ID and task-specific IDs for
   child roles. Checkpoint after user input, before provider dispatch, after
   tool/model results, after verification, and at task/session close.
8. Recover before resumed inference. Preserve `in_doubt` transactions without
   redispatching them. Provider compaction may rotate provider context but must
   not reset ContextVM state.
9. Replace legacy context artifacts and request fields with invocation and
   context-pack artifacts. Remove all production legacy callers and writers;
   retain only read-only migration decoders and fixtures.

## Gates

- Unit, deterministic property, fault-injection, migration, Bun/Node parity,
  CLI integration, restart, and no-redispatch tests pass.
- The 100,000-event evaluation passes the plan's provenance, recovery,
  temporal, contradiction, recall, multi-hop, page-fault, summary, and budget
  thresholds.
- `bun test:cli`, `bun build:cli`, and the full root test pass when feasible.
- CI runs all deterministic ContextVM gates. A separate opt-in live gate
  validates both providers on a disposable repository and stores redacted,
  source-bound evidence.
- Architecture, policy, schema, operations, recovery, and evaluation
  documentation is complete.
- Repository search finds no production use of the legacy evidence packet or
  intelligence context.

## Performance phase

Only after the correctness report passes, freeze output and recovery hashes,
measure P50/P95 baselines, then optimize incremental checkpoints, batched
projection/index writes, retrieval queries, tokenization, and cache/prefetch in
that order. Every optimization must preserve the frozen correctness oracle.
