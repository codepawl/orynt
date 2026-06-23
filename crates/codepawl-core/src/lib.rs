use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectContext {
    pub name: String,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionContext {
    pub id: String,
    pub source: String,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Verified,
    NeedsEvidence,
    Risky,
    Failed,
    Blocked,
}

impl Verdict {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Verified => "verified",
            Self::NeedsEvidence => "needs_evidence",
            Self::Risky => "risky",
            Self::Failed => "failed",
            Self::Blocked => "blocked",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChangedFile {
    pub path: String,
    pub status: ChangeStatus,
    pub evidence_ref: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationStatus {
    Passed,
    Failed,
    Missing,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidationEvidence {
    pub check: String,
    pub status: ValidationStatus,
    pub source: String,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RiskItem {
    pub severity: String,
    pub title: String,
    pub detail: String,
    pub evidence_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MissingEvidence {
    pub check: String,
    pub expected: String,
    pub evidence_ref: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Artifact {
    pub kind: String,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalysisSnapshot {
    pub id: String,
    pub created_at: String,
    pub project: ProjectContext,
    pub session: SessionContext,
    pub agent: String,
    pub branch: String,
    pub changed_files: Vec<ChangedFile>,
    pub validation_evidence: Vec<ValidationEvidence>,
    pub required_checks: Vec<String>,
    pub protected_paths: Vec<String>,
    pub risky_patterns: Vec<String>,
    pub blocked_paths: Vec<String>,
    pub artifacts: Vec<Artifact>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Report {
    pub id: String,
    pub created_at: String,
    pub project: ProjectContext,
    pub session: SessionContext,
    pub agent: String,
    pub branch: String,
    pub verdict: Verdict,
    pub summary: String,
    pub changed_files: Vec<ChangedFile>,
    pub validation_evidence: Vec<ValidationEvidence>,
    pub risks: Vec<RiskItem>,
    pub missing_evidence: Vec<MissingEvidence>,
    pub next_actions: Vec<String>,
    pub follow_up_prompt: String,
    pub memory_candidates: Vec<String>,
    pub artifacts: Vec<Artifact>,
}

pub fn analyze_snapshot(snapshot: AnalysisSnapshot) -> Report {
    let missing_evidence = missing_required_evidence(&snapshot);
    let risks = detect_risks(&snapshot);
    let has_blocker = risks.iter().any(|risk| risk.severity == "Blocker");
    let failed_evidence = snapshot
        .validation_evidence
        .iter()
        .find(|item| item.status == ValidationStatus::Failed);

    let verdict = if snapshot.changed_files.is_empty() || has_blocker {
        Verdict::Blocked
    } else if failed_evidence.is_some() {
        Verdict::Failed
    } else if !risks.is_empty() {
        Verdict::Risky
    } else if !missing_evidence.is_empty() {
        Verdict::NeedsEvidence
    } else {
        Verdict::Verified
    };

    let next_actions = next_actions(&verdict, failed_evidence, &missing_evidence, &risks);
    let follow_up_prompt = follow_up_prompt(&verdict, &next_actions);
    let memory_candidates = memory_candidates(&verdict, &missing_evidence, &risks);
    let summary = report_summary(&verdict, &snapshot);

    Report {
        id: snapshot.id,
        created_at: snapshot.created_at,
        project: snapshot.project,
        session: snapshot.session,
        agent: snapshot.agent,
        branch: snapshot.branch,
        verdict,
        summary,
        changed_files: snapshot.changed_files,
        validation_evidence: snapshot.validation_evidence,
        risks,
        missing_evidence,
        next_actions,
        follow_up_prompt,
        memory_candidates,
        artifacts: snapshot.artifacts,
    }
}

fn missing_required_evidence(snapshot: &AnalysisSnapshot) -> Vec<MissingEvidence> {
    snapshot
        .required_checks
        .iter()
        .filter(|check| {
            !snapshot
                .validation_evidence
                .iter()
                .any(|item| item.check == **check && item.status != ValidationStatus::Missing)
        })
        .map(|check| {
            let expected_source = snapshot
                .validation_evidence
                .iter()
                .find(|item| item.check == *check)
                .map(|item| item.source.clone())
                .unwrap_or_else(|| format!("logs/{check}.log"));
            MissingEvidence {
                check: check.clone(),
                expected: format!("Expected validation evidence for `{check}`."),
                evidence_ref: expected_source,
            }
        })
        .collect()
}

fn detect_risks(snapshot: &AnalysisSnapshot) -> Vec<RiskItem> {
    let mut risks = Vec::new();
    let mut blocked_files = Vec::new();
    let mut blocked_refs = BTreeSet::new();
    let mut protected_files = Vec::new();
    let mut protected_refs = BTreeSet::new();
    let mut dependency_files = BTreeSet::new();
    let mut dependency_refs = BTreeSet::new();

    for file in &snapshot.changed_files {
        if snapshot
            .blocked_paths
            .iter()
            .any(|pattern| path_matches_pattern(&file.path, pattern))
        {
            blocked_files.push(file.path.clone());
            blocked_refs.insert(file.evidence_ref.clone());
        }

        if snapshot
            .protected_paths
            .iter()
            .any(|pattern| path_matches_pattern(&file.path, pattern))
        {
            protected_files.push(file.path.clone());
            protected_refs.insert(file.evidence_ref.clone());
        }

        if is_dependency_or_lockfile(&file.path)
            || snapshot
                .risky_patterns
                .iter()
                .any(|pattern| path_matches_pattern(&file.path, pattern))
        {
            dependency_files.insert(file.path.clone());
            dependency_refs.insert(file.evidence_ref.clone());
        }
    }

    if !blocked_files.is_empty() {
        risks.push(RiskItem {
            severity: "Blocker".to_string(),
            title: "Blocked policy path touched".to_string(),
            detail: format!(
                "Blocked policy paths changed: {}.",
                blocked_files.join(", ")
            ),
            evidence_refs: evidence_refs_with_policy("policy.blocked_paths", blocked_refs),
        });
    }

    if !protected_files.is_empty() {
        risks.push(RiskItem {
            severity: "High".to_string(),
            title: "Protected path touched".to_string(),
            detail: format!(
                "Protected policy paths changed: {}.",
                protected_files.join(", ")
            ),
            evidence_refs: evidence_refs_with_policy("policy.protected_paths", protected_refs),
        });
    }

    if !dependency_files.is_empty() {
        risks.push(RiskItem {
            severity: "Medium".to_string(),
            title: "Dependency or lockfile changed".to_string(),
            detail: format!(
                "Dependency or lockfile changes need review: {}.",
                dependency_files.into_iter().collect::<Vec<_>>().join(", ")
            ),
            evidence_refs: evidence_refs_with_policy("policy.risky_patterns", dependency_refs),
        });
    }

    if snapshot.changed_files.len() > 20 {
        risks.push(RiskItem {
            severity: "Medium".to_string(),
            title: "Broad change surface".to_string(),
            detail: format!(
                "{} files changed; review scope before marking this session ready.",
                snapshot.changed_files.len()
            ),
            evidence_refs: vec!["changed_files".to_string()],
        });
    }

    risks
}

fn evidence_refs_with_policy(policy_ref: &str, refs: BTreeSet<String>) -> Vec<String> {
    let mut evidence_refs = refs.into_iter().collect::<Vec<_>>();
    evidence_refs.push(policy_ref.to_string());
    evidence_refs
}

fn path_matches_pattern(path: &str, pattern: &str) -> bool {
    if let Some(prefix) = pattern.strip_suffix("/**") {
        return path == prefix || path.starts_with(&format!("{prefix}/"));
    }

    if let Some(suffix) = pattern.strip_prefix("**/") {
        return path == suffix || path.ends_with(&format!("/{suffix}"));
    }

    path == pattern
}

fn is_dependency_or_lockfile(path: &str) -> bool {
    matches!(
        path.rsplit('/').next().unwrap_or(path),
        "Cargo.lock"
            | "package.json"
            | "pnpm-lock.yaml"
            | "package-lock.json"
            | "yarn.lock"
            | "bun.lock"
            | "bun.lockb"
            | "Cargo.toml"
            | "pyproject.toml"
            | "requirements.txt"
    )
}

fn next_actions(
    verdict: &Verdict,
    failed_evidence: Option<&ValidationEvidence>,
    missing: &[MissingEvidence],
    risks: &[RiskItem],
) -> Vec<String> {
    match verdict {
        Verdict::Verified => {
            vec![
                "No immediate action required; keep the report with the session record."
                    .to_string(),
            ]
        }
        Verdict::NeedsEvidence => {
            let checks = missing
                .iter()
                .map(|item| item.check.as_str())
                .collect::<Vec<_>>()
                .join(", ");
            vec![format!(
                "Run or attach missing validation evidence for: {checks}."
            )]
        }
        Verdict::Risky => grouped_risk_actions(risks),
        Verdict::Failed => {
            let check = failed_evidence
                .map(|item| item.check.as_str())
                .unwrap_or("validation");
            vec![format!(
                "Fix failing validation evidence for `{check}`, then rerun CodePawl."
            )]
        }
        Verdict::Blocked => {
            if risks.iter().any(|risk| risk.severity == "Blocker") {
                vec!["Resolve blocked policy paths before marking this session ready.".to_string()]
            } else {
                vec![
                    "Provide a usable diff or session artifact, then rerun CodePawl analysis."
                        .to_string(),
                ]
            }
        }
    }
}

fn grouped_risk_actions(risks: &[RiskItem]) -> Vec<String> {
    let mut actions = Vec::new();
    let mut grouped: BTreeMap<&str, Vec<String>> = BTreeMap::new();
    for risk in risks {
        grouped
            .entry(risk.title.as_str())
            .or_default()
            .extend(paths_from_detail(&risk.detail));
    }

    for (title, mut paths) in grouped {
        paths.sort();
        paths.dedup();
        match title {
            "Dependency or lockfile changed" => actions.push(format!(
                "Review dependency and lockfile changes before marking this session ready: {}.",
                paths.join(", ")
            )),
            "Protected path touched" => actions.push(format!(
                "Review protected path changes before merge: {}.",
                paths.join(", ")
            )),
            "Broad change surface" => actions
                .push("Review broad change surface before marking this session ready.".to_string()),
            _ => actions.push(format!(
                "Review risky changes before marking this session ready: {title}."
            )),
        }
    }

    actions
}

fn follow_up_prompt(verdict: &Verdict, next_actions: &[String]) -> String {
    match verdict {
        Verdict::Verified => "No rerun prompt is needed for this verified report.".to_string(),
        _ => format!(
            "Continue from this CodePawl report. Focus only on the cited evidence and complete this next action: {}",
            next_actions.first().cloned().unwrap_or_else(|| "rerun analysis".to_string())
        ),
    }
}

fn memory_candidates(
    verdict: &Verdict,
    missing: &[MissingEvidence],
    risks: &[RiskItem],
) -> Vec<String> {
    let mut candidates = Vec::new();
    if *verdict == Verdict::NeedsEvidence {
        candidates.push(format!(
            "Require validation evidence for {} before marking similar sessions verified.",
            missing
                .iter()
                .map(|item| item.check.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    for risk in risks {
        let candidate = format!("Review future sessions for risk pattern: {}.", risk.title);
        if !candidates.contains(&candidate) {
            candidates.push(candidate);
        }
    }
    candidates
}

fn paths_from_detail(detail: &str) -> Vec<String> {
    detail
        .trim_end_matches('.')
        .split_once(": ")
        .map(|(_, paths)| paths.split(", ").map(ToString::to_string).collect())
        .unwrap_or_default()
}

fn report_summary(verdict: &Verdict, snapshot: &AnalysisSnapshot) -> String {
    format!(
        "{} {} file(s) on branch `{}`. Verdict: {}.",
        snapshot.session.summary,
        snapshot.changed_files.len(),
        snapshot.branch,
        verdict.as_str()
    )
}
