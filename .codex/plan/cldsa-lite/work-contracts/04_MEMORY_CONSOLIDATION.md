/plan

Goal: Add local episodic memory and candidate-only post-run learning without allowing self-modification of safety or evaluator code.

Context:
- Inspect the completed cognitive loop, event store, SQLite/storage, verifier, UI, and redaction.
- Inspect `.codex/plan/cldsa-lite/plans/05_EVALS_AND_MATURITY.md`.
- Inspect the original CLDSA research report for episodic, semantic, procedural memory, consolidation, and forgetting requirements.

Constraints:
- Preserve raw events and provenance.
- Use SQLite and structured retrieval first; do not add graph DB or cloud memory.
- Do not run an LLM extractor on every event.
- A candidate rule or skill must cite evidence and scope.
- No automatic promotion to Stable in P0.
- The learning loop cannot edit CorePolicy, sandbox rules, evaluator code, or secret handling.
- Use archive/supersession/tombstones rather than destructive rewrites of history.

Done when:
- Runs persist as episodic memory.
- The next run can retrieve a small relevant evidence packet.
- User corrections can create candidate project rules.
- Eligible successful runs can create candidate skills with preconditions, postconditions, validators, and risk policy.
- The UI supports approve/edit/reject/leave-candidate.
- Secret-redaction, stale-memory, contradiction, and provenance tests pass.
- A repeated fixture task demonstrates lower context size or fewer steps without lower verifier success.
