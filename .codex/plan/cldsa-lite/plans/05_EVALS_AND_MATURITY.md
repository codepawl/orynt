# Evals, Learning Gates, and Maturity

## Why this exists

CodePawl must not claim an agent is learning simply because it stores chat history. Improvement is accepted only when it is measurable and does not violate safety or cost constraints.

## Baseline metrics

Per run:

- task success;
- partial progress;
- validation status;
- goal drift;
- constraint retention;
- repeated error;
- user intervention count;
- recovery after failure;
- protected-path violation;
- tokens and cost per success;
- tool steps per success;
- wall time;
- context packet size;
- approval count;
- provider confidence vs verifier outcome.

Per capability:

- success rate by task class;
- calibration error;
- skill reuse success;
- stale-memory harm;
- regression rate;
- safety incident count;
- cost trend;
- supported environment coverage.

## Maturity states

```text
Unknown
→ Observed
→ Candidate
→ Validated
→ Stable
→ Degraded
→ Retired
```

## Promotion gates

A candidate rule can become Stable only when:

- evidence is linked;
- no unresolved contradiction exists;
- scope is explicit;
- secret/redaction checks pass;
- the user approves or an approved policy allows promotion;
- it is revalidated after relevant repo/version changes.

A candidate skill can become Stable only when:

- preconditions are explicit;
- postconditions are executable;
- risk policy is attached;
- it passes fixture tasks;
- it passes regression tasks;
- no critical safety violation occurs;
- cost stays within threshold;
- replay does not rely on blind coordinates or unstable hidden state.

## Initial eval fixtures

Create three tiny repositories:

1. TypeScript bug with failing unit test.
2. React component change with typecheck and snapshot/DOM test.
3. Python import bug with pytest and lint.

For each fixture, measure:

- run state correctness;
- blocked command behavior;
- event completeness;
- verifier result;
- context size;
- repeated-run memory reuse;
- candidate rule provenance;
- rollback/cleanup.

## Ablations later

Do not run full neuroscience-inspired ablations in P0. After the vertical slice is stable, compare:

- transcript-only baseline;
- bounded workspace;
- + episodic retrieval;
- + verified semantic rules;
- + skills;
- + adaptive controller;
- + consolidation/lifecycle.

This identifies product value without requiring model training.
