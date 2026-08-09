# Project Board v24 Repair Plan

## Outcome

Make one Orynt-clean Project Board canary pass the functional, source
readability, visual, evidence, latency, and token gates before starting the
Support Desk battle test.

## Current evidence

- v23 failed after 29.3 seconds because a ready repository-action
  understanding produced a conversational `answer` disposition.
- Headless execution now treats that contradiction as one bounded corrective
  retry. Conversational turns retain their existing answer behavior.
- v24 reached implementation and deterministic verification in 263.9 seconds
  with 343,535 input tokens, three invocations, one implementation invocation,
  no recovery, no reconnect, and no absolute-path rejection.
- v24 still failed final requirement coverage because `req-13` and `req-14`
  depended only on a model-proposed compound shell command that the managed
  verifier did not and must not execute.
- The external oracle also rejected `styles.css`: authored lines 4, 16, 17,
  18, and 19 exceeded 400 characters despite the attached UI skill.

## Repair lanes

1. Bind command evidence to executable verifier commands.
   - Reject unsafe, compound, placeholder, or unavailable command evidence at
     the active CLI planner boundary.
   - Prefer the managed repository verifier command for headless plans.
   - Preserve exact-command matching in final requirement coverage; do not
     claim that a model-proposed command ran when only a different command ran.
   - Add regressions for unsafe command rejection, one corrective retry, and
     coverage of safety and completion requirements by the managed verifier.

2. Make source readability an executable pre-verification invariant.
   - Extend the managed repository verifier to reject authored HTML, CSS, and
     JavaScript lines over 400 characters in changed frontend files.
   - Keep the external oracle as independent evidence.
   - Add focused fixtures for compacted CSS and properly formatted CSS.

3. Rebuild and validate.
   - Run focused CLI, Coding Apprentice, and verifier tests.
   - Run `bun test:cli`, `bun test:core`, `bun test:eval`, `bun build:cli`, and
     `git diff --check`.
   - Package a new CLI and record its exact source digest and binary hashes.

4. Run exactly one new Project Board canary.
   - Do not retry a failed trial under the same source binding.
   - Require functional oracle pass, source readability pass, desktop and
     mobile visual evidence, model visual-review pass, Orynt duration at most
     300 seconds, total duration at most 360 seconds, total input at most
     360,000 tokens, at most three invocations, exactly one implementation
     invocation, no recovery, and no absolute-path rejection.
   - Manually inspect both screenshots to calibrate the visual-review verdict.

5. Advance only after the gate passes.
   - If the Project Board canary passes and human calibration agrees, run one
     Orynt-clean Support Desk trial.
   - Otherwise stop, audit the new failure, and update this plan with evidence.

## Non-goals

- Do not weaken the oracle, evidence coverage, source readability, safety,
  approval, path-scope, or visual-review gates.
- Do not add frontend dependencies or modify the frozen desktop adapter.
- Do not commit, push, publish, or deploy.

## v25 result

- The command-evidence repair worked: the approved plan used the exact managed
  verifier command, so `req-13` no longer failed because of command mismatch.
- The managed readability gate worked and rejected `styles.css` lines 17 and
  18 before publication. The external oracle independently reported the same
  source-readability failure.
- The run failed the advancement gate: 288,552 ms Orynt time, 292,992 ms total,
  362,254 input tokens, five invocations, two implementation invocations, one
  reviewer invocation, and no reconnect or absolute-path rejection.
- The planner created a dependent read-only validation task even though the
  change was one bounded greenfield implementation. That task caused a second
  implementer call and helped exceed both invocation and token budgets.
- A trusted verifier that exits nonzero now retains `command_failed` evidence
  instead of being mislabeled `trusted_evidence_invalid`; a pass report remains
  mandatory after exit zero.

Do not run another Project Board canary until the next repair prevents a
redundant validation task from becoming a model invocation and makes source
readability part of the implementer's final self-check rather than relying on
post-implementation rejection.
