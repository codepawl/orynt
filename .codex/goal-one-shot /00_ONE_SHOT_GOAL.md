# One-Shot Codex Goal Command

Paste this into Codex as one durable work contract.

```text
/goal Complete the CodePawl brain-inspired computer-use agent MVP roadmap without stopping until the repository contains a working, tested implementation of the foundation, cognitive kernel, computer-use gateway, teach/adjust memory loop, evaluation harness, and productization scaffolding described in this timeline package. First inspect AGENTS.md, .agents, PLAN.md, README.md, package.json, lockfiles, apps/*, packages/*, src/*, server/*, db/*, prisma/*, supabase/*, migrations/*, docs/*, tests/*, and existing billing/auth/agent/session code. Then read this package in order: 01_MASTER_TIMELINE.md, 02_RESEARCH_TO_PRODUCT_MAP.md, 03_ARCHITECTURE_SPEC.md, 04_VALIDATION_AND_METRICS.md, 06_RISKS_AND_GUARDRAILS.md, and all codex/phase_*.prompt.md files. Preserve existing architecture, auth boundaries, database conventions, style, lint rules, privacy rules, and public API compatibility unless a phase explicitly requires a migration. Do not remove existing features. Do not introduce uncontrolled autonomy, credential capture, payment execution, financial transfers, destructive actions, or hidden background behavior. Work in checkpoints matching the timeline phases, keep a short progress log in docs/codepawl_cognitive_agent_progress.md, create ADRs for major architecture decisions, run the repository's discovered validation commands after each checkpoint, and update tests/docs as implementation changes. Run typecheck, lint, unit tests, integration tests, database migration validation, and build commands when available. Done when all phase-level "Done when" criteria pass, the MVP can execute a supervised computer-use task with memory retrieval, permission gating, replayable evidence, cost/usage tracking, and a user feedback loop that can save or improve a reusable skill. Pause only if a required secret, external paid service, legal compliance decision, or destructive migration cannot be safely simulated locally.
```

## Expected phase order

1. Discovery and repo alignment.
2. Foundation telemetry, event log, and cost ledger.
3. Cognitive kernel: workspace, executive controller, memory modules, action selection.
4. Computer-use gateway and permission cockpit.
5. Teach/adjust loop and reusable skills.
6. Evaluation, safety, and regression harness.
7. Productization: Paddle-ready subscriptions, onboarding, docs, and positioning.

## Required output from Codex

Codex should leave behind:

- Working code.
- Tests.
- Database migrations or schemas.
- Documentation.
- Progress log.
- ADRs for architecture decisions.
- A concise final report with commands run and remaining risks.
