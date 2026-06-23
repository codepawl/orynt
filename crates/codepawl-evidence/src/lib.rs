use std::{fs, path::Path};

use anyhow::Result;
use codepawl_core::{ValidationEvidence, ValidationStatus};

pub fn parse_validation_logs(
    root: impl AsRef<Path>,
    required_checks: &[&str],
) -> Result<Vec<ValidationEvidence>> {
    let sources = required_checks
        .iter()
        .map(|check| format!("logs/{check}.log"))
        .collect::<Vec<_>>();
    parse_validation_logs_with_sources(root, required_checks, &sources)
}

pub fn parse_validation_logs_with_sources(
    root: impl AsRef<Path>,
    required_checks: &[&str],
    sources: &[String],
) -> Result<Vec<ValidationEvidence>> {
    let root = root.as_ref();
    required_checks
        .iter()
        .zip(sources.iter())
        .map(|check| {
            let (check, source) = check;
            let path = root.join(source);
            if !path.exists() {
                return Ok(ValidationEvidence {
                    check: (*check).to_string(),
                    status: ValidationStatus::Missing,
                    source: source.clone(),
                    summary: format!("No {check} validation log found."),
                });
            }

            let contents = redact_text(&fs::read_to_string(&path)?);
            let status = classify_log_status(&contents);
            let summary = summarize_log(check, &contents, &status);
            Ok(ValidationEvidence {
                check: (*check).to_string(),
                status,
                source: source.clone(),
                summary,
            })
        })
        .collect()
}

pub fn redact_text(input: &str) -> String {
    let mut output = Vec::new();
    let mut in_private_key = false;

    for line in input.lines() {
        if line.contains("-----BEGIN ") && line.contains(" PRIVATE KEY-----") {
            output.push("[REDACTED:private-key]".to_string());
            in_private_key = true;
            continue;
        }

        if in_private_key {
            if line.contains("-----END ") && line.contains(" PRIVATE KEY-----") {
                in_private_key = false;
            }
            continue;
        }

        output.push(redact_line(line));
    }

    if input.ends_with('\n') {
        format!("{}\n", output.join("\n"))
    } else {
        output.join("\n")
    }
}

fn redact_line(line: &str) -> String {
    if let Some((prefix, _)) = line.split_once("Bearer ") {
        return format!("{prefix}Bearer [REDACTED:token]");
    }

    if let Some((key, _value)) = line.split_once('=') {
        let upper_key = key.trim().to_ascii_uppercase();
        if upper_key.contains("TOKEN")
            || upper_key.contains("API_KEY")
            || upper_key.contains("SECRET")
            || upper_key.contains("PRIVATE_KEY")
            || upper_key == "KEY"
        {
            return format!("{}=[REDACTED:secret]", key.trim());
        }
    }

    line.to_string()
}

fn classify_log_status(contents: &str) -> ValidationStatus {
    let lower = contents.to_ascii_lowercase();
    if lower.contains("error:")
        || lower.contains("failed")
        || lower.contains("failure")
        || lower.contains("could not compile")
    {
        if lower.contains("0 failed") || lower.contains("test result: ok") {
            return ValidationStatus::Passed;
        }
        return ValidationStatus::Failed;
    }

    if lower.contains("passed")
        || lower.contains("finished")
        || lower.contains("success")
        || lower.contains("test result: ok")
    {
        return ValidationStatus::Passed;
    }

    ValidationStatus::Missing
}

fn summarize_log(check: &str, contents: &str, status: &ValidationStatus) -> String {
    let first_line = contents
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("validation log present");
    format!("{check} evidence {status:?}: {first_line}")
}
