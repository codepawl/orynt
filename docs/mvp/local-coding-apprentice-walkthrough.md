# Local Coding Apprentice MVP Walkthrough

This walkthrough proves the local Coding Apprentice loop with a disposable repository, a CodePawl-managed sandbox/worktree, a generated Codex contract artifact, explicit controlled-execution approval, result import, deterministic verification, memory review, manual skill promotion, and a dry-run replay plan.

The default path uses a fake Codex executable. It does not require model credentials, cloud execution, browser automation, billing, or autonomous mode.

## Prerequisites

- Node.js and pnpm for the TypeScript workspace.
- Git for the disposable fixture repository and sandbox worktree.
- Rust, Cargo, and Tauri system libraries for `pnpm test:tauri` and desktop development.
- No API keys or model credentials for the default fake-Codex walkthrough.

Install dependencies from the repository root:

```bash
pnpm install
```

## Run Validations

Run the contract, desktop, workspace, build, Tauri, and walkthrough checks:

```bash
pnpm test:desktop
pnpm test:contracts
pnpm -r test
pnpm -r build
pnpm test:tauri
pnpm walkthrough:smoke
git diff --check
```

`pnpm walkthrough:smoke` builds the required packages, creates a temporary fixture repository under `/tmp`, creates a fake `codex` executable, explicitly approves the fake execution, and prints the run ID, sandbox worktree path, artifact root, contract artifact path, verifier input path, automatic candidate-rule count, promoted skill ID, replay plan ID, and emitted event types.

To preserve the temporary fixture, sandbox, and artifacts for manual inspection:

```bash
CODEPAWL_KEEP_WALKTHROUGH=1 pnpm walkthrough:smoke
```

## Start The Desktop App

Run the Tauri desktop shell:

```bash
pnpm --filter @codepawl/desktop exec tauri dev
```

The desktop shell shows the MVP cockpit with the run timeline, controlled Codex execution panel, memory panel, candidate rule review, skill registry, and dry-run replay planner states. The current desktop path is mock-backed; the acceptance script is the local end-to-end fixture that exercises the package orchestrator.

## Walkthrough Flow

1. Create or select a fixture repo.
   - Default: run `pnpm walkthrough:smoke`; it creates a disposable git repo with `packages/value.txt` and `scripts/pass.mjs`.
   - Manual inspection: preserve artifacts with `CODEPAWL_KEEP_WALKTHROUGH=1`.

2. Create a CodePawl run.
   - The smoke script calls `LocalCodingApprenticeDemoOrchestrator.runDemo`.
   - The run goal is `Run the local MVP walkthrough with fake Codex.`

3. Inspect the sandbox/worktree.
   - Use the printed `sandboxWorktreePath`.
   - Check status and diff:

```bash
git -C <sandboxWorktreePath> status --short
git -C <sandboxWorktreePath> diff -- packages/value.txt
```

4. Generate and inspect the Codex contract.
   - Use the printed `contractArtifactPath`.
   - Confirm the artifact contains the run ID, sandbox path, allowed validation command, protected paths, and bounded instructions.

5. Approve controlled execution with the fake Codex fixture.
   - The smoke script creates an approval object only after the execution plan reaches `approval_required`.
   - The fake Codex receives the contract artifact over stdin and runs inside the sandbox worktree.
   - Real Codex is not used in the default walkthrough.

6. Import the result bundle.
   - After fake execution finishes, the existing result import path creates an imported result bundle.
   - The run timeline must include `codex_result_import_requested`.

7. Run the verifier.
   - The verifier input is printed as `verifierInputPath`.
   - The fixture verifier command is `node scripts/pass.mjs`.
   - The verifier remains a separate explicit stage after execution.

8. Review memory and candidate rules.
   - The smoke script asserts that at least one episode was produced and reports the automatic candidate-rule count.
   - This passing fixture can produce memory episodes without automatic candidate rules because current rule extraction is conservative and focuses on protected-path, unexpected-file, or failed-command evidence.
   - For the manual skill path, the smoke script creates a reviewed candidate rule from successful verifier evidence when no automatic rule is produced.
   - In the desktop shell, use the Memory panel and Candidate Rule Review UI to inspect the same product state shape.

