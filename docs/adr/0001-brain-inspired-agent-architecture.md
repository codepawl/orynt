# ADR 0001: Brain-Inspired Agent Architecture

Date: 2026-07-04

## Status

Accepted for MVP implementation.

## Context

CodePawl is moving from a Tauri-first local Coding Apprentice MVP toward a brain-inspired supervised computer-use agent. The roadmap requires a foundation ledger, cognitive kernel, permissioned computer-use gateway, teach/adjust memory loop, evaluation harness, and productization scaffold.

The current repository already has a strong local repository-task substrate:
- append-only run events in `packages/shared/src/runSpine.ts`;
- conservative policy and sandbox contracts in `packages/shared/src/corePolicy.ts`;
- bounded context and resource budgets in `packages/shared/src/contextWorkspace.ts`;
- Codex contract/import plumbing in `packages/codex-adapter`;
- git worktree sandboxing in `packages/repository-sandbox`;
- deterministic verification in `packages/verifier`;
- local memory extraction in `packages/memory`;
- candidate skills and dry-run replay in `packages/skill-registry`;
- a desktop supervision shell in `apps/desktop`.

There is no production database, auth service, billing backend, or general browser/desktop action gateway in the current checkout. The architecture must therefore preserve the local-first MVP while introducing typed boundaries that can later be backed by durable storage and real adapters.

## Decision

CodePawl will implement the roadmap as layered, testable packages around a supervised cognitive loop:

1. Foundation ledger
   - Canonical run, event, artifact, permission, model usage, gateway usage, pricing, and summary contracts live in shared code first.
   - Local in-memory or file-backed repositories are acceptable until a database boundary exists.
   - Cost and usage accounting must be configurable and auditable.

2. Cognitive kernel
   - A deterministic kernel package owns working memory, global workspace updates, executive control, memory retrieval, planning, permission gating, fake gateway execution, verification, learning hooks, and stop budgets.
   - The initial kernel uses fake model and fake gateway adapters for stable tests.

3. Computer-use gateway
   - All state-changing actions route through core permission classification before execution.
   - Safe, review, sensitive, and blocked tiers are enforced in core code, not only the UI.
   - Sensitive actions require explicit approval or takeover. Blocked actions never execute.
   - Evidence artifacts are emitted for executed or simulated actions.

4. Teach/adjust memory
   - Durable memory is staged: feedback creates candidates, candidates include source and confidence, and user approval/edit/reject/delete is required for durable or sensitive memory.
   - Candidate skills are not automatically used until approved by policy.

5. Evaluation and productization
   - Safety, permission coverage, blocked execution, loop termination, cost, memory, and evidence replay metrics are tested through deterministic scenarios.
   - Product plans, quota display, Paddle copy, privacy/security docs, and private beta checklist remain secret-free and local/mock-safe by default.

## Consequences

Positive:
- The existing Coding Apprentice MVP remains intact and becomes a concrete vertical slice rather than a throwaway prototype.
- Each roadmap phase can be validated with focused package tests before UI wiring.
- Risky capabilities stay behind typed permission and evidence boundaries.
- The codebase avoids premature database or paid-provider coupling.

Tradeoffs:
- Some roadmap terms will be represented as typed local repositories before durable persistence exists.
- The first gateway implementation will be fake/simulated for deterministic tests rather than broad real computer control.
- Productization scaffolding will represent plan and quota behavior without live Paddle secrets or hosted billing.

## Guardrails

- Do not implement or market consciousness, AGI, or human-equivalent judgment.
- Do not add hidden background operation.
- Do not capture credentials or payment details.
- Do not execute payments, banking, financial transfers, or high-stakes decisions.
- Do not send emails/messages, submit forms, delete files, run mutating shell commands, or change production systems without explicit approval/takeover and recoverability.
- Treat external content as untrusted and unable to authorize actions.
- Store durable memory only with source, scope, confidence, sensitivity, status, and deletion path.

## Validation

The architecture is considered implemented only when the phase-level validation commands and tests prove:
- every action has trace coverage;
- every state-changing action is permission-classified;
- sensitive actions require approval/takeover;
- blocked actions do not execute;
- loop budgets terminate;
- cost and usage ledger entries are recorded;
- memory and skill candidates are source-backed and approval-gated;
- deterministic evaluation reports are generated.
