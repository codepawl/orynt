# CodePawl Implementation Timeline

Timeline target: 12 weeks for an MVP suitable for a private beta and Paddle review.

This is organized as implementation phases. Codex should run them sequentially, because later phases depend on stable telemetry, event schemas, and permission policies.

## Phase 0 — Discovery and Alignment

Duration: Week 0 to Week 1.

Goal: understand the existing repo, identify implementation surfaces, and create a precise local plan.

Context Codex should inspect first:
- `AGENTS.md`, `.agents`, `PLAN.md`, `README.md`, `/docs`.
- Package manager files.
- Existing app structure.
- Existing auth, workspace, billing, model-provider, task, browser/computer-use, and session code.
- Existing test commands and CI.

Constraints:
- Do not change behavior in this phase except for docs.
- Preserve current architecture.
- Record assumptions rather than silently rewriting product direction.

Done when:
- `docs/codepawl_cognitive_agent_progress.md` exists.
- `docs/adr/0001-brain-inspired-agent-architecture.md` exists.
- A discovered validation command list exists.
- Phase implementation surfaces are mapped to files/modules.

Deliverables:
- Repo map.
- Risk map.
- Phase-by-phase implementation checklist adjusted to the actual repo.

## Phase 1 — Foundation: Agent Run Ledger, Event Log, and Cost Tracking

Duration: Week 1 to Week 2.

Goal: create the minimum reliable substrate for agent product decisions: every run, tool action, model call, permission event, memory event, and cost estimate must be observable.

Brain analogy:
- "Nervous system telemetry": the agent needs sensory/action traces before it can learn.
- "Episodic trace": every task run should leave a replayable memory.

Core tasks:
- Add canonical `agent_runs`.
- Add append-only `agent_events`.
- Add `model_usage_ledger`.
- Add `gateway_usage_ledger`.
- Add `permission_events`.
- Add `run_artifacts` for screenshots, logs, diffs, files, traces.
- Add admin-only usage summary.
- Add provider pricing config, not hard-coded business logic.

Done when:
- A run records start, observations, plans, actions, tool results, permission requests, user approvals/rejections, model usage, gateway usage, duration, retry count, estimated cost, and final result.
- Tests prove cost calculation for at least two provider/model price configs.
- Monthly usage summary exists by user/workspace/plan.
- Sensitive internal cost data is not exposed to normal end users.

## Phase 2 — Cognitive Kernel MVP

Duration: Week 2 to Week 4.

Goal: implement a minimal brain-inspired agent loop that is useful, testable, and not overclaimed.

Brain-inspired modules:
- Working Memory: active task state, current goal, constraints, open questions, selected context.
- Global Workspace / Blackboard: shared event bus where perception, memory, planner, risk, and executor publish candidate state.
- Executive Controller: decides whether to plan, act, ask, retrieve memory, pause, or request approval.
- Episodic Memory: previous run traces and outcomes.
- Semantic Memory: user preferences, stable facts, environment notes, tool/site rules.
- Procedural Memory: reusable skills/playbooks.
- Attention / Salience Router: chooses relevant screen/context/memory within budget.
- Predictive Error Loop: predict expected observation after action, compare actual state, recover on mismatch.
- Metacognition: confidence, uncertainty, anomaly detection, and when to ask the user.

Core tasks:
- Create cognitive kernel interfaces.
- Add state machine for supervised task execution.
- Add memory retrieval hooks.
- Add action proposal and critique cycle.
- Add action outcome verification.
- Add stop conditions and anti-loop budgets.
- Add deterministic test harness with fake model and fake computer-use environment.

Done when:
- A supervised task can run through observe → retrieve → plan → propose action → permission check → execute/simulate → verify → summarize.
- The task can pause for approval when risk policy requires it.
- The kernel can retrieve at least one relevant episodic/semantic/procedural memory.
- Unit tests cover success, mismatch recovery, uncertainty ask, and loop limit.

## Phase 3 — Computer-Use Gateway and Permission Cockpit

Duration: Week 4 to Week 6.

Goal: make CodePawl trustworthy for real computer-use by controlling blast radius and showing evidence.

