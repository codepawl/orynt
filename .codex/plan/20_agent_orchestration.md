# Agent Orchestration

Generated: 2026-06-24

## Agent loop

```text
User task
-> TaskIntent
-> ObservationGraph
-> CandidateActions
-> ContextPacket
-> ModelAction
-> Policy check
-> ActionCompiler
-> Execution
-> Verification
-> Trace event
-> Next step or finish
```

## Roles

### Planner

Creates short goal decomposition. Should be called sparingly.

### Actor

Chooses next action from candidate list.

### Verifier

Checks whether expected result happened. Can be deterministic first, model-assisted later.

### Recovery manager

Handles failure diagnosis and next safe retry.

### Model router

Chooses local/small/strong model based on uncertainty, risk, context size, and budget.

## State machine

Maintain explicit run states:

```text
IDLE
OBSERVING
PLANNING
CHOOSING_ACTION
WAITING_APPROVAL
EXECUTING
VERIFYING
RECOVERING
FINISHED
FAILED
PAUSED_BY_USER
```

## Loop limits

Each run should have:

- max steps
- max wall-clock time
- max token budget
- max screenshots
- max retries per action
- max consecutive failures

## Stop conditions

- user stops
- task complete
- budget exceeded
- approval denied
- unsafe request detected
- repeated failure
- target site blocks automation

## Implementation note

Use explicit orchestration code rather than relying on a generic agent framework initially. CodePawl’s value is its runtime controls; generic frameworks may hide too much.
