use std::{
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{anyhow, Context, Result};
use codepawl_core::{
    analyze_snapshot, AnalysisSnapshot, Artifact, ChangeStatus, ChangedFile, ProjectContext,
    SessionContext,
};
use codepawl_evidence::parse_validation_logs_with_sources;
use codepawl_git::inspect_repo;
use codepawl_report::{render_markdown, write_report_files};
use codepawl_store::Store;
use serde::Deserialize;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommandResult {
    pub stdout: String,
}

#[derive(Debug, Deserialize)]
struct FixtureInput {
    report_id: String,
    created_at: String,
    project: ProjectContext,
    session: SessionContext,
    agent: String,
    branch: String,
    required_checks: Vec<String>,
    protected_paths: Vec<String>,
}

pub fn run_cli<I, S>(args: I) -> Result<CommandResult>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut args = args
        .into_iter()
        .map(|arg| arg.as_ref().to_string())
        .collect::<Vec<_>>();
    if args.first().is_some_and(|arg| is_binary_name(arg)) {
        args.remove(0);
    }

    let store_path = take_option(&mut args, "--store")
        .map(PathBuf::from)
        .unwrap_or(default_store_path()?);
    let output_dir = take_option(&mut args, "--output-dir")
        .map(PathBuf::from)
        .unwrap_or(default_report_dir()?);

    match args.first().map(String::as_str) {
        Some("analyze") => run_analyze(&args[1..], &store_path, &output_dir),
        Some("report") => run_report(&args[1..], &store_path),
        Some("projects") => run_projects(&args[1..], &store_path),
        Some("doctor") => Ok(CommandResult {
            stdout: "CodePawl doctor\nlocal-first: enabled\ntelemetry: disabled\nsource upload: disabled\n".to_string(),
        }),
        Some(command) => Err(anyhow!("unknown command `{command}`")),
        None => Err(anyhow!("missing command")),
    }
}

fn run_analyze(args: &[String], store_path: &Path, output_dir: &Path) -> Result<CommandResult> {
    let report = if let Some(index) = args.iter().position(|arg| arg == "--fixture") {
        let fixture = args
            .get(index + 1)
            .ok_or_else(|| anyhow!("--fixture requires a path"))?;
        analyze_fixture(Path::new(fixture))?
    } else {
        analyze_current_repo(&env::current_dir()?)?
    };

    let report_dir = output_dir.join(&report.id);
    let (json_path, markdown_path) = write_report_files(&report, &report_dir)?;
    Store::open(store_path)?.save_report(&report)?;

    Ok(CommandResult {
        stdout: format!(
            "Verdict: {}\nReport JSON: {}\nReport Markdown: {}\nSQLite: {}\n",
            report.verdict.as_str(),
            json_path.display(),
            markdown_path.display(),
            store_path.display()
        ),
    })
}

fn run_report(args: &[String], store_path: &Path) -> Result<CommandResult> {
    if !args.iter().any(|arg| arg == "--last") {
        return Err(anyhow!("report currently requires --last"));
    }

    let store = Store::open(store_path)?;
    let global = args.iter().any(|arg| arg == "--global");
    let (scope, report) = if global {
        (
            "global".to_string(),
            store
                .latest_report()?
                .ok_or_else(|| anyhow!("no reports found in {}", store_path.display()))?,
        )
    } else {
        let project_path = current_project_path()?;
        (
            format!("current project ({})", project_path.display()),
            store
                .latest_report_for_project(&project_path.display().to_string())?
                .ok_or_else(|| {
                    anyhow!(
                        "no reports found for current project {}; use --global for latest report across all projects",
                        project_path.display()
                    )
                })?,
        )
    };

    Ok(CommandResult {
        stdout: format!("Scope: {scope}\n\n{}", render_markdown(&report)),
    })
}

fn run_projects(args: &[String], store_path: &Path) -> Result<CommandResult> {
    match args.first().map(String::as_str) {
        Some("add") => {
            let path = args
                .get(1)
                .ok_or_else(|| anyhow!("projects add requires a path"))?;
            let canonical = fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));
            let name = canonical
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("project")
                .to_string();
            Store::open(store_path)?.add_project(&name, &canonical.display().to_string())?;
            Ok(CommandResult {
                stdout: format!("Added project `{}` at {}\n", name, canonical.display()),
            })
        }
        Some("list") => {
            let projects = Store::open(store_path)?.list_projects()?;
            let mut stdout = String::new();
            for (name, path) in projects {
                stdout.push_str(&format!("{name}\t{path}\n"));
            }
            Ok(CommandResult { stdout })
        }
        Some(command) => Err(anyhow!("unknown projects command `{command}`")),
        None => Err(anyhow!("projects requires add or list")),
    }
}

