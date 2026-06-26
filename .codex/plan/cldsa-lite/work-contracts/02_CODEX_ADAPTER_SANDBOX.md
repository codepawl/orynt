/plan

Goal: Implement the safe Coding Apprentice execution boundary: isolated git worktree, CorePolicy, ActionGate, ResourceGovernor, and a Codex provider adapter.

Context:
- Inspect the completed Run/event spine.
- Inspect Tauri capabilities, sidecar lifecycle, repository access, secret handling, and current Codex installation/configuration.
- Inspect `.codex/plan/cldsa-lite/plans/01_ARCHITECTURE_BOUNDARIES.md` and `04_MVP_VERTICAL_SLICE_CODING_APPRENTICE.md`.
- Prefer the official Codex App Server/SDK integration when compatible with the repo; otherwise implement a narrow adapter with the same interface and document the migration path.

Constraints:
- Codex may operate only inside the isolated worktree.
- No `--dangerously-bypass-approvals-and-sandbox`.
- Do not interpolate untrusted UI text into shell command strings.
- Block or require approval for destructive commands, protected files, dependency installation, network changes, git push/merge, and commands outside the allowlist.
- Pin the tested Codex runtime version when embedding an app-server binary.
- Normalize Codex events into CodePawl RunEvents.
- The renderer never launches Codex directly.
- Hard limits: wall time, steps, changed files, output bytes, process count, and model budget.

Done when:
- A fixture repository can be copied or opened in an isolated worktree.
- A mock Codex provider and one real Codex adapter share the same interface.
- CodePawl can start, stream, cancel, and clean up a Codex task.
- Policy decisions and approvals are persisted.
- The task cannot access files outside the allowed workspace in tests.
- Failure, cancellation, timeout, and cleanup paths are tested.
- Security review, lint, typecheck, tests, and build pass.
