use std::fs;

use codepawl_policy::{load_policy, CheckRequirement};

#[test]
fn loads_minimal_codepawl_yml_policy() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join("codepawl.yml"),
        r#"project:
  name: codepawl

checks:
  test:
    required: true
    log: logs/test.log
  build:
    required: false
    log: logs/build.log
  e2e:
    required_for:
      - "apps/web/**"
      - "components/**"
    log: logs/e2e.log

policy:
  protected_paths:
    - "apps/api/billing/**"
  risky_patterns:
    - "package.json"
  blocked_paths:
    - "schema/destructive/**"
"#,
    )
    .unwrap();

    let policy = load_policy(dir.path()).unwrap();

    assert_eq!(policy.project_name.as_deref(), Some("codepawl"));
    assert_eq!(policy.checks["test"].requirement, CheckRequirement::Always);
    assert_eq!(
        policy.checks["build"].requirement,
        CheckRequirement::Optional
    );
    assert_eq!(
        policy.checks["e2e"].requirement,
        CheckRequirement::ForPaths(vec!["apps/web/**".to_string(), "components/**".to_string()])
    );
    assert_eq!(policy.protected_paths, vec!["apps/api/billing/**"]);
    assert_eq!(policy.risky_patterns, vec!["package.json"]);
    assert_eq!(policy.blocked_paths, vec!["schema/destructive/**"]);
}

#[test]
fn default_policy_loads_when_codepawl_yml_is_absent() {
    let dir = tempfile::tempdir().unwrap();

    let policy = load_policy(dir.path()).unwrap();

    assert!(policy.checks.contains_key("test"));
    assert!(policy
        .protected_paths
        .iter()
        .any(|path| path == ".github/**"));
}

#[test]
fn invalid_config_returns_clear_error() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join("codepawl.yml"),
        "checks:\n  test:\n    required: maybe\n",
    )
    .unwrap();

    let error = load_policy(dir.path()).unwrap_err().to_string();

    assert!(error.contains("invalid codepawl.yml"));
    assert!(error.contains("required"));
}
