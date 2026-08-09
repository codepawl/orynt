# ADR 0003: Prompt Understanding Gate

Status: accepted for the CLI public beta.

## Context

Repository work needs a read-only interpretation step before task planning.
That step must distinguish direct answers, repository actions, missing material
information, assumptions that change scope, and work that requires operator
takeover. Conversation history helps resolve follow-up references, but must not
silently become execution authority.

## Decision

- Prompt understanding runs before a task plan, run, approval, checkpoint,
  artifact, or run event exists.
- The operator-controlled basis contains the raw prompt, active goal,
  acceptance criteria, clarification answers, and explicitly confirmed
  assumptions. Only these fields may become task-plan requirements.
- Conversation context contains a redacted summary and at most six recent
  user/agent turns. It is advisory and may only resolve references.
- `promptId` binds the authoritative basis. `inputId` additionally binds the
  bounded context so a result cannot be replayed against another conversation.
  Neither identifier grants execution authority; the approved task-plan digest
  remains authoritative.
- Models return content candidates only. Orynt owns protocol and input identity.
- A controller surfaces one clarification question at a time. Assumptions that
  affect scope require explicit confirmation. Three unsuccessful clarification
  rounds fail closed.
- The original raw prompt remains the canonical run, ledger, and cognitive
  runtime goal. Answers and assumptions remain traceable requirements.

## Failure behavior

Invalid schemas, stale identities, repeated question IDs, changed confirmed
assumptions, cancellation, timeout, missing providers, and exhausted
clarification rounds create no executable plan. Restored pending drafts require
operator reconfirmation.

## Verification

Contract and integration tests run in CI. The controlled prompt-understanding
benchmark must pass all gates. A two-repetition, thirty-scenario live benchmark
is a manual release gate and records JSON, JSONL, Markdown, and provenance.
