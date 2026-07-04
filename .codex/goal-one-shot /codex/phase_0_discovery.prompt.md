# Codex Phase 0 Prompt — Discovery and Alignment

Use this as a normal prompt or as the first checkpoint inside the one-shot `/goal`.

Goal: map the existing CodePawl repository and create a precise implementation plan for the brain-inspired computer-use agent roadmap.

Context: inspect `AGENTS.md`, `.agents`, `PLAN.md`, `README.md`, package manager files, `/docs`, app/package structure, auth/workspace/billing code, agent/session/task code, browser/computer-use/gateway code, database schema/migrations, and test/CI setup.

Constraints: do not change runtime behavior except adding documentation. Preserve current architecture and naming conventions. Do not invent services or secrets. Record uncertainty in the progress log.

Done when: create `docs/codepawl_cognitive_agent_progress.md`, create `docs/adr/0001-brain-inspired-agent-architecture.md`, list discovered validation commands, list files/modules to modify in later phases, and write a phase-by-phase implementation checklist adapted to the actual repo.
