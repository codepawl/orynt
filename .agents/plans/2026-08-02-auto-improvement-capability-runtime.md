# Auto-improvement capability runtime

## Objective

Add a local-first capability router and verifier-gated improvement loop that
reduces manual skill/app attachment, preserves Orynt's authority boundary, and
supports adaptive 1–4 lane orchestration.

## Decisions

- Keep episodic evidence, semantic memory, learned procedures, and routing
  metadata as separate stores connected by immutable provenance.
- Auto-attach only installed, connected, healthy read-only capabilities.
  Bundle side effects for normal approval; never auto-install or authenticate.
- Default Auto Improve to `auto`, but require warm-up, held-out shadow evidence,
  canary evidence, correctness/latency gates, and automatic rollback.
- Never auto-change installed packages, credentials, permission, trust,
  approval policy, repository scope, destructive allowances, or promotion
  gates.
- Allow parallel implementers only with explicit disjoint path ownership.
  Keep child depth at one and concurrency configurable from one to four.

## Implementation

1. Add versioned capability, selection, outcome, improvement, settings, and
   benchmark contracts.
2. Add `@codepawl/capability-runtime` with deterministic hard filtering,
   bounded deferred disclosure, promotion/rollback gates, paired Hermes release
   evaluation, and a CAS-backed local outcome ledger.
3. Add the explicit `auto-improve` built-in skill as procedural guidance; keep
   persistence and authorization in runtime code.
4. Persist Intelligence settings in desktop and CLI. Expose Auto Improve,
   read-only routing, subagent mode, and maximum concurrency.
5. Extend orchestration validation and scheduling for dependency-ready,
   disjoint writers with a maximum concurrency of four.

## Acceptance

- Capability, skill-registry, shared, cognitive-kernel, CLI, desktop, and Tauri
  focused tests pass.
- Desktop and CLI builds pass.
- Auto-promotion fails closed on weak evidence or immutable targets.
- Hermes release status cannot pass without at least 30 matched trials,
  a 10-point correctness advantage, declared latency/token targets, zero median
  manual attachment, and an Orynt safety pass.
