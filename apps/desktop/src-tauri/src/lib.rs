use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use thiserror::Error;

#[derive(Debug, Default)]
pub struct AppState {
    runs: Mutex<Vec<String>>,
    candidate_rule_statuses: Mutex<HashMap<String, CandidateRuleReviewStatus>>,
    skill_statuses: Mutex<HashMap<String, SkillLifecycleStatus>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetPolicy {
    max_steps: u32,
    max_wall_time_ms: u64,
    max_model_tokens: u32,
    max_usd: Option<f64>,
    stop_on_budget_exceeded: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRunInput {
    goal: String,
    capability_id: String,
    task_id: String,
    workspace_id: String,
    budget: BudgetPolicy,
}

#[derive(Debug, Serialize)]
pub struct RunId {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDecisionInput {
    run_id: String,
    approval_id: String,
    decision: ApprovalDecision,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateRuleStatusUpdateInput {
    id: String,
    status: CandidateRuleReviewStatus,
    run_id: Option<String>,
    superseded_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillStatusUpdateInput {
    skill_id: String,
    decision: SkillDecision,
    actor: String,
    reason: String,
    run_id: Option<String>,
    superseded_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillReplayPlanInput {
    skill_id: String,
    run_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalDecision {
    Approved,
    Denied,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CandidateRuleReviewStatus {
    Accepted,
    Rejected,
    Superseded,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SkillDecision {
    Promote,
    Reject,
    Supersede,
    Archive,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SkillLifecycleStatus {
    Candidate,
    Active,
    Rejected,
    Superseded,
    Archived,
}

impl SkillLifecycleStatus {
    fn as_str(&self) -> &'static str {
        match self {
            SkillLifecycleStatus::Candidate => "candidate",
            SkillLifecycleStatus::Active => "active",
            SkillLifecycleStatus::Rejected => "rejected",
            SkillLifecycleStatus::Superseded => "superseded",
            SkillLifecycleStatus::Archived => "archived",
        }
    }
}

impl SkillDecision {
    fn status(&self) -> SkillLifecycleStatus {
        match self {
            SkillDecision::Promote => SkillLifecycleStatus::Active,
            SkillDecision::Reject => SkillLifecycleStatus::Rejected,
            SkillDecision::Supersede => SkillLifecycleStatus::Superseded,
            SkillDecision::Archive => SkillLifecycleStatus::Archived,
        }
    }
}

impl CandidateRuleReviewStatus {
    fn as_str(&self) -> &'static str {
        match self {
            CandidateRuleReviewStatus::Accepted => "accepted",
            CandidateRuleReviewStatus::Rejected => "rejected",
            CandidateRuleReviewStatus::Superseded => "superseded",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEvent {
    id: String,
    run_id: String,
    sequence: u32,
    #[serde(rename = "type")]
    event_type: String,
    timestamp: String,
    actor: serde_json::Value,
    payload: serde_json::Value,
    redaction: serde_json::Value,
    artifacts: Vec<serde_json::Value>,
    safety: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshot {
    workspace_id: String,
    permission_mode: String,
    executable_surfaces: Vec<String>,
    blocked_surfaces: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdateInput {
    permission_mode: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderKeySaveInput {
    provider_id: String,
    label: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretReference {
    provider_id: String,
    key_ref: String,
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("state lock failed")]
    StateLock,
    #[error("event emit failed: {0}")]
    Event(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

fn validate_create_run(input: &CreateRunInput) -> Result<(), AppError> {
    if input.goal.trim().is_empty() {
        return Err(AppError::Validation("goal is required".into()));
    }

    if input.capability_id.trim().is_empty()
        || input.task_id.trim().is_empty()
        || input.workspace_id.trim().is_empty()
    {
        return Err(AppError::Validation(
            "capabilityId, taskId, and workspaceId are required".into(),
        ));
    }

    if input.budget.max_steps == 0 {
        return Err(AppError::Validation(
            "maxSteps must be greater than zero".into(),
        ));
    }

    if input.budget.max_wall_time_ms == 0 || input.budget.max_model_tokens == 0 {
        return Err(AppError::Validation(
            "maxWallTimeMs and maxModelTokens must be greater than zero".into(),
        ));
    }

    if let Some(max_usd) = input.budget.max_usd {
        if !max_usd.is_finite() || max_usd <= 0.0 {
            return Err(AppError::Validation(
                "maxUsd must be greater than zero".into(),
            ));
        }
    }

    if !input.budget.stop_on_budget_exceeded {
        return Err(AppError::Validation(
            "stopOnBudgetExceeded must be enabled for the MVP".into(),
        ));
    }

    Ok(())
}

fn validate_candidate_rule_status_update(
    input: &CandidateRuleStatusUpdateInput,
) -> Result<(), AppError> {
    if input.id.trim().is_empty() {
        return Err(AppError::Validation("candidate rule id is required".into()));
    }

    Ok(())
}

fn validate_skill_status_update(input: &SkillStatusUpdateInput) -> Result<(), AppError> {
    if input.skill_id.trim().is_empty() {
        return Err(AppError::Validation("skill id is required".into()));
    }
    if input.actor.trim().is_empty() {
        return Err(AppError::Validation("skill decision actor is required".into()));
    }
    if input.reason.trim().is_empty() {
        return Err(AppError::Validation("skill decision reason is required".into()));
    }

    Ok(())
}

fn validate_skill_replay_plan_input(input: &SkillReplayPlanInput) -> Result<(), AppError> {
    if input.skill_id.trim().is_empty() {
        return Err(AppError::Validation("skill id is required".into()));
    }

    Ok(())
}

fn candidate_rule_review_event_type(status: &CandidateRuleReviewStatus) -> &'static str {
    match status {
        CandidateRuleReviewStatus::Accepted => "candidate_rule_accepted",
        CandidateRuleReviewStatus::Rejected => "candidate_rule_rejected",
        CandidateRuleReviewStatus::Superseded => "candidate_rule_superseded",
    }
}

fn skill_decision_event_type(decision: &SkillDecision) -> &'static str {
    match decision {
        SkillDecision::Promote => "skill_promoted_manual",
        SkillDecision::Reject => "skill_rejected",
        SkillDecision::Supersede => "skill_superseded",
        SkillDecision::Archive => "skill_archived",
    }
}

fn skill_replay_lifecycle_event_types(blocked: bool) -> Vec<&'static str> {
    vec![
        "skill_replay_plan_requested",
        "skill_replay_preconditions_checked",
        "skill_replay_policy_checked",
        "skill_replay_budget_estimated",
        if blocked {
            "skill_replay_plan_blocked"
        } else {
            "skill_replay_plan_created"
        },
    ]
}

fn now_run_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("run-{millis}")
}

fn memory_namespace() -> serde_json::Value {
    serde_json::json!({
        "capabilityId": "coding-apprentice",
        "workspaceId": "workspace-local-alpha",
        "repositoryPath": "/repos/codepawl",
    })
}

fn memory_provenance(run_id: &str) -> serde_json::Value {
    serde_json::json!({
        "runId": run_id,
        "taskId": "task-failing-unit-test",
        "eventIds": [format!("{run_id}-event-30"), format!("{run_id}-event-34")],
        "artifactRefs": [
            {
                "id": "mock-memory-episode",
                "kind": "memory_episode",
                "uri": format!("codepawl-artifact://{run_id}/memory/memory-store.json#episode"),
                "label": "Episodic memory item",
                "sha256": "mock-memory-episode-sha256",
            },
            {
                "id": "mock-candidate-rule",
                "kind": "candidate_rule",
                "uri": format!("codepawl-artifact://{run_id}/memory/memory-store.json#candidate-rule"),
                "label": "Candidate project rule",
                "sha256": "mock-candidate-rule-sha256",
            },
        ],
        "sources": ["verification_result", "import_summary", "run_event"],
        "sourceTimestamps": ["2026-06-26T00:00:00.000Z"],
        "verificationResultId": "mock-verification-result",
        "importBundleId": "mock-codex-result-import",
    })
}

fn mock_memory_episode(run_id: &str) -> serde_json::Value {
    serde_json::json!({
        "id": "episode-latest-successful-run",
        "namespace": memory_namespace(),
        "kind": "run_episode",
        "summary": "Latest successful run episode: verifier passed after a package-only imported correction.",
        "content": {
            "status": "pass",
            "changedFiles": ["packages/shared/src/index.ts"],
            "redactedNote": "[REDACTED]",
        },
        "provenance": memory_provenance(run_id),
        "retention": { "ttlDays": 30, "archiveAfterDays": 90 },
        "redaction": { "applied": true, "redactedPaths": ["content.redactedNote"], "redactionCount": 1 },
        "confidence": 1,
        "createdAt": "2026-06-26T00:00:00.000Z",
    })
}

fn mock_candidate_rule(
    id: &str,
    title: &str,
    rule: &str,
    evidence_kind: &str,
    evidence_summary: &str,
    confidence: f64,
    status: &str,
    run_id: &str,
    redacted: bool,
    superseded_by: Option<&str>,
) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "namespace": memory_namespace(),
        "status": status,
        "title": title,
        "rule": rule,
        "scope": {
            "repositoryPath": "/repos/codepawl",
            "allowedPaths": ["apps/desktop/**", "packages/**"],
            "protectedPaths": [".env", "pnpm-lock.yaml"],
        },
        "evidence": [
            {
                "kind": evidence_kind,
                "summary": evidence_summary,
                "eventIds": [format!("{run_id}-event-30")],
                "artifactRefs": [
                    {
                        "id": "mock-candidate-rule",
                        "kind": "candidate_rule",
                        "uri": format!("codepawl-artifact://{run_id}/memory/memory-store.json#candidate-rule"),
                        "label": "Candidate project rule",
                        "sha256": "mock-candidate-rule-sha256",
                    }
                ],
                "confidence": confidence,
            }
        ],
        "provenance": memory_provenance(run_id),
        "redaction": {
            "applied": redacted,
            "redactedPaths": if redacted { vec!["rule", "evidence[0].summary"] } else { vec![] },
            "redactionCount": if redacted { 2 } else { 0 },
        },
        "createdAt": "2026-06-26T00:00:00.000Z",
        "updatedAt": "2026-06-26T00:00:00.000Z",
        "supersededBy": superseded_by,
    })
}

fn mock_candidate_rules(
    statuses: &HashMap<String, CandidateRuleReviewStatus>,
) -> Vec<serde_json::Value> {
    let run_id = "run-1";
    let package_status = statuses
        .get("candidate-rule-package-scope")
        .map(CandidateRuleReviewStatus::as_str)
        .unwrap_or("candidate");
    let redacted_status = statuses
        .get("candidate-rule-redacted-log")
        .map(CandidateRuleReviewStatus::as_str)
        .unwrap_or("candidate");
    vec![
        mock_candidate_rule(
            "candidate-rule-package-scope",
            "Keep package fixes scoped",
            "Keep source-only fixes under packages/** unless the contract says otherwise.",
            "allowed_scope_pattern",
            "Verifier passed after changed files stayed inside packages/**.",
            0.86,
            package_status,
            run_id,
            false,
            if package_status == "superseded" {
                Some("candidate-rule-replacement-demo")
            } else {
                None
            },
        ),
        mock_candidate_rule(
            "candidate-rule-redacted-log",
            "Avoid secret-bearing logs",
            "Do not persist imported manual logs containing [REDACTED]; keep only redacted summaries and artifact references.",
            "command_observation",
            "Manual import evidence contained [REDACTED] and was redacted before display.",
            0.78,
            redacted_status,
            run_id,
            true,
            if redacted_status == "superseded" {
                Some("candidate-rule-replacement-demo")
            } else {
                None
            },
        ),
    ]
}

fn mock_skill(
    status: &SkillLifecycleStatus,
    run_id: &str,
    superseded_by: Option<&str>,
) -> serde_json::Value {
    serde_json::json!({
        "id": "skill-keep-package-fixes-scoped",
        "namespace": memory_namespace(),
        "capabilityId": "coding-apprentice.repository-scope",
        "title": "Keep package fixes scoped",
        "summary": "Apply package-only source fixes, keep protected files untouched, and validate with pnpm test:contracts. Redacted note: [REDACTED].",
        "status": status.as_str(),
        "confidence": 0.86,
        "preconditions": [
            {
                "id": "precondition-accepted-rule",
                "kind": "memory_rule_status",
                "summary": "Accepted rule required: candidate-rule-package-scope",
                "required": true,
            },
            {
                "id": "precondition-successful-verifier",
                "kind": "verification_available",
                "summary": "Successful verifier evidence must be present before manual promotion.",
                "required": true,
            },
        ],
        "steps": [
            {
                "id": "step-review-scope",
                "title": "Review repository scope",
                "instruction": "Keep edits under packages/** unless a later approved contract expands scope.",
                "expectedOutcome": "No protected path is touched.",
                "evidenceRefs": [format!("{run_id}-event-30")],
            },
            {
                "id": "step-validate",
                "title": "Validate contracts",
                "instruction": "Use verifier commands as validation expectations only; do not execute automatically.",
                "expectedOutcome": "Verifier evidence remains passing.",
            },
        ],
        "validation": {
            "requiresVerifierPass": true,
            "requiresDiffWithinScope": true,
            "commands": ["pnpm test:contracts"],
            "expectedEvidenceKinds": ["command", "diff_scope"],
        },
        "safety": {
            "allowedPaths": ["packages/**"],
            "protectedPaths": [".env", "pnpm-lock.yaml"],
            "allowedCommands": ["pnpm test:contracts"],
            "blockedActions": ["automatic_execution", "codex_auto_run", "browser_automation", "secret_storage"],
            "requiresManualApproval": true,
            "rollbackNotes": "Archive or supersede this skill if later verifier evidence invalidates the package-scope rule.",
            "secretHandling": "Store only redacted summaries and artifact references; never store raw sensitive values.",
        },
        "provenance": {
            "sourceRunIds": [run_id],
            "sourceTaskIds": ["task-failing-unit-test"],
            "candidateRuleIds": ["candidate-rule-package-scope"],
            "episodeIds": ["episode-latest-successful-run"],
            "verificationResultIds": ["mock-verification-result"],
            "codexContractIds": ["mock-codex-contract"],
            "artifactRefs": [
                {
                    "id": "mock-skill-definition",
                    "kind": "skill_definition",
                    "uri": format!("codepawl-artifact://{run_id}/skills/skill-package-scope.json"),
                    "label": "Candidate skill definition",
                    "sha256": "mock-skill-definition-sha256",
                }
            ],
            "sourceEventIds": [format!("{run_id}-event-30"), format!("{run_id}-event-34")],
        },
        "redaction": { "applied": true, "redactedPaths": ["summary"], "redactionCount": 1 },
        "promotionDecisions": [],
        "createdAt": "2026-06-26T00:00:00.000Z",
        "updatedAt": "2026-06-26T00:00:00.000Z",
        "supersededBy": superseded_by,
    })
}

fn mock_skills(statuses: &HashMap<String, SkillLifecycleStatus>) -> Vec<serde_json::Value> {
    let status = statuses
        .get("skill-keep-package-fixes-scoped")
        .cloned()
        .unwrap_or(SkillLifecycleStatus::Candidate);
    vec![mock_skill(
        &status,
        "run-1",
        if status == SkillLifecycleStatus::Superseded {
            Some("skill-replacement-demo")
        } else {
            None
        },
    )]
}

fn mock_skill_replay_plan(skill: &serde_json::Value, run_id: &str) -> serde_json::Value {
    let skill_id = skill
        .get("id")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("skill-keep-package-fixes-scoped");
    let skill_title = skill
        .get("title")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("Keep package fixes scoped");
    let skill_status = skill
        .get("status")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("candidate");
    let readiness = match skill_status {
        "active" => "ready",
        "candidate" => "preview_only",
        _ => "blocked",
    };
    let stop_reasons = match skill_status {
        "candidate" => serde_json::json!(["candidate_preview_only"]),
        "active" => serde_json::json!([]),
        _ => serde_json::json!(["skill_not_active"]),
    };
    let mode = if skill_status == "candidate" {
        "candidate_preview"
    } else {
        "active_dry_run"
    };

    serde_json::json!({
        "id": format!("skill-replay-plan-{skill_id}"),
        "runId": run_id,
        "taskId": "task-failing-unit-test",
        "skillId": skill_id,
        "skillTitle": skill_title,
        "skillStatus": skill_status,
        "mode": mode,
        "dryRunOnly": true,
        "executable": false,
        "readiness": readiness,
        "summary": if skill_status == "candidate" {
            format!("{skill_title} is available as a dry-run preview only; candidate skills are not executable.")
        } else if skill_status == "active" {
            format!("{skill_title} dry-run replay plan is ready for manual review.")
        } else {
            format!("{skill_title} replay planning is blocked: skill_not_active.")
        },
        "preconditions": [
            {
                "id": "precondition-accepted-rule",
                "kind": "memory_rule_status",
                "summary": "Accepted rule required: candidate-rule-package-scope",
                "required": true,
                "status": "passed",
            },
            {
                "id": "precondition-successful-verifier",
                "kind": "verification_available",
                "summary": "Successful verifier evidence must be present before manual promotion.",
                "required": true,
                "status": "passed",
            },
        ],
        "steps": [
            {
                "id": "replay-step-review-scope",
                "title": "Review repository scope",
                "kind": "skill_step",
                "summary": "Keep edits under packages/** unless a later approved contract expands scope. Expected: No protected path is touched.",
                "dryRunOnly": true,
                "status": if readiness == "blocked" { "skipped" } else { "planned" },
            },
            {
                "id": "replay-step-validate",
                "title": "Validate contracts",
                "kind": "validation_expectation",
                "summary": "pnpm test:contracts",
                "dryRunOnly": true,
                "status": if readiness == "blocked" { "skipped" } else { "planned" },
            },
        ],
        "risks": if readiness == "blocked" { serde_json::json!(["blocked"]) } else { serde_json::json!(["low"]) },
        "policyChecks": [
            {
                "actionId": "skill-replay-command-1",
                "summary": "Validate replay expectation: pnpm test:contracts",
                "decision": "allow",
                "risk": "low",
                "approvalRequired": false,
                "reasons": ["Command is on the conservative allowlist."],
                "violations": [],
            }
        ],
        "validationExpectations": [
            {
                "command": "pnpm test:contracts",
                "allowed": true,
                "expectedEvidenceKinds": ["command", "diff_scope"],
                "requiresVerifierPass": true,
                "policyDecision": "allow",
                "reason": "Command is on the conservative allowlist.",
            }
        ],
        "budgetEstimate": {
            "estimatedSteps": 6,
            "estimatedCommands": 1,
            "estimatedArtifacts": 2,
            "estimatedModelTokens": 2800,
            "estimatedWallTimeMs": 180000,
            "decision": "allow",
            "stopReasons": [],
        },
        "blockedActions": ["automatic_execution", "codex_auto_run", "browser_automation", "secret_storage"],
        "requiredApprovals": ["manual approval required before any future skill execution"],
        "expectedArtifacts": [
            {
                "id": format!("skill-replay-plan-{skill_id}"),
                "kind": "skill_replay_plan",
                "uri": format!("codepawl-artifact://{run_id}/skills/{skill_id}-replay-plan.json"),
                "label": "Skill replay dry-run plan",
            }
        ],
        "stopReasons": stop_reasons,
        "redaction": { "applied": true, "redactedPaths": ["summary"], "redactionCount": 1 },
        "createdAt": now_iso_like(),
    })
}

fn now_iso_like() -> String {
    "2026-06-26T00:00:00.000Z".into()
}

fn run_event(
    run_id: &str,
    sequence: u32,
    event_type: &str,
    actor_kind: &str,
    actor_id: &str,
    summary: &str,
) -> RunEvent {
    RunEvent {
        id: format!("{run_id}-event-{sequence}"),
        run_id: run_id.into(),
        sequence,
        event_type: event_type.into(),
        timestamp: now_iso_like(),
        actor: serde_json::json!({ "kind": actor_kind, "id": actor_id }),
        payload: serde_json::json!({ "summary": summary }),
        redaction: serde_json::json!({ "applied": false, "redactedPaths": [] }),
        artifacts: vec![],
        safety: None,
    }
}

#[tauri::command]
async fn run_create(
    app: AppHandle,
    state: State<'_, AppState>,
    input: CreateRunInput,
) -> Result<RunId, AppError> {
    validate_create_run(&input)?;

    let run_id = now_run_id();
    state
        .runs
        .lock()
        .map_err(|_| AppError::StateLock)?
        .push(run_id.clone());

    app.emit(
        "run_event",
        run_event(
            &run_id,
            1,
            "run_started",
            "runtime",
            "tauri-host",
            "Mock repository run started",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(&run_id, 2, "goal_received", "user", "operator", &input.goal),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            3,
            "policy_checked",
            "policy",
            "core-policy",
            "Allowed: command is on the conservative allowlist",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            4,
            "sandbox_planned",
            "policy",
            "core-policy",
            "Planned isolated repository worktree without executing commands",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            5,
            "sandbox_ready_mock",
            "runtime",
            "tauri-host",
            "Dry-run sandbox boundary is ready; no worktree was created",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            6,
            "codex_missing",
            "runtime",
            "tauri-host",
            "Codex CLI was not required for contract-only mode",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            7,
            "codex_contract_requested",
            "runtime",
            "tauri-host",
            "Requested safe Codex work contract generation",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        RunEvent {
            id: format!("{run_id}-event-8"),
            run_id: run_id.clone(),
            sequence: 8,
            event_type: "codex_contract_created".into(),
            timestamp: now_iso_like(),
            actor: serde_json::json!({ "kind": "runtime", "id": "tauri-host" }),
            payload: serde_json::json!({
                "summary": "Generated safe Codex work contract artifact",
                "contractId": format!("codex-contract-{run_id}"),
            }),
            redaction: serde_json::json!({ "applied": false, "redactedPaths": [] }),
            artifacts: vec![
                serde_json::json!({
                    "id": "mock-codex-contract-md",
                    "kind": "codex_contract",
                    "uri": format!("codepawl-artifact://{run_id}/codex-contract.md"),
                    "label": "Generated Codex work contract",
                    "sha256": "mock-codex-contract-md-sha256",
                }),
                serde_json::json!({
                    "id": "mock-codex-contract-metadata",
                    "kind": "codex_contract_metadata",
                    "uri": format!("codepawl-artifact://{run_id}/codex-contract.metadata.json"),
                    "label": "Generated Codex contract metadata",
                    "sha256": "mock-codex-contract-metadata-sha256",
                }),
            ],
            safety: None,
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            9,
            "codex_manual_next_step",
            "runtime",
            "tauri-host",
            "Manual next step: review the generated Codex contract before any provider execution",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            10,
            "codex_result_import_requested",
            "runtime",
            "tauri-host",
            "Requested manual Codex result import from the managed sandbox artifact directory",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            11,
            "codex_sandbox_diff_inspected",
            "runtime",
            "tauri-host",
            "Inspected sandbox diff scope before trusting imported result notes",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            12,
            "codex_manual_log_imported",
            "runtime",
            "tauri-host",
            "Imported optional manual Codex log from the CodePawl-managed artifact directory",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            13,
            "codex_result_redacted",
            "runtime",
            "tauri-host",
            "Redacted imported manual result content before persistence",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        RunEvent {
            id: format!("{run_id}-event-14"),
            run_id: run_id.clone(),
            sequence: 14,
            event_type: "codex_result_imported".into(),
            timestamp: now_iso_like(),
            actor: serde_json::json!({ "kind": "runtime", "id": "tauri-host" }),
            payload: serde_json::json!({
                "summary": "Imported structured manual Codex result bundle for verifier handoff",
                "status": "imported",
                "changedFileCount": 1,
            }),
            redaction: serde_json::json!({ "applied": false, "redactedPaths": [] }),
            artifacts: vec![serde_json::json!({
                "id": "mock-codex-result-import",
                "kind": "codex_result_bundle",
                "uri": format!("codepawl-artifact://{run_id}/codex-result-import.json"),
                "label": "Imported manual Codex result bundle",
                "sha256": "mock-codex-result-import-sha256",
            })],
            safety: None,
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            15,
            "manual_review_required",
            "runtime",
            "tauri-host",
            "Manual review checkpoint remains required before adopting imported work",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        RunEvent {
            id: format!("{run_id}-event-16"),
            run_id: run_id.clone(),
            sequence: 16,
            event_type: "verifier_input_created".into(),
            timestamp: now_iso_like(),
            actor: serde_json::json!({ "kind": "verifier", "id": "tauri-host" }),
            payload: serde_json::json!({
                "summary": "Created verifier input from imported Codex result without running verification",
                "commands": ["pnpm test:contracts"],
            }),
            redaction: serde_json::json!({ "applied": false, "redactedPaths": [] }),
            artifacts: vec![
                serde_json::json!({
                    "id": "mock-verifier-input",
                    "kind": "verifier_input",
                    "uri": format!("codepawl-artifact://{run_id}/verifier-input.json"),
                    "label": "Verifier input from imported Codex result",
                    "sha256": "mock-verifier-input-sha256",
                }),
            ],
            safety: None,
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            17,
            "context_initialized",
            "runtime",
            "tauri-host",
            "Mock Rust host validated the run and initialized repository context",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            18,
            "budget_initialized",
            "budget",
            "resource-governor",
            "Initialized ResourceGovernor budget",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            19,
            "budget_checked",
            "budget",
            "resource-governor",
            "Allowed: budget is within conservative limits",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            20,
            "workspace_initialized",
            "runtime",
            "tauri-host",
            "Initialized bounded ContextWorkspace",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            21,
            "workspace_item_added",
            "runtime",
            "tauri-host",
            "Added workspace item: sandbox boundary",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            22,
            "budget_checked",
            "budget",
            "resource-governor",
            "Allowed: budget check before verifier",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            23,
            "context_packet_created",
            "runtime",
            "tauri-host",
            "Created bounded ContextPacket",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            24,
            "verification_planned",
            "verifier",
            "tauri-host",
            "Planned deterministic repository verification",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            25,
            "verification_policy_checked",
            "verifier",
            "tauri-host",
            "Verified validation commands against CorePolicy allowlist",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            26,
            "verification_started",
            "verifier",
            "tauri-host",
            "Started deterministic verifier for sandbox worktree",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            27,
            "verification_command_started",
            "verifier",
            "tauri-host",
            "Started verification command: pnpm test:contracts",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            28,
            "verification_command_finished",
            "verifier",
            "tauri-host",
            "Finished verification command: pnpm test:contracts",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            29,
            "verification_diff_checked",
            "verifier",
            "tauri-host",
            "Checked diff scope for protected and unexpected paths",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        RunEvent {
            id: format!("{run_id}-event-30"),
            run_id: run_id.clone(),
            sequence: 30,
            event_type: "verification_recorded".into(),
            timestamp: now_iso_like(),
            actor: serde_json::json!({ "kind": "verifier", "id": "tauri-host" }),
            payload: serde_json::json!({
                "summary": "Recorded deterministic validation evidence for the repository run",
            }),
            redaction: serde_json::json!({ "applied": false, "redactedPaths": [] }),
            artifacts: vec![serde_json::json!({
                "id": "mock-verification-result",
                "kind": "validation_report",
                "uri": format!("codepawl-artifact://{run_id}/verification-result.json"),
                "label": "Verification result",
                "sha256": "mock-verification-result-sha256",
            })],
            safety: None,
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            31,
            "verification_passed",
            "verifier",
            "tauri-host",
            "Verification passed with machine-readable evidence",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            32,
            "memory_extraction_started",
            "runtime",
            "tauri-host",
            "Memory extraction started from redacted verifier and import evidence",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            33,
            "memory_episode_written",
            "runtime",
            "tauri-host",
            "Wrote successful run episode memory with verifier provenance",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            34,
            "candidate_rule_proposed",
            "runtime",
            "tauri-host",
            "Candidate rule proposed from verified package-only change",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &run_id,
            35,
            "memory_extraction_finished",
            "runtime",
            "tauri-host",
            "Memory extraction finished with candidate-only learning output",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;

    Ok(RunId { id: run_id })
}

#[tauri::command]
async fn run_cancel(run_id: String) -> Result<(), AppError> {
    if run_id.trim().is_empty() {
        return Err(AppError::Validation("runId is required".into()));
    }

    Ok(())
}

#[tauri::command]
async fn approval_respond(app: AppHandle, input: ApprovalDecisionInput) -> Result<(), AppError> {
    if input.run_id.trim().is_empty() {
        return Err(AppError::Validation("runId is required".into()));
    }
    if input.approval_id.trim().is_empty() {
        return Err(AppError::Validation("approvalId is required".into()));
    }

    let decision_label = match &input.decision {
        ApprovalDecision::Approved => "approved",
        ApprovalDecision::Denied => "denied",
    };

    app.emit(
        "run_event",
        RunEvent {
            id: format!("{}-event-approval-{}", input.run_id, input.approval_id),
            run_id: input.run_id,
            sequence: 10_000,
            event_type: "action_blocked_or_approved".into(),
            timestamp: now_iso_like(),
            actor: serde_json::json!({ "kind": "policy", "id": "tauri-host" }),
            payload: serde_json::json!({
                "summary": format!("Approval {} for {}", decision_label, input.approval_id),
                "approvalId": input.approval_id,
                "decision": input.decision,
            }),
            redaction: serde_json::json!({ "applied": false, "redactedPaths": [] }),
            artifacts: vec![],
            safety: Some(serde_json::json!({
                "policyMode": "safe",
                "riskLevel": "low",
                "approvalRequired": false,
                "protectedPathTouched": false,
                "commandAllowed": true,
                "reasons": ["operator decision recorded"],
            })),
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;

    Ok(())
}

#[tauri::command]
async fn memory_list_episodes() -> Result<Vec<serde_json::Value>, AppError> {
    Ok(vec![mock_memory_episode("run-1")])
}

#[tauri::command]
async fn memory_list_candidate_rules(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, AppError> {
    let statuses = state
        .candidate_rule_statuses
        .lock()
        .map_err(|_| AppError::StateLock)?;

    Ok(mock_candidate_rules(&statuses))
}

#[tauri::command]
async fn memory_update_candidate_rule_status(
    app: AppHandle,
    state: State<'_, AppState>,
    input: CandidateRuleStatusUpdateInput,
) -> Result<serde_json::Value, AppError> {
    validate_candidate_rule_status_update(&input)?;

    {
        let mut statuses = state
            .candidate_rule_statuses
            .lock()
            .map_err(|_| AppError::StateLock)?;
        statuses.insert(input.id.clone(), input.status.clone());
    }

    let run_id = input.run_id.clone().unwrap_or_else(|| "run-1".into());
    let event_type = candidate_rule_review_event_type(&input.status);
    app.emit(
        "run_event",
        RunEvent {
            id: format!("{}-event-{}-{}", run_id, event_type, input.id),
            run_id: run_id.clone(),
            sequence: 20_000,
            event_type: event_type.into(),
            timestamp: now_iso_like(),
            actor: serde_json::json!({ "kind": "ui", "id": "memory-review-panel" }),
            payload: serde_json::json!({
                "summary": format!("Candidate rule {}: {}", input.status.as_str(), input.id),
                "candidateRuleId": input.id,
                "status": input.status.as_str(),
            }),
            redaction: serde_json::json!({ "applied": false, "redactedPaths": [] }),
            artifacts: vec![],
            safety: None,
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;

    let statuses = state
        .candidate_rule_statuses
        .lock()
        .map_err(|_| AppError::StateLock)?;
    let rule = mock_candidate_rules(&statuses)
        .into_iter()
        .find(|rule| rule.get("id").and_then(serde_json::Value::as_str) == Some(input.id.as_str()))
        .ok_or_else(|| AppError::Validation("candidate rule not found".into()))?;
    let mut updated = rule;
    if input.status == CandidateRuleReviewStatus::Superseded {
        updated["supersededBy"] = serde_json::Value::String(
            input
                .superseded_by
                .unwrap_or_else(|| "candidate-rule-replacement-demo".into()),
        );
    }

    Ok(updated)
}

#[tauri::command]
async fn skill_list(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, AppError> {
    let statuses = state.skill_statuses.lock().map_err(|_| AppError::StateLock)?;
    Ok(mock_skills(&statuses))
}

#[tauri::command]
async fn skill_create_candidate(app: AppHandle) -> Result<serde_json::Value, AppError> {
    let run_id = "run-1";
    let skill = mock_skill(&SkillLifecycleStatus::Candidate, run_id, None);
    app.emit(
        "run_event",
        RunEvent {
            id: format!("{run_id}-event-skill-candidate-created"),
            run_id: run_id.into(),
            sequence: 20_000,
            event_type: "skill_candidate_created".into(),
            timestamp: now_iso_like(),
            actor: serde_json::json!({ "kind": "runtime", "id": "skill-registry" }),
            payload: serde_json::json!({
                "summary": "Candidate skill created: Keep package fixes scoped",
                "skillId": "skill-keep-package-fixes-scoped",
                "status": "candidate",
            }),
            redaction: serde_json::json!({ "applied": true, "redactedPaths": ["summary"] }),
            artifacts: vec![serde_json::json!({
                "id": "mock-skill-definition",
                "kind": "skill_definition",
                "uri": format!("codepawl-artifact://{run_id}/skills/skill-package-scope.json"),
                "label": "Candidate skill definition",
                "sha256": "mock-skill-definition-sha256",
            })],
            safety: None,
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    Ok(skill)
}

async fn apply_skill_decision(
    app: AppHandle,
    state: State<'_, AppState>,
    mut input: SkillStatusUpdateInput,
    decision: SkillDecision,
) -> Result<serde_json::Value, AppError> {
    input.decision = decision;
    validate_skill_status_update(&input)?;

    let status = input.decision.status();
    {
        let mut statuses = state.skill_statuses.lock().map_err(|_| AppError::StateLock)?;
        statuses.insert(input.skill_id.clone(), status.clone());
    }

    let run_id = input.run_id.clone().unwrap_or_else(|| "run-1".into());
    let event_type = skill_decision_event_type(&input.decision);
    app.emit(
        "run_event",
        RunEvent {
            id: format!("{}-event-{}-{}", run_id, event_type, input.skill_id),
            run_id: run_id.clone(),
            sequence: 20_001,
            event_type: event_type.into(),
            timestamp: now_iso_like(),
            actor: serde_json::json!({ "kind": "ui", "id": "skill-registry-panel" }),
            payload: serde_json::json!({
                "summary": format!("Skill {}: {}", status.as_str(), input.skill_id),
                "skillId": input.skill_id,
                "status": status.as_str(),
                "actor": input.actor,
                "reason": input.reason,
            }),
            redaction: serde_json::json!({ "applied": false, "redactedPaths": [] }),
            artifacts: vec![],
            safety: None,
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;

    let statuses = state.skill_statuses.lock().map_err(|_| AppError::StateLock)?;
    let mut skill = mock_skills(&statuses)
        .into_iter()
        .find(|skill| skill.get("id").and_then(serde_json::Value::as_str) == Some(input.skill_id.as_str()))
        .ok_or_else(|| AppError::Validation("skill not found".into()))?;
    if status == SkillLifecycleStatus::Superseded {
        skill["supersededBy"] = serde_json::Value::String(
            input
                .superseded_by
                .clone()
                .unwrap_or_else(|| "skill-replacement-demo".into()),
        );
    }
    skill["promotionDecisions"] = serde_json::json!([
        {
            "skillId": input.skill_id,
            "decision": input.decision,
            "actor": input.actor,
            "reason": input.reason,
            "runId": run_id,
            "supersededBy": input.superseded_by,
            "decidedAt": now_iso_like(),
        }
    ]);

    Ok(skill)
}

#[tauri::command]
async fn skill_promote_manual(
    app: AppHandle,
    state: State<'_, AppState>,
    input: SkillStatusUpdateInput,
) -> Result<serde_json::Value, AppError> {
    apply_skill_decision(app, state, input, SkillDecision::Promote).await
}

#[tauri::command]
async fn skill_reject(
    app: AppHandle,
    state: State<'_, AppState>,
    input: SkillStatusUpdateInput,
) -> Result<serde_json::Value, AppError> {
    apply_skill_decision(app, state, input, SkillDecision::Reject).await
}

#[tauri::command]
async fn skill_supersede(
    app: AppHandle,
    state: State<'_, AppState>,
    input: SkillStatusUpdateInput,
) -> Result<serde_json::Value, AppError> {
    apply_skill_decision(app, state, input, SkillDecision::Supersede).await
}

#[tauri::command]
async fn skill_archive(
    app: AppHandle,
    state: State<'_, AppState>,
    input: SkillStatusUpdateInput,
) -> Result<serde_json::Value, AppError> {
    apply_skill_decision(app, state, input, SkillDecision::Archive).await
}

#[tauri::command]
async fn skill_create_replay_plan(
    app: AppHandle,
    state: State<'_, AppState>,
    input: SkillReplayPlanInput,
) -> Result<serde_json::Value, AppError> {
    validate_skill_replay_plan_input(&input)?;

    let run_id = input.run_id.clone().unwrap_or_else(|| "run-1".into());
    let statuses = state.skill_statuses.lock().map_err(|_| AppError::StateLock)?;
    let skill = mock_skills(&statuses)
        .into_iter()
        .find(|skill| skill.get("id").and_then(serde_json::Value::as_str) == Some(input.skill_id.as_str()))
        .ok_or_else(|| AppError::Validation("skill not found".into()))?;
    let plan = mock_skill_replay_plan(&skill, &run_id);
    let blocked = plan
        .get("readiness")
        .and_then(serde_json::Value::as_str)
        == Some("blocked");

    for (index, event_type) in skill_replay_lifecycle_event_types(blocked).iter().enumerate() {
        let artifacts = if *event_type == "skill_replay_plan_created" || *event_type == "skill_replay_plan_blocked" {
            plan.get("expectedArtifacts")
                .and_then(serde_json::Value::as_array)
                .cloned()
                .unwrap_or_default()
        } else {
            vec![]
        };
        app.emit(
            "run_event",
            RunEvent {
                id: format!("{}-event-{}-{}", run_id, event_type, input.skill_id),
                run_id: run_id.clone(),
                sequence: 20_100 + index as u32,
                event_type: (*event_type).into(),
                timestamp: now_iso_like(),
                actor: serde_json::json!({ "kind": "ui", "id": "skill-registry-panel" }),
                payload: serde_json::json!({
                    "summary": format!("Skill replay {}: {}", plan.get("readiness").and_then(serde_json::Value::as_str).unwrap_or("unknown"), input.skill_id),
                    "skillId": input.skill_id,
                    "replayPlanId": plan.get("id").and_then(serde_json::Value::as_str).unwrap_or("skill-replay-plan"),
                    "readiness": plan.get("readiness").and_then(serde_json::Value::as_str).unwrap_or("unknown"),
                }),
                redaction: serde_json::json!({ "applied": true, "redactedPaths": ["summary"] }),
                artifacts,
                safety: None,
            },
        )
        .map_err(|error| AppError::Event(error.to_string()))?;
    }

    Ok(plan)
}

#[tauri::command]
async fn settings_get() -> Result<SettingsSnapshot, AppError> {
    Ok(SettingsSnapshot {
        workspace_id: "workspace-local-alpha".into(),
        permission_mode: "safe".into(),
        executable_surfaces: vec!["repository".into()],
        blocked_surfaces: vec![
            "browser".into(),
            "desktop".into(),
            "files".into(),
            "terminal".into(),
        ],
    })
}

#[tauri::command]
async fn settings_update(input: SettingsUpdateInput) -> Result<SettingsSnapshot, AppError> {
    match input.permission_mode.as_str() {
        "safe" | "balanced" | "manual" => settings_get().await,
        _ => Err(AppError::Validation(
            "permissionMode must be safe, balanced, or manual".into(),
        )),
    }
}

#[tauri::command]
async fn provider_key_save(input: ProviderKeySaveInput) -> Result<SecretReference, AppError> {
    if input.provider_id.trim().is_empty() || input.label.trim().is_empty() {
        return Err(AppError::Validation(
            "providerId and label are required".into(),
        ));
    }

    Ok(SecretReference {
        provider_id: input.provider_id,
        key_ref: "keychain://codepawl/local-alpha/provider".into(),
    })
}

#[tauri::command]
async fn provider_key_test(provider_id: String) -> Result<bool, AppError> {
    Ok(!provider_id.trim().is_empty())
}

#[tauri::command]
async fn trace_export(run_id: String) -> Result<String, AppError> {
    if run_id.trim().is_empty() {
        return Err(AppError::Validation("runId is required".into()));
    }

    Ok(format!("trace://local-alpha/{run_id}"))
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            run_create,
            run_cancel,
            approval_respond,
            memory_list_episodes,
            memory_list_candidate_rules,
            memory_update_candidate_rule_status,
            skill_list,
            skill_create_candidate,
            skill_promote_manual,
            skill_reject,
            skill_supersede,
            skill_archive,
            skill_create_replay_plan,
            settings_get,
            settings_update,
            provider_key_save,
            provider_key_test,
            trace_export
        ])
        .setup(|app| {
            let _ = app.handle().app_handle();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CodePawl desktop app");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_run_input() -> CreateRunInput {
        CreateRunInput {
            goal: "Fix a failing unit test".into(),
            capability_id: "coding-apprentice".into(),
            task_id: "task-1".into(),
            workspace_id: "workspace-1".into(),
            budget: BudgetPolicy {
                max_steps: 40,
                max_wall_time_ms: 1_800_000,
                max_model_tokens: 120_000,
                max_usd: Some(1.0),
                stop_on_budget_exceeded: true,
            },
        }
    }

    #[test]
    fn validate_create_run_accepts_repository_run_input() {
        assert!(validate_create_run(&valid_run_input()).is_ok());
    }

    #[test]
    fn validate_create_run_rejects_missing_identifiers() {
        let mut input = valid_run_input();
        input.workspace_id = "".into();

        let error = validate_create_run(&input).expect_err("workspace id is required");
        assert_eq!(
            error.to_string(),
            "capabilityId, taskId, and workspaceId are required"
        );
    }

    #[test]
    fn validate_create_run_requires_budget_stop() {
        let mut input = valid_run_input();
        input.budget.stop_on_budget_exceeded = false;

        let error = validate_create_run(&input).expect_err("budget stop is required");
        assert_eq!(
            error.to_string(),
            "stopOnBudgetExceeded must be enabled for the MVP"
        );
    }

    #[test]
    fn candidate_rule_status_update_requires_explicit_valid_status() {
        let accepted = CandidateRuleStatusUpdateInput {
            id: "candidate-rule-1".into(),
            status: CandidateRuleReviewStatus::Accepted,
            run_id: Some("run-1".into()),
            superseded_by: None,
        };

        assert!(validate_candidate_rule_status_update(&accepted).is_ok());

        let missing_id = CandidateRuleStatusUpdateInput {
            id: "".into(),
            status: CandidateRuleReviewStatus::Rejected,
            run_id: Some("run-1".into()),
            superseded_by: None,
        };
        let error = validate_candidate_rule_status_update(&missing_id).expect_err("id is required");
        assert_eq!(error.to_string(), "candidate rule id is required");
    }

    #[test]
    fn candidate_rule_review_status_maps_to_visible_run_event_type() {
        assert_eq!(
            candidate_rule_review_event_type(&CandidateRuleReviewStatus::Accepted),
            "candidate_rule_accepted"
        );
        assert_eq!(
            candidate_rule_review_event_type(&CandidateRuleReviewStatus::Rejected),
            "candidate_rule_rejected"
        );
        assert_eq!(
            candidate_rule_review_event_type(&CandidateRuleReviewStatus::Superseded),
            "candidate_rule_superseded"
        );
    }

    #[test]
    fn skill_status_update_requires_explicit_skill_id() {
        let promote = SkillStatusUpdateInput {
            skill_id: "skill-package-scope".into(),
            decision: SkillDecision::Promote,
            actor: "operator".into(),
            reason: "Reviewed evidence".into(),
            run_id: Some("run-1".into()),
            superseded_by: None,
        };

        assert!(validate_skill_status_update(&promote).is_ok());

        let missing_id = SkillStatusUpdateInput {
            skill_id: "".into(),
            decision: SkillDecision::Reject,
            actor: "operator".into(),
            reason: "Too broad".into(),
            run_id: Some("run-1".into()),
            superseded_by: None,
        };
        let error = validate_skill_status_update(&missing_id).expect_err("skill id is required");
        assert_eq!(error.to_string(), "skill id is required");
    }

    #[test]
    fn skill_decisions_map_to_visible_run_event_types() {
        assert_eq!(skill_decision_event_type(&SkillDecision::Promote), "skill_promoted_manual");
        assert_eq!(skill_decision_event_type(&SkillDecision::Reject), "skill_rejected");
        assert_eq!(skill_decision_event_type(&SkillDecision::Supersede), "skill_superseded");
        assert_eq!(skill_decision_event_type(&SkillDecision::Archive), "skill_archived");
    }

    #[test]
    fn skill_replay_plan_requires_explicit_skill_id() {
        let input = SkillReplayPlanInput {
            skill_id: "skill-package-scope".into(),
            run_id: Some("run-1".into()),
        };

        assert!(validate_skill_replay_plan_input(&input).is_ok());

        let missing_id = SkillReplayPlanInput {
            skill_id: "".into(),
            run_id: Some("run-1".into()),
        };
        let error = validate_skill_replay_plan_input(&missing_id).expect_err("skill id is required");
        assert_eq!(error.to_string(), "skill id is required");
    }

    #[test]
    fn skill_replay_lifecycle_maps_to_visible_run_event_types() {
        assert_eq!(
            skill_replay_lifecycle_event_types(false),
            vec![
                "skill_replay_plan_requested",
                "skill_replay_preconditions_checked",
                "skill_replay_policy_checked",
                "skill_replay_budget_estimated",
                "skill_replay_plan_created",
            ]
        );
        assert_eq!(
            skill_replay_lifecycle_event_types(true).last().copied(),
            Some("skill_replay_plan_blocked")
        );
    }
}
