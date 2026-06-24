# Trace, Replay, and Verification

Generated: 2026-06-24

## Trace design

Trace is a first-class product surface, not a debug log.

## Event types

```ts
type TraceEvent =
  | RunStarted
  | ObservationCaptured
  | ContextPacketBuilt
  | ModelCalled
  | ActionProposed
  | PolicyChecked
  | ApprovalRequested
  | ApprovalResolved
  | ActionExecuted
  | VerificationCompleted
  | FailureDiagnosed
  | SkillSaved
  | RunFinished;
```

## Ledger UI

Each row should show:

- step number
- observation summary
- proposed action
- risk level
- approval status
- execution status
- verifier result
- token/cost
- artifacts

## Verification types

### Deterministic

- URL equals/contains.
- element exists.
- element value changed.
- network request seen.
- console error count.

### Heuristic

- page changed meaningfully.
- modal appeared.
- validation state changed.

### Model-assisted

- “Does this page look like task is complete?”
- Use only when deterministic checks are insufficient.

## Replay

Replay should prefer deterministic execution:

1. Load skill.
2. Resolve selectors.
3. Check preconditions.
4. Execute steps.
5. Verify each step.
6. Use LLM only on mismatch.

## Replay value

Replay turns expensive reasoning into cheaper execution. It is one of CodePawl’s main cost-reduction mechanisms.

## Export formats

- Markdown report.
- JSON trace.
- HAR/network optional.
- screenshots/videos optional.

## Done when

A user can inspect a failed step and understand exactly what the agent saw, tried, expected, and what actually happened.
