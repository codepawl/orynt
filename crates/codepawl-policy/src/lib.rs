use std::{collections::BTreeMap, fs, path::Path};

use anyhow::{anyhow, Result};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PolicyConfig {
    pub project_name: Option<String>,
    pub checks: BTreeMap<String, CheckPolicy>,
    pub protected_paths: Vec<String>,
    pub risky_patterns: Vec<String>,
    pub blocked_paths: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CheckPolicy {
    pub requirement: CheckRequirement,
    pub log: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CheckRequirement {
    Always,
    Optional,
    ForPaths(Vec<String>),
}

pub fn default_required_checks() -> Vec<String> {
    vec![
        "test".to_string(),
        "typecheck".to_string(),
        "build".to_string(),
    ]
}

pub fn default_protected_paths() -> Vec<String> {
    vec![
        ".github/**".to_string(),
        "crates/codepawl-store/migrations/**".to_string(),
        "**/.env".to_string(),
        "**/.env.*".to_string(),
        "**/.npmrc".to_string(),
        "**/.pypirc".to_string(),
        "**/.netrc".to_string(),
        "**/*.pem".to_string(),
        "**/*.key".to_string(),
    ]
}

pub fn default_risky_patterns() -> Vec<String> {
    vec![
        "package.json".to_string(),
        "pnpm-lock.yaml".to_string(),
        "Cargo.toml".to_string(),
        "Cargo.lock".to_string(),
        "**/migration/**".to_string(),
    ]
}

pub fn load_policy(root: impl AsRef<Path>) -> Result<PolicyConfig> {
    let root = root.as_ref();
    let path = root.join("codepawl.yml");
    if !path.exists() {
        return Ok(default_policy());
    }

    let contents = fs::read_to_string(&path)?;
    parse_policy(&contents).map_err(|error| anyhow!("invalid codepawl.yml: {error}"))
}

pub fn default_policy() -> PolicyConfig {
    let mut checks = BTreeMap::new();
    for check in default_required_checks() {
        checks.insert(
            check.clone(),
            CheckPolicy {
                requirement: CheckRequirement::Always,
                log: format!("logs/{check}.log"),
            },
        );
    }

    PolicyConfig {
        project_name: None,
        checks,
        protected_paths: default_protected_paths(),
        risky_patterns: default_risky_patterns(),
        blocked_paths: Vec::new(),
    }
}

pub fn required_checks_for(policy: &PolicyConfig, changed_files: &[String]) -> Vec<String> {
    policy
        .checks
        .iter()
        .filter(|(_, check)| match &check.requirement {
            CheckRequirement::Always => true,
            CheckRequirement::Optional => false,
            CheckRequirement::ForPaths(patterns) => changed_files.iter().any(|path| {
                patterns
                    .iter()
                    .any(|pattern| path_matches_pattern(path, pattern))
            }),
        })
        .map(|(name, _)| name.clone())
        .collect()
}

pub fn check_logs_for(policy: &PolicyConfig, checks: &[String]) -> Vec<String> {
    checks
        .iter()
        .map(|check| {
            policy
                .checks
                .get(check)
                .map(|item| item.log.clone())
                .unwrap_or_else(|| format!("logs/{check}.log"))
        })
        .collect()
}

pub fn is_secret_like_path(path: &str) -> bool {
    let file_name = path.rsplit('/').next().unwrap_or(path);
    matches!(
        file_name,
        ".env" | ".npmrc" | ".pypirc" | ".netrc" | "id_rsa" | "id_ed25519"
    ) || file_name.starts_with(".env.")
        || file_name.ends_with(".pem")
        || file_name.ends_with(".key")
        || file_name.ends_with("_rsa")
        || file_name.ends_with("_ed25519")
}

pub fn path_matches_pattern(path: &str, pattern: &str) -> bool {
    if let Some(prefix) = pattern.strip_suffix("/**") {
        return path == prefix || path.starts_with(&format!("{prefix}/"));
    }

    if let Some(suffix) = pattern.strip_prefix("**/") {
        return path == suffix || path.ends_with(&format!("/{suffix}"));
    }

    path == pattern
}

fn parse_policy(contents: &str) -> Result<PolicyConfig> {
    let mut policy = PolicyConfig {
        project_name: None,
        checks: BTreeMap::new(),
        protected_paths: Vec::new(),
        risky_patterns: Vec::new(),
        blocked_paths: Vec::new(),
    };
    let mut section = "";
    let mut current_check: Option<String> = None;
    let mut list_target: Option<String> = None;

    for raw_line in contents.lines() {
        let line = raw_line.trim_end();
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if !line.starts_with(' ') && trimmed.ends_with(':') {
            section = trimmed.trim_end_matches(':');
            current_check = None;
            list_target = None;
            continue;
        }

        match section {
            "project" => {
                if let Some(value) = trimmed.strip_prefix("name:") {
                    policy.project_name = Some(clean_scalar(value));
                }
            }
            "checks" => {
                if line.starts_with("  ") && !line.starts_with("    ") && trimmed.ends_with(':') {
                    let name = trimmed.trim_end_matches(':').to_string();
                    policy.checks.insert(
                        name.clone(),
                        CheckPolicy {
                            requirement: CheckRequirement::Optional,
                            log: format!("logs/{name}.log"),
                        },
                    );
                    current_check = Some(name);
                    list_target = None;
                    continue;
                }

                let check_name = current_check
                    .as_ref()
                    .ok_or_else(|| anyhow!("check property without check name"))?
                    .clone();
                let check = policy
                    .checks
                    .get_mut(&check_name)
                    .ok_or_else(|| anyhow!("missing check `{check_name}`"))?;

                if let Some(value) = trimmed.strip_prefix("required:") {
                    check.requirement = match clean_scalar(value).as_str() {
                        "true" => CheckRequirement::Always,
                        "false" => CheckRequirement::Optional,
                        other => {
                            return Err(anyhow!(
                                "checks.{check_name}.required must be true or false, got `{other}`"
                            ));
                        }
                    };
                    list_target = None;
                } else if let Some(value) = trimmed.strip_prefix("log:") {
                    check.log = clean_scalar(value);
                    list_target = None;
                } else if trimmed == "required_for:" {
                    check.requirement = CheckRequirement::ForPaths(Vec::new());
                    list_target = Some(format!("checks.{check_name}.required_for"));
                } else if let Some(item) = trimmed.strip_prefix("- ") {
                    if list_target.as_deref() == Some(&format!("checks.{check_name}.required_for"))
                    {
                        if let CheckRequirement::ForPaths(paths) = &mut check.requirement {
                            paths.push(clean_scalar(item));
                        }
                    } else {
                        return Err(anyhow!("unexpected list item in checks.{check_name}"));
                    }
                }
            }
            "policy" => {
                if trimmed == "protected_paths:"
                    || trimmed == "risky_patterns:"
                    || trimmed == "blocked_paths:"
                {
                    list_target = Some(trimmed.trim_end_matches(':').to_string());
                    continue;
                }

                if let Some(item) = trimmed.strip_prefix("- ") {
                    match list_target.as_deref() {
                        Some("protected_paths") => policy.protected_paths.push(clean_scalar(item)),
                        Some("risky_patterns") => policy.risky_patterns.push(clean_scalar(item)),
                        Some("blocked_paths") => policy.blocked_paths.push(clean_scalar(item)),
                        _ => return Err(anyhow!("unexpected policy list item `{trimmed}`")),
                    }
                }
            }
            other => return Err(anyhow!("unsupported top-level section `{other}`")),
        }
    }

    if policy.checks.is_empty() {
        policy.checks = default_policy().checks;
    }
    if policy.protected_paths.is_empty() {
        policy.protected_paths = default_protected_paths();
    }
    if policy.risky_patterns.is_empty() {
        policy.risky_patterns = default_risky_patterns();
    }

    Ok(policy)
}

fn clean_scalar(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}
