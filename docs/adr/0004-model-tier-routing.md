# ADR 0004: Deterministic model-tier routing

Status: accepted

## Context

Orynt previously exposed Economy, Balanced, and Quality orchestration presets.
Those presets mixed product intent, role assignment, model selection, and
fallback behavior. That made it difficult to reason about which capability was
used for a task and could silently substitute a different model or reasoning
effort.

## Decision

The primary routing abstraction is now three capability tiers:

- Light: bounded, read-only inspection and summarization.
- Medium: prompt understanding, coordination, planning, and ordinary mutable
  repository work.
- Heavy: high-risk, destructive, cross-package, architectural, recovery, and
  large-scope work.

Roles point to tiers rather than directly to models. The editable defaults are
Helper = Light, Coordinator = Medium, Implementer = Medium, and Reviewer =
Heavy. Each tier has one exact provider, model, thinking effort, and immutable
system resource caps.

The selected tier is the maximum of:

1. the role baseline;
2. the deterministic task-safety floor;
3. an optional operator minimum.

An operator minimum may raise the tier but cannot lower the safety floor.
Providers may differ between tiers. A routed invocation must find the exact
provider/model/effort binding and a ready provider connection. It blocks with
`MODEL_TIER_UNAVAILABLE` otherwise; there is no cross-tier, cross-provider,
model, or effort fallback.

Routing decisions and invocation records include the selected tier and reason
codes. Legacy presets remain input-compatible only for migration. A legacy
single-model configuration is copied into all three tiers and marked for user
review.

## Consequences

- Cheap models cannot be selected for mutable work merely because a role or
  operator requested them.
- Expensive models can be explicitly pinned as a minimum for the next request.
- Mixed-provider setups are possible without changing role definitions.
- A missing exact binding stops the run rather than weakening its execution
  contract.
- Economy, Balanced, and Quality are no longer the primary user-facing routing
  model, though compatibility adapters remain during migration.
