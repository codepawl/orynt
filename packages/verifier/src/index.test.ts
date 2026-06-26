import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  createConservativeCodingApprenticePolicy,
  createDefaultRunBudget,
  InMemoryRunStore,
  type CorePolicy,
  type RepositorySandbox,
} from "@codepawl/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalRepositoryVerifier } from "./index";

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
  await mkdir(path.join(repoPath, "packages"), { recursive: true });
  await mkdir(path.join(repoPath, "scripts"), { recursive: true });
  await writeFile(path.join(repoPath, "packages", "README.md"), "fixture\n");
  await writeFile(path.join(repoPath, "scripts", "pass.mjs"), "console.log('apiKey=sk-testredacted');\n");
  await writeFile(path.join(repoPath, "scripts", "slow.mjs"), "setTimeout(() => console.log('done'), 1000);\n");
  await writeFile(path.join(repoPath, "scripts", "marker.mjs"), "import { writeFileSync } from 'node:fs'; writeFileSync('marker.txt', 'ran');\n");
  await git(["add", "packages/README.md", "scripts/pass.mjs", "scripts/slow.mjs", "scripts/marker.mjs"], repoPath);
  await git(["commit", "-m", "initial"], repoPath);

  const worktreePath = path.join(tempRoot, `${name}-worktree`);
  await git(["worktree", "add", "-b", "codepawl/test", worktreePath, "HEAD"], repoPath);
  return { repoPath, worktreePath, commit: await git(["rev-parse", "HEAD"], worktreePath) };
}

function createRun(store: InMemoryRunStore) {
  return store.createRun({
    goal: "Verify a repository task",
    capabilityId: "coding-apprentice",
    taskId: "task-verify",
    workspaceId: "workspace-test",
    budget: createDefaultRunBudget(),
  });
}

function createSandbox(repoPath: string, worktreePath: string, commit: string): RepositorySandbox {
  return {
    id: "sandbox-test",
    runId: "run-test",
    taskId: "task-verify",
    repositoryPath: repoPath,
    gitRoot: repoPath,
    worktreePath,
    branchName: "codepawl/test",
    baseRef: "HEAD",
    currentCommit: commit,
    createdAt: "2026-06-26T00:00:00.000Z",
  };
}

function policyWithAllowlist(repoPath: string, worktreePath: string, allowlist: string[]): CorePolicy {
  const policy = createConservativeCodingApprenticePolicy(repoPath, worktreePath);
  return {
    ...policy,
    sandbox: {
      ...policy.sandbox,
      repository: {
        ...policy.sandbox.repository,
        repositoryPath: repoPath,
        worktreePath,
      },
      commandPolicy: {
        ...policy.sandbox.commandPolicy,
        allowlist,
      },
    },
  };
}

