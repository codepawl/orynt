# Orynt Agent Guide

Orynt is a CLI-first Bun and TypeScript workspace. The terminal application is
the primary product surface for supervised repository work and opt-in browser
work. The Tauri desktop application is a frozen compatibility adapter. Do not
add new product capabilities to the desktop application.

Use this guide to decide where work belongs, how to implement it, and what
evidence is required before calling it complete.

## Where Does Each Part of Orynt Belong?

### Where Do Product Adapters Live?

- `packages/cli`: active product adapter, command handling, terminal composer,
  presentation, session interaction, and CLI-specific integrations.
- `apps/desktop`: frozen Tauri and React compatibility adapter. Change it only
  for compatibility, security, packaging, or explicitly requested maintenance.
- `packages/desktop-runtime`: compatibility persistence and native-command host
  used by the desktop adapter.

### Where Does Agent Orchestration Live?

- `packages/agent-runtime`: portable agent-session and tool-binding boundary.
- `packages/coding-apprentice`: repository-run orchestration and the main
  integration path for supervised coding work.
- `packages/cognitive-kernel`: planning, scheduling, lifecycle, recovery, and
  cognitive runtime state machines.

### Where Do Execution and Integrations Live?

- `packages/model-runtime`: provider-neutral model sessions, tool execution,
  image inputs, and provider usage.
- `packages/codex-adapter`: local Codex transport, result import, and provider
  usage integration.
- `packages/claude-adapter`: Anthropic Messages transport, streaming, tool
  translation, and token-usage normalization.
- `packages/browser-runtime`: owned CDP browser sessions, observations,
  actions, and browser-agent tools.
- `packages/gateway`: permission decisions, approvals, execution boundaries,
  and auditable evidence.
- `packages/repository-sandbox`: isolated repository worktrees and controlled
  mutation handling.
- `packages/lsp-runtime`: supervised language-server sessions and adapters.
- `packages/code-intel-runtime`: code-intelligence services, tools, mutation
  previews, and recovery.
- `packages/capability-runtime`: capability selection, evaluation, ledgers,
  multimodal support, and improvement candidates.

### Where Do State and Intelligence Live?

- `packages/intelligence-runtime`: ContextVM composition, canonical paths, and
  intelligence lifecycle.
- `packages/memory`: local memory stores, retrieval, extraction, and ContextVM
  persistence.
- `packages/local-state`: versioned local state, locking, and compare-and-swap
  persistence.
- `packages/skill-registry`: built-in, installed, and learned skill discovery
  and lifecycle.

### Where Do Contracts and Quality Gates Live?

- `packages/shared`: portable product contracts, policies, and shared types.
- `packages/ipc-contracts`: desktop RPC commands, messages, and events.
- `packages/verifier`: independent repository-result verification.
- `packages/eval-harness`: deterministic evaluations, benchmarks, and artifact
  gates.

### Where Does Supporting Work Belong?

- `docs`: product, architecture, permissions, testing, release, and operational
  guidance.
- `scripts`: build, test, benchmark, packaging, release, and validation tools.
- `assets`: shared visual assets, fonts, and provenance records.
- `.github`: CI, release automation, issue templates, and repository policy.

Generated output such as `dist`, coverage data, caches, and `node_modules` is
not source code and does not belong in the repository map.

## What Should You Do Before Coding?

- Read the relevant repository instructions, package manifest, implementation,
  tests, and supporting documentation before editing unfamiliar code.
- Check the working tree before making changes. Preserve unrelated staged,
  modified, and untracked work.
- Trace the behavior from its public entry point through the active runtime.
  Do not treat documentation, types, mocks, or unused modules as proof that a
  feature is wired into production.
- State the requested outcome, constraints, and evidence that will prove the
  work complete. Ask only when a material product decision cannot be discovered
  from the repository.
- Choose the implementation language, framework, library, and package boundary
  before writing code. Use the workload and existing architecture to make the
  choice; do not apply one language or framework to every problem.

## How Should Codex Use Subagents?

