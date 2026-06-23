use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};

use anyhow::Result;
use codepawl_core::{Report, RiskItem, ValidationStatus, Verdict};

pub fn render_json(report: &Report) -> Result<String> {
    Ok(serde_json::to_string_pretty(report)?)
}

pub fn render_markdown(report: &Report) -> String {
    let mut markdown = String::new();
    markdown.push_str("# CodePawl Report\n\n");
    markdown.push_str(&format!("**Verdict:** {}\n\n", report.verdict.as_str()));
    markdown.push_str(&format!("**Project:** `{}`\n\n", report.project.path));
    markdown.push_str(&format!(
        "**Session:** `{}` via {}\n\n",
        report.session.id, report.agent
    ));
    markdown.push_str(&format!("**Branch:** `{}`\n\n", report.branch));
    markdown.push_str(&format!("{}\n\n", report.summary));

    markdown.push_str("## Changed Files\n\n");
    if report.changed_files.is_empty() {
        markdown.push_str("- No changed files were detected.\n");
    } else {
        for file in &report.changed_files {
            markdown.push_str(&format!(
                "- `{:?}` `{}` evidence: `{}`\n",
                file.status, file.path, file.evidence_ref
            ));
        }
    }
    markdown.push('\n');

    markdown.push_str("## Validation Evidence\n\n");
    if report.validation_evidence.is_empty() {
        markdown.push_str("- No validation evidence was found.\n");
    } else {
        for item in &report.validation_evidence {
            markdown.push_str(&format!(
                "- `{}`: {} from `{}` - {}\n",
                item.check,
                validation_status(&item.status),
                item.source,
                item.summary
            ));
        }
    }
    markdown.push('\n');

    markdown.push_str("## Risks\n\n");
    if report.risks.is_empty() {
        markdown.push_str("- No risks detected by deterministic v0.1 rules.\n");
    } else {
        for risk in grouped_risks(&report.risks) {
            markdown.push_str(&format!(
                "- **{}** {}: {} Evidence: `{}`\n",
                risk.severity,
                risk.title,
                risk.detail,
                risk.evidence_refs.join("`, `")
            ));
        }
    }
    markdown.push('\n');

    markdown.push_str("## Missing Evidence\n\n");
    if report.missing_evidence.is_empty() {
        markdown.push_str("- No required evidence is missing.\n");
    } else {
        for item in &report.missing_evidence {
            markdown.push_str(&format!(
                "- `{}` expected: {} Evidence target: `{}`\n",
                item.check, item.expected, item.evidence_ref
            ));
        }
    }
    markdown.push('\n');

    markdown.push_str("## Next Actions\n\n");
    for action in display_next_actions(report) {
        markdown.push_str(&format!("- {action}\n"));
    }
    markdown.push('\n');

    markdown.push_str("## Follow-up Prompt\n\n");
    markdown.push_str(&display_follow_up_prompt(report));
    markdown.push_str("\n\n");

    markdown.push_str("## Memory Candidates\n\n");
    if report.memory_candidates.is_empty() {
        markdown.push_str("- No memory candidate suggested.\n");
    } else {
        for item in unique_lines(&report.memory_candidates) {
            markdown.push_str(&format!("- {item}\n"));
        }
    }
    markdown
}

fn grouped_risks(risks: &[RiskItem]) -> Vec<RiskItem> {
    let mut by_title: BTreeMap<&str, Vec<&RiskItem>> = BTreeMap::new();
    for risk in risks {
        by_title.entry(&risk.title).or_default().push(risk);
    }

    by_title
        .into_iter()
        .map(|(title, items)| {
            if title == "Dependency or lockfile changed" {
                let paths = items
                    .iter()
                    .flat_map(|risk| dependency_paths_from_detail(&risk.detail))
                    .collect::<BTreeSet<_>>()
                    .into_iter()
                    .collect::<Vec<_>>();
                RiskItem {
                    severity: strongest_severity(&items).to_string(),
                    title: title.to_string(),
                    detail: format!(
                        "Dependency or lockfile changes need review: {}.",
                        paths.join(", ")
                    ),
                    evidence_refs: merged_evidence_refs(&items),
                }
            } else if items.len() == 1 {
                (*items[0]).clone()
            } else {
                RiskItem {
                    severity: strongest_severity(&items).to_string(),
                    title: title.to_string(),
                    detail: items
                        .iter()
                        .map(|risk| risk.detail.as_str())
                        .collect::<Vec<_>>()
                        .join(" "),
                    evidence_refs: merged_evidence_refs(&items),
                }
            }
        })
        .collect()
}