Brain analogy:
- Motor cortex: action execution.
- Prefrontal inhibitory control: permission and risk gating.
- Sensory feedback: screenshot/log/diff result.
- Attention: selecting the right UI target.

Core tasks:
- Implement or wrap the CodePawl Gateway as a secure connector layer.
- Route browser/desktop actions through an auditable gateway.
- Add permission policy tiers: safe, review, sensitive, blocked.
- Add approval UX/API surface.
- Add replayable evidence: action timeline, screenshot, DOM/accessibility tree, command logs, file diffs.
- Add credential and payment safety boundaries.
- Add local-first or sandbox-first behavior where possible.

Done when:
- Every state-changing action goes through permission classification.
- Sensitive actions require explicit user approval or takeover.
- Blocked actions cannot execute.
- All executed actions have trace evidence.
- Tests cover safe action, sensitive action, blocked action, ambiguous instruction, and gateway failure.

## Phase 4 — Teach, Adjust, and Skill Memory Loop

Duration: Week 6 to Week 8.

Goal: make CodePawl learn from user feedback in a product-safe way.

Brain analogy:
- Procedural memory: repeated workflows become skills.
- Hippocampal indexing: successful episodes can be retrieved later.
- Reinforcement learning: feedback updates future action selection, but production behavior should remain constrained and auditable.

Core tasks:
- Add feedback capture after every run and after selected actions.
- Extract candidate preferences from user corrections.
- Extract candidate skills from repeated successful workflows.
- Add skill schema with preconditions, steps, tools, permissions, examples, owner, version, test status.
- Add review/edit/publish flow for skills.
- Add skill invocation and fallback when skill confidence is low.
- Add memory hygiene: expiry, source, confidence, user-editable facts, deletion.

Done when:
- User can correct the agent.
- The correction can update a preference or create a candidate skill.
- A candidate skill is not used automatically until approved or marked safe by policy.
- A saved skill can be invoked in a later run.
- Tests cover creation, approval, invocation, failure fallback, and deletion.

## Phase 5 — Evaluation, Safety, and Reliability Harness

Duration: Week 8 to Week 10.

Goal: prove that CodePawl is safer and more useful than a raw agent prompt.

Core tasks:
- Build a scenario benchmark suite.
- Include repetitive admin workflows, browser research, form filling without submission, local file organization, coding support if relevant, and cross-app workflows.
- Add permission-gate tests for ambiguous scope and destructive actions.
- Add prompt-injection and malicious page tests.
- Add action replay tests.
- Add memory regression tests.
- Add cost regression tests.

Done when:
- Evaluation suite runs in CI or with one command.
- It reports task success, approval precision/recall, blocked action rate, loop rate, retry rate, mean cost, p90 cost, and human intervention count.
- Safety tests demonstrate blocked or approval-required behavior for risky classes.
- A regression dashboard or report artifact is generated.

## Phase 6 — Productization, Billing, and Launch Prep

Duration: Week 10 to Week 12.

Goal: package the MVP for private beta and Paddle review.

Core tasks:
- Add subscription plan scaffolding.
- Add BYOK mode and managed AI usage mode if architecture supports both.
- Add monthly quota and credits model.
- Add usage display for users.
- Add onboarding explaining safe delegation and user control.
- Add Paddle product copy.
- Add landing page copy.
- Add privacy/security documentation.
- Add pilot onboarding checklist.

Done when:
- Product can be described clearly to Paddle.
- Plans and quotas are represented in code/config.
- Users can see usage and limits.
- The product states what the agent can and cannot do.
- Private beta checklist exists.

## Phase 7 — Pilot and Iteration

Duration: after Week 12.

Goal: learn from real users without over-scaling risk.

Core tasks:
- Recruit 10–30 users across technical operators, solo founders, and workflow-heavy professionals.
- Collect task traces, cost, failure modes, approval friction, and retention signals.
- Identify top 3 repeated workflows.
- Convert repeated workflows into curated templates.
- Tune pricing based on p90 cost, not average cost.

Done when:
- At least 100 real supervised runs are analyzed.
- Top workflows and failure patterns are documented.
- Pricing/quotas are updated from observed cost.
- A narrow v1 launch segment is chosen.
