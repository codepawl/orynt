use std::{fs, path::PathBuf};

use codepawl_cli::run_cli;

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("fixtures/sessions/basic")
}

fn fixture_named(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("fixtures/sessions")
        .join(name)
}

#[test]
fn analyze_fixture_writes_reports_and_persists_latest() {
    let temp = tempfile::tempdir().unwrap();
    let store = temp.path().join("codepawl.db");
    let output_dir = temp.path().join("reports");

    let result = run_cli([
        "codepawl",
        "analyze",
        "--fixture",
        fixture_path().to_str().unwrap(),
        "--store",
        store.to_str().unwrap(),
        "--output-dir",
        output_dir.to_str().unwrap(),
    ])
    .unwrap();

    assert!(result.stdout.contains("Verdict: verified"));
    let report_json = output_dir.join("report-fixture-basic/report.json");
    let report_md = output_dir.join("report-fixture-basic/report.md");
    assert!(report_json.exists());
    assert!(report_md.exists());

    let expected = fs::read_to_string(fixture_path().join("expected.report.json")).unwrap();
    let actual = fs::read_to_string(report_json).unwrap();
    assert_eq!(actual.trim(), expected.trim());

    let scoped_latest = run_cli([
        "codepawl",
        "report",
        "--last",
        "--store",
        store.to_str().unwrap(),
    ]);
    assert!(scoped_latest.unwrap_err().to_string().contains("--global"));

    let latest = run_cli([
        "codepawl",
        "report",
        "--last",
        "--global",
        "--store",
        store.to_str().unwrap(),
    ])
    .unwrap();
    assert!(latest.stdout.contains("Scope: global"));
    assert!(latest.stdout.contains("**Verdict:** verified"));
}

#[test]
fn report_last_returns_latest_current_project_report_by_default() {
    let temp = tempfile::tempdir().unwrap();
    let store = temp.path().join("codepawl.db");
    let output_dir = temp.path().join("reports");

    run_cli([
        "codepawl",
        "analyze",
        "--fixture",
        fixture_path().to_str().unwrap(),
        "--store",
        store.to_str().unwrap(),
        "--output-dir",
        output_dir.to_str().unwrap(),
    ])
    .unwrap();
    run_cli([
        "codepawl",
        "analyze",
        "--store",
        store.to_str().unwrap(),
        "--output-dir",
        output_dir.to_str().unwrap(),
    ])
    .unwrap();

    let latest = run_cli([
        "codepawl",
        "report",
        "--last",
        "--store",
        store.to_str().unwrap(),
    ])
    .unwrap();

    assert!(latest.stdout.contains("Scope: current project"));
    assert!(latest.stdout.contains("Current git repository analysis"));
}

#[test]
fn fixtures_cover_all_required_verdicts() {
    let temp = tempfile::tempdir().unwrap();
    let store = temp.path().join("codepawl.db");
    let output_dir = temp.path().join("reports");
    let cases = [
        ("basic", "verified"),
        ("needs_evidence_missing_test", "needs_evidence"),
        ("risky_protected_path", "risky"),
        ("failed_command_log", "failed"),
        ("blocked_severe_policy", "blocked"),
    ];

    for (fixture, verdict) in cases {
        let result = run_cli([
            "codepawl",
            "analyze",
            "--fixture",
            fixture_named(fixture).to_str().unwrap(),
            "--store",
            store.to_str().unwrap(),
            "--output-dir",
            output_dir.to_str().unwrap(),
        ])
        .unwrap();

        assert!(
            result.stdout.contains(&format!("Verdict: {verdict}")),
            "{fixture} should be {verdict}: {}",
            result.stdout
        );
    }
}

#[test]
fn invalid_codepawl_yml_returns_clear_cli_error() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("codepawl.yml"),
        "checks:\n  test:\n    required: maybe\n",
    )
    .unwrap();
    fs::write(temp.path().join("input.json"), "{}").unwrap();

    let error = run_cli([
        "codepawl",
        "analyze",
        "--fixture",
        temp.path().to_str().unwrap(),
    ])
    .unwrap_err()
    .to_string();

    assert!(error.contains("invalid codepawl.yml"));
}

#[test]
fn projects_add_and_list_use_sqlite_store() {
    let temp = tempfile::tempdir().unwrap();
    let store = temp.path().join("codepawl.db");

    run_cli([
        "codepawl",
        "projects",
        "add",
        temp.path().to_str().unwrap(),
        "--store",
        store.to_str().unwrap(),
    ])
    .unwrap();

    let listed = run_cli([
        "codepawl",
        "projects",
        "list",
        "--store",
        store.to_str().unwrap(),
    ])
    .unwrap();

    assert!(listed.stdout.contains(temp.path().to_str().unwrap()));
}

#[test]
fn doctor_reports_local_first_defaults() {
    let result = run_cli(["codepawl", "doctor"]).unwrap();

    assert!(result.stdout.contains("local-first"));
    assert!(result.stdout.contains("telemetry: disabled"));
    assert!(result.stdout.contains("source upload: disabled"));
}

#[test]
fn accepts_binary_path_as_argv_zero() {
    let result = run_cli(["target/debug/codepawl", "doctor"]).unwrap();

    assert!(result.stdout.contains("local-first"));
}
