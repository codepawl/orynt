import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  createConservativeCodingApprenticePolicy,
  createDefaultRunBudget,
  InMemoryRunStore,
} from "@codepawl/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GitRepositorySandboxManager, RepositorySandboxFailure } from "./index";

const execFileAsync = promisify(execFile);

let tempRoot = "";

async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return String(stdout).trim();
}

async function createTempGitRepository(name = "repo") {
  const repoPath = path.join(tempRoot, name);
  await mkdir(repoPath, { recursive: true });
  await git(["init"], repoPath);
  await git(["config", "user.email", "codepawl@example.test"], repoPath);
  await git(["config", "user.name", "CodePawl Test"], repoPath);
  await writeFile(path.join(repoPath, "README.md"), "# Fixture\n");
  await git(["add", "README.md"], repoPath);
  await git(["commit", "-m", "initial"], repoPath);
  return realpath(repoPath);
}

function createRun(store: InMemoryRunStore) {
  return store.createRun({
    goal: "Fix a failing unit test",
    capabilityId: "coding-apprentice",
    taskId: "task-fixture",
    workspaceId: "workspace-test",
    budget: createDefaultRunBudget(),
  });
}

describe("GitRepositorySandboxManager", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "codepawl-repository-sandbox-test-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("inspects a clean git repository", async () => {
    const repoPath = await createTempGitRepository();
    await git(["remote", "add", "origin", "https://example.test/codepawl.git"], repoPath);
    const policy = createConservativeCodingApprenticePolicy(repoPath, path.join(tempRoot, "sandboxes"));
    const inspection = await new GitRepositorySandboxManager().inspectRepository(
      { runId: "run-clean", taskId: "task-clean", repositoryPath: repoPath, baseRef: "HEAD" },
      policy,
    );

    expect(inspection.gitRoot).toBe(repoPath);
    expect(inspection.isDirty).toBe(false);
    expect(inspection.currentCommit).toHaveLength(40);
    expect(inspection.hasRemote).toBe(true);
    expect(inspection.remotes).toEqual(["origin"]);
  });

  it("inspects a dirty git repository", async () => {
    const repoPath = await createTempGitRepository();
    await writeFile(path.join(repoPath, "dirty.txt"), "dirty\n");
    const policy = createConservativeCodingApprenticePolicy(repoPath, path.join(tempRoot, "sandboxes"));
    const inspection = await new GitRepositorySandboxManager().inspectRepository(
      { runId: "run-dirty", taskId: "task-dirty", repositoryPath: repoPath, baseRef: "HEAD" },
      policy,
    );

    expect(inspection.isDirty).toBe(true);
    expect(inspection.hasRemote).toBe(false);
  });

  it("rejects a non-git path", async () => {
    const nonGitPath = path.join(tempRoot, "not-git");
    await mkdir(nonGitPath);
    const policy = createConservativeCodingApprenticePolicy(nonGitPath, path.join(tempRoot, "sandboxes"));

    await expect(
      new GitRepositorySandboxManager().inspectRepository(
        { runId: "run-non-git", taskId: "task-non-git", repositoryPath: nonGitPath, baseRef: "HEAD" },
        policy,
      ),
    ).rejects.toMatchObject({ details: { code: "repository_not_git" } });
  });

  it("rejects unsafe repository paths", async () => {
    const policy = createConservativeCodingApprenticePolicy(path.parse(tempRoot).root, path.join(tempRoot, "sandboxes"));

    await expect(
      new GitRepositorySandboxManager().inspectRepository(
        { runId: "run-root", taskId: "task-root", repositoryPath: path.parse(tempRoot).root, baseRef: "HEAD" },
        policy,
      ),
    ).rejects.toMatchObject({ details: { code: "unsafe_repository_path" } });
  });

  it("generates deterministic worktree plans", async () => {
    const repoPath = await createTempGitRepository();
    const sandboxRoot = path.join(tempRoot, "sandboxes");
    const policy = createConservativeCodingApprenticePolicy(repoPath, sandboxRoot);
    const manager = new GitRepositorySandboxManager({ sandboxRoot });
    const request = { runId: "run-123", taskId: "task-abc", repositoryPath: repoPath, baseRef: "HEAD" };
    const inspection = await manager.inspectRepository(request, policy);

    const first = manager.planWorktree(request, policy, inspection);
    const second = manager.planWorktree(request, policy, inspection);

    expect(first).toEqual(second);
    expect(first.branchName).toMatch(/^codepawl\/run-123-task-abc-/);
    expect(first.worktreePath).toContain(sandboxRoot);
    expect(first.policyDecision.decision).toBe("allow");
  });

  it("creates a policy-gated git worktree", async () => {
    const repoPath = await createTempGitRepository();
    const sandboxRoot = path.join(tempRoot, "sandboxes");
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const policy = createConservativeCodingApprenticePolicy(repoPath, sandboxRoot);
    const manager = new GitRepositorySandboxManager({ sandboxRoot, runStore: store });

    const sandbox = await manager.createRepositorySandbox(
      { runId: run.id, taskId: run.taskId, repositoryPath: repoPath, baseRef: "HEAD" },
      policy,
    );

    expect(await realpath(sandbox.worktreePath)).toBe(sandbox.worktreePath);
    expect(await git(["-C", sandbox.worktreePath, "rev-parse", "--abbrev-ref", "HEAD"])).toBe(sandbox.branchName);
    expect(await manager.listSandboxes()).toEqual([sandbox]);
  });

  it("emits sandbox lifecycle events", async () => {
    const repoPath = await createTempGitRepository();
    const sandboxRoot = path.join(tempRoot, "sandboxes");
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const policy = createConservativeCodingApprenticePolicy(repoPath, sandboxRoot);

    await new GitRepositorySandboxManager({ sandboxRoot, runStore: store }).createRepositorySandbox(
      { runId: run.id, taskId: run.taskId, repositoryPath: repoPath, baseRef: "HEAD" },
      policy,
    );

    expect(store.listEvents(run.id).map((event) => event.type)).toEqual([
      "sandbox_create_requested",
      "sandbox_inspected",
      "sandbox_create_allowed",
      "sandbox_created",
    ]);
  });

  it("plans cleanup as a dry-run and blocks unmanaged cleanup", async () => {
    const repoPath = await createTempGitRepository();
    const sandboxRoot = path.join(tempRoot, "sandboxes");
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const policy = createConservativeCodingApprenticePolicy(repoPath, sandboxRoot);
    const manager = new GitRepositorySandboxManager({ sandboxRoot, runStore: store });
    const sandbox = await manager.createRepositorySandbox(
      { runId: run.id, taskId: run.taskId, repositoryPath: repoPath, baseRef: "HEAD" },
      policy,
    );

    const cleanup = await manager.cleanupSandboxPlan(sandbox.id);
    const blocked = await manager.cleanupSandboxPlan("unmanaged", run.id);

    expect(cleanup.dryRun).toBe(true);
    expect(cleanup.blocked).toBe(false);
    expect(cleanup.gitArgs[0]).toEqual(["-C", sandbox.gitRoot, "worktree", "remove", sandbox.worktreePath]);
    expect(blocked.blocked).toBe(true);
    expect(store.listEvents(run.id).map((event) => event.type)).toContain("sandbox_cleanup_planned");
    expect(store.listEvents(run.id).map((event) => event.type)).toContain("sandbox_cleanup_blocked");
  });

  it("reports worktree creation failure as a typed error", async () => {
    const repoPath = await createTempGitRepository();
    const sandboxRoot = path.join(tempRoot, "sandboxes");
    const policy = createConservativeCodingApprenticePolicy(repoPath, sandboxRoot);
    const manager = new GitRepositorySandboxManager({ sandboxRoot });
    const request = { runId: "run-fail", taskId: "task-fail", repositoryPath: repoPath, baseRef: "HEAD" };
    const inspection = await manager.inspectRepository(request, policy);
    const plan = manager.planWorktree(request, policy, inspection);
    await mkdir(plan.worktreePath, { recursive: true });

    await expect(manager.createWorktree(plan)).rejects.toBeInstanceOf(RepositorySandboxFailure);
  });
});