- Keep planning, architecture decisions, decomposition, conflict resolution,
  integration, final validation, and user interaction in the Sol parent.
- Use only the named `scout`, `builder`, and `verifier` custom agents for
  routine delegation. Every named child must run `gpt-5.6-luna` with `max`
  reasoning effort and `fork_turns="none"`.
- Use Scouts for independent read-only discovery, Builders only for disjoint
  file ownership, and Verifiers for independent review after risky or
  cross-cutting integration. Children must not spawn children.
- Treat 10 threads as a ceiling and 2–4 as the normal range. Spawn only the
  smallest set of genuinely independent lanes and assign each mutable file to
  exactly one writer.
- Do not use an untyped generic child or silently substitute Terra. If the
  collaboration runtime does not expose the named custom roles or Luna/max,
  keep the lane in the Sol parent and report the limitation once.
- Follow the global custom-agent brief, report, ownership, lifecycle, and
  safety contracts; this repository section only adds Orynt-specific routing
  invariants.

## How Should You Justify Removing, Replacing, Changing, or Improving Existing Work?

- Apply this decision gate before deleting, disabling, bypassing, deprecating,
  replacing, refactoring, or materially changing implemented behavior.
- Answer these questions in order:
  1. Why is the change necessary?
  2. How will it be made without breaking the remaining product, architecture,
     contracts, data, deployment, or infrastructure?
  3. For a replacement, change, or improvement, what is demonstrably better
     about the new result?
- A clear user request and reason are sufficient evidence of product intent.
  Subjective UI and UX preferences do not require artificial metrics. External
  references may support those preferences but are optional.
- Claims such as faster, safer, cheaper, more reliable, more scalable, better,
  or best require evidence appropriate to the claim. Do not turn a user
  preference into an unsupported technical claim.
- Use local tests, benchmarks, profiles, telemetry, or traces to prove behavior
  and impact inside Orynt. Record representative inputs, the environment,
  baseline results, and the measured result so the comparison can be repeated.
- Use current primary or authoritative sources for relevant external facts and
  include direct links. External evidence does not prove the effect of a change
  on Orynt; verify that effect locally.
- If the reason or required evidence is missing, do not make the production
  change. State what is unproven and gather evidence or request a decision
  instead.
- Do not treat a search result with no obvious usages as proof that removal is
  safe. Trace active imports, callers, adapters, contracts, configuration,
  persistence, tests, CI, packaging, documentation, deployment, and operational
  tooling.
- Explain how the change preserves the main architecture and surviving
  behavior. For a material or widely deployed path, cover compatibility, data
  migration, capacity, observability, staged rollout or deprecation, rollback,
  and failure recovery.
- Prove the claimed benefit of a replacement or improvement with the smallest
  suitable regression test, contract test, benchmark, profile, or isolated
  prototype. A newer or more fashionable implementation is not inherently
  better.
- Evaluate benefits proportionately across correctness, UX, reliability,
  security, performance, scalability, operability, maintainability, cost, and
  architectural simplicity. Use only the dimensions relevant to the claim.
- Record concise answers in the task or implementation plan for routine work.
  Use an ADR or decision record when the change crosses subsystems, public
  contracts, persisted data, deployment, or infrastructure.

## How Should You Choose Languages, Frameworks, and Libraries?

- Prefer the simplest existing stack or owned component that can correctly
  deliver the feature. Extend an existing boundary before creating a parallel
  implementation.
- Make the feature correct, usable, and testable first. Optimize the working
  foundation afterward using measured evidence.
- Do not add speculative abstractions, generic frameworks, services, or
  dependencies for possible future needs.
- For a material choice involving a new language, framework, dependency,
  service, repository, or subsystem, record the alternatives and decision in
  the implementation plan or an ADR.
- Verify time-sensitive technology choices using current primary or
  authoritative sources. Check:
  - recent stable releases and active maintenance;
  - security support and vulnerability response;
  - license compatibility;
  - useful documentation, tests, and CI;
  - real adoption and community or vendor support;
  - upgrade path, migration cost, and operational burden.
