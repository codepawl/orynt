# Token Economy Runtime

## Objective

Prevent context explosion.

## Components

```text
ObservationStore
ContextPacketBuilder
CandidateNarrower
DiffEngine
BudgetGate
PromptCacheAligner
ScreenshotBudgeter
CostLedger
SkillReplaySavingsEstimator
```

## Rules

1. Keep full graph local.
2. Send top-k candidates, not whole DOM.
3. Send graph diffs after first observation.
4. Use crop screenshots only when needed.
5. Keep stable prompt prefix for cache-friendly providers.
6. Replay skills deterministically.
7. Use weak/local models for small classification/verification jobs.
8. Stop or ask approval when cost exceeds policy.

## Budget policy

```ts
export interface BudgetPolicy {
  maxUsd?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxSteps?: number;
  maxScreenshots?: number;
  requireApprovalAboveUsd?: number;
  stopOnBudgetExceeded: boolean;
}
```

## UI output

Run cockpit should show:

```text
model used
estimated cost
actual tokens if provider returns them
context packet size
step count
screenshot count
replay savings estimate
```
