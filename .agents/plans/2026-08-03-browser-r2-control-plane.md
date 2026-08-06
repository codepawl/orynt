# Orynt Browser R2 control plane

## Objective

Harden the v0.1 CDP browser boundary and implement the deterministic v0.2
control plane without adding general computer use or an automatic vision
provider.

## Deliverables

- Exact-origin session scope with fail-closed migration from legacy descriptors.
- Persistent per-process CDP runtime leases.
- Versioned semantic snapshots, focused retrieval, mutation deltas, and explicit
  vision-escalation signals.
- Semantic target inspection before gateway authorization.
- Bounded typed batches, postcondition verification, safe recovery, and traces.
- Browser telemetry plus a matched 30-task by 5-repetition R2 promotion gate.
- Updated browser skill, architecture, privacy, permission, test, and public
  beta guidance.

## Safety boundaries

- No raw CDP, JavaScript evaluation, cookie/header exposure, computer use, or
  automatic image-provider call.
- No state-changing browser tool may bypass semantic inspection and the gateway.
- No live provider or quota-consuming benchmark run without explicit consent.
- Missing live evidence fails the promotion gate; fixtures never substitute for
  live results.

## Validation

- Browser runtime, gateway, eval harness, and CLI package tests/builds.
- Root `bun run test:cli` and `bun run build:cli`.
- Script syntax checks and `git diff --check`.
