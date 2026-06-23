use codepawl_core::{
    Artifact, ChangeStatus, ChangedFile, ProjectContext, Report, RiskItem, SessionContext,
    ValidationEvidence, ValidationStatus, Verdict,
};
use codepawl_report::{render_json, render_markdown};

fn sample_report() -> Report {
    Report {
        id: "report-fixture-basic".to_string(),
        created_at: "2026-06-23T00:00:00Z".to_string(),
        project: ProjectContext {
            name: "codepawl-fixture".to_string(),
            path: "fixtures/sessions/basic".to_string(),
        },
        session: SessionContext {
            id: "fixture-basic".to_string(),
            source: "fixture".to_string(),
            summary: "Scoped fixture analysis.".to_string(),
        },
        agent: "Codex".to_string(),
        branch: "fixture/basic".to_string(),
        verdict: Verdict::Verified,
        summary: "Scoped change with complete validation evidence.".to_string(),
        changed_files: vec![ChangedFile {
            path: "crates/codepawl-core/src/lib.rs".to_string(),
            status: ChangeStatus::Modified,
            evidence_ref: "diff.patch".to_string(),
        }],
        validation_evidence: vec![ValidationEvidence {
            check: "test".to_string(),
            status: ValidationStatus::Passed,
            source: "logs/test.log".to_string(),
            summary: "cargo test --workspace passed".to_string(),
        }],
        risks: vec![],
        missing_evidence: vec![],
        next_actions: vec![
            "No immediate action required; keep the report with the session record.".to_string(),
        ],
        follow_up_prompt: "No rerun needed.".to_string(),
        memory_candidates: vec![],
        artifacts: vec![Artifact {
            kind: "report".to_string(),
            path: "report.json".to_string(),
        }],
    }
}

#[test]
fn renders_stable_json_with_snake_case_verdict() {
    let json = render_json(&sample_report()).unwrap();

    assert!(json.contains("\"verdict\": \"verified\""));
    assert!(json.contains("\"validation_evidence\""));
}

#[test]
fn renders_markdown_with_evidence_risks_and_next_actions() {
    let markdown = render_markdown(&sample_report());

    assert!(markdown.contains("# CodePawl Report"));
    assert!(markdown.contains("**Verdict:** verified"));
    assert!(markdown.contains("## Validation Evidence"));
    assert!(markdown.contains("## Risks"));
    assert!(markdown.contains("## Next Actions"));
}

#[test]
fn renders_legacy_duplicate_dependency_risks_as_grouped_output() {
    let mut report = sample_report();
    report.verdict = Verdict::Risky;
    report.risks = vec![
        RiskItem {
            severity: "Medium".to_string(),
            title: "Dependency or lockfile changed".to_string(),
            detail: "Cargo.toml can affect installation or dependency resolution.".to_string(),
            evidence_refs: vec!["git status --porcelain=v1".to_string()],
        },
        RiskItem {
            severity: "Medium".to_string(),
            title: "Dependency or lockfile changed".to_string(),
            detail: "pnpm-lock.yaml can affect installation or dependency resolution.".to_string(),
            evidence_refs: vec!["git status --porcelain=v1".to_string()],
        },
    ];
    report.next_actions = vec![
        "Review risky changes before acceptance: Dependency or lockfile changed, Dependency or lockfile changed.".to_string(),
    ];
    report.follow_up_prompt =
        "Review risky changes before acceptance, then rerun CodePawl.".to_string();
    report.memory_candidates = vec![
        "Review future sessions for risk pattern: Dependency or lockfile changed.".to_string(),
        "Review future sessions for risk pattern: Dependency or lockfile changed.".to_string(),
    ];

    let markdown = render_markdown(&report);

    assert!(markdown.contains(
        "Review dependency and lockfile changes before marking this session ready: Cargo.toml, pnpm-lock.yaml."
    ));
    assert!(!markdown.contains("acceptance"));
    assert_eq!(
        markdown
            .matches("Review future sessions for risk pattern: Dependency or lockfile changed.")
            .count(),
        1
    );
}
