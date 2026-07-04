# Codex Phase 2 Prompt — Cognitive Kernel MVP

Goal: implement a minimal brain-inspired agent execution kernel with working memory, global workspace, executive control, memory retrieval, planning, action proposal, permission gating, action execution, verification, and learning hooks.

Context: inspect the Phase 1 event ledger, existing agent runner, model adapters, gateway adapters, and task state management.

Constraints: do not claim or implement artificial consciousness. Keep the kernel deterministic under fake-model tests. Use interfaces that can support multiple model providers and gateway adapters. Enforce loop, cost, and permission budgets.

Done when: a supervised test task runs through observe → retrieve → plan → propose → gate → execute/simulate → verify → summarize, and tests cover success, user approval pause, blocked action, mismatch recovery, uncertainty escalation, memory retrieval, and loop budget termination.
