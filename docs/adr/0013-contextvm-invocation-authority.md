# ADR 0013: Context Pack invocation authority

Status: accepted

## Decision

All active CLI model invocations use the provider-neutral ContextVM invocation
boundary before Codex CLI, Codex app-server, or Responses API inference.
Readiness schema v2 is intentionally unable to contain an answer or action.
Context Packs are the sole model-context artifact.

Memory access is fail-closed by sensitivity and owner, token accounting uses a
UTF-8 upper bound, and page-fault coverage is evaluated from structured
metadata. Provider failures do not permit bypassing ContextVM.

## Consequences

Prompt understanding, coordinator, helper, reviewer, and repository implementer
roles share the same lifecycle and audit semantics. The old intelligence
context and evidence packet are removed from active runtime composition.
Correctness, runtime parity, and CLI build gates run before scale optimization.
