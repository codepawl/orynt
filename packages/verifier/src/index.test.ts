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
import { parsePorcelainStatusPaths } from "./gitStatus";

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
  await git(["config", "user.email", "orynt@example.test"], repoPath);
  await git(["config", "user.name", "Orynt Test"], repoPath);
  await mkdir(path.join(repoPath, "packages"), { recursive: true });
  await mkdir(path.join(repoPath, "scripts"), { recursive: true });
  await writeFile(path.join(repoPath, "packages", "README.md"), "fixture\n");
  await writeFile(path.join(repoPath, "scripts", "pass.mjs"), "console.log('apiKey=sk-testredacted');\n");
  await writeFile(path.join(repoPath, "scripts", "slow.mjs"), "setTimeout(() => console.log('done'), 1000);\n");
  await writeFile(path.join(repoPath, "scripts", "marker.mjs"), "import { writeFileSync } from 'node:fs'; writeFileSync('marker.txt', 'ran');\n");
  await git(["add", "packages/README.md", "scripts/pass.mjs", "scripts/slow.mjs", "scripts/marker.mjs"], repoPath);
  await git(["commit", "-m", "initial"], repoPath);

  const worktreePath = path.join(tempRoot, `${name}-worktree`);
  await git(["worktree", "add", "-b", "orynt/test", worktreePath, "HEAD"], repoPath);
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
    branchName: "orynt/test",
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
    tempRoot = await mkdtemp(path.join(tmpdir(), "orynt-verifier-test-"));
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

  it("cancels an active verification command", async () => {
    const { repoPath, worktreePath, commit } =
      await createTempGitRepository("repo-cancel-verification");
    const sandbox = createSandbox(repoPath, worktreePath, commit);
    const policy = policyWithAllowlist(repoPath, worktreePath, [
      "node scripts/slow.mjs",
    ]);
    const verifier = new LocalRepositoryVerifier({
      managedArtifactRoot: path.join(tempRoot, "artifacts-cancel-verification"),
    });
    const plan = verifier.createPlan({
      runId: "run-cancel-verification",
      taskId: "task-verify",
      sandbox,
      policy,
      budget: createDefaultRunBudget(),
      commands: ["node scripts/slow.mjs"],
      artifactRoot: path.join(
        tempRoot,
        "artifacts-cancel-verification",
        "run-cancel-verification",
      ),
      config: { defaultCommands: [], commandTimeoutMs: 5_000 },
    });
    const controller = new AbortController();
    const verification = verifier.runVerification(plan, policy, {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 25);

    await expect(verification).rejects.toThrow(
      "Repository verification cancelled",
    );
    await expect(
      readFile(
        path.join(
          tempRoot,
          "artifacts-cancel-verification",
          "run-cancel-verification",
          "verification-result.json",
        ),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("detects allowed diff scope, protected paths, and unexpected files", async () => {
    const { repoPath, worktreePath, commit } = await createTempGitRepository();
    await writeFile(path.join(worktreePath, "packages", "feature.txt"), "allowed\n");
    const exactPath = 'packages/file "quoted"\\name.txt';
    await writeFile(path.join(worktreePath, exactPath), "exact path\n");
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
    expect(result.diffScope.allowedFiles).toContain(exactPath);
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

  it("fails verification when the actual diff is broad or destructive", async () => {
    const broadFixture = await createTempGitRepository("repo-broad");
    const broadPolicy = policyWithAllowlist(
      broadFixture.repoPath,
      broadFixture.worktreePath,
      [],
    );
    for (
      let index = 0;
      index < broadPolicy.sandbox.fileWritePolicy.maxChangedFiles + 1;
      index += 1
    ) {
      await writeFile(
        path.join(broadFixture.worktreePath, "packages", `broad-${index}.txt`),
        `${index}\n`,
      );
    }
    let verifier = new LocalRepositoryVerifier({
      managedArtifactRoot: path.join(tempRoot, "artifacts-broad"),
    });
    let plan = verifier.createPlan({
      runId: "run-broad",
      taskId: "task-verify",
      sandbox: createSandbox(
        broadFixture.repoPath,
        broadFixture.worktreePath,
        broadFixture.commit,
      ),
      policy: broadPolicy,
      budget: createDefaultRunBudget(),
      artifactRoot: path.join(tempRoot, "artifacts-broad", "run-broad"),
      config: { defaultCommands: [] },
    });
    let result = await verifier.runVerification(plan, broadPolicy);
    expect(result.status).toBe("fail");
    expect(result.verdict.failureClass).toBe("changed_file_limit_exceeded");
    expect(result.diffScope.changedFileLimitExceeded).toBe(true);

    plan = verifier.createPlan({
      runId: "run-broad-approved",
      taskId: "task-verify",
      sandbox: createSandbox(
        broadFixture.repoPath,
        broadFixture.worktreePath,
        broadFixture.commit,
      ),
      policy: broadPolicy,
      budget: createDefaultRunBudget(),
      artifactRoot: path.join(tempRoot, "artifacts-broad", "run-broad-approved"),
      config: {
        defaultCommands: [],
        authorizedChangedPaths: Array.from(
          {
            length:
              broadPolicy.sandbox.fileWritePolicy.maxChangedFiles + 1,
          },
          (_, index) => `packages/broad-${index}.txt`,
        ),
        allowChangedFileLimitExceeded: true,
      },
    });
    result = await verifier.runVerification(plan, broadPolicy);
    expect(result.verdict.failureClass).toBeUndefined();

    const destructiveFixture = await createTempGitRepository("repo-destructive");
    await git(["rm", "packages/README.md"], destructiveFixture.worktreePath);
    const destructivePolicy = policyWithAllowlist(
      destructiveFixture.repoPath,
      destructiveFixture.worktreePath,
      [],
    );
    verifier = new LocalRepositoryVerifier({
      managedArtifactRoot: path.join(tempRoot, "artifacts-destructive"),
    });
    plan = verifier.createPlan({
      runId: "run-destructive",
      taskId: "task-verify",
      sandbox: createSandbox(
        destructiveFixture.repoPath,
        destructiveFixture.worktreePath,
        destructiveFixture.commit,
      ),
      policy: destructivePolicy,
      budget: createDefaultRunBudget(),
      artifactRoot: path.join(tempRoot, "artifacts-destructive", "run-destructive"),
      config: { defaultCommands: [] },
    });
    result = await verifier.runVerification(plan, destructivePolicy);
    expect(result.status).toBe("fail");
    expect(result.verdict.failureClass).toBe("destructive_change_detected");
    expect(result.diffScope.destructiveFiles).toContain("packages/README.md");

    plan = verifier.createPlan({
      runId: "run-destructive-approved",
      taskId: "task-verify",
      sandbox: createSandbox(
        destructiveFixture.repoPath,
        destructiveFixture.worktreePath,
        destructiveFixture.commit,
      ),
      policy: destructivePolicy,
      budget: createDefaultRunBudget(),
      artifactRoot: path.join(
        tempRoot,
        "artifacts-destructive",
        "run-destructive-approved",
      ),
      config: {
        defaultCommands: [],
        authorizedChangedPaths: ["packages/README.md"],
        allowDestructiveChanges: true,
      },
    });
    result = await verifier.runVerification(plan, destructivePolicy);
    expect(result.verdict.failureClass).toBeUndefined();
  });

  it("fails when the real diff exceeds the action-bound path grant", async () => {
    const fixture = await createTempGitRepository("repo-authorized-scope");
    await writeFile(path.join(fixture.worktreePath, "packages", "actual.txt"), "changed\n");
    const policy = policyWithAllowlist(
      fixture.repoPath,
      fixture.worktreePath,
      [],
    );
    const verifier = new LocalRepositoryVerifier({
      managedArtifactRoot: path.join(tempRoot, "artifacts-authorized-scope"),
    });
    const plan = verifier.createPlan({
      runId: "run-authorized-scope",
      taskId: "task-verify",
      sandbox: createSandbox(
        fixture.repoPath,
        fixture.worktreePath,
        fixture.commit,
      ),
      policy,
      budget: createDefaultRunBudget(),
      artifactRoot: path.join(
        tempRoot,
        "artifacts-authorized-scope",
        "run-authorized-scope",
      ),
      config: {
        defaultCommands: [],
        authorizedChangedPaths: ["packages/declared.txt"],
      },
    });

    const result = await verifier.runVerification(plan, policy);

    expect(result.status).toBe("fail");
    expect(result.verdict.failureClass).toBe("unauthorized_file_touch");
    expect(result.diffScope.unauthorizedFiles).toEqual(["packages/actual.txt"]);
  });

  it("checks both source and destination paths for porcelain rename records", async () => {
    const fixture = await createTempGitRepository("repo-rename-authorization");
    await writeFile(path.join(fixture.worktreePath, ".env"), "SECRET=value\n");
    await git(["add", ".env"], fixture.worktreePath);
    await git(["commit", "-m", "add protected source"], fixture.worktreePath);
    const baseRef = await git(["rev-parse", "HEAD"], fixture.worktreePath);
    await git(
      ["mv", ".env", "packages/renamed-protected.env"],
      fixture.worktreePath,
    );
    const policy = policyWithAllowlist(
      fixture.repoPath,
      fixture.worktreePath,
      [],
    );
    const verifier = new LocalRepositoryVerifier({
      managedArtifactRoot: path.join(tempRoot, "artifacts-rename-authorization"),
    });
    const plan = verifier.createPlan({
      runId: "run-rename-authorization",
      taskId: "task-verify",
      sandbox: createSandbox(
        fixture.repoPath,
        fixture.worktreePath,
        baseRef,
      ),
      policy,
      budget: createDefaultRunBudget(),
      artifactRoot: path.join(
        tempRoot,
        "artifacts-rename-authorization",
        "run-rename-authorization",
      ),
      config: {
        defaultCommands: [],
        authorizedChangedPaths: ["packages/renamed-protected.env"],
        allowDestructiveChanges: true,
      },
    });

    const result = await verifier.runVerification(plan, policy);

    expect(result.status).toBe("fail");
    expect(result.diffScope.changedFiles).toEqual(
      expect.arrayContaining([".env", "packages/renamed-protected.env"]),
    );
    expect(result.diffScope.protectedFiles).toContain(".env");
    expect(result.diffScope.unauthorizedFiles).toContain(".env");
    expect(result.diffScope.destructiveFiles).toEqual(
      expect.arrayContaining([".env", "packages/renamed-protected.env"]),
    );
  });

  it("parses both paths for copy records without classifying them as destructive", () => {
    const parsed = parsePorcelainStatusPaths(
      "C  packages/copied-pass.mjs\0scripts/pass.mjs\0",
    );

    expect(parsed.changedFiles).toEqual([
      "packages/copied-pass.mjs",
      "scripts/pass.mjs",
    ]);
    expect(parsed.destructiveFiles).toEqual([]);
  });

  it("fails closed for empty interactive grants and does not expand directory grants", async () => {
    const fixture = await createTempGitRepository("repo-exact-authorization");
    await writeFile(
      path.join(fixture.worktreePath, "packages", "actual.txt"),
      "changed\n",
    );
    const policy = policyWithAllowlist(
      fixture.repoPath,
      fixture.worktreePath,
      [],
    );
    const verifier = new LocalRepositoryVerifier({
      managedArtifactRoot: path.join(tempRoot, "artifacts-exact-authorization"),
    });

    for (const authorizedChangedPaths of [[], ["packages"]]) {
      const plan = verifier.createPlan({
        runId: `run-exact-${authorizedChangedPaths.length}`,
        taskId: "task-verify",
        sandbox: createSandbox(
          fixture.repoPath,
          fixture.worktreePath,
          fixture.commit,
        ),
        policy,
        budget: createDefaultRunBudget(),
        artifactRoot: path.join(
          tempRoot,
          "artifacts-exact-authorization",
          `run-exact-${authorizedChangedPaths.length}`,
        ),
        config: {
          defaultCommands: [],
          authorizedChangedPaths,
          requireAuthorizedChangedPaths: true,
        },
      });

      const result = await verifier.runVerification(plan, policy);
      expect(result.status).toBe("fail");
      expect(result.verdict.failureClass).toBe("unauthorized_file_touch");
      expect(result.diffScope.unauthorizedFiles).toEqual([
        "packages/actual.txt",
      ]);
    }
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
