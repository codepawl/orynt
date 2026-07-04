use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

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
    repository_path: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexExecutionInput {
    run_id: String,
    plan_id: String,
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
    provider_refs: Vec<SecretReference>,
    retention_policy: RetentionPolicySnapshot,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionPolicySnapshot {
    run_history_days: u32,
    artifact_retention_days: u32,
    cleanup_enabled: bool,
    summary: String,
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
    raw_secret: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSetupInput {
    provider_id: String,
    label: String,
    raw_secret: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderReadinessStatus {
    Untested,
    Ready,
    Failed,
}

impl Default for ProviderReadinessStatus {
    fn default() -> Self {
        Self::Untested
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPreflightResult {
    checked_provider_id: String,
    status: ProviderReadinessStatus,
    ready: bool,
    checked_at: String,
    executable_path: Option<String>,
    reasons: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretReference {
    provider_id: String,
    #[serde(default)]
    label: String,
    key_ref: String,
    #[serde(default)]
    status: ProviderReadinessStatus,
    #[serde(default)]
    last_preflight: Option<ProviderPreflightResult>,
}

const MAX_ARTIFACT_EVIDENCE_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactEvidenceKind {
    ArtifactManifest,
    Contract,
    ContractMetadata,
    EventLog,
    VerifierInput,
    VerificationResult,
    RedactedLog,
    MemoryCandidates,
    MemoryStore,
    UsageSummary,
    ReplayPlan,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ArtifactEvidenceStatus {
    Verified,
    Unavailable,
    Corrupted,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactEvidenceSummary {
    artifact_id: String,
    label: String,
    kind: ArtifactEvidenceKind,
    status: ArtifactEvidenceStatus,
    uri: Option<String>,
    byte_size: Option<u64>,
    content_type: Option<String>,
    reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactReadInput {
    run_id: String,
    artifact_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactEvidenceContent {
    artifact_id: String,
    label: String,
    kind: ArtifactEvidenceKind,
    status: ArtifactEvidenceStatus,
    content_type: String,
    byte_size: u64,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRepositoryRunOutput {
    run_id: String,
    status: String,
    artifact_root: String,
    artifact_manifest_path: String,
    event_count: usize,
    events: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRepositoryRunRequest {
    goal: String,
    task_id: String,
    workspace_id: String,
    repository_path: String,
    sandbox_root: String,
    artifact_root: String,
    memory_root: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedRunRecord {
    run_id: String,
    task_id: String,
    workspace_id: String,
    goal: String,
    repository_path: String,
    status: String,
    artifact_root: String,
    artifact_manifest_path: String,
    events: Vec<serde_json::Value>,
    artifacts: Vec<serde_json::Value>,
    usage_summary: serde_json::Value,
    memory_candidates: Vec<serde_json::Value>,
    skills: Vec<serde_json::Value>,
    skill_replay_plan: Option<serde_json::Value>,
    provider_refs: Vec<SecretReference>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedRunSummary {
    run_id: String,
    task_id: String,
    workspace_id: String,
    goal: String,
    repository_path: String,
    status: String,
    artifact_manifest_path: String,
    event_count: usize,
    artifact_count: usize,
    memory_candidate_count: usize,
    skill_count: usize,
    updated_at: String,
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("state lock failed")]
    StateLock,
    #[error("event emit failed: {0}")]
    Event(String),
    #[error("repository run failed: {0}")]
    RepositoryRun(String),
    #[error("{0}")]
    Persistence(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub struct LocalPersistenceStore {
    root: PathBuf,
}

impl LocalPersistenceStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn settings_path(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    fn runs_dir(&self) -> PathBuf {
        self.root.join("runs")
    }

    fn run_path(&self, run_id: &str) -> PathBuf {
        self.runs_dir().join(format!("{run_id}.json"))
    }

    fn run_index_path(&self) -> PathBuf {
        self.root.join("runs-index.json")
    }

    fn ensure_dirs(&self) -> Result<(), AppError> {
        fs::create_dir_all(self.runs_dir()).map_err(|error| {
            AppError::Persistence(format!("could not create app data store: {error}"))
        })?;
        Ok(())
    }

    pub fn save_run(&self, run: &PersistedRunRecord) -> Result<(), AppError> {
        self.ensure_dirs()?;
        self.validate_artifact_manifest_path(&run.artifact_manifest_path)?;
        let run_json = serde_json::to_string_pretty(run).map_err(|error| {
            AppError::Persistence(format!("could not encode run snapshot: {error}"))
        })?;
        fs::write(self.run_path(&run.run_id), format!("{run_json}\n")).map_err(|error| {
            AppError::Persistence(format!("could not write run snapshot: {error}"))
        })?;

        let mut summaries = self.list_runs().unwrap_or_default();
        summaries.retain(|summary| summary.run_id != run.run_id);
        summaries.push(run.summary());
        summaries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        let summary_json = serde_json::to_string_pretty(&summaries).map_err(|error| {
            AppError::Persistence(format!("could not encode run index: {error}"))
        })?;
        fs::write(self.run_index_path(), format!("{summary_json}\n")).map_err(|error| {
            AppError::Persistence(format!("could not write run index: {error}"))
        })?;
        Ok(())
    }

    pub fn list_runs(&self) -> Result<Vec<PersistedRunSummary>, AppError> {
        if !self.run_index_path().exists() {
            return Ok(vec![]);
        }
        let raw = fs::read_to_string(self.run_index_path())
            .map_err(|error| AppError::Persistence(format!("could not read run index: {error}")))?;
        serde_json::from_str(&raw)
            .map_err(|error| AppError::Persistence(format!("could not parse run index: {error}")))
    }

    pub fn open_run(&self, run_id: &str) -> Result<PersistedRunRecord, AppError> {
        if run_id.trim().is_empty() {
            return Err(AppError::Validation("runId is required".into()));
        }
        let raw = fs::read_to_string(self.run_path(run_id))
            .map_err(|_| AppError::Persistence(format!("run snapshot not found: {run_id}")))?;
        let run: PersistedRunRecord = serde_json::from_str(&raw).map_err(|error| {
            AppError::Persistence(format!("could not parse run snapshot: {error}"))
        })?;
        self.read_artifact_manifest(&run).map_err(|_| {
            AppError::Persistence(format!(
                "artifact manifest is missing or corrupted for run {run_id}"
            ))
        })?;
        Ok(run)
    }

    pub fn save_settings(&self, settings: &SettingsSnapshot) -> Result<(), AppError> {
        self.ensure_dirs()?;
        let settings_json = serde_json::to_string_pretty(settings).map_err(|error| {
            AppError::Persistence(format!("could not encode settings: {error}"))
        })?;
        fs::write(self.settings_path(), format!("{settings_json}\n"))
            .map_err(|error| AppError::Persistence(format!("could not write settings: {error}")))?;
        Ok(())
    }

    pub fn load_settings(&self) -> Result<SettingsSnapshot, AppError> {
        if !self.settings_path().exists() {
            return Ok(default_settings_snapshot());
        }
        let raw = fs::read_to_string(self.settings_path())
            .map_err(|error| AppError::Persistence(format!("could not read settings: {error}")))?;
        serde_json::from_str(&raw)
            .map_err(|error| AppError::Persistence(format!("could not parse settings: {error}")))
    }

    pub fn save_provider_reference(
        &self,
        input: ProviderSetupInput,
    ) -> Result<SecretReference, AppError> {
        validate_provider_setup_input(&input)?;
        let reference = SecretReference {
            provider_id: input.provider_id.trim().to_string(),
            label: input.label.trim().to_string(),
            key_ref: provider_key_ref(input.provider_id.trim()),
            status: ProviderReadinessStatus::Untested,
            last_preflight: None,
        };
        self.save_provider_reference_record(reference.clone())?;
        Ok(reference)
    }

    pub fn save_provider_reference_record(
        &self,
        reference: SecretReference,
    ) -> Result<(), AppError> {
        let mut settings = self.load_settings()?;
        settings
            .provider_refs
            .retain(|existing| existing.provider_id != reference.provider_id);
        settings.provider_refs.push(reference);
        self.save_settings(&settings)
    }

    pub fn list_provider_references(&self) -> Result<Vec<SecretReference>, AppError> {
        Ok(self.load_settings()?.provider_refs)
    }

    pub fn delete_provider_reference(&self, provider_id: &str) -> Result<(), AppError> {
        if provider_id.trim().is_empty() {
            return Err(AppError::Validation("providerId is required".into()));
        }
        let mut settings = self.load_settings()?;
        settings
            .provider_refs
            .retain(|existing| existing.provider_id != provider_id.trim());
        self.save_settings(&settings)
    }

    fn validate_artifact_manifest_path(
        &self,
        artifact_manifest_path: &str,
    ) -> Result<(), AppError> {
        let root = self.canonical_root()?;
        let manifest = PathBuf::from(artifact_manifest_path);
        let manifest_parent = manifest.parent().ok_or_else(|| {
            AppError::Validation(
                "artifact manifest must stay inside the CodePawl app data directory".into(),
            )
        })?;
        let canonical_parent = manifest_parent.canonicalize().map_err(|_| {
            AppError::Validation(
                "artifact manifest must stay inside the CodePawl app data directory".into(),
            )
        })?;
        if !canonical_parent.starts_with(&root) {
            return Err(AppError::Validation(
                "artifact manifest must stay inside the CodePawl app data directory".into(),
            ));
        }
        Ok(())
    }

    fn read_artifact_manifest(
        &self,
        run: &PersistedRunRecord,
    ) -> Result<serde_json::Value, AppError> {
        self.validate_artifact_manifest_path(&run.artifact_manifest_path)?;
        let raw = fs::read_to_string(&run.artifact_manifest_path).map_err(|error| {
            AppError::Persistence(format!("could not read artifact manifest: {error}"))
        })?;
        serde_json::from_str(&raw).map_err(|error| {
            AppError::Persistence(format!("could not parse artifact manifest: {error}"))
        })
    }

    pub fn list_artifact_evidence(
        &self,
        run_id: &str,
    ) -> Result<Vec<ArtifactEvidenceSummary>, AppError> {
        let run = self.open_run(run_id)?;
        let manifest = self.read_artifact_manifest(&run).map_err(|_| {
            AppError::Persistence(format!(
                "artifact manifest is missing or corrupted for run {run_id}"
            ))
        })?;
        Ok(artifact_evidence_specs(&run, &manifest)
            .into_iter()
            .map(|spec| self.summarize_artifact_evidence(&run, spec))
            .collect())
    }

    pub fn read_artifact_evidence(
        &self,
        input: ArtifactReadInput,
    ) -> Result<ArtifactEvidenceContent, AppError> {
        if input.run_id.trim().is_empty() || input.artifact_id.trim().is_empty() {
            return Err(AppError::Validation(
                "runId and artifactId are required".into(),
            ));
        }
        let run = self.open_run(&input.run_id)?;
        let manifest = self.read_artifact_manifest(&run).map_err(|_| {
            AppError::Persistence(format!(
                "artifact manifest is missing or corrupted for run {}",
                input.run_id
            ))
        })?;
        let spec = artifact_evidence_specs(&run, &manifest)
            .into_iter()
            .find(|spec| spec.artifact_id == input.artifact_id)
            .ok_or_else(|| {
                AppError::Validation(
                    "artifact is not referenced by the persisted run manifest".into(),
                )
            })?;

        if let Some(content) = spec.virtual_content {
            let redacted = redact_secret_like_strings(&content);
            return Ok(ArtifactEvidenceContent {
                artifact_id: spec.artifact_id,
                label: spec.label,
                kind: spec.kind,
                status: ArtifactEvidenceStatus::Verified,
                content_type: spec.content_type,
                byte_size: redacted.len() as u64,
                content: redacted,
            });
        }

        let uri = spec
            .uri
            .as_deref()
            .ok_or_else(|| AppError::Persistence("artifact file is missing".into()))?;
        let path = self.resolve_artifact_path(&run, uri, &spec.kind)?;
        let metadata = fs::metadata(&path)
            .map_err(|_| AppError::Persistence("artifact file is missing".into()))?;
        if metadata.len() > MAX_ARTIFACT_EVIDENCE_BYTES as u64 {
            return Err(AppError::Validation("artifact is too large to open".into()));
        }
        let raw = fs::read_to_string(&path)
            .map_err(|error| AppError::Persistence(format!("could not read artifact: {error}")))?;
        Ok(ArtifactEvidenceContent {
            artifact_id: spec.artifact_id,
            label: spec.label,
            kind: spec.kind.clone(),
            status: ArtifactEvidenceStatus::Verified,
            content_type: spec.content_type,
            byte_size: metadata.len(),
            content: redact_secret_like_strings(&raw),
        })
    }

    fn summarize_artifact_evidence(
        &self,
        run: &PersistedRunRecord,
        spec: ArtifactEvidenceSpec,
    ) -> ArtifactEvidenceSummary {
        let mut summary = ArtifactEvidenceSummary {
            artifact_id: spec.artifact_id,
            label: spec.label,
            kind: spec.kind.clone(),
            status: ArtifactEvidenceStatus::Verified,
            uri: spec.uri.clone(),
            byte_size: None,
            content_type: Some(spec.content_type),
            reason: None,
        };

        if let Some(content) = spec.virtual_content {
            summary.byte_size = Some(content.len() as u64);
            return summary;
        }

        let Some(uri) = spec.uri.as_deref() else {
            summary.status = ArtifactEvidenceStatus::Unavailable;
            summary.reason = Some("artifact file is missing".into());
            return summary;
        };

        let path = match self.resolve_artifact_path(run, uri, &spec.kind) {
            Ok(path) => path,
            Err(error) => {
                if error.to_string() == "artifact file is missing" {
                    summary.status = ArtifactEvidenceStatus::Unavailable;
                    summary.reason = Some("artifact file is missing".into());
                } else {
                    summary.status = ArtifactEvidenceStatus::Corrupted;
                    summary.reason = Some(error.to_string());
                }
                return summary;
            }
        };

        let metadata = match fs::metadata(path) {
            Ok(metadata) => metadata,
            Err(_) => {
                summary.status = ArtifactEvidenceStatus::Unavailable;
                summary.reason = Some("artifact file is missing".into());
                return summary;
            }
        };
        summary.byte_size = Some(metadata.len());
        if metadata.len() > MAX_ARTIFACT_EVIDENCE_BYTES as u64 {
            summary.status = ArtifactEvidenceStatus::Corrupted;
            summary.reason = Some("artifact is too large to open".into());
        }
        summary
    }

    fn resolve_artifact_path(
        &self,
        run: &PersistedRunRecord,
        artifact_uri: &str,
        kind: &ArtifactEvidenceKind,
    ) -> Result<PathBuf, AppError> {
        let artifact_root = PathBuf::from(&run.artifact_root);
        let canonical_artifact_root = artifact_root
            .canonicalize()
            .map_err(|_| AppError::Persistence("artifact directory is missing".into()))?;
        let app_artifact_root = self.canonical_root()?.join("artifacts");
        let canonical_app_artifact_root = app_artifact_root.canonicalize().map_err(|_| {
            AppError::Validation(
                "artifact path must stay inside the CodePawl app artifact directory".into(),
            )
        })?;
        if !canonical_artifact_root.starts_with(&canonical_app_artifact_root) {
            return Err(AppError::Validation(
                "artifact path must stay inside the persisted run artifact directory".into(),
            ));
        }
        let mut allowed_roots = vec![canonical_artifact_root];
        if matches!(kind, ArtifactEvidenceKind::MemoryStore) {
            let memory_root = self.canonical_root()?.join("memory");
            if let Ok(canonical_memory_root) = memory_root.canonicalize() {
                allowed_roots.push(canonical_memory_root);
            } else {
                allowed_roots.push(memory_root);
            }
        }

        if artifact_uri.contains("../") || artifact_uri.contains("..\\") {
            return Err(AppError::Validation(
                "artifact path must stay inside the persisted run artifact directory".into(),
            ));
        }
        let candidate = artifact_path_from_uri(run, artifact_uri)?;
        if candidate
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
        {
            return Err(AppError::Validation(
                "artifact path must stay inside the persisted run artifact directory".into(),
            ));
        }
        let candidate_parent = candidate.parent().ok_or_else(|| {
            AppError::Validation(
                "artifact path must stay inside the persisted run artifact directory".into(),
            )
        })?;
        let canonical_candidate_parent = candidate_parent
            .canonicalize()
            .map_err(|_| AppError::Persistence("artifact file is missing".into()))?;
        if !allowed_roots
            .iter()
            .any(|allowed_root| canonical_candidate_parent.starts_with(allowed_root))
        {
            return Err(AppError::Validation(
                "artifact path must stay inside the persisted run artifact directory".into(),
            ));
        }

        let canonical_candidate = candidate
            .canonicalize()
            .map_err(|_| AppError::Persistence("artifact file is missing".into()))?;
        if !allowed_roots
            .iter()
            .any(|allowed_root| canonical_candidate.starts_with(allowed_root))
        {
            return Err(AppError::Validation(
                "artifact path must stay inside the persisted run artifact directory".into(),
            ));
        }
        Ok(canonical_candidate)
    }

    fn canonical_root(&self) -> Result<PathBuf, AppError> {
        fs::create_dir_all(&self.root).map_err(|error| {
            AppError::Persistence(format!("could not create app data root: {error}"))
        })?;
        self.root.canonicalize().map_err(|error| {
            AppError::Persistence(format!("could not resolve app data root: {error}"))
        })
    }
}

impl PersistedRunRecord {
    fn summary(&self) -> PersistedRunSummary {
        PersistedRunSummary {
            run_id: self.run_id.clone(),
            task_id: self.task_id.clone(),
            workspace_id: self.workspace_id.clone(),
            goal: self.goal.clone(),
            repository_path: self.repository_path.clone(),
            status: self.status.clone(),
            artifact_manifest_path: self.artifact_manifest_path.clone(),
            event_count: self.events.len(),
            artifact_count: self.artifacts.len(),
            memory_candidate_count: self.memory_candidates.len(),
            skill_count: self.skills.len(),
            updated_at: self.updated_at.clone(),
        }
    }
}

fn default_retention_policy() -> RetentionPolicySnapshot {
    RetentionPolicySnapshot {
        run_history_days: 30,
        artifact_retention_days: 30,
        cleanup_enabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.".into(),
    }
}

fn default_settings_snapshot() -> SettingsSnapshot {
    SettingsSnapshot {
        workspace_id: "workspace-local-alpha".into(),
        permission_mode: "safe".into(),
        executable_surfaces: vec!["repository".into()],
        blocked_surfaces: vec![
            "browser".into(),
            "desktop".into(),
            "files".into(),
            "terminal".into(),
        ],
        provider_refs: vec![],
        retention_policy: default_retention_policy(),
    }
}

struct ArtifactEvidenceSpec {
    artifact_id: String,
    label: String,
    kind: ArtifactEvidenceKind,
    uri: Option<String>,
    virtual_content: Option<String>,
    content_type: String,
}

fn artifact_evidence_specs(
    run: &PersistedRunRecord,
    manifest: &serde_json::Value,
) -> Vec<ArtifactEvidenceSpec> {
    let mut specs = vec![ArtifactEvidenceSpec {
        artifact_id: "artifactManifest".into(),
        label: "Artifact manifest".into(),
        kind: ArtifactEvidenceKind::ArtifactManifest,
        uri: Some(run.artifact_manifest_path.clone()),
        virtual_content: None,
        content_type: "application/json".into(),
    }];

    for (artifact_id, label, kind, content_type) in [
        (
            "contract",
            "Contract",
            ArtifactEvidenceKind::Contract,
            "text/markdown",
        ),
        (
            "contractMetadata",
            "Contract metadata",
            ArtifactEvidenceKind::ContractMetadata,
            "application/json",
        ),
        (
            "eventLog",
            "Event log",
            ArtifactEvidenceKind::EventLog,
            "application/json",
        ),
        (
            "verifierInput",
            "Verifier input",
            ArtifactEvidenceKind::VerifierInput,
            "application/json",
        ),
        (
            "verificationResult",
            "Verification result",
            ArtifactEvidenceKind::VerificationResult,
            "application/json",
        ),
        (
            "redactedLog",
            "Redacted log",
            ArtifactEvidenceKind::RedactedLog,
            "text/plain",
        ),
        (
            "memoryStore",
            "Memory store",
            ArtifactEvidenceKind::MemoryStore,
            "application/json",
        ),
        (
            "replayPlan",
            "Replay plan",
            ArtifactEvidenceKind::ReplayPlan,
            "application/json",
        ),
    ] {
        let uri = manifest
            .get("artifacts")
            .and_then(|artifacts| artifacts.get(artifact_id))
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string);
        specs.push(ArtifactEvidenceSpec {
            artifact_id: artifact_id.into(),
            label: label.into(),
            kind,
            uri,
            virtual_content: None,
            content_type: content_type.into(),
        });
    }

    specs.push(ArtifactEvidenceSpec {
        artifact_id: "usageSummary".into(),
        label: "Usage summary".into(),
        kind: ArtifactEvidenceKind::UsageSummary,
        uri: None,
        virtual_content: Some(pretty_json(
            manifest
                .get("usageSummary")
                .cloned()
                .unwrap_or_else(|| run.usage_summary.clone()),
        )),
        content_type: "application/json".into(),
    });
    specs.push(ArtifactEvidenceSpec {
        artifact_id: "memoryCandidates".into(),
        label: "Memory candidates".into(),
        kind: ArtifactEvidenceKind::MemoryCandidates,
        uri: None,
        virtual_content: Some(pretty_json(serde_json::Value::Array(
            run.memory_candidates.clone(),
        ))),
        content_type: "application/json".into(),
    });
    specs
}

fn pretty_json(value: serde_json::Value) -> String {
    serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".into())
}

fn artifact_path_from_uri(
    run: &PersistedRunRecord,
    artifact_uri: &str,
) -> Result<PathBuf, AppError> {
    let trimmed = artifact_uri.trim();
    if trimmed.is_empty() {
        return Err(AppError::Persistence("artifact file is missing".into()));
    }
    if let Some(path) = trimmed.strip_prefix("file://") {
        return Ok(PathBuf::from(path));
    }
    if let Some(rest) = trimmed.strip_prefix("codepawl-artifact://") {
        let (run_id, relative_path) = rest
            .split_once('/')
            .ok_or_else(|| AppError::Validation("artifact URI scheme is not allowed".into()))?;
        if run_id != run.run_id {
            return Err(AppError::Validation(
                "artifact is not referenced by the persisted run manifest".into(),
            ));
        }
        return Ok(PathBuf::from(&run.artifact_root).join(relative_path));
    }
    if trimmed.contains("://") {
        return Err(AppError::Validation(
            "artifact URI scheme is not allowed".into(),
        ));
    }
    let path = PathBuf::from(trimmed);
    if path.is_absolute() {
        Ok(path)
    } else {
        Ok(PathBuf::from(&run.artifact_root).join(path))
    }
}

fn redact_secret_like_strings(input: &str) -> String {
    let mut redacted = String::with_capacity(input.len());
    let mut index = 0;
    while let Some(relative_start) = input[index..].find("sk-") {
        let start = index + relative_start;
        redacted.push_str(&input[index..start]);
        let mut end = start + 3;
        for character in input[end..].chars() {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                end += character.len_utf8();
            } else {
                break;
            }
        }
        if end - start >= 10 {
            redacted.push_str("[REDACTED_SECRET]");
        } else {
            redacted.push_str(&input[start..end]);
        }
        index = end;
    }
    redacted.push_str(&input[index..]);
    redacted
}

fn validate_provider_setup_input(input: &ProviderSetupInput) -> Result<(), AppError> {
    if input.provider_id.trim().is_empty() || input.label.trim().is_empty() {
        return Err(AppError::Validation(
            "providerId and label are required".into(),
        ));
    }
    Ok(())
}

fn provider_key_ref(provider_id: &str) -> String {
    let suffix = provider_id
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    format!("local-safe-keychain://codepawl/private-beta/{suffix}")
}

fn executable_path_on_path(path_env: &str, executable_name: &str) -> Option<PathBuf> {
    for entry in std::env::split_paths(path_env) {
        let candidate = entry.join(executable_name);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(windows)]
        {
            let exe_candidate = entry.join(format!("{executable_name}.exe"));
            if exe_candidate.is_file() {
                return Some(exe_candidate);
            }
        }
    }
    None
}

fn preflight_provider_reference(
    reference: &SecretReference,
    path_env: &str,
) -> ProviderPreflightResult {
    let checked_at = now_iso_like();
    if reference.provider_id != "codex-cli" {
        return ProviderPreflightResult {
            checked_provider_id: reference.provider_id.clone(),
            status: ProviderReadinessStatus::Failed,
            ready: false,
            checked_at,
            executable_path: None,
            reasons: vec![format!(
                "Provider {} is not supported in the private beta repository runner.",
                reference.provider_id
            )],
        };
    }

    if let Some(executable_path) = executable_path_on_path(path_env, "codex") {
        return ProviderPreflightResult {
            checked_provider_id: reference.provider_id.clone(),
            status: ProviderReadinessStatus::Ready,
            ready: true,
            checked_at,
            executable_path: Some(executable_path.to_string_lossy().to_string()),
            reasons: vec!["Codex CLI executable is available.".into()],
        };
    }

    ProviderPreflightResult {
        checked_provider_id: reference.provider_id.clone(),
        status: ProviderReadinessStatus::Failed,
        ready: false,
        checked_at,
        executable_path: None,
        reasons: vec!["Codex CLI was not found on PATH.".into()],
    }
}

fn ensure_provider_ready_for_run(
    store: &LocalPersistenceStore,
) -> Result<SecretReference, AppError> {
    let provider_refs = store.list_provider_references()?;
    if provider_refs.is_empty() {
        return Err(AppError::Validation(
            "Provider setup is required before running a real repository task".into(),
        ));
    }
    provider_refs
        .into_iter()
        .find(|reference| reference.status == ProviderReadinessStatus::Ready)
        .ok_or_else(|| {
            AppError::Validation(
                "Provider preflight must pass before running a real repository task".into(),
            )
        })
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

    validate_repository_path(input.repository_path.as_deref())?;

    Ok(())
}

fn validate_repository_path(repository_path: Option<&str>) -> Result<PathBuf, AppError> {
    let repository_path = repository_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::Validation(
                "repositoryPath must point to a selected local git repository".into(),
            )
        })?;
    let canonical = Path::new(repository_path).canonicalize().map_err(|_| {
        AppError::Validation("repositoryPath must point to a selected local git repository".into())
    })?;
    if !canonical.is_dir() || canonical.parent().is_none() || !canonical.join(".git").exists() {
        return Err(AppError::Validation(
            "repositoryPath must point to a selected local git repository".into(),
        ));
    }

    Ok(canonical)
}

fn is_desktop_repository_runner_root(root: &Path) -> bool {
    root.join("scripts")
        .join("desktop-repository-run.mjs")
        .is_file()
        && root.join("scripts")
            .join("register-extensionless-esm-loader.mjs")
            .is_file()
        && root.join("package.json").is_file()
}

fn find_repository_root(start: &Path) -> Option<PathBuf> {
    let mut current = if start.is_file() {
        start.parent()?.to_path_buf()
    } else {
        start.to_path_buf()
    };
    loop {
        if is_desktop_repository_runner_root(&current) {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn packaged_repository_runner_root(executable_path: &Path) -> Option<PathBuf> {
    let binary_dir = executable_path.parent()?;
    let candidates = [
        binary_dir.join("codepawl-runner"),
        binary_dir.join("../codepawl-runner"),
    ];
    candidates
        .into_iter()
        .find(|candidate| is_desktop_repository_runner_root(candidate))
}

fn resolve_desktop_repository_runner() -> Result<(PathBuf, PathBuf), AppError> {
    if let Ok(script_path) = std::env::var("CODEPAWL_DESKTOP_REPOSITORY_RUNNER") {
        let script = PathBuf::from(script_path);
        let root = find_repository_root(&script).ok_or_else(|| {
            AppError::RepositoryRun(
                "could not locate CodePawl repository root for desktop repository runner".into(),
            )
        })?;
        return Ok((root, script));
    }

    if let Ok(executable_path) = std::env::current_exe() {
        if let Some(root) = packaged_repository_runner_root(&executable_path) {
            return Ok((
                root.clone(),
                root.join("scripts").join("desktop-repository-run.mjs"),
            ));
        }
    }

    let current_dir = std::env::current_dir().map_err(|error| {
        AppError::RepositoryRun(format!("could not resolve current directory: {error}"))
    })?;
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for start in [&current_dir, &manifest_dir] {
        if let Some(root) = find_repository_root(start) {
            return Ok((
                root.clone(),
                root.join("scripts").join("desktop-repository-run.mjs"),
            ));
        }
    }

    Err(AppError::RepositoryRun(
        "could not locate scripts/desktop-repository-run.mjs".into(),
    ))
}

fn run_data_root(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("codepawl-desktop"))
}

fn persistence_store(app: &AppHandle) -> LocalPersistenceStore {
    LocalPersistenceStore::new(run_data_root(app))
}

fn read_json_file(path: &str) -> Option<serde_json::Value> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn manifest_artifact_path(manifest: &serde_json::Value, key: &str) -> Option<String> {
    manifest
        .get("artifacts")
        .and_then(|artifacts| artifacts.get(key))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
}

fn manifest_artifact_refs(
    manifest: &serde_json::Value,
    events: &[serde_json::Value],
) -> Vec<serde_json::Value> {
    if let Some(refs) = manifest
        .get("artifactRefs")
        .and_then(serde_json::Value::as_array)
    {
        return refs.clone();
    }
    events
        .iter()
        .flat_map(|event| {
            event
                .get("artifacts")
                .and_then(serde_json::Value::as_array)
                .cloned()
                .unwrap_or_default()
        })
        .collect()
}

fn manifest_memory_candidates(manifest: &serde_json::Value) -> Vec<serde_json::Value> {
    manifest_artifact_path(manifest, "memoryStore")
        .as_deref()
        .and_then(read_json_file)
        .and_then(|memory| {
            memory
                .get("candidateRules")
                .and_then(serde_json::Value::as_array)
                .cloned()
        })
        .unwrap_or_default()
}

fn manifest_skill_plan(manifest: &serde_json::Value) -> Option<serde_json::Value> {
    manifest_artifact_path(manifest, "replayPlan")
        .as_deref()
        .and_then(read_json_file)
}

fn manifest_skills(skill_plan: &Option<serde_json::Value>) -> Vec<serde_json::Value> {
    let Some(plan) = skill_plan else {
        return vec![];
    };
    let skill_id = plan
        .get("skillId")
        .and_then(serde_json::Value::as_str)
        .or_else(|| plan.get("id").and_then(serde_json::Value::as_str))
        .unwrap_or("skill-invocation-plan");
    vec![serde_json::json!({
        "id": skill_id,
        "title": plan.get("skillTitle").and_then(serde_json::Value::as_str).unwrap_or("Repository skill invocation plan"),
        "status": plan.get("selectedSkillStatus").and_then(serde_json::Value::as_str).or_else(|| plan.get("status").and_then(serde_json::Value::as_str)).unwrap_or("candidate"),
        "fallbackReason": plan.get("fallbackReason").cloned(),
        "source": "skill_invocation_plan",
    })]
}

fn persisted_run_from_output(
    app: &AppHandle,
    input: &CreateRunInput,
    repository_path: &Path,
    output: &DesktopRepositoryRunOutput,
) -> Result<PersistedRunRecord, AppError> {
    let store = persistence_store(app);
    let manifest_path = output.artifact_manifest_path.clone();
    store.validate_artifact_manifest_path(&manifest_path)?;
    let manifest_raw = fs::read_to_string(&manifest_path).map_err(|error| {
        AppError::Persistence(format!("could not read artifact manifest: {error}"))
    })?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_raw).map_err(|error| {
        AppError::Persistence(format!("could not parse artifact manifest: {error}"))
    })?;
    let skill_replay_plan = manifest_skill_plan(&manifest);
    let settings = store
        .load_settings()
        .unwrap_or_else(|_| default_settings_snapshot());
    let events = output.events.clone();
    let artifacts = manifest_artifact_refs(&manifest, &events);
    let now = now_iso_like();

    Ok(PersistedRunRecord {
        run_id: output.run_id.clone(),
        task_id: input.task_id.clone(),
        workspace_id: input.workspace_id.clone(),
        goal: input.goal.clone(),
        repository_path: repository_path.to_string_lossy().to_string(),
        status: output.status.clone(),
        artifact_root: output.artifact_root.clone(),
        artifact_manifest_path: manifest_path,
        events,
        artifacts,
        usage_summary: manifest.get("usageSummary").cloned().unwrap_or_else(
            || serde_json::json!({ "runCount": 1, "artifactCount": 0, "gatewayActionCount": 0 }),
        ),
        memory_candidates: manifest_memory_candidates(&manifest),
        skills: manifest_skills(&skill_replay_plan),
        skill_replay_plan,
        provider_refs: settings.provider_refs,
        created_at: now.clone(),
        updated_at: now,
    })
}

fn run_desktop_repository_sidecar(
    app: &AppHandle,
    input: &CreateRunInput,
    repository_path: &Path,
) -> Result<DesktopRepositoryRunOutput, AppError> {
    let (repo_root, script_path) = resolve_desktop_repository_runner()?;
    let loader_path = repo_root
        .join("scripts")
        .join("register-extensionless-esm-loader.mjs");
    let data_root = run_data_root(app);
    let request = DesktopRepositoryRunRequest {
        goal: input.goal.clone(),
        task_id: input.task_id.clone(),
        workspace_id: input.workspace_id.clone(),
        repository_path: repository_path.to_string_lossy().to_string(),
        sandbox_root: data_root.join("sandboxes").to_string_lossy().to_string(),
        artifact_root: data_root.join("artifacts").to_string_lossy().to_string(),
        memory_root: data_root.join("memory").to_string_lossy().to_string(),
    };
    let request_json = serde_json::to_string(&request).map_err(|error| {
        AppError::RepositoryRun(format!("could not encode run request: {error}"))
    })?;
    let mut child = Command::new("node")
        .arg("--import")
        .arg(&loader_path)
        .arg(&script_path)
        .current_dir(repo_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            AppError::RepositoryRun(format!("could not start repository runner: {error}"))
        })?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(request_json.as_bytes()).map_err(|error| {
            AppError::RepositoryRun(format!("could not write runner request: {error}"))
        })?;
    }

    let output = child.wait_with_output().map_err(|error| {
        AppError::RepositoryRun(format!("repository runner did not finish: {error}"))
    })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::RepositoryRun(stderr.trim().to_string()));
    }

    let output: DesktopRepositoryRunOutput =
        serde_json::from_slice(&output.stdout).map_err(|error| {
            AppError::RepositoryRun(format!("could not parse repository runner output: {error}"))
        })?;
    if output.event_count != output.events.len()
        || output.status.trim().is_empty()
        || output.artifact_root.trim().is_empty()
        || output.artifact_manifest_path.trim().is_empty()
    {
        return Err(AppError::RepositoryRun(
            "repository runner returned incomplete run metadata".into(),
        ));
    }

    Ok(output)
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
        return Err(AppError::Validation(
            "skill decision actor is required".into(),
        ));
    }
    if input.reason.trim().is_empty() {
        return Err(AppError::Validation(
            "skill decision reason is required".into(),
        ));
    }

    Ok(())
}

fn validate_skill_replay_plan_input(input: &SkillReplayPlanInput) -> Result<(), AppError> {
    if input.skill_id.trim().is_empty() {
        return Err(AppError::Validation("skill id is required".into()));
    }

    Ok(())
}

fn validate_codex_execution_input(input: &CodexExecutionInput) -> Result<(), AppError> {
    if input.run_id.trim().is_empty() || input.plan_id.trim().is_empty() {
        return Err(AppError::Validation("runId and planId are required".into()));
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

fn mock_codex_execution_preview(
    run_id: &str,
    plan_id: &str,
    status: &str,
    blocked_reasons: Vec<&str>,
    summary: &str,
) -> serde_json::Value {
    serde_json::json!({
        "runId": run_id,
        "planId": plan_id,
        "status": status,
        "command": "codex exec --json --ephemeral --sandbox workspace-write",
        "contractArtifact": format!("codepawl-artifact://{run_id}/codex-contract.md"),
        "artifactRoot": format!("codepawl-artifact://{run_id}/execution/"),
        "blockedReasons": blocked_reasons,
        "approvalRequired": status == "approval_required",
        "resultReady": status == "result_ready",
        "verificationSeparate": true,
        "summary": summary,
    })
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
    let repository_path = validate_repository_path(input.repository_path.as_deref())?;
    let store = persistence_store(&app);
    let _provider_reference = ensure_provider_ready_for_run(&store)?;
    let output = run_desktop_repository_sidecar(&app, &input, &repository_path)?;
    let persisted_run = persisted_run_from_output(&app, &input, &repository_path, &output)?;
    store.save_run(&persisted_run)?;

    state
        .runs
        .lock()
        .map_err(|_| AppError::StateLock)?
        .push(output.run_id.clone());

    for event in &output.events {
        app.emit("run_event", event.clone())
            .map_err(|error| AppError::Event(error.to_string()))?;
    }

    Ok(RunId { id: output.run_id })
}

#[tauri::command]
async fn run_list(app: AppHandle) -> Result<Vec<PersistedRunSummary>, AppError> {
    persistence_store(&app).list_runs()
}

#[tauri::command]
async fn run_open(app: AppHandle, run_id: String) -> Result<PersistedRunRecord, AppError> {
    persistence_store(&app).open_run(&run_id)
}

#[tauri::command]
async fn artifact_list(
    app: AppHandle,
    run_id: String,
) -> Result<Vec<ArtifactEvidenceSummary>, AppError> {
    persistence_store(&app).list_artifact_evidence(&run_id)
}

#[tauri::command]
async fn artifact_read(
    app: AppHandle,
    input: ArtifactReadInput,
) -> Result<ArtifactEvidenceContent, AppError> {
    persistence_store(&app).read_artifact_evidence(input)
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
    let statuses = state
        .skill_statuses
        .lock()
        .map_err(|_| AppError::StateLock)?;
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
        let mut statuses = state
            .skill_statuses
            .lock()
            .map_err(|_| AppError::StateLock)?;
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

    let statuses = state
        .skill_statuses
        .lock()
        .map_err(|_| AppError::StateLock)?;
    let mut skill = mock_skills(&statuses)
        .into_iter()
        .find(|skill| {
            skill.get("id").and_then(serde_json::Value::as_str) == Some(input.skill_id.as_str())
        })
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
    let statuses = state
        .skill_statuses
        .lock()
        .map_err(|_| AppError::StateLock)?;
    let skill = mock_skills(&statuses)
        .into_iter()
        .find(|skill| {
            skill.get("id").and_then(serde_json::Value::as_str) == Some(input.skill_id.as_str())
        })
        .ok_or_else(|| AppError::Validation("skill not found".into()))?;
    let plan = mock_skill_replay_plan(&skill, &run_id);
    let blocked = plan.get("readiness").and_then(serde_json::Value::as_str) == Some("blocked");

    for (index, event_type) in skill_replay_lifecycle_event_types(blocked)
        .iter()
        .enumerate()
    {
        let artifacts = if *event_type == "skill_replay_plan_created"
            || *event_type == "skill_replay_plan_blocked"
        {
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
async fn codex_execution_approve(
    app: AppHandle,
    input: CodexExecutionInput,
) -> Result<serde_json::Value, AppError> {
    validate_codex_execution_input(&input)?;
    app.emit(
        "run_event",
        run_event(
            &input.run_id,
            21_000,
            "codex_execution_approved",
            "ui",
            "codex-execution-panel",
            "Controlled Codex execution approved by operator",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        run_event(
            &input.run_id,
            21_001,
            "codex_execution_started",
            "runtime",
            "codex-execution-panel",
            "Controlled Codex execution started in managed sandbox",
        ),
    )
    .map_err(|error| AppError::Event(error.to_string()))?;
    app.emit(
        "run_event",
        RunEvent {
            id: format!("{}-event-codex-execution-result-ready", input.run_id),
            run_id: input.run_id.clone(),
            sequence: 21_002,
            event_type: "codex_execution_result_ready".into(),
            timestamp: now_iso_like(),
            actor: serde_json::json!({ "kind": "runtime", "id": "codex-execution-panel" }),
            payload: serde_json::json!({
                "summary": "Controlled Codex execution result ready for import",
                "planId": input.plan_id,
                "importReady": true,
            }),
            redaction: serde_json::json!({ "applied": false, "redactedPaths": [] }),
            artifacts: vec![serde_json::json!({
                "id": format!("{}-result", input.plan_id),
                "kind": "codex_execution_result",
                "uri": format!("codepawl-artifact://{}/execution/codex-execution-result.json", input.run_id),
                "label": "Controlled Codex execution result",
            })],
            safety: None,
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;

    Ok(mock_codex_execution_preview(
        &input.run_id,
        &input.plan_id,
        "result_ready",
        vec![],
        "Result ready for import. Verification remains separate.",
    ))
}

#[tauri::command]
async fn codex_execution_blocked_preview(
    app: AppHandle,
    input: CodexExecutionInput,
) -> Result<serde_json::Value, AppError> {
    validate_codex_execution_input(&input)?;
    app.emit(
        "run_event",
        RunEvent {
            id: format!("{}-event-codex-execution-blocked", input.run_id),
            run_id: input.run_id.clone(),
            sequence: 21_010,
            event_type: "codex_execution_blocked".into(),
            timestamp: now_iso_like(),
            actor: serde_json::json!({ "kind": "policy", "id": "codex-execution-panel" }),
            payload: serde_json::json!({
                "summary": "Controlled Codex execution blocked: codex_missing",
                "planId": input.plan_id,
                "failureReasons": ["codex_missing"],
            }),
            redaction: serde_json::json!({ "applied": false, "redactedPaths": [] }),
            artifacts: vec![],
            safety: None,
        },
    )
    .map_err(|error| AppError::Event(error.to_string()))?;

    Ok(mock_codex_execution_preview(
        &input.run_id,
        &input.plan_id,
        "blocked",
        vec!["codex_missing"],
        "Blocked before execution because Codex is missing from the controlled runtime.",
    ))
}

#[tauri::command]
async fn settings_get(app: AppHandle) -> Result<SettingsSnapshot, AppError> {
    persistence_store(&app).load_settings()
}

#[tauri::command]
async fn settings_update(
    app: AppHandle,
    input: SettingsUpdateInput,
) -> Result<SettingsSnapshot, AppError> {
    match input.permission_mode.as_str() {
        "safe" | "balanced" | "manual" => {
            let mut settings = persistence_store(&app).load_settings()?;
            settings.permission_mode = input.permission_mode;
            persistence_store(&app).save_settings(&settings)?;
            Ok(settings)
        }
        _ => Err(AppError::Validation(
            "permissionMode must be safe, balanced, or manual".into(),
        )),
    }
}

#[tauri::command]
async fn provider_key_save(
    app: AppHandle,
    input: ProviderKeySaveInput,
) -> Result<SecretReference, AppError> {
    persistence_store(&app).save_provider_reference(ProviderSetupInput {
        provider_id: input.provider_id,
        label: input.label,
        raw_secret: input.raw_secret,
    })
}

#[tauri::command]
async fn provider_key_list(app: AppHandle) -> Result<Vec<SecretReference>, AppError> {
    persistence_store(&app).list_provider_references()
}

#[tauri::command]
async fn provider_key_test(
    app: AppHandle,
    provider_id: String,
) -> Result<ProviderPreflightResult, AppError> {
    if provider_id.trim().is_empty() {
        return Err(AppError::Validation("providerId is required".into()));
    }
    let store = persistence_store(&app);
    let mut reference = store
        .list_provider_references()?
        .into_iter()
        .find(|reference| reference.provider_id == provider_id.trim())
        .ok_or_else(|| AppError::Validation("provider reference not found".into()))?;
    let result =
        preflight_provider_reference(&reference, &(std::env::var("PATH").unwrap_or_default()));
    reference.status = result.status.clone();
    reference.last_preflight = Some(result.clone());
    store.save_provider_reference_record(reference)?;
    Ok(result)
}

#[tauri::command]
async fn provider_key_delete(app: AppHandle, provider_id: String) -> Result<(), AppError> {
    persistence_store(&app).delete_provider_reference(&provider_id)
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
            run_list,
            run_open,
            artifact_list,
            artifact_read,
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
            codex_execution_approve,
            codex_execution_blocked_preview,
            settings_get,
            settings_update,
            provider_key_save,
            provider_key_list,
            provider_key_test,
            provider_key_delete,
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

    fn local_git_repository_path(label: &str) -> String {
        let mut repository_path = std::env::temp_dir();
        repository_path.push(format!("codepawl-tauri-test-{label}-{}", unique_suffix()));
        std::fs::create_dir_all(repository_path.join(".git")).expect("create test git marker");
        repository_path.to_string_lossy().to_string()
    }

    fn unique_suffix() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time")
            .as_nanos()
    }

    fn valid_run_input() -> CreateRunInput {
        CreateRunInput {
            goal: "Fix a failing unit test".into(),
            capability_id: "coding-apprentice".into(),
            task_id: "task-1".into(),
            workspace_id: "workspace-1".into(),
            repository_path: Some(local_git_repository_path("valid")),
            budget: BudgetPolicy {
                max_steps: 40,
                max_wall_time_ms: 1_800_000,
                max_model_tokens: 120_000,
                max_usd: Some(1.0),
                stop_on_budget_exceeded: true,
            },
        }
    }

    fn valid_run_input_json(repository_path: Option<&str>) -> CreateRunInput {
        let mut value = serde_json::json!({
            "goal": "Fix a failing unit test",
            "capabilityId": "coding-apprentice",
            "taskId": "task-1",
            "workspaceId": "workspace-1",
            "budget": {
                "maxSteps": 40,
                "maxWallTimeMs": 1_800_000,
                "maxModelTokens": 120_000,
                "maxUsd": 1.0,
                "stopOnBudgetExceeded": true
            }
        });
        if let Some(repository_path) = repository_path {
            value["repositoryPath"] = serde_json::Value::String(repository_path.into());
        }

        serde_json::from_value(value).expect("valid create run input json")
    }

    #[test]
    fn validate_create_run_accepts_repository_run_input() {
        assert!(validate_create_run(&valid_run_input()).is_ok());
    }

    #[test]
    fn validate_create_run_accepts_selected_local_git_repository_path() {
        let input = valid_run_input_json(Some(&local_git_repository_path("json-valid")));

        assert!(validate_create_run(&input).is_ok());
    }

    #[test]
    fn validate_create_run_requires_selected_repository_path() {
        let input = valid_run_input_json(None);

        let error = validate_create_run(&input).expect_err("repository path is required");
        assert_eq!(
            error.to_string(),
            "repositoryPath must point to a selected local git repository"
        );
    }

    #[test]
    fn validate_create_run_rejects_filesystem_root_repository_path() {
        let input = valid_run_input_json(Some("/"));

        let error = validate_create_run(&input).expect_err("filesystem root is unsafe");
        assert_eq!(
            error.to_string(),
            "repositoryPath must point to a selected local git repository"
        );
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
        assert_eq!(
            skill_decision_event_type(&SkillDecision::Promote),
            "skill_promoted_manual"
        );
        assert_eq!(
            skill_decision_event_type(&SkillDecision::Reject),
            "skill_rejected"
        );
        assert_eq!(
            skill_decision_event_type(&SkillDecision::Supersede),
            "skill_superseded"
        );
        assert_eq!(
            skill_decision_event_type(&SkillDecision::Archive),
            "skill_archived"
        );
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
        let error =
            validate_skill_replay_plan_input(&missing_id).expect_err("skill id is required");
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

    fn temp_store_root(label: &str) -> PathBuf {
        let mut root = std::env::temp_dir();
        root.push(format!(
            "codepawl-persistence-test-{label}-{}",
            unique_suffix()
        ));
        root
    }

    #[test]
    fn packaged_repository_runner_root_resolves_runner_next_to_binary() {
        let root = temp_store_root("packaged-runner");
        let app_dir = root.join("app");
        let runner_dir = app_dir.join("codepawl-runner");
        let scripts_dir = runner_dir.join("scripts");
        std::fs::create_dir_all(&scripts_dir).expect("create packaged runner scripts");
        std::fs::write(runner_dir.join("package.json"), "{}\n").expect("write package manifest");
        std::fs::write(scripts_dir.join("desktop-repository-run.mjs"), "\n")
            .expect("write repository runner");
        std::fs::write(scripts_dir.join("register-extensionless-esm-loader.mjs"), "\n")
            .expect("write esm loader");

        let executable = app_dir.join("codepawl-desktop");
        let resolved =
            packaged_repository_runner_root(&executable).expect("packaged runner root resolves");

        assert_eq!(resolved, runner_dir);
    }

    fn write_manifest(root: &Path, run_id: &str) -> String {
        let manifest_path = root
            .join("artifacts")
            .join(run_id)
            .join("artifact-manifest.json");
        std::fs::create_dir_all(manifest_path.parent().expect("manifest parent"))
            .expect("create manifest parent");
        std::fs::write(
            &manifest_path,
            serde_json::json!({
                "runId": run_id,
                "repositoryPath": "/repo/codepawl",
                "artifacts": {
                    "contract": format!("{}/artifacts/{}/codex-contract.md", root.display(), run_id),
                    "eventLog": format!("{}/artifacts/{}/run-events.json", root.display(), run_id),
                    "verifierInput": format!("{}/artifacts/{}/verifier-input.json", root.display(), run_id),
                    "verificationResult": format!("{}/artifacts/{}/verification-result.json", root.display(), run_id),
                    "redactedLog": format!("{}/artifacts/{}/manual-result.redacted.log", root.display(), run_id),
                    "memoryStore": format!("{}/memory/memory-store.json", root.display())
                },
                "eventTypes": ["run_started", "run_finished"]
            })
            .to_string(),
        )
        .expect("write manifest");
        manifest_path.to_string_lossy().to_string()
    }

    fn persisted_run(root: &Path, run_id: &str) -> PersistedRunRecord {
        PersistedRunRecord {
            run_id: run_id.into(),
            task_id: "task-1".into(),
            workspace_id: "workspace-1".into(),
            goal: "Persist this run".into(),
            repository_path: "/repo/codepawl".into(),
            status: "pass".into(),
            artifact_root: root
                .join("artifacts")
                .join(run_id)
                .to_string_lossy()
                .to_string(),
            artifact_manifest_path: write_manifest(root, run_id),
            events: vec![serde_json::json!({
                "id": format!("{run_id}-event-1"),
                "runId": run_id,
                "sequence": 1,
                "type": "run_started",
                "payload": { "summary": "run started" },
                "artifacts": []
            })],
            artifacts: vec![serde_json::json!({
                "id": "contract",
                "kind": "codex_contract",
                "uri": format!("file://{}/artifacts/{}/codex-contract.md", root.display(), run_id),
                "label": "Codex contract"
            })],
            usage_summary: serde_json::json!({ "runCount": 1, "artifactCount": 1, "gatewayActionCount": 1 }),
            memory_candidates: vec![
                serde_json::json!({ "id": "candidate-rule-1", "status": "candidate" }),
            ],
            skills: vec![serde_json::json!({ "id": "skill-1", "status": "candidate" })],
            skill_replay_plan: Some(
                serde_json::json!({ "id": "skill-replay-plan-1", "dryRunOnly": true }),
            ),
            provider_refs: vec![SecretReference {
                provider_id: "openai".into(),
                label: "OpenAI".into(),
                key_ref: "keychain://codepawl/local-beta/openai".into(),
                status: ProviderReadinessStatus::Untested,
                last_preflight: None,
            }],
            created_at: "2026-07-04T00:00:00.000Z".into(),
            updated_at: "2026-07-04T00:00:00.000Z".into(),
        }
    }

    #[test]
    fn local_persistence_writes_and_reads_repository_run_snapshot() {
        let root = temp_store_root("write-read");
        let store = LocalPersistenceStore::new(root.clone());
        let run = persisted_run(&root, "run-persisted-1");

        store.save_run(&run).expect("save run");
        let reopened = store.open_run("run-persisted-1").expect("open run");

        assert_eq!(reopened.run_id, "run-persisted-1");
        assert_eq!(reopened.events.len(), 1);
        assert_eq!(reopened.artifacts.len(), 1);
        assert_eq!(reopened.memory_candidates.len(), 1);
        assert_eq!(reopened.skills.len(), 1);
        assert!(reopened.skill_replay_plan.is_some());
        assert_eq!(reopened.usage_summary["artifactCount"], 1);
        assert_eq!(
            reopened.provider_refs[0].key_ref,
            "keychain://codepawl/local-beta/openai"
        );
    }

    #[test]
    fn local_persistence_reloads_run_index_after_restart() {
        let root = temp_store_root("restart");
        let store = LocalPersistenceStore::new(root.clone());
        store
            .save_run(&persisted_run(&root, "run-restart-1"))
            .expect("save run before restart");

        let fresh_store = LocalPersistenceStore::new(root);
        let runs = fresh_store.list_runs().expect("list runs after restart");

        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].run_id, "run-restart-1");
        assert_eq!(runs[0].status, "pass");
        assert_eq!(runs[0].artifact_count, 1);
    }

    #[test]
    fn local_persistence_persists_settings_and_provider_references_without_raw_secrets() {
        let root = temp_store_root("settings");
        let store = LocalPersistenceStore::new(root.clone());
        let settings = SettingsSnapshot {
            workspace_id: "workspace-local-alpha".into(),
            permission_mode: "manual".into(),
            executable_surfaces: vec!["repository".into()],
            blocked_surfaces: vec![
                "browser".into(),
                "desktop".into(),
                "files".into(),
                "terminal".into(),
            ],
            provider_refs: vec![SecretReference {
                provider_id: "openai".into(),
                label: "OpenAI".into(),
                key_ref: "keychain://codepawl/local-beta/openai".into(),
                status: ProviderReadinessStatus::Untested,
                last_preflight: None,
            }],
            retention_policy: RetentionPolicySnapshot {
                run_history_days: 30,
                artifact_retention_days: 30,
                cleanup_enabled: false,
                summary: "Cleanup is manual for private beta; automatic retention is planned."
                    .into(),
            },
        };

        store.save_settings(&settings).expect("save settings");
        let reloaded = LocalPersistenceStore::new(root)
            .load_settings()
            .expect("load settings");
        let raw_settings = std::fs::read_to_string(store.settings_path()).expect("read settings");

        assert_eq!(reloaded.permission_mode, "manual");
        assert_eq!(
            reloaded.provider_refs[0].key_ref,
            "keychain://codepawl/local-beta/openai"
        );
        assert!(!raw_settings.contains("sk-"));
        assert!(!raw_settings.contains("rawApiKey"));
    }

    #[test]
    fn local_persistence_rejects_artifact_manifest_outside_app_data_root() {
        let root = temp_store_root("unsafe");
        let store = LocalPersistenceStore::new(root.clone());
        let mut run = persisted_run(&root, "run-unsafe-1");
        run.artifact_manifest_path = "/tmp/outside-codepawl-artifact-manifest.json".into();

        let error = store
            .save_run(&run)
            .expect_err("outside manifest path is unsafe");

        assert_eq!(
            error.to_string(),
            "artifact manifest must stay inside the CodePawl app data directory"
        );
    }

    #[test]
    fn local_persistence_reports_missing_or_corrupted_artifact_manifest_on_reopen() {
        let root = temp_store_root("corrupt");
        let store = LocalPersistenceStore::new(root.clone());
        let run = persisted_run(&root, "run-corrupt-1");
        store.save_run(&run).expect("save run");
        std::fs::write(&run.artifact_manifest_path, "{not-json").expect("corrupt manifest");

        let error = store
            .open_run("run-corrupt-1")
            .expect_err("corrupted manifest is rejected");

        assert_eq!(
            error.to_string(),
            "artifact manifest is missing or corrupted for run run-corrupt-1"
        );
    }

    #[test]
    fn provider_reference_save_load_and_delete_never_persists_raw_secret() {
        let root = temp_store_root("provider-ref");
        let store = LocalPersistenceStore::new(root.clone());

        let reference = store
            .save_provider_reference(ProviderSetupInput {
                provider_id: "codex-cli".into(),
                label: "Local Codex CLI".into(),
                raw_secret: Some("sk-privatebeta-secret-123".into()),
            })
            .expect("save provider reference");
        let loaded = store
            .list_provider_references()
            .expect("load provider references");
        let raw_settings = std::fs::read_to_string(store.settings_path()).expect("read settings");

        assert_eq!(reference.provider_id, "codex-cli");
        assert_eq!(reference.status, ProviderReadinessStatus::Untested);
        assert_eq!(loaded.len(), 1);
        assert!(reference
            .key_ref
            .starts_with("local-safe-keychain://codepawl/private-beta/"));
        assert!(!raw_settings.contains("sk-privatebeta-secret-123"));

        store
            .delete_provider_reference("codex-cli")
            .expect("delete provider reference");
        assert!(store
            .list_provider_references()
            .expect("reload after delete")
            .is_empty());
    }

    #[test]
    fn provider_preflight_reports_failed_and_ready_states() {
        let root = temp_store_root("provider-preflight");
        let store = LocalPersistenceStore::new(root.clone());
        let mut reference = store
            .save_provider_reference(ProviderSetupInput {
                provider_id: "codex-cli".into(),
                label: "Local Codex CLI".into(),
                raw_secret: None,
            })
            .expect("save provider reference");

        let failed = preflight_provider_reference(&reference, "");
        assert!(!failed.ready);
        assert_eq!(failed.status, ProviderReadinessStatus::Failed);
        assert!(failed
            .reasons
            .iter()
            .any(|reason| reason.contains("Codex CLI was not found")));

        let bin_dir = root.join("bin");
        let codex_path = bin_dir.join("codex");
        std::fs::create_dir_all(&bin_dir).expect("create fake bin dir");
        std::fs::write(
            &codex_path,
            "#!/usr/bin/env node\nconsole.log('codex fake')\n",
        )
        .expect("write fake codex");
        let mut permissions = std::fs::metadata(&codex_path)
            .expect("codex metadata")
            .permissions();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            permissions.set_mode(0o755);
        }
        std::fs::set_permissions(&codex_path, permissions).expect("chmod fake codex");

        let ready = preflight_provider_reference(&reference, &bin_dir.to_string_lossy());
        assert!(ready.ready);
        assert_eq!(ready.status, ProviderReadinessStatus::Ready);
        assert_eq!(ready.checked_provider_id, "codex-cli");

        reference.last_preflight = Some(ready);
        reference.status = ProviderReadinessStatus::Ready;
        store
            .save_provider_reference_record(reference)
            .expect("persist ready provider");
        assert!(ensure_provider_ready_for_run(&store).is_ok());
    }

    #[test]
    fn repository_runs_are_blocked_without_ready_provider() {
        let root = temp_store_root("provider-block");
        let store = LocalPersistenceStore::new(root.clone());

        let missing_error =
            ensure_provider_ready_for_run(&store).expect_err("missing provider blocks run");
        assert_eq!(
            missing_error.to_string(),
            "Provider setup is required before running a real repository task"
        );

        store
            .save_provider_reference(ProviderSetupInput {
                provider_id: "codex-cli".into(),
                label: "Local Codex CLI".into(),
                raw_secret: None,
            })
            .expect("save untested provider");
        let failed_error =
            ensure_provider_ready_for_run(&store).expect_err("untested provider blocks run");
        assert_eq!(
            failed_error.to_string(),
            "Provider preflight must pass before running a real repository task"
        );
    }

    #[test]
    fn persisted_repository_run_records_provider_status_without_raw_secret() {
        let root = temp_store_root("provider-run");
        let store = LocalPersistenceStore::new(root.clone());
        let mut provider = store
            .save_provider_reference(ProviderSetupInput {
                provider_id: "codex-cli".into(),
                label: "Local Codex CLI".into(),
                raw_secret: Some("sk-privatebeta-secret-456".into()),
            })
            .expect("save provider");
        provider.status = ProviderReadinessStatus::Ready;
        provider.last_preflight = Some(ProviderPreflightResult {
            checked_provider_id: "codex-cli".into(),
            status: ProviderReadinessStatus::Ready,
            ready: true,
            checked_at: "2026-07-04T00:00:00.000Z".into(),
            executable_path: Some("/usr/local/bin/codex".into()),
            reasons: vec!["Codex CLI executable is available.".into()],
        });
        store
            .save_provider_reference_record(provider)
            .expect("save ready provider");

        let mut run = persisted_run(&root, "run-provider-ready");
        run.provider_refs = store
            .list_provider_references()
            .expect("load provider refs for run");
        store.save_run(&run).expect("save run");

        let raw_run =
            std::fs::read_to_string(store.run_path("run-provider-ready")).expect("read run");
        assert!(raw_run.contains("codex-cli"));
        assert!(raw_run.contains("ready"));
        assert!(!raw_run.contains("sk-privatebeta-secret-456"));
    }

    #[test]
    fn artifact_evidence_lists_and_reads_manifest_owned_artifacts_with_secret_redaction() {
        let root = temp_store_root("artifact-read");
        let store = LocalPersistenceStore::new(root.clone());
        let run = persisted_run(&root, "run-artifact-read");
        let artifact_root = PathBuf::from(&run.artifact_root);
        std::fs::create_dir_all(&artifact_root).expect("create artifact root");
        std::fs::write(
            artifact_root.join("codex-contract.md"),
            "Contract body\napi_key = sk-privatebeta-secret-789\n",
        )
        .expect("write contract");
        std::fs::write(artifact_root.join("run-events.json"), "[]\n").expect("write events");
        std::fs::write(artifact_root.join("verifier-input.json"), "{}\n")
            .expect("write verifier input");
        std::fs::write(artifact_root.join("verification-result.json"), "{}\n")
            .expect("write verification result");
        std::fs::write(
            artifact_root.join("manual-result.redacted.log"),
            "redacted\n",
        )
        .expect("write redacted log");
        let memory_root = root.join("memory");
        std::fs::create_dir_all(&memory_root).expect("create memory root");
        std::fs::write(
            memory_root.join("memory-store.json"),
            r#"{"candidateRules":[]}"#,
        )
        .expect("write memory store");
        store.save_run(&run).expect("save run");

        let artifacts = store
            .list_artifact_evidence("run-artifact-read")
            .expect("list artifact evidence");
        assert!(artifacts
            .iter()
            .any(|artifact| artifact.artifact_id == "artifactManifest"
                && artifact.status == ArtifactEvidenceStatus::Verified));
        assert!(artifacts
            .iter()
            .any(|artifact| artifact.artifact_id == "contract"
                && artifact.label == "Contract"
                && artifact.status == ArtifactEvidenceStatus::Verified));
        assert!(artifacts
            .iter()
            .any(|artifact| artifact.artifact_id == "usageSummary"
                && artifact.kind == ArtifactEvidenceKind::UsageSummary));
        assert!(artifacts
            .iter()
            .any(|artifact| artifact.artifact_id == "memoryStore"
                && artifact.kind == ArtifactEvidenceKind::MemoryStore
                && artifact.status == ArtifactEvidenceStatus::Verified));

        let contract = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-artifact-read".into(),
                artifact_id: "contract".into(),
            })
            .expect("read contract artifact");

        assert_eq!(contract.status, ArtifactEvidenceStatus::Verified);
        assert!(contract.content.contains("Contract body"));
        assert!(!contract.content.contains("sk-privatebeta-secret-789"));
        assert!(contract.content.contains("[REDACTED_SECRET]"));

        let memory_store = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-artifact-read".into(),
                artifact_id: "memoryStore".into(),
            })
            .expect("read app memory store artifact");
        assert_eq!(memory_store.status, ArtifactEvidenceStatus::Verified);
        assert!(memory_store.content.contains("candidateRules"));

        let unknown_error = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-artifact-read".into(),
                artifact_id: "unknownArtifact".into(),
            })
            .expect_err("unknown artifacts are not manifest members");
        assert_eq!(
            unknown_error.to_string(),
            "artifact is not referenced by the persisted run manifest"
        );
    }

    #[test]
    fn artifact_evidence_rejects_traversal_external_paths_unknown_schemes_missing_corrupt_and_oversized_artifacts(
    ) {
        let root = temp_store_root("artifact-reject");
        let store = LocalPersistenceStore::new(root.clone());

        let traversal_path = root
            .join("artifacts")
            .join("run-traversal")
            .join("artifact-manifest.json");
        std::fs::create_dir_all(traversal_path.parent().expect("traversal parent"))
            .expect("create traversal parent");
        let mut traversal_run = persisted_run(&root, "run-traversal");
        traversal_run.artifact_root = root
            .join("artifacts")
            .join("run-traversal")
            .to_string_lossy()
            .to_string();
        traversal_run.artifact_manifest_path = traversal_path.to_string_lossy().to_string();
        std::fs::write(
            &traversal_path,
            serde_json::json!({
                "runId": "run-traversal",
                "artifacts": {
                    "contract": format!("{}/artifacts/run-traversal/../outside.md", root.display())
                }
            })
            .to_string(),
        )
        .expect("write traversal manifest");
        store.save_run(&traversal_run).expect("save traversal run");
        let traversal_error = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-traversal".into(),
                artifact_id: "contract".into(),
            })
            .expect_err("traversal artifact is unsafe");
        assert_eq!(
            traversal_error.to_string(),
            "artifact path must stay inside the persisted run artifact directory"
        );

        let external_path = root
            .join("artifacts")
            .join("run-external")
            .join("artifact-manifest.json");
        std::fs::create_dir_all(external_path.parent().expect("external parent"))
            .expect("create external parent");
        let mut external_run = persisted_run(&root, "run-external");
        external_run.artifact_root = root
            .join("artifacts")
            .join("run-external")
            .to_string_lossy()
            .to_string();
        external_run.artifact_manifest_path = external_path.to_string_lossy().to_string();
        std::fs::write(
            &external_path,
            serde_json::json!({
                "runId": "run-external",
                "artifacts": { "contract": "/tmp/codepawl-external-contract.md" }
            })
            .to_string(),
        )
        .expect("write external manifest");
        store.save_run(&external_run).expect("save external run");
        let external_error = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-external".into(),
                artifact_id: "contract".into(),
            })
            .expect_err("external path is unsafe");
        assert_eq!(
            external_error.to_string(),
            "artifact path must stay inside the persisted run artifact directory"
        );

        let memory_root = root.join("memory");
        std::fs::create_dir_all(&memory_root).expect("create memory root");
        std::fs::write(memory_root.join("not-a-contract.md"), "wrong root")
            .expect("write non-memory artifact in memory root");
        let non_memory_path = root
            .join("artifacts")
            .join("run-non-memory-root")
            .join("artifact-manifest.json");
        std::fs::create_dir_all(non_memory_path.parent().expect("non-memory parent"))
            .expect("create non-memory parent");
        let mut non_memory_run = persisted_run(&root, "run-non-memory-root");
        non_memory_run.artifact_root = root
            .join("artifacts")
            .join("run-non-memory-root")
            .to_string_lossy()
            .to_string();
        non_memory_run.artifact_manifest_path = non_memory_path.to_string_lossy().to_string();
        std::fs::write(
            &non_memory_path,
            serde_json::json!({
                "runId": "run-non-memory-root",
                "artifacts": { "contract": memory_root.join("not-a-contract.md").to_string_lossy() }
            })
            .to_string(),
        )
        .expect("write non-memory-root manifest");
        store
            .save_run(&non_memory_run)
            .expect("save non-memory-root run");
        let non_memory_error = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-non-memory-root".into(),
                artifact_id: "contract".into(),
            })
            .expect_err("non-memory artifacts cannot use memory root");
        assert_eq!(
            non_memory_error.to_string(),
            "artifact path must stay inside the persisted run artifact directory"
        );

        let scheme_path = root
            .join("artifacts")
            .join("run-scheme")
            .join("artifact-manifest.json");
        std::fs::create_dir_all(scheme_path.parent().expect("scheme parent"))
            .expect("create scheme parent");
        let mut scheme_run = persisted_run(&root, "run-scheme");
        scheme_run.artifact_root = root
            .join("artifacts")
            .join("run-scheme")
            .to_string_lossy()
            .to_string();
        scheme_run.artifact_manifest_path = scheme_path.to_string_lossy().to_string();
        std::fs::write(
            &scheme_path,
            serde_json::json!({
                "runId": "run-scheme",
                "artifacts": { "contract": "https://example.com/contract.md" }
            })
            .to_string(),
        )
        .expect("write scheme manifest");
        store.save_run(&scheme_run).expect("save scheme run");
        let scheme_error = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-scheme".into(),
                artifact_id: "contract".into(),
            })
            .expect_err("unknown scheme is unsafe");
        assert_eq!(
            scheme_error.to_string(),
            "artifact URI scheme is not allowed"
        );

        #[cfg(unix)]
        {
            let symlink_path = root
                .join("artifacts")
                .join("run-symlink")
                .join("artifact-manifest.json");
            std::fs::create_dir_all(symlink_path.parent().expect("symlink parent"))
                .expect("create symlink parent");
            let outside_symlink_target = std::env::temp_dir()
                .join(format!("codepawl-symlink-target-{}.md", unique_suffix()));
            std::fs::write(&outside_symlink_target, "outside secret")
                .expect("write outside symlink target");
            let mut symlink_run = persisted_run(&root, "run-symlink");
            let symlink_artifact_root = root.join("artifacts").join("run-symlink");
            symlink_run.artifact_root = symlink_artifact_root.to_string_lossy().to_string();
            symlink_run.artifact_manifest_path = symlink_path.to_string_lossy().to_string();
            std::os::unix::fs::symlink(
                &outside_symlink_target,
                symlink_artifact_root.join("codex-contract.md"),
            )
            .expect("create artifact symlink");
            store.save_run(&symlink_run).expect("save symlink run");
            let symlink_error = store
                .read_artifact_evidence(ArtifactReadInput {
                    run_id: "run-symlink".into(),
                    artifact_id: "contract".into(),
                })
                .expect_err("symlink target outside app data is unsafe");
            assert_eq!(
                symlink_error.to_string(),
                "artifact path must stay inside the persisted run artifact directory"
            );
        }

        let outside_memory_path = root
            .join("artifacts")
            .join("run-outside-memory")
            .join("artifact-manifest.json");
        std::fs::create_dir_all(outside_memory_path.parent().expect("outside memory parent"))
            .expect("create outside memory parent");
        let outside_memory_file =
            std::env::temp_dir().join(format!("codepawl-outside-memory-{}.json", unique_suffix()));
        std::fs::write(&outside_memory_file, "{}").expect("write outside memory file");
        let mut outside_memory_run = persisted_run(&root, "run-outside-memory");
        outside_memory_run.artifact_root = root
            .join("artifacts")
            .join("run-outside-memory")
            .to_string_lossy()
            .to_string();
        outside_memory_run.artifact_manifest_path =
            outside_memory_path.to_string_lossy().to_string();
        std::fs::write(
            &outside_memory_path,
            serde_json::json!({
                "runId": "run-outside-memory",
                "artifacts": { "memoryStore": outside_memory_file.to_string_lossy() }
            })
            .to_string(),
        )
        .expect("write outside memory manifest");
        store
            .save_run(&outside_memory_run)
            .expect("save outside memory run");
        let outside_memory_error = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-outside-memory".into(),
                artifact_id: "memoryStore".into(),
            })
            .expect_err("memory store outside app data is unsafe");
        assert_eq!(
            outside_memory_error.to_string(),
            "artifact path must stay inside the persisted run artifact directory"
        );

        let missing_file_run = persisted_run(&root, "run-missing-file");
        std::fs::create_dir_all(&missing_file_run.artifact_root)
            .expect("create missing file artifact root");
        store
            .save_run(&missing_file_run)
            .expect("save missing file run");
        let missing_artifacts = store
            .list_artifact_evidence("run-missing-file")
            .expect("list missing file evidence");
        let missing_contract = missing_artifacts
            .iter()
            .find(|artifact| artifact.artifact_id == "contract")
            .expect("contract evidence exists");
        assert_eq!(missing_contract.status, ArtifactEvidenceStatus::Unavailable);
        assert_eq!(
            missing_contract.reason.as_deref(),
            Some("artifact file is missing")
        );
        let missing_file_error = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-missing-file".into(),
                artifact_id: "contract".into(),
            })
            .expect_err("missing artifact file is rejected");
        assert_eq!(missing_file_error.to_string(), "artifact file is missing");

        let missing_error = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-artifact-read-missing".into(),
                artifact_id: "contract".into(),
            })
            .expect_err("missing run rejected");
        assert!(missing_error.to_string().contains("run snapshot not found"));

        let corrupt_run = persisted_run(&root, "run-corrupt-artifact-manifest");
        store.save_run(&corrupt_run).expect("save corrupt run");
        std::fs::write(&corrupt_run.artifact_manifest_path, "{not-json").expect("corrupt manifest");
        let corrupt_error = store
            .list_artifact_evidence("run-corrupt-artifact-manifest")
            .expect_err("corrupt manifest rejected");
        assert_eq!(
            corrupt_error.to_string(),
            "artifact manifest is missing or corrupted for run run-corrupt-artifact-manifest"
        );

        let oversized_run = persisted_run(&root, "run-oversized");
        let oversized_root = PathBuf::from(&oversized_run.artifact_root);
        std::fs::create_dir_all(&oversized_root).expect("create oversized root");
        std::fs::write(
            oversized_root.join("codex-contract.md"),
            "x".repeat(MAX_ARTIFACT_EVIDENCE_BYTES + 1),
        )
        .expect("write oversized contract");
        store.save_run(&oversized_run).expect("save oversized run");
        let oversized_error = store
            .read_artifact_evidence(ArtifactReadInput {
                run_id: "run-oversized".into(),
                artifact_id: "contract".into(),
            })
            .expect_err("oversized artifact rejected");
        assert_eq!(oversized_error.to_string(), "artifact is too large to open");
    }
}
