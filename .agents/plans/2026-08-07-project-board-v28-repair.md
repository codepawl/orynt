# Project Board v28 Selected-skill and Empty-state Repair

## Outcome

Make the Project Board canary use only Orynt's selected product UI guidance,
start with empty user data, and avoid avoidable design-skill exploration and
source-formatting rework.

## Baseline

- Project Board v27 used three invocations and passed managed readability.
- The oracle failed because two fabricated starter tasks existed before the
  oracle created its task.
- Orynt took 364,573 ms: 85,870 ms coordination and 258,837 ms implementation.
- The implementer loaded a landing-page skill that explicitly excluded product
  boards even though Orynt attached `product-ui-design`.

## Implementation

1. Bind selected Agent Skill snapshots as the complete task-specific guidance
   in mutation and recovery work contracts.
2. Forbid discovery or application of another skill package unless the
   operator selected it for the run.
3. Require product UI greenfield workflows to start with empty user data and
   forbid fabricated starter, demo, sample, mock, or placeholder records.
4. Require readable formatting while authoring, before the first preflight.

## Gates

- Contract and skill-registry regressions prove the new guidance is present
  without expanding authority.
- Existing core, CLI, evaluation, packaging, and executable gates remain green.
- Run one Project Board canary with the same prompt, seed, model, and effort.
- Advance only when functional, source, visual, evidence, latency, token, and
  invocation gates all pass.

## Non-goals

- Do not change model routing, coordinator flow, batching, verifier, oracle,
  task-plan schemas, trusted-report schemas, or public CLI behavior.
- Do not commit, push, publish, or deploy.