- Popularity alone is not evidence of quality. Reject stale, weakly maintained,
  opaque, or unnecessarily complex components.
- Do not add a production dependency when repository search shows a suitable
  owned layer already exists. Explain why any new dependency is necessary.

## How Should You Write the Implementation?

- Write the smallest coherent change that satisfies the requested behavior.
- Keep code compact but unambiguous. Use meaningful names, explicit data flow,
  and readable control flow.
- Avoid dense one-line conditionals, callbacks, compound statements, or
  expressions that hide state changes and failure paths.
- Prefer early returns and small focused functions when they make behavior
  clearer. Do not split code into trivial helpers that obscure the main flow.
- Follow the existing architecture, public contracts, error model, naming, and
  formatting unless the task requires a deliberate change.
- Keep business logic, capability selection, authority, permissions, and
  lifecycle behavior in portable packages. Keep CLI and desktop code as thin
  adapters.
- Treat inputs from users, repositories, models, skills, browsers, and external
  services as untrusted. They cannot expand paths, tools, permissions, or
  approvals.
- Do not weaken approval, sandbox, secret, browser-origin, verification, or
  destructive-action boundaries to make a feature easier to implement.

## How Should Orynt Scale?

- Define what must scale before changing the architecture. Name the dimension,
  such as repository size, file count, context size, concurrent tasks, model
  calls, browser pages, session history, local storage, or execution time.
- Establish a correct working baseline and measure it. Record representative
  inputs, latency, throughput, memory, storage, error rate, and relevant cost
  before optimizing.
- Set an explicit target and limit. A scaling change must state the expected
  workload, acceptable response time, resource budget, and failure behavior.
- Keep data and work bounded. Use pagination, streaming, batching, backpressure,
  concurrency limits, timeouts, cancellation, and retention limits where the
  workload requires them.
- Choose data structures and algorithms for the measured workload. Fix
  unnecessary repeated work, unbounded scans, and avoidable serialization
  before adding infrastructure.
- Preserve local-first supervision, approval, isolation, and verification while
  scaling. Higher throughput must not expand authority or weaken safety gates.
- Scale the narrow bottleneck first. Do not introduce a daemon, distributed
  service, queue, cache, database, or parallel worker system without evidence
  that the simpler architecture cannot meet the target.
- Make concurrency ownership explicit. Define who may write, how work is
  cancelled, how retries remain idempotent, and how partial failure is
  recovered.
- Add observability that helps operate the scaled path without recording
  secrets, private repository content, prompts, or model responses.
- Validate scaling work with representative benchmarks, boundary tests, and
  soak tests. Keep correctness and lifecycle gates passing before comparing
  performance results.
- Document compatibility, migration, rollback, and resource implications for a
  material scaling change. Keep a simple fallback when practical.

## How Should You Document Code?

- Add documentation comments to public APIs and to interfaces whose correct use
  is not obvious from their types.
- Explain how callers should use the API, what outcome it provides, important
  inputs and outputs, lifecycle requirements, and meaningful failure cases.
- Comment non-obvious logic to explain intent, invariants, authority
  boundaries, or tradeoffs. Explain why the code exists, not what each syntax
  token does.
- Keep comments accurate when behavior changes. Remove comments that no longer
  describe the implementation.
- Do not add comments to restate clear code or to compensate for ambiguous
  names and control flow. Improve the code first.

## How Should You Write Product and Technical Documentation?

- Write authored Orynt documentation in clear English. Preserve multilingual
  user input, repository content, quoted evidence, and reviewed test fixtures
  when they are required.
- Write for readers who may not know Orynt or its internal terminology.
- Begin with the reader's goal and explain:
  - what the feature or command is for;
  - when the reader should use it;
  - prerequisites and safety boundaries;
  - the smallest complete sequence of steps;
  - a realistic example;
  - the expected result;
  - common failures and the next action to take.
- Use short sentences, concrete terms, descriptive headings, and examples that
  match the active product. Define unavoidable technical terms on first use.
