# Ship Orynt's Core Prebuilt Skills

## Summary

Bundle five Orynt-owned Agent Skills with the desktop and CLI runner. They are
enabled and selectable immediately, but never auto-attached. Project and user
skills retain precedence and may override them by name.

## Prebuilt skills and interfaces

- `repository-onboarding`: read-only repository instructions, architecture,
  ownership, entrypoints, tests, commands, and worktree mapping.
- `change-planner`: read-only, decision-complete implementation plans grounded
  in actual symbols, interfaces, edge cases, and validation.
- `bug-fixer`: reproduce first, identify root cause, add a regression test,
  implement the smallest coherent fix, and verify it.
- `code-reviewer`: read-only, prioritized correctness, security, and regression
  findings with file references and validation gaps.
- `release-readiness`: evidence-backed release checks without publishing,
  tagging, deployment, or other consequential actions.

Each package contains only `SKILL.md` and `agents/openai.yaml`. Metadata uses
explicit trigger descriptions, concise prompts, and
`policy.allow_implicit_invocation: false`. Skills cannot expand repository
scope, tools, network access, or approval authority.

Expose the packages as source `orynt-builtin`, scope `runtime`, trust
`builtin`, read-only and non-receipt-owned. IDs use
`orynt-builtin:<skill-name>` and the UI version label is `bundled`. Extend the
desktop source-kind type with `runtime`; do not change IPC or mutation
contracts.

## Implementation changes

- Resolve the bundled root relative to `scripts/desktop-skill-manager.mjs`,
  pass it through the existing `runtimeRoots` support, and show
  `Orynt built-ins` as a non-stale source requiring no refresh.
- Keep built-ins enabled and eligible by default. Existing runtime behavior
  prevents update, removal, pinning, or Trash actions; attachment remains an
  explicit per-run desktop or CLI choice.
- Mirror all five skills in browser-mode desktop fixtures so the non-Tauri
  workbench demonstrates production behavior.
- Copy the built-in directory into
  `orynt-runner/packages/skill-registry/builtins`, record the names in the
  internal release manifest, and update skill-manager and release-smoke docs.

## Validation

- Run Skill Creator validation for every package and add tests for the exact
  bundle, metadata, explicit-only policy, deterministic fingerprints, healthy
  scans, context snapshots, precedence, and immutable runtime behavior.
- Verify desktop and CLI inventory display, source policy, explicit
  attachment, and `skill-context.json` evidence.
- Run the skill-registry, CLI, and desktop suites; desktop build; release
  contract check; internal package build; and `git diff --check`.
- Forward-test each skill in fresh context against a disposable repository.

## Assumptions

- The current uncommitted Skills Hub implementation is the base and must not be
  reset or duplicated.
- Enabled means selectable only; no built-in is implicitly injected.
- Built-ins update only with an Orynt release. Higher-precedence project and
  user skills provide customization.
- No external catalog, network request, dependency installation, or new
  production dependency is needed.
