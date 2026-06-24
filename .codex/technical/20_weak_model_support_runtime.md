# Weak Model Support Runtime

## Goal

Make weaker/cheaper models useful by reducing ambiguity.

## Techniques

```text
top-k candidate actions
strict JSON schema
runtime state machine
deterministic action compiler
small verifier jobs
human hint mode
strong model escalation
skill replay
```

## Confidence score

```ts
export interface StepConfidence {
  candidateConfidence: number;
  modelConfidence: number;
  selectorConfidence: number;
  verifierConfidence: number;
  overall: number;
}
```

## Human hint mode

When confidence is low, ask:

```text
Click the correct control once. CodePawl will save this mapping for this site/workflow.
```

This turns user intervention into replayable skill data.