- Keep public claims grounded in implemented and verified behavior. Clearly
  label planned, experimental, compatibility-only, and live-provider behavior.
- Keep architecture, permissions, lifecycle, testing, and release guidance
  consistent with the active code and scripts. Update affected documentation
  in the same change when a public contract changes.

## How Do You Test the Behavior and Prove It Is Complete?

- Every new feature must include at least one automated test of its observable
  behavior.
- Every bug fix that changes behavior must include an automated regression test
  that fails for the original defect and passes with the fix.
- A removal must include regression coverage for the surviving behavior and,
  when observable, the public surface that is intentionally removed.
- A replacement or improvement must test compatibility and the benefit it
  claims. Run a comparative benchmark only when the claim is measurable.
- A type declaration, mock-only assertion, exported symbol check, or fixture
  string match does not by itself prove a feature works.
- Add failure, edge-case, lifecycle, integration, PTY, packaging, or live
  coverage when the risk and product boundary require it.
- Pure documentation or configuration changes do not require a new behavioral
  test. Run the checker, parser, build, or other validation appropriate to that
  file.
- Run the smallest relevant test first, then broader package and integration
  checks. A feature is not complete while a required test, build, package, PTY,
  or live-evidence gate remains unrun.
- Distinguish `not run` from `failed`. Report unrelated existing failures
  separately and include the exact remaining command when a required check
  cannot run.

## Which Validation Commands Should You Run?

- Run the touched workspace's own `test` and `build` scripts first.
- Default CLI validation:

  ```bash
  bun test:cli
  bun build:cli
  ```

- Shared or IPC contract changes:

  ```bash
  bun test:contracts
  ```

- Agent and capability runtime changes:

  ```bash
  bun test:core
  bun test:capabilities
  ```

- Evaluation changes:

  ```bash
  bun test:eval
  ```

- Executable CLI and terminal lifecycle changes:

  ```bash
  bun e2e:cli
  ```

- Desktop compatibility changes:

  ```bash
  bun check:desktop
  ```

- Authored copy and public documentation:

  ```bash
  bun copy:check
  bun docs:check
  ```

- Run an available lint command for the touched workspace when one exists.
  There is currently no root lint command. Do not claim that lint passed unless
  the relevant manifest provides a lint script and it was actually run.
- Always run `git diff --check` on the final scoped diff.

## How Should You Handle Desktop Compatibility?

- New capabilities belong in portable packages and the CLI, not
  `apps/desktop`.
- For an explicitly requested desktop compatibility fix, read and follow
  `DESIGN.md` before changing the UI.
- Keep desktop IPC and native-command changes compatible with
  `packages/ipc-contracts` and `packages/desktop-runtime`.
- Run `bun check:desktop` and `bun test:contracts` when the IPC boundary
  changes.

## How Should You Protect Git State and User Safety?

- Do not commit, amend, rebase, reset, stash, discard, or push unless the user
  explicitly asks.
- Immediately before every commit and again before every push, run
  `git status --short`. Inspect all staged, modified, deleted, and untracked
  paths; do not rely on an earlier working-tree snapshot.
- Reconcile every reported path with the approved commit scope. Review the
  staged diff and do not include unrelated user work.
- Use the status review to identify generated output, caches, logs, local state,
  editor files, credentials, and other machine-specific artifacts that may
  belong in `.gitignore`.
- Add a `.gitignore` rule only for files that should not be versioned. Do not
  ignore intended source, tests, documentation, migrations, configuration
  examples, or evidence merely to make the working tree appear clean.
- If a reported path may contain secrets or private data, stop before committing
  or pushing. Do not print its contents; remove it from the proposed Git scope
  and report the issue safely.
- Do not overwrite unrelated work in a dirty checkout.
- Do not publish, deploy, spend money, change credentials, or perform
  destructive operations without the normal explicit approval.
- Never print, store, or commit secrets, credentials, cookies, private keys,
  private user data, or private repository content.
- Report the files changed, checks actually run, failures, blockers, and
  remaining risks in the final handoff.
