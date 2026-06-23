use std::{fs, process::Command};

use codepawl_core::ChangeStatus;
use codepawl_git::inspect_repo;

fn git(dir: &std::path::Path, args: &[&str]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {:?} failed: {}{}",
        args,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn inspect_repo_reports_branch_and_changed_files_without_reading_source() {
    let dir = tempfile::tempdir().unwrap();
    git(dir.path(), &["init", "-b", "main"]);
    git(
        dir.path(),
        &["config", "user.email", "test@example.invalid"],
    );
    git(dir.path(), &["config", "user.name", "CodePawl Test"]);
    fs::write(dir.path().join("README.md"), "before\n").unwrap();
    git(dir.path(), &["add", "README.md"]);
    git(dir.path(), &["commit", "-m", "initial"]);

    fs::write(dir.path().join("README.md"), "after\n").unwrap();
    fs::write(dir.path().join("pnpm-lock.yaml"), "lockfile\n").unwrap();

    let snapshot = inspect_repo(dir.path()).unwrap();

    assert_eq!(snapshot.branch, "main");
    assert!(snapshot
        .changed_files
        .iter()
        .any(|file| { file.path == "README.md" && file.status == ChangeStatus::Modified }));
    assert!(snapshot
        .changed_files
        .iter()
        .any(|file| { file.path == "pnpm-lock.yaml" && file.status == ChangeStatus::Added }));
}

#[test]
fn inspect_repo_expands_untracked_directories_to_files() {
    let dir = tempfile::tempdir().unwrap();
    git(dir.path(), &["init", "-b", "main"]);
    git(
        dir.path(),
        &["config", "user.email", "test@example.invalid"],
    );
    git(dir.path(), &["config", "user.name", "CodePawl Test"]);
    fs::write(dir.path().join("README.md"), "tracked\n").unwrap();
    git(dir.path(), &["add", "README.md"]);
    git(dir.path(), &["commit", "-m", "initial"]);

    fs::create_dir_all(dir.path().join("new-dir/nested")).unwrap();
    fs::write(
        dir.path().join("new-dir/nested/file.txt"),
        "content that must not be read\n",
    )
    .unwrap();

    let snapshot = inspect_repo(dir.path()).unwrap();

    assert!(snapshot
        .changed_files
        .iter()
        .any(|file| file.path == "new-dir/nested/file.txt"));
    assert!(!snapshot
        .changed_files
        .iter()
        .any(|file| file.path == "new-dir/"));
}