fn display_next_actions(report: &Report) -> Vec<String> {
    if report.verdict == Verdict::Risky
        && report
            .risks
            .iter()
            .any(|risk| risk.title == "Dependency or lockfile changed")
    {
        let paths = report
            .risks
            .iter()
            .filter(|risk| risk.title == "Dependency or lockfile changed")
            .flat_map(|risk| dependency_paths_from_detail(&risk.detail))
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        return vec![format!(
            "Review dependency and lockfile changes before marking this session ready: {}.",
            paths.join(", ")
        )];
    }

    unique_lines(&report.next_actions)
        .into_iter()
        .map(|line| normalize_workflow_terms(&line))
        .collect()
}

fn normalize_workflow_terms(line: &str) -> String {
    line.replace("before acceptance", "before marking this session ready")
        .replace("acceptance", "readiness")
}

fn display_follow_up_prompt(report: &Report) -> String {
    if report.verdict == Verdict::Risky
        && report
            .risks
            .iter()
            .any(|risk| risk.title == "Dependency or lockfile changed")
    {
        let action = display_next_actions(report)
            .into_iter()
            .next()
            .unwrap_or_else(|| {
                "Review risky changes before marking this session ready.".to_string()
            });
        return format!(
            "Continue from this CodePawl report. Focus only on the cited evidence and complete this next action: {action}"
        );
    }

    normalize_workflow_terms(&report.follow_up_prompt)
}

fn dependency_paths_from_detail(detail: &str) -> Vec<String> {
    if let Some((_, paths)) = detail.trim_end_matches('.').split_once(": ") {
        return paths.split(", ").map(ToString::to_string).collect();
    }

    detail
        .split_whitespace()
        .next()
        .map(|path| vec![path.trim_end_matches(':').to_string()])
        .unwrap_or_default()
}

fn merged_evidence_refs(risks: &[&RiskItem]) -> Vec<String> {
    risks
        .iter()
        .flat_map(|risk| risk.evidence_refs.iter().cloned())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn strongest_severity(risks: &[&RiskItem]) -> &'static str {
    if risks.iter().any(|risk| risk.severity == "Blocker") {
        "Blocker"
    } else if risks.iter().any(|risk| risk.severity == "High") {
        "High"
    } else if risks.iter().any(|risk| risk.severity == "Medium") {
        "Medium"
    } else {
        "Low"
    }
}

fn unique_lines(lines: &[String]) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut unique = Vec::new();
    for line in lines {
        if seen.insert(line.clone()) {
            unique.push(line.clone());
        }
    }
    unique
}

pub fn write_report_files(report: &Report, dir: impl AsRef<Path>) -> Result<(PathBuf, PathBuf)> {
    let dir = dir.as_ref();
    fs::create_dir_all(dir)?;
    let json_path = dir.join("report.json");
    let markdown_path = dir.join("report.md");
    fs::write(&json_path, format!("{}\n", render_json(report)?))?;
    fs::write(&markdown_path, render_markdown(report))?;
    Ok((json_path, markdown_path))
}

fn validation_status(status: &ValidationStatus) -> &'static str {
    match status {
        ValidationStatus::Passed => "passed",
        ValidationStatus::Failed => "failed",
        ValidationStatus::Missing => "missing",
    }
}
