# Token Economy Engine

Generated: 2026-06-24

## Problem

Computer-use agents can become extremely expensive because each loop may include screenshots, accessibility trees, DOM dumps, tool schemas, tool results, logs, and conversation history. Cost is not just a billing problem; context bloat also makes models less focused and less reliable.

## Product goal

CodePawl should make token usage visible, controllable, and optimizable.

## Runtime principle

Prevent context bloat before compressing it. Compression is useful, but the best token is the one never sent.

## Components

### ObservationStore

Stores full raw observations outside model context:

- full accessibility snapshot
- DOM metadata
- screenshots/crops
- network events
- console logs
- prior action results

### ContextPacket Builder

Builds small task-specific packets from ObservationStore:

- current goal
- current state summary
- top-k candidate actions
- relevant changed elements
- policy warnings
- last verifier result
- cost/budget status

### UI diff engine

Sends what changed instead of resending entire page state.

### Prompt Cache Aligner

Keeps stable prefix unchanged:

- system instructions
- action schema
- policy summary
- examples
- tool descriptions

Put variable page/task state at the end.

### Tool result clearing

After a tool result is stored in trace, only a summary or pointer remains in model context.

### Screenshot budgeter

Use screenshots only when:

- element semantics are insufficient
- layout/visual judgment matters
- captcha/bot/blocked page needs user awareness
- OCR/vision fallback is explicitly requested

### Cost HUD

Show:

- input/output token estimate
- cost estimate by provider
- screenshot count
- context packet size
- cache hit potential
- skill replay savings

## Budget config

```ts
export interface TokenBudget {
  maxInputTokensPerStep: number;
  maxOutputTokensPerStep: number;
  maxTotalTokensPerRun: number;
  maxScreenshotsPerRun: number;
  preferLocalModelBelowRisk: 'low' | 'medium';
  escalationBudgetTokens: number;
}
```

## Optimization targets

- Average step context under 2k tokens for simple forms.
- Screenshot-free by default for ordinary forms/pages.
- Replay runs should use 70%+ fewer tokens than exploratory runs.
- Strong model calls should be reserved for planning, ambiguity, and recovery.

## Headroom-like idea adapted to CodePawl

Headroom-style compression is useful, but CodePawl needs surface-aware context selection:

- compress logs after storing raw trace
- route only relevant UI nodes
- summarize only after state diffing
- preserve exact stable prefix for prompt caching
- build reversible pointers to raw trace artifacts

## Done when

A demo run shows token usage per step, total estimated cost, which context packet was sent, and how replay reduces cost.
