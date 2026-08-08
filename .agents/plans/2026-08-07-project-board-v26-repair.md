# Project Board v26 One-call Repair

## Outcome

Make the next Project Board canary complete in one implementation model
invocation while preserving deterministic verification, source readability,
scope, and visual-quality gates.

## Baseline

- Project Board v25 used five model invocations, including two implementation
  invocations and one failure reviewer.
- The dependent validation task was not batched because its writer declared
  both `read` and `write`; batching accepted only an exact `write` operation.
- The attached UI skill stated the 400-character limit, but the implementer did
  not run an executable readability check before finishing.

## Implementation

1. Treat a bounded writer with only `read` and `write` operations as batchable.
   Continue rejecting dependency, migration, and external inspection work.
2. Preserve the source semantic plan and evidence map while executing its
   bounded writer and covered validation task in one derived model batch.
3. Add `--source-readability-only` to the managed verifier and expose that
   exact preflight command in mutation-task contracts. The preflight does not
   create trusted evidence; final verification remains independent.
4. Rebuild and run one Project Board canary. Advance to Support Desk only after
   every functional, source, visual, evidence, latency, token, and invocation
   gate passes.

## Gates

- Orynt duration at most 300 seconds and total duration at most 360 seconds.
- Total input at most 360,000 tokens and at most three model invocations.
- Exactly one implementation invocation, no recovery, and no reviewer on pass.
- Managed verifier, external oracle, and visual review all pass.

## Non-goals

- Do not change prompt understanding, caching, reviewer policy, task-plan
  schemas, trusted-report schemas, or public CLI behavior.
- Do not weaken safety, approval, path scope, verification, readability, or
  visual gates.
- Do not commit, push, publish, or deploy.

## v26 Result

- Batching worked: the semantic implementation and validation tasks became one
  derived batch and produced exactly one implementation invocation.
- Orynt completed in 277,768 ms with 309,312 input tokens, no recovery, no
  reconnect, and no absolute-path rejection.
- The implementer ran the declared readability preflight, but its internal Git
  subprocess was denied by the Codex sandbox with `EPERM`. The model treated
  that as an environment limitation and continued.
- Final trusted verification and the external oracle independently rejected
  `styles.css` line 64 at 443 characters. Conditional failure review raised the
  final count to four invocations, and visual review did not run.
- The formal audit completed on the unchanged source digest. Project Board did
  not pass, so Support Desk was not run.

Do not run another canary until readability-only mode discovers task-owned
source files without spawning Git inside the model sandbox. The final trusted
verifier must retain Git-backed changed-file discovery.
