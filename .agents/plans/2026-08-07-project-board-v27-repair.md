# Project Board v27 Git-free Readability Preflight

## Outcome

Make the managed source-readability preflight work inside the Codex sandbox
without spawning Git, while preserving Git-backed final verification.

## Baseline

- Project Board v26 completed in 277,768 ms with 309,312 input tokens.
- Batching produced exactly one implementation invocation.
- The preflight attempted to spawn Git, received `EPERM`, and did not expose
  the 443-character CSS line to the implementer.
- Final trusted verification and the external oracle both rejected the same
  source line.

## Implementation

1. Capture SHA-256 digests for authored source under the task path envelope
   before model execution.
2. In `--source-readability-only` mode, walk the task-owned paths directly and
   inspect only new or changed authored source.
3. Bound discovery to 2,000 authored files and 64 MiB, prune generated paths,
   exclude explicit `.min.*` files, and never follow symbolic links.
4. Keep the final trusted verifier report at schema version 2 and retain
   Git-backed changed-file discovery outside the model sandbox.

## Gates

- Focused regression proves the preflight succeeds with Git unavailable,
  ignores unchanged legacy source, rejects a changed line over 400 characters,
  rejects newly authored manual minification, and does not rewrite trusted
  evidence.
- Existing Coding Apprentice, contract, core, capability, CLI, evaluation,
  packaging, and executable lifecycle gates remain green.
- The next Project Board canary must use the same prompt, seed, model, and
  configuration as v26.
- Advance only with at most 300 seconds Orynt time, at most 360 seconds total,
  at most 360,000 input tokens, at most three invocations, exactly one
  implementation invocation, no recovery, and no reviewer on pass.

## Non-goals

- Do not change batching, planning, reviewer, cache, public CLI, task-plan, or
  trusted-report contracts.
- Do not weaken approval, scope, verification, oracle, or visual-quality gates.
- Do not commit, push, publish, or deploy.

## v27 Result

- The Git-free preflight worked as intended. It rejected the implementer's
  compact CSS, the implementer reformatted it, and the second preflight passed
  without `EPERM`. Final trusted verification independently passed the same
  authored source.
- The run used three model invocations with exactly one implementation
  invocation, no recovery, no reviewer, no reconnect, and no path rejection.
- The external oracle rejected the product because it initialized two starter
  tasks. After the oracle created one task, three `task-card` elements existed
  instead of one.
- Orynt took 364,573 ms and total wall time was 370,229 ms. The implementer
  consumed 258,837 ms and the coordinator consumed 85,870 ms.
- The implementer read the generic landing-page `design-taste-frontend` skill
  even though that skill explicitly excludes dashboards and Orynt had attached
  the board-specific `product-ui-design` skill.
- Formal audit completed on source digest
  `1eadf3723684048247eaa2a820bdae86845f9d8af089c2d0024b6c4dd002f5e8`.
  Project Board did not pass, so Support Desk was not run.

Do not retry this digest. The next repair should bind the selected product UI
skill as the only task-specific design guidance, forbid fabricated starter
data, and reduce coordinator plus implementer latency without weakening the
functional, readability, scope, or visual gates.
