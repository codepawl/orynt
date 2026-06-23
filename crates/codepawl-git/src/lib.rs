use std::{path::Path, process::Command};

use anyhow::{anyhow, Context, Result};
use codepawl_core::{ChangeStatus, ChangedFile};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoSnapshot {
    pub branch: String,
    pub changed_files: Vec<ChangedFile>,
}

pub fn inspect_repo(path: impl AsRef<Path>) -> Result<RepoSnapshot> {
    let path = path.as_ref();
    let branch = git_output(path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .context("failed to inspect git branch")?;
    let status = git_output(path, &["status", "--porcelain=v1", "--untracked-files=all"])
        .context("failed to inspect git status")?;

    let changed_files = status
        .lines()
        .filter_map(parse_status_line)
        .collect::<Vec<_>>();

    Ok(RepoSnapshot {
        branch: branch.trim().to_string(),
        changed_files,
    })
}

fn git_output(path: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git").args(args).current_dir(path).output()?;
    if !output.status.success() {
        return Err(anyhow!(
            "git {:?} failed: {}{}",
            args,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_status_line(line: &str) -> Option<ChangedFile> {
    if line.len() < 4 {
        return None;
    }

    let status_code = &line[..2];
    let raw_path = line[3..].trim();
    let path = raw_path
        .rsplit_once(" -> ")
        .map(|(_, new_path)| new_path)
        .unwrap_or(raw_path)
        .trim_matches('"')
        .to_string();

    let status = if status_code == "??" || status_code.contains('A') {
        ChangeStatus::Added
    } else if status_code.contains('D') {
        ChangeStatus::Deleted
    } else if status_code.contains('R') {
        ChangeStatus::Renamed
    } else if status_code.trim().is_empty() {
        return None;
    } else {
        ChangeStatus::Modified
    };

    Some(ChangedFile {
        path,
        status,
        evidence_ref: "git status --porcelain=v1 -uall".to_string(),
    })
}
