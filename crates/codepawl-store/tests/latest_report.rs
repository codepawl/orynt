use codepawl_core::{
    Artifact, ProjectContext, Report, SessionContext, ValidationEvidence, ValidationStatus, Verdict,
};
use codepawl_store::Store;

fn report_for_project(id: &str, created_at: &str, project_path: &str) -> Report {
    Report {
        id: id.to_string(),
        created_at: created_at.to_string(),
        project: ProjectContext {
            name: "codepawl".to_string(),
            path: project_path.to_string(),
        },
        session: SessionContext {
            id: format!("session-{id}"),
            source: "fixture".to_string(),
            summary: "SQLite latest report test.".to_string(),
        },
        agent: "Codex".to_string(),
        branch: "main".to_string(),
        verdict: Verdict::NeedsEvidence,
        summary: "Report for latest lookup.".to_string(),
        changed_files: vec![],
        validation_evidence: vec![ValidationEvidence {
            check: "test".to_string(),
            status: ValidationStatus::Missing,
            source: "logs/test.log".to_string(),
            summary: "No test log found.".to_string(),
        }],
        risks: vec![],
        missing_evidence: vec![],
        next_actions: vec!["Run cargo test --workspace.".to_string()],
        follow_up_prompt: "Attach validation evidence and rerun CodePawl.".to_string(),
        memory_candidates: vec![],
        artifacts: vec![Artifact {
            kind: "report".to_string(),
            path: "report.json".to_string(),
        }],
    }
}

fn report(id: &str, created_at: &str) -> Report {
    report_for_project(id, created_at, ".")
}

#[test]
fn latest_report_survives_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("codepawl.db");

    {
        let store = Store::open(&db_path).unwrap();
        store
            .save_report(&report("report-old", "2026-06-22T00:00:00Z"))
            .unwrap();
        store
            .save_report(&report("report-new", "2026-06-23T00:00:00Z"))
            .unwrap();
    }

    let store = Store::open(&db_path).unwrap();
    let latest = store.latest_report().unwrap().unwrap();

    assert_eq!(latest.id, "report-new");
}

#[test]
fn latest_report_uses_insert_order_across_timestamp_formats() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("codepawl.db");
    let store = Store::open(&db_path).unwrap();

    store
        .save_report(&report("report-fixture", "2026-06-23T00:00:00Z"))
        .unwrap();
    store
        .save_report(&report("report-current", "1782153705"))
        .unwrap();

    let latest = store.latest_report().unwrap().unwrap();

    assert_eq!(latest.id, "report-current");
}

#[test]
fn latest_report_for_project_ignores_other_projects() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("codepawl.db");
    let store = Store::open(&db_path).unwrap();

    store
        .save_report(&report_for_project(
            "report-current-project",
            "2026-06-23T00:00:00Z",
            "/repos/current",
        ))
        .unwrap();
    store
        .save_report(&report_for_project(
            "report-other-project",
            "2026-06-23T01:00:00Z",
            "/repos/other",
        ))
        .unwrap();

    let latest = store
        .latest_report_for_project("/repos/current")
        .unwrap()
        .unwrap();

    assert_eq!(latest.id, "report-current-project");
}
