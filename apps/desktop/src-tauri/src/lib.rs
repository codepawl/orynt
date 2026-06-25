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
    max_usd: Option<f64>,
    stop_on_budget_exceeded: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRunInput {
    task: String,
    surface_kind: String,
    budget_policy: BudgetPolicy,
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
#[serde(tag = "type")]
pub enum RunEvent {
    #[serde(rename = "run.created", rename_all = "camelCase")]
    Created {
        run_id: String,
        task: String,
        summary: String,
    },
    #[serde(rename = "run.step_added", rename_all = "camelCase")]
    StepAdded {
        run_id: String,
        step_index: u32,
        summary: String,
    },
    #[serde(rename = "approval.resolved", rename_all = "camelCase")]
    ApprovalResolved {
        run_id: String,
        approval_id: String,
        decision: ApprovalDecision,
    },
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
    if input.task.trim().is_empty() {
        return Err(AppError::Validation("task is required".into()));
    }

    if input.surface_kind != "browser" {
        return Err(AppError::Validation(
            "browser is the only executable MVP surface".into(),
        ));
    }

    if input.budget_policy.max_steps == 0 {
        return Err(AppError::Validation("maxSteps must be greater than zero".into()));
    }

    if let Some(max_usd) = input.budget_policy.max_usd {
        if !max_usd.is_finite() || max_usd <= 0.0 {
            return Err(AppError::Validation("maxUsd must be greater than zero".into()));
        }
    }

    if !input.budget_policy.stop_on_budget_exceeded {
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
        RunEvent::Created {
            run_id: run_id.clone(),
            task: input.task.clone(),
            summary: "Mock run created".into(),
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        RunEvent::StepAdded {
            run_id: run_id.clone(),
            step_index: 1,
            summary: "Mock Rust host validated the run and queued browser observation".into(),
        },
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

    app.emit(
        "run_event",
        RunEvent::ApprovalResolved {
            run_id: input.run_id,
            approval_id: input.approval_id,
            decision: input.decision,
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
        executable_surfaces: vec!["browser".into()],
        blocked_surfaces: vec!["desktop".into(), "files".into(), "terminal".into()],
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
            task: "Fill a browser form".into(),
            surface_kind: "browser".into(),
            budget_policy: BudgetPolicy {
                max_steps: 40,
                max_usd: Some(1.0),
                stop_on_budget_exceeded: true,
            },
        }
    }

    #[test]
    fn validate_create_run_accepts_browser_only_mvp_input() {
        assert!(validate_create_run(&valid_run_input()).is_ok());
    }

    #[test]
    fn validate_create_run_rejects_future_surfaces() {
        let mut input = valid_run_input();
        input.surface_kind = "terminal".into();

        let error = validate_create_run(&input).expect_err("terminal must be blocked");
        assert_eq!(error.to_string(), "browser is the only executable MVP surface");
    }

    #[test]
    fn validate_create_run_requires_budget_stop() {
        let mut input = valid_run_input();
        input.budget_policy.stop_on_budget_exceeded = false;

        let error = validate_create_run(&input).expect_err("budget stop is required");
        assert_eq!(
            error.to_string(),
            "stopOnBudgetExceeded must be enabled for the MVP"
        );
    }
}
