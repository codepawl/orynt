use std::fs;

use codepawl_core::ValidationStatus;
use codepawl_evidence::{parse_validation_logs, redact_text};

#[test]
fn parses_pass_fail_and_missing_validation_logs() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("logs")).unwrap();
    fs::write(dir.path().join("logs/test.log"), "cargo test\n0 failed\n").unwrap();
    fs::write(
        dir.path().join("logs/build.log"),
        "error: could not compile codepawl\n",
    )
    .unwrap();

    let evidence = parse_validation_logs(dir.path(), &["test", "typecheck", "build"]).unwrap();

    assert_eq!(evidence[0].check, "test");
    assert_eq!(evidence[0].status, ValidationStatus::Passed);
    assert_eq!(evidence[1].check, "typecheck");
    assert_eq!(evidence[1].status, ValidationStatus::Missing);
    assert_eq!(evidence[2].check, "build");
    assert_eq!(evidence[2].status, ValidationStatus::Failed);
}

#[test]
fn redacts_common_secret_shapes_before_reporting() {
    let input = "Authorization: Bearer abcdef1234567890\nOPENAI_API_KEY=sk-test-secret\n-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";

    let redacted = redact_text(input);

    assert!(!redacted.contains("abcdef1234567890"));
    assert!(!redacted.contains("sk-test-secret"));
    assert!(!redacted.contains("abc\n-----END"));
    assert!(redacted.contains("Authorization: Bearer [REDACTED:token]"));
    assert!(redacted.contains("OPENAI_API_KEY=[REDACTED:secret]"));
    assert!(redacted.contains("[REDACTED:private-key]"));
}