describe("LocalRepositoryVerifier", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "codepawl-verifier-test-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("creates a plan from explicit commands plus conservative defaults", async () => {
    const { repoPath, worktreePath, commit } = await createTempGitRepository();
    const sandbox = createSandbox(repoPath, worktreePath, commit);
    const policy = policyWithAllowlist(repoPath, worktreePath, ["node scripts/pass.mjs", "pnpm test"]);

    const plan = new LocalRepositoryVerifier({ managedArtifactRoot: path.join(tempRoot, "artifacts") }).createPlan({
      runId: "run-test",
      taskId: "task-verify",
      sandbox,
      policy,
      budget: createDefaultRunBudget(),
      commands: ["node scripts/pass.mjs"],
      artifactRoot: path.join(tempRoot, "artifacts", "run-test"),
    });

    expect(plan.commands.map((command) => command.displayName)).toContain("node scripts/pass.mjs");
    expect(plan.commands.map((command) => command.displayName)).toContain("pnpm test");
    expect(plan.commands.find((command) => command.displayName === "node scripts/pass.mjs")?.allowed).toBe(true);
  });

  it("does not execute blocked non-allowlisted commands", async () => {
    const { repoPath, worktreePath, commit } = await createTempGitRepository();
    const sandbox = createSandbox(repoPath, worktreePath, commit);
    const policy = policyWithAllowlist(repoPath, worktreePath, []);
    const verifier = new LocalRepositoryVerifier({ managedArtifactRoot: path.join(tempRoot, "artifacts") });
    const plan = verifier.createPlan({
      runId: "run-test",
      taskId: "task-verify",
      sandbox,
      policy,
      budget: createDefaultRunBudget(),
      commands: ["node scripts/marker.mjs"],
      artifactRoot: path.join(tempRoot, "artifacts", "run-test"),
      config: { defaultCommands: [] },
    });

    const result = await verifier.runVerification(plan, policy);

    expect(result.status).toBe("fail");
    expect(result.verdict.failureClass).toBe("policy_blocked");
    await expect(readFile(path.join(worktreePath, "marker.txt"), "utf8")).rejects.toThrow();
  });

  it("executes policy-allowed validation commands in a sandbox worktree", async () => {
    const { repoPath, worktreePath, commit } = await createTempGitRepository();
    const sandbox = createSandbox(repoPath, worktreePath, commit);
    const policy = policyWithAllowlist(repoPath, worktreePath, ["node scripts/pass.mjs"]);
    const verifier = new LocalRepositoryVerifier({ managedArtifactRoot: path.join(tempRoot, "artifacts") });
    const plan = verifier.createPlan({
      runId: "run-test",
      taskId: "task-verify",
      sandbox,
      policy,
      budget: createDefaultRunBudget(),
      commands: ["node scripts/pass.mjs"],
      artifactRoot: path.join(tempRoot, "artifacts", "run-test"),
      config: { defaultCommands: [] },
    });

    const result = await verifier.runVerification(plan, policy);

    expect(result.status).toBe("pass");
    expect(result.evidence.find((item) => item.kind === "command")?.stdout).not.toContain("sk-testredacted");
    expect(JSON.parse(await readFile(path.join(tempRoot, "artifacts", "run-test", "verification-result.json"), "utf8"))).toMatchObject({
      status: "pass",
      runId: "run-test",
    });
  });

  it("classifies command timeout when practical", async () => {
    const { repoPath, worktreePath, commit } = await createTempGitRepository();
    const sandbox = createSandbox(repoPath, worktreePath, commit);
    const policy = policyWithAllowlist(repoPath, worktreePath, ["node scripts/slow.mjs"]);
    const verifier = new LocalRepositoryVerifier({ managedArtifactRoot: path.join(tempRoot, "artifacts") });
    const plan = verifier.createPlan({
      runId: "run-test",
      taskId: "task-verify",
      sandbox,
      policy,
      budget: createDefaultRunBudget(),
      commands: ["node scripts/slow.mjs"],
      artifactRoot: path.join(tempRoot, "artifacts", "run-test"),
      config: { defaultCommands: [], commandTimeoutMs: 25 },
    });

    const result = await verifier.runVerification(plan, policy);

    expect(result.status).toBe("fail");
    expect(result.verdict.failureClass).toBe("command_timeout");
  });

  it("detects allowed diff scope, protected paths, and unexpected files", async () => {
    const { repoPath, worktreePath, commit } = await createTempGitRepository();
    await writeFile(path.join(worktreePath, "packages", "feature.txt"), "allowed\n");
    let sandbox = createSandbox(repoPath, worktreePath, commit);
    let policy = policyWithAllowlist(repoPath, worktreePath, []);
    let verifier = new LocalRepositoryVerifier({ managedArtifactRoot: path.join(tempRoot, "artifacts-allowed") });
    let plan = verifier.createPlan({
      runId: "run-allowed",
      taskId: "task-verify",
      sandbox,
      policy,
      budget: createDefaultRunBudget(),
      artifactRoot: path.join(tempRoot, "artifacts-allowed", "run-allowed"),
      config: { defaultCommands: [] },
    });
    let result = await verifier.runVerification(plan, policy);
    expect(result.diffScope.allowedFiles).toContain("packages/feature.txt");
    expect(result.diffScope.withinAllowedScope).toBe(true);

    const protectedFixture = await createTempGitRepository("repo-protected");
    await writeFile(path.join(protectedFixture.worktreePath, ".env"), "SECRET=value\n");
    sandbox = createSandbox(protectedFixture.repoPath, protectedFixture.worktreePath, protectedFixture.commit);
    policy = policyWithAllowlist(protectedFixture.repoPath, protectedFixture.worktreePath, []);
    verifier = new LocalRepositoryVerifier({ managedArtifactRoot: path.join(tempRoot, "artifacts-protected") });
    plan = verifier.createPlan({
      runId: "run-protected",
      taskId: "task-verify",
      sandbox,
      policy,
      budget: createDefaultRunBudget(),
      artifactRoot: path.join(tempRoot, "artifacts-protected", "run-protected"),
      config: { defaultCommands: [] },
    });
    result = await verifier.runVerification(plan, policy);
    expect(result.status).toBe("fail");
    expect(result.verdict.failureClass).toBe("protected_path_touched");

    const unexpectedFixture = await createTempGitRepository("repo-unexpected");
    await writeFile(path.join(unexpectedFixture.worktreePath, "outside.txt"), "unexpected\n");
    sandbox = createSandbox(unexpectedFixture.repoPath, unexpectedFixture.worktreePath, unexpectedFixture.commit);
    policy = policyWithAllowlist(unexpectedFixture.repoPath, unexpectedFixture.worktreePath, []);
    verifier = new LocalRepositoryVerifier({ managedArtifactRoot: path.join(tempRoot, "artifacts-unexpected") });
    plan = verifier.createPlan({
      runId: "run-unexpected",
      taskId: "task-verify",
      sandbox,
      policy,
      budget: createDefaultRunBudget(),
      artifactRoot: path.join(tempRoot, "artifacts-unexpected", "run-unexpected"),
      config: { defaultCommands: [] },
    });
    result = await verifier.runVerification(plan, policy);
    expect(result.status).toBe("fail");
    expect(result.verdict.failureClass).toBe("unexpected_file_touch");
  });

  it("emits verification lifecycle RunEvents", async () => {
    const { repoPath, worktreePath, commit } = await createTempGitRepository();
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const sandbox = { ...createSandbox(repoPath, worktreePath, commit), runId: run.id, taskId: run.taskId };
    const policy = policyWithAllowlist(repoPath, worktreePath, ["node scripts/pass.mjs"]);
    const verifier = new LocalRepositoryVerifier({ managedArtifactRoot: path.join(tempRoot, "artifacts"), runStore: store });
    const plan = verifier.createPlan({
      runId: run.id,
      taskId: run.taskId,
      sandbox,
      policy,
      budget: createDefaultRunBudget(),
      commands: ["node scripts/pass.mjs"],
      artifactRoot: path.join(tempRoot, "artifacts", run.id),
      config: { defaultCommands: [] },
    });

    await verifier.runVerification(plan, policy);

    expect(store.listEvents(run.id).map((event) => event.type)).toEqual([
      "verification_planned",
      "verification_policy_checked",
      "verification_started",
      "verification_command_started",
      "verification_command_finished",
      "verification_diff_checked",
      "verification_recorded",
      "verification_passed",
    ]);
  });
});
