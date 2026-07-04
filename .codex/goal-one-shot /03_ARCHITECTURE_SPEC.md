# Architecture Spec: Brain-Inspired CodePawl Agent

This is a product-oriented architecture, not a literal brain simulation.

## Top-level modules

```text
User
  ↓
Task Intake
  ↓
Cognitive Kernel
  ├── Working Memory
  ├── Global Workspace / Blackboard
  ├── Executive Controller
  ├── Planner
  ├── Attention Router
  ├── Memory Manager
  │   ├── Episodic Memory
  │   ├── Semantic Memory
  │   └── Procedural Memory / Skills
  ├── Risk and Permission Policy
  ├── Cost and Budget Manager
  └── Verifier / Critic
  ↓
CodePawl Gateway
  ├── Browser Adapter
  ├── Desktop Adapter
  ├── Filesystem Adapter
  ├── Shell/Command Adapter
  ├── App Connector Adapter
  └── Model Provider Adapter
  ↓
Evidence Store + Usage Ledger + Feedback Loop
```

## Core data contracts

### AgentRun

Represents one delegated task.

Required fields:
- `id`
- `workspace_id`
- `user_id`
- `status`
- `user_goal`
- `normalized_goal`
- `risk_level`
- `started_at`
- `ended_at`
- `duration_seconds`
- `model_provider`
- `primary_model`
- `estimated_cost_usd`
- `credits_consumed`
- `human_intervention_count`
- `approval_count`
- `blocked_action_count`
- `retry_count`
- `final_summary`
- `failure_reason`

### AgentEvent

Append-only event stream.

Event types:
- `task.created`
- `observation.captured`
- `memory.retrieved`
- `plan.created`
- `action.proposed`
- `permission.requested`
- `permission.approved`
- `permission.rejected`
- `action.executed`
- `verification.passed`
- `verification.failed`
- `feedback.received`
- `skill.candidate_created`
- `run.completed`
- `run.failed`

### WorkingMemory

Short-lived task state.

Fields:
- `run_id`
- `current_goal`
- `constraints`
- `current_observation_ref`
- `selected_context_refs`
- `open_questions`
- `candidate_plan`
- `next_action`
- `expected_next_state`
- `uncertainty_score`
- `risk_score`
- `budget_remaining`

### SemanticMemory

Stable facts/preferences.

Fields:
- `id`
- `workspace_id`
- `user_id`
- `scope`
- `key`
- `value`
- `source`
- `confidence`
- `created_at`
- `updated_at`
- `expires_at`
- `deleted_at`

Examples:
- "User prefers markdown reports."
- "Never submit forms without approval."
- "For supplier research, use sources from official company sites first."

### EpisodicMemory

Prior task episodes.

Fields:
- `id`
- `run_id`
- `workspace_id`
- `summary`
- `goal_embedding`
- `outcome`
- `tools_used`
- `important_events`
- `artifact_refs`
- `cost_usd`
- `duration_seconds`
- `user_rating`
- `retrieval_tags`

### ProceduralSkill

Reusable workflow.

Fields:
- `id`
- `workspace_id`
- `name`
- `description`
- `version`
- `status`: `draft | candidate | approved | deprecated`
- `owner_user_id`
- `preconditions`
- `required_tools`
- `permission_requirements`
- `steps`
- `verification_checks`
- `examples`
- `failure_modes`
- `created_from_run_ids`
- `success_count`
- `failure_count`
- `last_validated_at`

## Execution state machine

```text
created
  → observing
  → retrieving_memory
  → planning
  → proposing_action
  → permission_check
    → waiting_for_user
    → blocked
    → executing
  → verifying
    → recovering
    → learning
  → completed | failed | canceled
```

## Permission tiers

### Tier 0 — Safe

Read-only or reversible actions.

Examples:
- Read page.
- Search.
- Open safe local file.
- Draft text.
- Summarize.
- Create non-submitted form draft.

Behavior:
- Can execute automatically if within task scope.

### Tier 1 — Review

Low-risk but state-changing actions.

Examples:
- Edit draft document.
- Create local file.
- Modify non-critical settings.
- Save workflow.

Behavior:
- May execute under plan-level approval or require inline confirmation depending on workspace policy.

### Tier 2 — Sensitive

High impact, credential, identity, finance, external communication, production data, or irreversible risk.

Examples:
- Submit form.
- Send email/message.
- Make purchase.
- Enter credentials.
- Delete files.
- Run shell command that modifies system state.
- Change production config.
- Access financial or medical/legal records.

Behavior:
- Requires explicit approval or takeover. Credentials and payment details should be entered by user in takeover mode where agent cannot see secrets.

### Tier 3 — Blocked

Disallowed or outside product scope.

Examples:
- Hidden credential extraction.
- Banking transaction execution.
- Circumventing security.
- Destructive actions without recoverable backup.
- High-stakes decisions on behalf of user.
- Actions forbidden by law, policy, or terms.

Behavior:
- Must not execute.

## Model routing

Start simple:
- Cheap model for summarization, tagging, memory extraction.
- Strong model for planning, computer-use decisions, and verification.
- Dedicated classifier or rules for risk policy.
- Fake model adapter for deterministic tests.

Do not hard-code provider prices in business logic. Store pricing in config with date/version.

## Memory retrieval strategy

At minimum:
1. Retrieve by workspace and user.
2. Filter by permission and privacy scope.
3. Rank by semantic similarity, recency, reliability, and task type.
4. Inject only the top relevant memories.
5. Record what was retrieved and why.

## Learning strategy

Do not let the agent silently rewrite durable memory.

Use a staged pipeline:
1. Capture feedback.
2. Generate memory candidate.
3. Label as preference, fact, correction, or skill.
4. Ask user to approve if durable or sensitive.
5. Store with source and confidence.
6. Allow edit/delete.

## Evidence and replay

Every real computer-use run should be reviewable.

Evidence types:
- screenshots
- accessibility tree snapshots
- DOM snapshots when available
- action list
- command logs
- file diffs
- network/tool call metadata
- model/tool usage
- permission decisions
- final artifact

## Minimal viable implementation

If the current repo is small, implement this in layers:

1. Event log and schemas.
2. Cognitive kernel with fake gateway.
3. Gateway adapters.
4. Permission gate.
5. Memory and skill loop.
6. UI/API views.
7. Evaluation suite.
