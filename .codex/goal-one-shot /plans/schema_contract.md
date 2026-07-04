# Schema Contract

Use existing database conventions in the repo. This file defines semantic requirements, not exact ORM syntax.

## agent_runs

Purpose: one row per user-delegated task.

Minimum columns:
- id
- workspace_id
- user_id
- plan_id nullable
- status
- user_goal
- normalized_goal
- task_type nullable
- risk_level
- started_at
- ended_at nullable
- duration_seconds nullable
- primary_model_provider nullable
- primary_model_name nullable
- estimated_cost_usd default 0
- credits_consumed default 0
- human_intervention_count default 0
- approval_count default 0
- blocked_action_count default 0
- retry_count default 0
- final_summary nullable
- failure_reason nullable
- created_at
- updated_at

## agent_events

Purpose: append-only event stream.

Minimum columns:
- id
- run_id
- workspace_id
- user_id
- event_type
- event_index
- payload_json
- visibility: internal | user | admin
- created_at

Indexes:
- run_id, event_index
- workspace_id, created_at
- event_type, created_at

## permission_events

Purpose: audit action permission decisions.

Minimum columns:
- id
- run_id
- action_id
- permission_tier
- decision: auto_allowed | approval_requested | approved | rejected | blocked | takeover_required
- reason
- policy_version
- requested_at
- decided_at nullable
- decided_by_user_id nullable

## model_usage_ledger

Purpose: track model costs.

Minimum columns:
- id
- run_id
- workspace_id
- user_id
- provider
- model
- input_tokens
- cached_input_tokens
- output_tokens
- tool_calls
- unit_price_config_version
- estimated_cost_usd
- created_at

## gateway_usage_ledger

Purpose: track runtime/gateway costs.

Minimum columns:
- id
- run_id
- workspace_id
- user_id
- gateway_type
- action_type
- duration_ms
- transferred_mb
- storage_gb_day
- request_count
- estimated_cost_usd
- created_at

## run_artifacts

Purpose: evidence and replay.

Minimum columns:
- id
- run_id
- event_id nullable
- artifact_type: screenshot | dom | accessibility_tree | command_log | file_diff | generated_file | trace | other
- storage_ref
- sha256 nullable
- visibility
- created_at

## semantic_memories

Purpose: stable facts and preferences.

Minimum columns:
- id
- workspace_id
- user_id nullable
- scope: user | workspace | project | site | tool
- key
- value_json
- source_event_id nullable
- source_run_id nullable
- confidence
- sensitivity
- status: candidate | approved | rejected | deleted
- expires_at nullable
- created_at
- updated_at
- deleted_at nullable

## episodic_memories

Purpose: retrievable run summaries.

Minimum columns:
- id
- run_id
- workspace_id
- user_id
- summary
- outcome
- task_type nullable
- retrieval_tags
- embedding_ref nullable
- cost_usd
- duration_seconds
- user_rating nullable
- created_at

## procedural_skills

Purpose: reusable workflows.

Minimum columns:
- id
- workspace_id
- owner_user_id
- name
- description
- version
- status: draft | candidate | approved | deprecated
- preconditions_json
- required_tools_json
- permission_requirements_json
- steps_json
- verification_checks_json
- examples_json
- created_from_run_ids_json
- success_count
- failure_count
- last_validated_at nullable
- created_at
- updated_at

## Migration rule

Codex should adapt to the existing ORM/migration system. If no database exists, implement typed in-memory or file-backed repositories first, with interfaces ready for persistence.
