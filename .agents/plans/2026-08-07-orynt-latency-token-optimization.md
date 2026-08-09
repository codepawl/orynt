# Orynt Latency and Token Optimization

## Goal

Reduce foreground repository-run latency and provider token use without
weakening prompt understanding, approval, sandbox scope, deterministic
verification, or high-risk review.

## Baseline

- Calculator clean p50: 557,503 ms.
- Raw Codex calculator wall time: 113,510 ms.
- Visible Orynt calculator usage averages about 606,875 input and 18,026
  output tokens, excluding complete planner and reviewer accounting.
- Battle trials requested `gpt-5.6-luna` at medium effort, while the runtime
  selected `gpt-5.5` at high effort because a negated safety clause triggered
  the high-risk text floor.
- One semantic task currently creates one model process, and conditional
  reviewer policy currently behaves like always.

## Implementation

1. Record requested and actual bindings, correct semantic task attempt
   metadata, phase timings, and provider token usage in durable run artifacts.
   Store task-scoped battle audits without overwriting other task summaries.
2. Make risk-text routing negation-aware and re-route implementation after the
   bound task plan exposes structured operations and path count.
3. Add an internal bounded execution-batch layer. Keep the semantic task graph
   and per-task evidence intact while eligible low-risk single-writer tasks run
   in one controlled model invocation. Execute command-only validation tasks
   through the trusted verifier instead of a model.
4. Implement reviewer policies exactly: always, failure-only, and conditional.
   Conditional review runs for failure, recovery, scope warnings, sensitive
   operations, or positive high-risk work, but skips a bounded low-risk
   verifier pass.
5. If the first three changes do not bring Calculator clean p50 below 300
   seconds and total provider input below 300,000 tokens, remove duplicate raw
   prompt serialization and optimize stable prompt caching while retaining the
   separate prompt-understanding gate.

## Validation

- Add focused regression tests for routing, batching, deterministic validation,
  reviewer policy, usage aggregation, and battle audit durability.
- Run contracts, core, CLI, eval, CLI build, CLI E2E, docs checks, and
  `git diff --check`.
- Rebuild the executable and run Calculator Standard-5. Require 5/5 correctness,
  actual Luna/medium binding, clean p50 at most 300 seconds, at most one
  implementer call, and no reviewer call on a normal low-risk pass.
- Only after that gate passes, resume the full Project Board Standard-3 matrix.