9. Create and promote a candidate skill manually.
   - The smoke script converts one candidate rule to accepted review evidence, creates a candidate skill, and promotes it manually through `LocalSkillRegistry.promoteSkillManually`.
   - No skill executes automatically.

10. Create a dry-run replay plan.
    - The smoke script calls `LocalSkillReplayPlanner.createReplayPlan` in `active_dry_run` mode.
    - The replay plan is dry-run only and non-executable.

## Expected Successful Timeline

A successful fake-Codex walkthrough should include these event types:

```text
run_started
goal_received
sandbox_inspected
sandbox_create_requested
sandbox_create_allowed
sandbox_created
codex_contract_requested
codex_contract_created
codex_manual_next_step
verification_planned
verification_policy_checked
codex_detected
codex_execution_planned
codex_execution_approval_required
codex_execution_approved
codex_execution_started
codex_execution_output_recorded
codex_execution_finished
codex_execution_result_ready
codex_result_import_requested
codex_sandbox_diff_inspected
codex_manual_log_imported
codex_result_redacted
codex_result_imported
verifier_input_created
verification_started
verification_command_started
verification_command_finished
verification_diff_checked
verification_recorded
verification_passed
memory_extraction_started
memory_redaction_applied
memory_episode_written
memory_extraction_finished
run_finished
skill_replay_plan_requested
skill_replay_preconditions_checked
skill_replay_policy_checked
skill_replay_budget_estimated
skill_replay_plan_created
```

The exact sandbox and artifact events can include additional policy or summary events as the orchestrator evolves. The critical invariant is that execution only starts after `codex_execution_approval_required` and `codex_execution_approved`, and verification happens after result import.

## Expected Blocked Timeline

A blocked controlled-execution run should stop before process start and result import:

```text
run_started
goal_received
sandbox_inspected
sandbox_create_requested
sandbox_create_allowed
sandbox_created
codex_contract_requested
codex_contract_created
verification_planned
codex_execution_planned
codex_execution_approval_required
codex_execution_blocked
```

Depending on the block reason, the timeline can include a more specific preflight event such as Codex missing, policy blocked, budget exceeded, verifier plan missing, or sandbox missing. It must not include `codex_execution_started`, `codex_execution_result_ready`, `codex_result_import_requested`, or verifier success after the block.

## Optional Real Codex Execution

The default walkthrough intentionally uses fake Codex. Optional real Codex execution should be tested only with a disposable repository, a CodePawl-managed sandbox/worktree, and explicit user approval.

Before trying real Codex:

```bash
codex --version
```

Keep secrets out of the repository, fixture files, command output, and contract content. Do not place API keys, passwords, OTPs, private keys, cookies, or raw sensitive values in the fixture repo or walkthrough notes. Verification must still run as a separate stage after result import.

## Troubleshooting

- `pnpm test:tauri` on Fedora/Linux: the wrapper in `scripts/test-tauri.mjs` forces `/usr/bin/pkg-config` when available, clears `PKG_CONFIG_LIBDIR` and `PKG_CONFIG_SYSROOT_DIR`, and sets `PKG_CONFIG_PATH=/usr/lib64/pkgconfig:/usr/share/pkgconfig`.
- Missing native Tauri libraries: install the Fedora packages that provide `gdk-3.0`, `webkit2gtk-4.1`, and `librsvg-2.0` `.pc` files, then rerun `pnpm test:tauri`.
- Homebrew `pkg-config` shadowing system packages: rerun through `pnpm test:tauri` instead of invoking Cargo directly.
- Missing git identity in the fixture repo: the smoke script configures local fixture-only `user.name` and `user.email`; it does not change global git config.
- Fake Codex not executable: rerun `pnpm walkthrough:smoke`; the script recreates the temporary fake binary with executable permissions.
- Need artifact inspection after cleanup: rerun with `CODEPAWL_KEEP_WALKTHROUGH=1`.

## Not Implemented Yet

- Browser automation.
- Autonomous skill execution.
- Cloud sync or cloud execution.
- Production billing.
- Team workspace collaboration.
- Real full-system control.