fn analyze_fixture(path: &Path) -> Result<codepawl_core::Report> {
    let policy = codepawl_policy::load_policy(path)?;
    let input_path = path.join("input.json");
    let input: FixtureInput = serde_json::from_str(
        &fs::read_to_string(&input_path)
            .with_context(|| format!("failed to read {}", input_path.display()))?,
    )?;
    let changed_files = parse_diff_patch(&path.join("diff.patch"))?;
    let changed_paths = changed_files
        .iter()
        .map(|file| file.path.clone())
        .collect::<Vec<_>>();
    let (required_checks, protected_paths, risky_patterns, blocked_paths) =
        if path.join("codepawl.yml").exists() {
            (
                codepawl_policy::required_checks_for(&policy, &changed_paths),
                policy.protected_paths.clone(),
                policy.risky_patterns.clone(),
                policy.blocked_paths.clone(),
            )
        } else {
            (
                input.required_checks.clone(),
                input.protected_paths.clone(),
                codepawl_policy::default_risky_patterns(),
                Vec::new(),
            )
        };
    let required_refs = required_checks
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    let log_sources = codepawl_policy::check_logs_for(&policy, &required_checks);
    let validation_evidence =
        parse_validation_logs_with_sources(path, &required_refs, &log_sources)?;

    let snapshot = AnalysisSnapshot {
        id: input.report_id,
        created_at: input.created_at,
        project: ProjectContext {
            name: policy.project_name.unwrap_or(input.project.name),
            path: input.project.path,
        },
        session: input.session,
        agent: input.agent,
        branch: input.branch,
        changed_files,
        validation_evidence,
        required_checks,
        protected_paths,
        risky_patterns,
        blocked_paths,
        artifacts: vec![
            Artifact {
                kind: "raw_events".to_string(),
                path: "raw-events.jsonl".to_string(),
            },
            Artifact {
                kind: "diff".to_string(),
                path: "diff.patch".to_string(),
            },
        ],
    };
    Ok(analyze_snapshot(snapshot))
}

fn analyze_current_repo(path: &Path) -> Result<codepawl_core::Report> {
    let git = inspect_repo(path)?;
    let policy = codepawl_policy::load_policy(path)?;
    let changed_paths = git
        .changed_files
        .iter()
        .map(|file| file.path.clone())
        .collect::<Vec<_>>();
    let required_checks = codepawl_policy::required_checks_for(&policy, &changed_paths);
    let required_refs = required_checks
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    let log_sources = codepawl_policy::check_logs_for(&policy, &required_checks);
    let validation_evidence =
        parse_validation_logs_with_sources(path, &required_refs, &log_sources)?;
    let now = unix_timestamp();
    let project_name = policy.project_name.clone().unwrap_or_else(|| {
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("project")
            .to_string()
    });

    let snapshot = AnalysisSnapshot {
        id: format!("report-{now}"),
        created_at: now.to_string(),
        project: ProjectContext {
            name: project_name,
            path: path.display().to_string(),
        },
        session: SessionContext {
            id: format!("git-{now}"),
            source: "git".to_string(),
            summary: "Current git repository analysis.".to_string(),
        },
        agent: "unknown".to_string(),
        branch: git.branch,
        changed_files: git.changed_files,
        validation_evidence,
        required_checks,
        protected_paths: policy.protected_paths,
        risky_patterns: policy.risky_patterns,
        blocked_paths: policy.blocked_paths,
        artifacts: vec![Artifact {
            kind: "git_status".to_string(),
            path: "git status --porcelain=v1 -uall".to_string(),
        }],
    };
    Ok(analyze_snapshot(snapshot))
}

fn parse_diff_patch(path: &Path) -> Result<Vec<ChangedFile>> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(path)?;
    let mut files = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_status = ChangeStatus::Modified;

    for line in contents.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            if let Some(path) = current_path.take() {
                files.push(ChangedFile {
                    path,
                    status: current_status,
                    evidence_ref: "diff.patch".to_string(),
                });
            }
            current_status = ChangeStatus::Modified;
            current_path = rest
                .split_whitespace()
                .nth(1)
                .and_then(|value| value.strip_prefix("b/"))
                .map(ToString::to_string);
        } else if line.starts_with("new file mode") {
            current_status = ChangeStatus::Added;
        } else if line.starts_with("deleted file mode") {
            current_status = ChangeStatus::Deleted;
        }
    }

    if let Some(path) = current_path {
        files.push(ChangedFile {
            path,
            status: current_status,
            evidence_ref: "diff.patch".to_string(),
        });
    }

    Ok(files)
}

fn take_option(args: &mut Vec<String>, name: &str) -> Option<String> {
    let index = args.iter().position(|arg| arg == name)?;
    args.remove(index);
    if index < args.len() {
        Some(args.remove(index))
    } else {
        None
    }
}

fn default_store_path() -> Result<PathBuf> {
    Ok(env::current_dir()?.join(".codepawl/dev/codepawl.db"))
}

fn default_report_dir() -> Result<PathBuf> {
    Ok(env::current_dir()?.join(".codepawl/reports"))
}

fn current_project_path() -> Result<PathBuf> {
    Ok(fs::canonicalize(env::current_dir()?)?)
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn is_binary_name(arg: &str) -> bool {
    Path::new(arg)
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "codepawl" || name == "codepawl.exe")
}
