use codepawl_core::{
    analyze_snapshot, Artifact, ChangeStatus, ChangedFile, ProjectContext, SessionContext,
    ValidationEvidence, ValidationStatus, Verdict,
};

fn base_snapshot() -> codepawl_core::AnalysisSnapshot {
    codepawl_core::AnalysisSnapshot {
        id: "report-fixture-basic".to_string(),
        created_at: "2026-06-23T00:00:00Z".to_string(),
        project: ProjectContext {
            name: "codepawl-fixture".to_string(),
            path: "fixtures/sessions/basic".to_string(),
        },
        session: SessionContext {
            id: "fixture-basic".to_string(),
            source: "fixture".to_string(),
            summary: "Synthetic scoped change with complete validation evidence.".to_string(),
        },
        agent: "Codex".to_string(),
        branch: "fixture/basic".to_string(),
        changed_files: vec![ChangedFile {
            path: "crates/codepawl-core/src/lib.rs".to_string(),
            status: ChangeStatus::Modified,
            evidence_ref: "diff.patch".to_string(),
        }],
        validation_evidence: vec![
            ValidationEvidence {
                check: "test".to_string(),
                status: ValidationStatus::Passed,
                source: "logs/test.log".to_string(),
                summary: "cargo test --workspace passed".to_string(),
            },
            ValidationEvidence {
                check: "typecheck".to_string(),
                status: ValidationStatus::Passed,
                source: "logs/typecheck.log".to_string(),
                summary: "cargo check --workspace passed".to_string(),
            },
            ValidationEvidence {
                check: "build".to_string(),
                status: ValidationStatus::Passed,
                source: "logs/build.log".to_string(),
                summary: "cargo build --workspace passed".to_string(),
            },
        ],
        required_checks: vec![
            "test".to_string(),
            "typecheck".to_string(),
            "build".to_string(),
        ],
        protected_paths: vec![
            ".github/**".to_string(),
            "crates/codepawl-store/migrations/**".to_string(),
        ],
        risky_patterns: vec![
            "package.json".to_string(),
            "pnpm-lock.yaml".to_string(),
            "Cargo.toml".to_string(),
            "Cargo.lock".to_string(),
        ],
        blocked_paths: vec!["schema/destructive/**".to_string()],
        artifacts: vec![Artifact {
            kind: "diff".to_string(),
            path: "diff.patch".to_string(),
        }],
    }
}

#[test]
fn complete_validation_without_risks_is_verified() {
    let report = analyze_snapshot(base_snapshot());

    assert_eq!(report.verdict, Verdict::Verified);
    assert!(report.risks.is_empty());
    assert!(report.missing_evidence.is_empty());
    assert!(report
        .next_actions
        .iter()
        .any(|action| action.contains("No immediate action")));
}

#[test]
fn missing_required_validation_is_needs_evidence() {
    let mut snapshot = base_snapshot();
    snapshot
        .validation_evidence
        .retain(|item| item.check != "typecheck");

    let report = analyze_snapshot(snapshot);

    assert_eq!(report.verdict, Verdict::NeedsEvidence);
    assert_eq!(report.missing_evidence[0].check, "typecheck");
    assert!(report.next_actions[0].contains("typecheck"));
}

#[test]
fn failed_validation_overrides_other_non_blocking_verdicts() {
    let mut snapshot = base_snapshot();
    snapshot.changed_files.push(ChangedFile {
        path: "pnpm-lock.yaml".to_string(),
        status: ChangeStatus::Modified,
        evidence_ref: "diff.patch".to_string(),
    });
    snapshot.validation_evidence[0].status = ValidationStatus::Failed;
    snapshot.validation_evidence[0].summary = "cargo test --workspace failed".to_string();

    let report = analyze_snapshot(snapshot);

    assert_eq!(report.verdict, Verdict::Failed);
    assert!(report.next_actions[0].contains("Fix failing validation"));
}

#[test]
fn protected_path_risk_cites_evidence() {
    let mut snapshot = base_snapshot();
    snapshot.changed_files.push(ChangedFile {
        path: ".github/workflows/ci.yml".to_string(),
        status: ChangeStatus::Modified,
        evidence_ref: "diff.patch".to_string(),
    });

    let report = analyze_snapshot(snapshot);

    assert_eq!(report.verdict, Verdict::Risky);
    assert!(report.risks.iter().any(|risk| {
        risk.title.contains("Protected path")
            && risk.evidence_refs.contains(&"diff.patch".to_string())
    }));
}

#[test]
fn dependency_risks_are_grouped_in_next_actions_and_memory_candidates() {
    let mut snapshot = base_snapshot();
    snapshot.changed_files.push(ChangedFile {
        path: "Cargo.toml".to_string(),
        status: ChangeStatus::Modified,
        evidence_ref: "diff.patch".to_string(),
    });
    snapshot.changed_files.push(ChangedFile {
        path: "pnpm-lock.yaml".to_string(),
        status: ChangeStatus::Modified,
        evidence_ref: "diff.patch".to_string(),
    });

    let report = analyze_snapshot(snapshot);

    assert_eq!(report.verdict, Verdict::Risky);
    assert!(report
        .next_actions
        .iter()
        .any(|action| action == "Review dependency and lockfile changes before marking this session ready: Cargo.toml, pnpm-lock.yaml."));
    assert_eq!(
        report
            .memory_candidates
            .iter()
            .filter(|candidate| candidate.contains("Dependency or lockfile changed"))
            .count(),
        1
    );
}

#[test]
fn blocked_policy_path_sets_blocked_verdict() {
    let mut snapshot = base_snapshot();
    snapshot.changed_files.push(ChangedFile {
        path: "schema/destructive/drop.sql".to_string(),
        status: ChangeStatus::Modified,
        evidence_ref: "diff.patch".to_string(),
    });

    let report = analyze_snapshot(snapshot);

    assert_eq!(report.verdict, Verdict::Blocked);
    assert!(report
        .next_actions
        .iter()
        .any(|action| action.contains("Resolve blocked policy paths")));
}
