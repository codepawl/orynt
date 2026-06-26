use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use thiserror::Error;

#[derive(Debug, Default)]
pub struct AppState {
    runs: Mutex<Vec<String>>,
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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalDecision {
    Approved,
    Denied,
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
        return Err(AppError::Validation("maxSteps must be greater than zero".into()));
    }

    if input.budget.max_wall_time_ms == 0 || input.budget.max_model_tokens == 0 {
        return Err(AppError::Validation(
            "maxWallTimeMs and maxModelTokens must be greater than zero".into(),
        ));
    }

    if let Some(max_usd) = input.budget.max_usd {
        if !max_usd.is_finite() || max_usd <= 0.0 {
            return Err(AppError::Validation("maxUsd must be greater than zero".into()));
        }
    }

    if !input.budget.stop_on_budget_exceeded {
        return Err(AppError::Validation(
            "stopOnBudgetExceeded must be enabled for the MVP".into(),
        ));
    }

    Ok(())
}

fn now_run_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("run-{millis}")
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
        run_event(
            &run_id,
            2,
            "goal_received",
            "user",
            "operator",
            &input.goal,
        ),
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
            artifacts: vec![
                serde_json::json!({
                    "id": "mock-codex-result-import",
                    "kind": "codex_result_bundle",
                    "uri": format!("codepawl-artifact://{run_id}/codex-result-import.json"),
                    "label": "Imported manual Codex result bundle",
                    "sha256": "mock-codex-result-import-sha256",
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
            artifacts: vec![
                serde_json::json!({
                    "id": "mock-verification-result",
                    "kind": "validation_report",
                    "uri": format!("codepawl-artifact://{run_id}/verification-result.json"),
                    "label": "Verification result",
                    "sha256": "mock-verification-result-sha256",
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
            31,
            "verification_passed",
            "verifier",
            "tauri-host",
            "Verification passed with machine-readable evidence",
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
        return Err(AppError::Validation("providerId and label are required".into()));
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

#[tauri::command]
async fn skill_replay(skill_id: String) -> Result<RunId, AppError> {
    if skill_id.trim().is_empty() {
        return Err(AppError::Validation("skillId is required".into()));
    }

    Ok(RunId { id: now_run_id() })
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            run_create,
            run_cancel,
            approval_respond,
            settings_get,
            settings_update,
            provider_key_save,
            provider_key_test,
            trace_export,
            skill_replay
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
}
