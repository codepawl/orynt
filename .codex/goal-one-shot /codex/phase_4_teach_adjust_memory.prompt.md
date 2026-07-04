# Codex Phase 4 Prompt — Teach, Adjust, and Skill Memory

Goal: let users teach CodePawl preferences and reusable workflows through feedback, while keeping durable memory user-visible, source-backed, and safe.

Context: inspect Phase 2 memory interfaces, Phase 1 event traces, user profile/preferences code, workspace settings, and any existing prompt/template/skill features.

Constraints: do not silently save sensitive durable memory. Candidate skills require approval before automatic use. Every memory must have source, scope, confidence, and deletion path. Preserve privacy boundaries across users/workspaces.

Done when: users can rate/correct a run, feedback creates a memory or skill candidate, candidate memory/skill can be approved/edited/rejected, approved skill can be invoked in a later run, and tests cover preference creation, skill extraction, approval, invocation, fallback, and deletion.
