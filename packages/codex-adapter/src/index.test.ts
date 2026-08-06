import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  createConservativeCodingApprenticePolicy,
  createDefaultRunBudget,
  InMemoryRunStore,
  ORYNT_ENGLISH_OUTPUT_INSTRUCTION,
  type CodexContractRequest,
  type CodexExecutionApproval,
  type CodexTaskAttemptBinding,
  type CorePolicy,
  type RepositorySandbox,
  type VerificationPlan,
} from "@codepawl/shared";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { CodexAdapterFailure, CodexExecutionFailure, CodexResultImporterFailure, LocalCodexContractAdapter, LocalManualCodexResultImporter } from "./index";

let tempRoot = "";
const execFileAsync = promisify(execFile);

async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return String(stdout).trim();
}

function createRun(store: InMemoryRunStore) {
  return store.createRun({
    goal: "Fix a failing unit test",
    capabilityId: "coding-apprentice",
    taskId: "task-1",
    workspaceId: "workspace-1",
    budget: createDefaultRunBudget(),
  });
}

function createRequest(overrides: Partial<CodexContractRequest> = {}): CodexContractRequest {
  const repositoryPath = path.join(tempRoot, "repo");
  const worktreePath = path.join(tempRoot, "sandboxes", "repo-run");
  const artifactRoot = path.join(tempRoot, "artifacts", "run-1");
  const policy = createConservativeCodingApprenticePolicy(repositoryPath, worktreePath);

  return {
    runId: "run-1",
    taskId: "task-1",
    goal: "Fix the failing test without touching protected files.",
    context: ["The failure is in packages/shared.", "Use the existing RunEvent patterns."],
    constraints: ["Do not execute Codex.", "Do not edit .env files."],
    doneWhen: ["The contract is generated.", "Validation expectations are documented."],
    repository: {
      repositoryPath,
      gitRoot: repositoryPath,
      currentBranch: "main",
      currentCommit: "0123456789abcdef0123456789abcdef01234567",
      isDirty: false,
      hasRemote: true,
      remotes: ["origin"],
    },
    sandbox: {
      id: "sandbox-1",
      runId: "run-1",
      taskId: "task-1",
      repositoryPath,
      gitRoot: repositoryPath,
      worktreePath,
      branchName: "orynt/run-1-task-1",
      baseRef: "HEAD",
      currentCommit: "0123456789abcdef0123456789abcdef01234567",
      createdAt: "2026-06-26T00:00:00.000Z",
    },
    policy,
    budget: createDefaultRunBudget(),
    validationCommands: ["bun test:contracts", "bun build:desktop"],
    artifactRoot,
    ...overrides,
  };
}

async function createImportFixture() {
  const repositoryPath = path.join(tempRoot, "repo-import");
  const sandboxRoot = path.join(tempRoot, "sandboxes");
  const artifactRoot = path.join(tempRoot, "artifacts", "run-import");
  await mkdir(path.join(repositoryPath, "packages"), { recursive: true });
  await mkdir(path.join(repositoryPath, "scripts"), { recursive: true });
  await git(["init"], repositoryPath);
  await git(["config", "user.email", "orynt@example.test"], repositoryPath);
  await git(["config", "user.name", "Orynt Test"], repositoryPath);
  await writeFile(path.join(repositoryPath, "packages", "README.md"), "initial\n");
  await writeFile(path.join(repositoryPath, "README.md"), "# Fixture\n");
  await git(["add", "README.md", "packages/README.md"], repositoryPath);
  await git(["commit", "-m", "initial"], repositoryPath);
  const baseCommit = await git(["rev-parse", "HEAD"], repositoryPath);
  const worktreePath = path.join(sandboxRoot, "repo-import-worktree");
  await mkdir(sandboxRoot, { recursive: true });
  await git(["worktree", "add", "-b", "orynt/run-import", worktreePath, "HEAD"], repositoryPath);

  const policy = createConservativeCodingApprenticePolicy(repositoryPath, sandboxRoot);
  const sandbox: RepositorySandbox = {
    id: "sandbox-import",
    runId: "run-import",
    taskId: "task-import",
    repositoryPath,
    gitRoot: repositoryPath,
    worktreePath,
    branchName: "orynt/run-import",
    baseRef: baseCommit,
    currentCommit: baseCommit,
    createdAt: "2026-06-26T00:00:00.000Z",
  };

  return { repositoryPath, sandboxRoot, artifactRoot, worktreePath, policy, sandbox };
}

async function writeImportChange(worktreePath: string) {
  await mkdir(path.join(worktreePath, "packages"), { recursive: true });
  await writeFile(
    path.join(worktreePath, "packages", "feature.txt"),
    "new feature\napiKey=sk-diffsecret123456\n",
  );
  await writeFile(path.join(worktreePath, "packages", "README.md"), "initial\nupdated\n");
}

function importRequest({
  artifactRoot,
  sandbox,
  policy,
  overrides = {},
}: {
  artifactRoot: string;
  sandbox: RepositorySandbox;
  policy: CorePolicy;
  overrides?: Partial<Parameters<LocalManualCodexResultImporter["importResultBundle"]>[0]>;
}) {
  return {
    runId: sandbox.runId,
    taskId: sandbox.taskId,
    sandbox,
    policy,
    budget: createDefaultRunBudget(),
    artifactRoot,
    userNotes: "Operator reviewed the manual Codex output.",
    validationCommands: ["bun test:contracts"],
    ...overrides,
  };
}

function createVerificationPlan(request: CodexContractRequest): VerificationPlan {
  return {
    id: `verification-plan-${request.runId}`,
    runId: request.runId,
    taskId: request.taskId,
    sandbox: request.sandbox,
    policyId: request.policy.id,
    commands: [],
    budget: request.budget,
    config: {
      defaultCommands: [],
      commandTimeoutMs: 30_000,
      maxOutputBytes: request.policy.sandbox.budget.maxOutputBytes,
      requireChangedFiles: true,
      artifactRoot: request.artifactRoot,
    },
    createdAt: "2026-06-26T00:00:00.000Z",
  };
}

async function createExecutableCodexFixture(scriptBody: string) {
  const binDir = path.join(tempRoot, "bin");
  const fakeCodex = path.join(binDir, "codex");
  await mkdir(binDir, { recursive: true });
  await writeFile(fakeCodex, scriptBody);
  await chmod(fakeCodex, 0o755);
  return { binDir, fakeCodex };
}

function approved(planId: string, runId = "run-1"): CodexExecutionApproval {
  return {
    id: `approval-${planId}`,
    runId,
    planId,
    approvedBy: "operator",
    status: "approved",
    reason: "Operator approved controlled Codex execution.",
    approvedAt: "2026-06-26T00:00:00.000Z",
  };
}

function taskBinding(
  overrides: Partial<CodexTaskAttemptBinding> = {},
): CodexTaskAttemptBinding {
  return {
    planId: "repository-task-plan-1",
    revision: 0,
    digest: "a".repeat(64),
    semanticTaskId: "task-1",
    attemptId: "task-1-attempt-1",
    retryIndex: 0,
    expectedPaths: ["packages/fake-codex.txt"],
    operations: ["write"],
    ...overrides,
  };
}

describe("LocalCodexContractAdapter", () => {
  it("renders read-only execution instructions without mutation guidance", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const request = createRequest({
      runId: run.id,
      taskId: run.taskId,
      taskMode: "read_only",
      executionMode: "manual_cli",
      goal: "read-only repository analysis task: inspect this codebase",
    });
    const adapter = new LocalCodexContractAdapter({
      managedArtifactRoot: path.join(tempRoot, "artifacts"),
      runStore: store,
    });

    const contract = adapter.createContract(request);

    expect(contract.markdown).toContain("Inspect the repository without modifying files.");
    expect(contract.markdown).toContain(ORYNT_ENGLISH_OUTPUT_INSTRUCTION);
    expect(contract.markdown).not.toContain("Implement the requested repository task directly");
    expect(contract.markdown).not.toContain("Create a complete runnable implementation");
  });

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "orynt-codex-adapter-test-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("carries a semantic task attempt through contract, plan, and derived approval", async () => {
    const request = createRequest({
      executionMode: "manual_cli",
      taskMode: "read_only",
      taskBinding: taskBinding({
        semanticTaskId: "inspect-repository",
        attemptId: "inspect-repository-attempt-1",
        expectedPaths: [],
        operations: ["read"],
      }),
    });
    await mkdir(request.sandbox.worktreePath, { recursive: true });
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env bun
process.exit(0);
`);
    const adapter = new LocalCodexContractAdapter({
      managedArtifactRoot: path.join(tempRoot, "artifacts"),
      pathEnv: binDir,
    });
    const contract = adapter.createContract(request);
    const artifact = await adapter.writeContractArtifact(contract, request.artifactRoot);
    const imagePath = path.join(tempRoot, "input.png");
    await writeFile(imagePath, "image");
    const plan = await adapter.planExecution({
      contract,
      contractArtifact: artifact,
      sandbox: request.sandbox,
      policy: request.policy,
      budget: request.budget,
      artifactRoot: request.artifactRoot,
      verifierPlan: createVerificationPlan(request),
      images: [{
        kind: "local_file",
        path: imagePath,
        mimeType: "image/png",
        sha256: "a".repeat(64),
        byteLength: 5,
        detail: "high",
        source: "user_attachment",
      }],
      taskBinding: request.taskBinding,
    });

    expect(contract.taskBinding).toEqual(request.taskBinding);
    expect(contract.metadata.taskBinding).toEqual(request.taskBinding);
    expect(artifact.taskBinding).toEqual(request.taskBinding);
    expect(plan.taskBinding).toEqual(request.taskBinding);
    expect(plan.argv.slice(plan.argv.indexOf("--sandbox"), plan.argv.indexOf("--sandbox") + 2)).toEqual([
      "--sandbox",
      "read-only",
    ]);
    expect(adapter.requestExecutionApproval(plan).taskBinding).toEqual(request.taskBinding);
  });

  it("rejects a mismatched semantic task approval before spawning Codex", async () => {
    const request = createRequest({
      executionMode: "manual_cli",
      taskMode: "mutation",
      taskBinding: taskBinding(),
    });
    await mkdir(request.sandbox.worktreePath, { recursive: true });
    const marker = path.join(request.sandbox.worktreePath, "task-binding-marker.txt");
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env bun
require("node:fs").writeFileSync(${JSON.stringify(marker)}, "spawned\\n");
`);
    const adapter = new LocalCodexContractAdapter({
      managedArtifactRoot: path.join(tempRoot, "artifacts"),
      pathEnv: binDir,
    });
    const contract = adapter.createContract(request);
    const artifact = await adapter.writeContractArtifact(contract, request.artifactRoot);
    const plan = await adapter.planExecution({
      contract,
      contractArtifact: artifact,
      sandbox: request.sandbox,
      policy: request.policy,
      budget: request.budget,
      artifactRoot: request.artifactRoot,
      verifierPlan: createVerificationPlan(request),
      taskBinding: request.taskBinding,
    });
    const approval = {
      ...adapter.requestExecutionApproval(plan),
      status: "approved" as const,
      approvedBy: "operator",
      approvedAt: "2026-06-26T00:00:00.000Z",
      taskBinding: taskBinding({ attemptId: "task-1-attempt-2" }),
    };

    await expect(adapter.executeApprovedContract(plan, approval)).rejects.toMatchObject({
      code: "approval_mismatch",
    });
    await expect(readFile(marker, "utf8")).rejects.toThrow();
  });

  it("generates the canonical work-contract sections and policy constraints", () => {
    const request = createRequest();
    const contract = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts") }).createContract(request);

    expect(contract.markdown).toContain("## Goal");
    expect(contract.markdown).toContain("## Context");
    expect(contract.markdown).toContain("## Constraints");
    expect(contract.markdown).toContain("## Done when");
    expect(contract.markdown).toContain(`Sandbox path: ${request.sandbox.worktreePath}`);
    expect(contract.markdown).toContain("Allowed paths: apps/**, packages/**, src/**, server/**, api/**, public/**, tests/**, .codex/**, README.md, PRODUCT.md, package.json, index.html");
    expect(contract.markdown).toContain("Blocked commands: git push, git merge, git branch -D, rm -rf, sudo, credential, secret");
    expect(contract.markdown).toContain("Max model tokens: 120000");
    expect(contract.markdown).toContain("- bun test:contracts");
    expect(contract.metadata.validationCommands).toEqual(["bun test:contracts", "bun build:desktop"]);
  });

  it("generates executable local CLI contracts for controlled repository tasks", () => {
    const request = createRequest({
      executionMode: "manual_cli",
      goal: "Create a complex fullstack tech web app with a frontend dashboard and backend API.",
      constraints: ["Keep changes inside the repository sandbox."],
      doneWhen: ["The app has package.json scripts.", "The app has frontend and backend/API files."],
      validationCommands: ["node .codex/orynt-beta-verify.mjs"],
    });

    const contract = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts") }).createContract(request);

    expect(contract.executionMode).toBe("manual_cli");
    expect(contract.markdown).toContain("Execution mode: manual_cli");
    expect(contract.markdown).toContain("Create a complex fullstack tech web app");
    expect(contract.markdown).toContain("Implement the requested repository task directly in the sandbox");
    expect(contract.markdown).toContain("node .codex/orynt-beta-verify.mjs");
    expect(contract.markdown).not.toContain("This artifact is a safe handoff contract only. Orynt has not executed Codex");
    expect(contract.metadata.executionMode).toBe("manual_cli");
  });

  it("redacts secret-like values from generated markdown and metadata", () => {
    const contract = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts") }).createContract(
      createRequest({
        goal: "Fix the test with apiKey=sk-thisshouldberedacted",
        context: ["authorization: Bearer abcdefghijklmnop"],
        validationCommands: ["echo token=ghp_thisshouldberedacted"],
      }),
    );

    expect(contract.markdown).not.toContain("sk-thisshouldberedacted");
    expect(contract.markdown).not.toContain("Bearer abcdefghijklmnop");
    expect(contract.metadata.validationCommands.join(" ")).not.toContain("ghp_thisshouldberedacted");
    expect(contract.metadata.redactionApplied).toBe(true);
  });

  it("reports missing Codex CLI without failing contract-only mode", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const adapter = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts"), runStore: store, pathEnv: "" });

    const status = await adapter.detectCodex(run.id);

    expect(status.available).toBe(false);
    expect(status.executionMode).toBe("contract_only");
    expect(store.listEvents(run.id).map((event) => event.type)).toEqual(["codex_missing"]);
  });

  it("detects a Codex executable by scanning PATH without invoking it", async () => {
    const binDir = path.join(tempRoot, "bin");
    const fakeCodex = path.join(binDir, "codex");
    await mkdir(binDir);
    await writeFile(fakeCodex, "not a runnable script\n");
    await chmod(fakeCodex, 0o755);

    const status = await new LocalCodexContractAdapter({
      managedArtifactRoot: path.join(tempRoot, "artifacts"),
      pathEnv: binDir,
    }).detectCodex();

    expect(status.available).toBe(true);
    expect(status.executablePath).toBe(fakeCodex);
  });

  it("writes markdown and JSON metadata artifacts inside the managed artifact root", async () => {
    const request = createRequest();
    const managedArtifactRoot = path.join(tempRoot, "artifacts");
    const adapter = new LocalCodexContractAdapter({ managedArtifactRoot });
    const contract = adapter.createContract(request);

    const artifact = await adapter.writeContractArtifact(contract, request.artifactRoot);

    expect(artifact.artifacts.map((item) => item.kind)).toEqual(["codex_contract", "codex_contract_metadata"]);
    expect(await readFile(artifact.markdownPath, "utf8")).toBe(contract.markdown);
    expect(JSON.parse(await readFile(artifact.metadataPath, "utf8"))).toMatchObject({
      id: contract.id,
      runId: request.runId,
      taskId: request.taskId,
      executionMode: "contract_only",
    });
  });

  it("rejects artifact writes outside the managed artifact root", async () => {
    const request = createRequest();
    const adapter = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts") });
    const contract = adapter.createContract(request);

    await expect(adapter.writeContractArtifact(contract, path.join(tempRoot, "outside"))).rejects.toBeInstanceOf(CodexAdapterFailure);
  });

  it("emits contract lifecycle RunEvents", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const managedArtifactRoot = path.join(tempRoot, "artifacts");
    const request = createRequest({ runId: run.id, taskId: run.taskId, artifactRoot: path.join(managedArtifactRoot, run.id) });
    const adapter = new LocalCodexContractAdapter({ managedArtifactRoot, runStore: store });

    const contract = adapter.createContract(request);
    await adapter.writeContractArtifact(contract, request.artifactRoot);
    await expect(adapter.writeContractArtifact(contract, path.join(tempRoot, "outside"))).rejects.toBeInstanceOf(CodexAdapterFailure);

    expect(store.listEvents(run.id).map((event) => event.type)).toEqual([
      "codex_contract_requested",
      "codex_contract_created",
      "codex_manual_next_step",
      "codex_contract_write_failed",
    ]);
  });

  it("plans controlled execution with isolated config and selected model", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const request = createRequest({
      runId: run.id,
      executionMode: "manual_cli",
      modelId: "gpt-5.5",
      modelLabel: "GPT-5.5",
      modelRole: "implementer",
      thinkingEffort: "high",
    });
    await mkdir(request.sandbox.worktreePath, { recursive: true });
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env bun
console.log("fake codex should not run without approval");
`);
    const adapter = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts"), runStore: store, pathEnv: binDir });
    const contract = adapter.createContract(request);
    const artifact = await adapter.writeContractArtifact(contract, request.artifactRoot);
    const imagePath = path.join(tempRoot, "input.png");
    await writeFile(imagePath, "image");
    const plan = await adapter.planExecution({
      contract,
      contractArtifact: artifact,
      sandbox: request.sandbox,
      policy: request.policy,
      budget: request.budget,
      artifactRoot: request.artifactRoot,
      verifierPlan: createVerificationPlan(request),
      images: [{
        kind: "local_file",
        path: imagePath,
        mimeType: "image/png",
        sha256: "a".repeat(64),
        byteLength: 5,
        detail: "high",
        source: "user_attachment",
      }],
    });

    expect(plan.argv).toEqual(
      expect.arrayContaining([
        "--ignore-user-config",
        "--ignore-rules",
        "-m",
        "gpt-5.5",
        "-c",
        'model_reasoning_effort="high"',
        "--image",
        imagePath,
      ]),
    );
    expect(plan).toMatchObject({
      modelRole: "implementer",
      thinkingEffort: "high",
      images: [expect.objectContaining({ path: imagePath })],
    });
    await expect(adapter.executeApprovedContract(plan, { ...approved(plan.id, run.id), status: "pending" })).rejects.toMatchObject({
      code: "approval_missing",
    });
    expect(store.listEvents(run.id).map((event) => event.type)).toContain("codex_execution_blocked");
  });

  it("blocks controlled execution when Codex is missing", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const request = createRequest({ runId: run.id });
    await mkdir(request.sandbox.worktreePath, { recursive: true });
    const adapter = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts"), runStore: store, pathEnv: "" });
    const contract = adapter.createContract(request);
    const artifact = await adapter.writeContractArtifact(contract, request.artifactRoot);

    const plan = await adapter.planExecution({
      contract,
      contractArtifact: artifact,
      sandbox: request.sandbox,
      policy: request.policy,
      budget: request.budget,
      artifactRoot: request.artifactRoot,
      verifierPlan: createVerificationPlan(request),
    });

    expect(plan.status).toBe("blocked");
    expect(plan.failureReasons).toContain("codex_missing");
    expect(store.listEvents(run.id).map((event) => event.type)).toContain("codex_execution_blocked");
  });

  it("blocks controlled execution when the sandbox is missing", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const request = createRequest({ runId: run.id });
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env bun
console.log("fake codex should not run without sandbox");
`);
    const adapter = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts"), runStore: store, pathEnv: binDir });
    const contract = adapter.createContract(request);
    const artifact = await adapter.writeContractArtifact(contract, request.artifactRoot);

    const plan = await adapter.planExecution({
      contract,
      contractArtifact: artifact,
      sandbox: request.sandbox,
      policy: request.policy,
      budget: request.budget,
      artifactRoot: request.artifactRoot,
      verifierPlan: createVerificationPlan(request),
    });

    expect(plan.status).toBe("blocked");
    expect(plan.failureReasons).toContain("sandbox_missing");
  });

  it("blocks controlled execution when CorePolicy blocks the Codex action", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const request = createRequest({ runId: run.id });
    await mkdir(request.sandbox.worktreePath, { recursive: true });
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env bun
console.log("fake codex should not run when policy blocks");
`);
    const adapter = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts"), runStore: store, pathEnv: binDir });
    const contract = adapter.createContract(request);
    const artifact = await adapter.writeContractArtifact(contract, request.artifactRoot);

    const plan = await adapter.planExecution({
      contract,
      contractArtifact: artifact,
      sandbox: request.sandbox,
      policy: {
        ...request.policy,
        sandbox: {
          ...request.policy.sandbox,
          commandPolicy: {
            ...request.policy.sandbox.commandPolicy,
            blockedCommands: [...request.policy.sandbox.commandPolicy.blockedCommands, "codex exec"],
          },
        },
      },
      budget: request.budget,
      artifactRoot: request.artifactRoot,
      verifierPlan: createVerificationPlan(request),
    });

    expect(plan.status).toBe("blocked");
    expect(plan.failureReasons).toContain("policy_blocked");
  });

  it("blocks controlled execution when the execution estimate exceeds the run budget", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const request = createRequest({ runId: run.id, budget: { ...createDefaultRunBudget(), maxSteps: 2 } });
    await mkdir(request.sandbox.worktreePath, { recursive: true });
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env bun
console.log("fake codex should not run over budget");
`);
    const adapter = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts"), runStore: store, pathEnv: binDir });
    const contract = adapter.createContract(request);
    const artifact = await adapter.writeContractArtifact(contract, request.artifactRoot);

    const plan = await adapter.planExecution({
      contract,
      contractArtifact: artifact,
      sandbox: request.sandbox,
      policy: request.policy,
      budget: request.budget,
      artifactRoot: request.artifactRoot,
      verifierPlan: createVerificationPlan(request),
      executionPolicy: { maxExecutionSteps: 3 },
    });

    expect(plan.status).toBe("blocked");
    expect(plan.failureReasons).toContain("budget_exceeded");
  });

  it("executes an approved contract with a fake Codex binary, redacts output, and creates an import request", async () => {
    const fixture = await createImportFixture();
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const request = createRequest({
      runId: run.id,
      taskId: run.taskId,
      repository: {
        repositoryPath: fixture.repositoryPath,
        gitRoot: fixture.repositoryPath,
        currentBranch: "main",
        currentCommit: fixture.sandbox.currentCommit,
        isDirty: false,
        hasRemote: false,
        remotes: [],
      },
      sandbox: { ...fixture.sandbox, runId: run.id, taskId: run.taskId },
      policy: createConservativeCodingApprenticePolicy(fixture.repositoryPath, fixture.sandboxRoot),
      artifactRoot: path.join(tempRoot, "artifacts", run.id),
    });
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
const stdin = fs.readFileSync(0, "utf8");
const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex >= 0) {
  const longFinalResponse = "Implemented final model response for regression coverage.\\n" + "Long visible response line. ".repeat(100) + "\\nFinal visible sentence after preview limit.\\ntoken=«redacted:sk-…»\\n";
  fs.writeFileSync(process.argv[outputIndex + 1], longFinalResponse);
}
fs.writeFileSync(path.join(cwd, "packages", "fake-codex.txt"), "changed by fake codex\\n");
process.stdout.write(JSON.stringify({ type: "item.updated", item: { id: "reason-1", type: "reasoning", text: "I inspected the repository and found the target file." } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { id: "tool-1", type: "command_execution", command: "echo token=sk-faketoolsecret123" } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { id: "tool-1", type: "command_execution", command: "echo token=sk-faketoolsecret123" } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { id: "search-1", type: "web_search", query: "Orynt streaming contract" } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { id: "message-1", type: "agent_message", text: "Changed packages/fake-codex.txt and verified it. " + "Streamed agent response remains visible. ".repeat(180) + "Streamed sentinel after six thousand chars." } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 12000, cached_input_tokens: 9000, output_tokens: 500, reasoning_output_tokens: 120, total_tokens: 12500 } }) + "\\n");
console.log("token=sk-fakecodexsecret123 contract=" + stdin.includes("Codex Work Contract"));
console.error("authorization=Bearer-fakecodexstderr12345");
`);
    const adapter = new LocalCodexContractAdapter({
      managedArtifactRoot: path.join(tempRoot, "artifacts"),
      runStore: store,
      pathEnv: binDir,
    });
    const contract = adapter.createContract(request);
    const artifact = await adapter.writeContractArtifact(contract, request.artifactRoot);
    const plan = await adapter.planExecution({
      contract,
      contractArtifact: artifact,
      sandbox: request.sandbox,
      policy: request.policy,
      budget: request.budget,
      artifactRoot: request.artifactRoot,
      verifierPlan: createVerificationPlan(request),
      executionPolicy: { timeoutMs: 10_000, maxOutputBytes: 20_000, maxExecutionSteps: 4, requireApproval: true },
    });

    const result = await adapter.executeApprovedContract(plan, approved(plan.id, run.id));
    const importRequest = adapter.createResultImportRequest(result);

    expect(result.status).toBe("finished");
    expect(result.exitCode).toBe(0);
    expect(result.streamStats).toMatchObject({
      emittedEventCount: 5,
      duplicateEventCount: 1,
      malformedLineCount: 1,
    });
    expect(result.stdoutSummary).not.toContain("sk-fakecodexsecret123");
    expect(result.stderrSummary).not.toContain("Bearer fakecodexstderr12345");
    expect(result.redaction.applied).toBe(true);
    expect(result.lastMessagePath).toBe(path.join(request.artifactRoot, "codex-execution-last-message.redacted.md"));
    if (!result.lastMessagePath) {
      throw new Error("Expected controlled Codex execution to persist the final model response.");
    }
    const lastMessage = await readFile(result.lastMessagePath, "utf8");
    expect(lastMessage).toContain("Implemented final model response for regression coverage.");
    expect(lastMessage).not.toContain("sk-fakelastmessagesecret123");
    expect(result.artifacts.map((item) => item.kind)).toEqual(expect.arrayContaining(["codex_execution_log", "codex_execution_result", "summary"]));
    expect(result.artifacts.find((item) => item.label === "Codex final model response")).toMatchObject({
      kind: "summary",
      uri: `file://${result.lastMessagePath}`,
    });
    expect(await readFile(path.join(request.sandbox.worktreePath, "packages", "fake-codex.txt"), "utf8")).toContain("changed by fake codex");
    expect(importRequest).toMatchObject({
      runId: run.id,
      taskId: run.taskId,
      sandbox: request.sandbox,
      artifactRoot: request.artifactRoot,
      validationCommands: request.validationCommands,
    });
    expect(importRequest.manualLogPath).toBe(result.lastMessagePath);
    const events = store.listEvents(run.id);
    const outputRecordedEvent = events.find((event) => event.type === "codex_execution_output_recorded");
    const executionFinishedEvent = events.find((event) => event.type === "codex_execution_finished");
    const outputPreview = String(
      (outputRecordedEvent?.payload as { lastMessagePreview?: string } | undefined)?.lastMessagePreview ?? "",
    );
    const finishedPreview = String(
      (executionFinishedEvent?.payload as { lastMessagePreview?: string } | undefined)?.lastMessagePreview ?? "",
    );
    for (const preview of [outputPreview, finishedPreview]) {
      expect(preview).toContain("Implemented final model response for regression coverage.");
      expect(preview).toContain("Final visible sentence after preview limit.");
      expect(preview).not.toContain("[TRUNCATED]");
    }
    expect(JSON.stringify(outputRecordedEvent?.payload)).not.toContain("sk-fakelastmessagesecret123");
    expect(JSON.stringify(executionFinishedEvent?.payload)).not.toContain("sk-fakelastmessagesecret123");
    const reasoningEvent = events.find((event) => event.type === "codex_reasoning_summary");
    const agentMessageEvent = events.find((event) => event.type === "codex_agent_message");
    const contextEvent = events.find((event) => event.type === "codex_context_usage");
    expect(reasoningEvent?.payload).toMatchObject({
      summary: "I inspected the repository and found the target file.",
      text: "I inspected the repository and found the target file.",
      status: "updated",
    });
    expect(agentMessageEvent?.payload).toMatchObject({
      summary: "Codex agent response streamed",
      status: "completed",
    });
    expect(contextEvent?.payload).toMatchObject({
      role: "implementer",
      precision: "provider",
      current: {
        inputTokens: 12_000,
        cachedInputTokens: 9_000,
        outputTokens: 500,
        reasoningOutputTokens: 120,
        totalTokens: 12_500,
      },
    });
    const agentMessage = String(
      (agentMessageEvent?.payload as { message?: string } | undefined)?.message ?? "",
    );
    expect(agentMessage).toContain("Changed packages/fake-codex.txt and verified it.");
    expect(agentMessage).toContain("Streamed sentinel after six thousand chars.");
    expect(agentMessage).not.toContain("[TRUNCATED]");
    const toolEvents = events.filter((event) => event.type === "codex_tool_activity");
    expect(
      toolEvents.filter(
        (event) =>
          (event.payload as { itemId?: string }).itemId === "tool-1",
      ),
    ).toHaveLength(1);
    expect(toolEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            itemId: "tool-1",
            status: "completed",
            toolKind: "command",
            toolName: "shell",
            detail: expect.stringMatching(/REDACTED/u),
          }),
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            itemId: "search-1",
            status: "completed",
            toolKind: "web_search",
            detail: "Orynt streaming contract",
          }),
        }),
      ]),
    );
    expect(JSON.stringify(toolEvents)).not.toContain("sk-faketoolsecret123");
    expect(outputRecordedEvent?.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "summary", label: "Codex final model response" })]),
    );
    expect(executionFinishedEvent?.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "summary", label: "Codex final model response" })]),
    );
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "codex_execution_planned",
        "codex_execution_approval_required",
        "codex_execution_approved",
        "codex_execution_started",
        "codex_reasoning_summary",
        "codex_tool_activity",
        "codex_agent_message",
        "codex_execution_output_recorded",
        "codex_execution_finished",
        "codex_execution_result_ready",
      ]),
    );
  });

  it("cancels an active controlled execution through AbortSignal without marking it import-ready", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const request = createRequest({ runId: run.id, taskId: run.taskId });
    await mkdir(request.sandbox.worktreePath, { recursive: true });
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env bun
process.stdin.resume();
setInterval(() => process.stdout.write("still running\\n"), 25);
`);
    const adapter = new LocalCodexContractAdapter({
      managedArtifactRoot: path.join(tempRoot, "artifacts"),
      runStore: store,
      pathEnv: binDir,
    });
    const contract = adapter.createContract(request);
    const artifact = await adapter.writeContractArtifact(contract, request.artifactRoot);
    const plan = await adapter.planExecution({
      contract,
      contractArtifact: artifact,
      sandbox: request.sandbox,
      policy: request.policy,
      budget: request.budget,
      artifactRoot: request.artifactRoot,
      verifierPlan: createVerificationPlan(request),
      executionPolicy: { timeoutMs: 10_000 },
    });
    const controller = new AbortController();
    const execution = adapter.executeApprovedContract(plan, approved(plan.id, run.id), { signal: controller.signal });
    setTimeout(() => controller.abort(), 40);

    const result = await execution;

    expect(result.status).toBe("cancelled");
    expect(result.failureReasons).toContain("execution_cancelled");
    const eventTypes = store.listEvents(run.id).map((event) => event.type);
    expect(eventTypes).toContain("codex_execution_cancel_requested");
    expect(eventTypes).toContain("codex_execution_failed");
    expect(eventTypes).not.toContain("codex_execution_result_ready");
  });

  it("escalates cleanup when a same-group descendant ignores SIGTERM", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const request = createRequest({ runId: run.id, taskId: run.taskId });
    await mkdir(request.sandbox.worktreePath, { recursive: true });
    const orphanMarker = path.join(
      request.sandbox.worktreePath,
      "packages",
      "orphan-marker.txt",
    );
    const readyMarker = path.join(
      request.sandbox.worktreePath,
      "packages",
      "descendant-ready.txt",
    );
    await mkdir(path.dirname(readyMarker), { recursive: true });
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env bun
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const marker = ${JSON.stringify(orphanMarker)};
const ready = ${JSON.stringify(readyMarker)};
spawn(process.execPath, ["-e", "const fs=require('node:fs');const marker=" + JSON.stringify(marker) + ";const ready=" + JSON.stringify(ready) + ";process.on('SIGTERM',()=>{});fs.writeFileSync(ready,'ready\\\\n');setTimeout(()=>fs.writeFileSync(marker,'orphan\\\\n'),400);"], {
  stdio: "ignore",
}).unref();
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
const deadline = Date.now() + 1000;
while (!fs.existsSync(ready) && Date.now() < deadline) Atomics.wait(waitBuffer, 0, 0, 5);
const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex >= 0) fs.writeFileSync(process.argv[outputIndex + 1], "Parent completed\\n");
`);
    const adapter = new LocalCodexContractAdapter({
      managedArtifactRoot: path.join(tempRoot, "artifacts"),
      runStore: store,
      pathEnv: binDir,
    });
    const contract = adapter.createContract(request);
    const artifact = await adapter.writeContractArtifact(
      contract,
      request.artifactRoot,
    );
    const plan = await adapter.planExecution({
      contract,
      contractArtifact: artifact,
      sandbox: request.sandbox,
      policy: request.policy,
      budget: request.budget,
      artifactRoot: request.artifactRoot,
      verifierPlan: createVerificationPlan(request),
    });

    const result = await adapter.executeApprovedContract(
      plan,
      approved(plan.id, run.id),
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(result.status).toBe("finished");
    await expect(readFile(readyMarker, "utf8")).resolves.toContain("ready");
    await expect(readFile(orphanMarker, "utf8")).rejects.toThrow();
  });
});

describe("LocalManualCodexResultImporter", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "orynt-codex-result-import-test-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("imports sandbox git diff summary, changed files, notes, and writes a redacted bundle artifact", async () => {
    const fixture = await createImportFixture();
    await writeImportChange(fixture.worktreePath);
    await mkdir(fixture.artifactRoot, { recursive: true });
    await writeFile(path.join(fixture.artifactRoot, "codex-log.md"), "Implemented feature with apiKey=sk-importsecret123\n");

    const importer = new LocalManualCodexResultImporter({ managedArtifactRoot: path.join(tempRoot, "artifacts") });
    const bundle = await importer.importResultBundle(
      importRequest({
        artifactRoot: fixture.artifactRoot,
        sandbox: fixture.sandbox,
        policy: fixture.policy,
        overrides: { manualLogPath: path.join(fixture.artifactRoot, "codex-log.md") },
      }),
    );

    expect(bundle.status).toBe("imported");
    expect(bundle.patch.changedFiles.map((file) => file.path)).toEqual(["packages/README.md", "packages/feature.txt"]);
    expect(bundle.patch.allowedFiles).toEqual(["packages/README.md", "packages/feature.txt"]);
    expect(bundle.manualLog?.content).not.toContain("sk-importsecret123");
    expect(bundle.redaction.applied).toBe(true);
    expect(bundle.artifacts.map((artifact) => artifact.kind)).toContain("codex_result_bundle");
    expect(bundle.artifacts.map((artifact) => artifact.kind)).toContain("diff");
    const diffArtifact = bundle.artifacts.find(
      ({ kind }) => kind === "diff",
    );
    const diff = JSON.parse(
      await readFile(diffArtifact?.path ?? "", "utf8"),
    ) as {
      redacted: boolean;
      redactionCount: number;
      totals: { files: number; additions: number };
      files: Array<{ path: string; patch: string }>;
    };
    expect(diff).toMatchObject({
      redacted: true,
      totals: { files: 2 },
    });
    expect(diff.redactionCount).toBeGreaterThan(0);
    expect(diff.files.find(({ path }) => path === "packages/feature.txt")?.patch)
      .toContain("[REDACTED]");
    expect(JSON.stringify(diff)).not.toContain("sk-diffsecret123456");
    expect(JSON.parse(await readFile(path.join(fixture.artifactRoot, "codex-result-import.json"), "utf8"))).toMatchObject({
      runId: fixture.sandbox.runId,
      status: "imported",
      patch: { hasChanges: true },
    });
  });

  it("preserves exact tracked, renamed, and untracked paths containing spaces and quotes", async () => {
    const fixture = await createImportFixture();
    await writeFile(
      path.join(fixture.worktreePath, "packages", "README.md"),
      "modified tracked file\n",
    );
    await git(
      [
        "mv",
        "README.md",
        'renamed "guide" file.md',
      ],
      fixture.worktreePath,
    );
    const untrackedPath = path.join(
      fixture.worktreePath,
      "packages",
      'nested dir',
      'untracked "quote".txt',
    );
    await mkdir(path.dirname(untrackedPath), { recursive: true });
    await writeFile(untrackedPath, "untracked\n");
    const importer = new LocalManualCodexResultImporter({
      managedArtifactRoot: path.join(tempRoot, "artifacts"),
    });

    const patch = await importer.inspectSandboxChanges(
      importRequest({
        artifactRoot: fixture.artifactRoot,
        sandbox: fixture.sandbox,
        policy: fixture.policy,
      }),
    );

    expect(patch.changedFiles).toEqual(
      expect.arrayContaining([
        {
          status: "modified",
          path: "packages/README.md",
        },
        {
          status: "renamed",
          previousPath: "README.md",
          path: 'renamed "guide" file.md',
        },
        {
          status: "untracked",
          path: 'packages/nested dir/untracked "quote".txt',
        },
      ]),
    );
    expect(patch.changedFiles.map((file) => file.path)).not.toContain(
      '"packages/nested dir/untracked \\"quote\\".txt"',
    );
  });

  it("supports no-change imports but requires manual review", async () => {
    const fixture = await createImportFixture();
    const importer = new LocalManualCodexResultImporter({ managedArtifactRoot: path.join(tempRoot, "artifacts") });

    const bundle = await importer.importResultBundle(
      importRequest({
        artifactRoot: fixture.artifactRoot,
        sandbox: fixture.sandbox,
        policy: fixture.policy,
      }),
    );

    expect(bundle.status).toBe("manual_review_required");
    expect(bundle.failureReasons).toContain("no_changes");
    expect(bundle.patch.hasChanges).toBe(false);
  });

  it("re-checks the actual diff size and destructive operations before import", async () => {
    const broadFixture = await createImportFixture();
    for (let index = 0; index < broadFixture.policy.sandbox.fileWritePolicy.maxChangedFiles + 1; index += 1) {
      await writeFile(
        path.join(broadFixture.worktreePath, "packages", `change-${index}.txt`),
        `change ${index}\n`,
      );
    }
    const importer = new LocalManualCodexResultImporter({
      managedArtifactRoot: path.join(tempRoot, "artifacts"),
    });

    const broadBundle = await importer.importResultBundle(
      importRequest({
        artifactRoot: broadFixture.artifactRoot,
        sandbox: broadFixture.sandbox,
        policy: broadFixture.policy,
      }),
    );

    expect(broadBundle.status).toBe("manual_review_required");
    expect(broadBundle.failureReasons).toContain("changed_file_limit_exceeded");

    const approvedBroadBundle = await importer.importResultBundle(
      importRequest({
        artifactRoot: broadFixture.artifactRoot,
        sandbox: broadFixture.sandbox,
        policy: broadFixture.policy,
        overrides: { allowChangedFileLimitExceeded: true },
      }),
    );
    expect(approvedBroadBundle.status).toBe("imported");
    expect(approvedBroadBundle.failureReasons).not.toContain(
      "changed_file_limit_exceeded",
    );

    await git(["rm", "packages/README.md"], broadFixture.worktreePath);
    const destructiveBundle = await importer.importResultBundle(
      importRequest({
        artifactRoot: broadFixture.artifactRoot,
        sandbox: broadFixture.sandbox,
        policy: broadFixture.policy,
      }),
    );

    expect(destructiveBundle.status).toBe("manual_review_required");
    expect(destructiveBundle.failureReasons).toContain("destructive_change_detected");

    const approvedDestructiveBundle = await importer.importResultBundle(
      importRequest({
        artifactRoot: broadFixture.artifactRoot,
        sandbox: broadFixture.sandbox,
        policy: broadFixture.policy,
        overrides: {
          allowChangedFileLimitExceeded: true,
          allowDestructiveChanges: true,
        },
      }),
    );
    expect(approvedDestructiveBundle.status).toBe("imported");
    expect(approvedDestructiveBundle.failureReasons).not.toContain(
      "destructive_change_detected",
    );
  });

  it("fails import when the actual diff exceeds an exact interactive path grant", async () => {
    const fixture = await createImportFixture();
    await writeImportChange(fixture.worktreePath);
    const importer = new LocalManualCodexResultImporter({
      managedArtifactRoot: path.join(tempRoot, "artifacts"),
    });

    const rejectedBundle = await importer.importResultBundle(
      importRequest({
        artifactRoot: fixture.artifactRoot,
        sandbox: fixture.sandbox,
        policy: fixture.policy,
        overrides: {
          expectedPaths: ["packages/feature.txt"],
          requireExpectedPaths: true,
        },
      }),
    );
    expect(rejectedBundle.status).toBe("manual_review_required");
    expect(rejectedBundle.failureReasons).toContain("unauthorized_file_touch");
    expect(rejectedBundle.patch.unauthorizedFiles).toEqual([
      "packages/README.md",
    ]);

    const acceptedBundle = await importer.importResultBundle(
      importRequest({
        artifactRoot: fixture.artifactRoot,
        sandbox: fixture.sandbox,
        policy: fixture.policy,
        overrides: {
          expectedPaths: [
            "packages/feature.txt",
            "packages/README.md",
          ],
          requireExpectedPaths: true,
        },
      }),
    );
    expect(acceptedBundle.status).toBe("imported");
    expect(acceptedBundle.failureReasons).not.toContain(
      "unauthorized_file_touch",
    );
  });

  it("imports an optional validation transcript and creates verifier input without running verification", async () => {
    const fixture = await createImportFixture();
    await writeImportChange(fixture.worktreePath);
    await mkdir(fixture.artifactRoot, { recursive: true });
    await writeFile(path.join(fixture.artifactRoot, "validation.log"), "bun test:contracts\nPASS\n");
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const sandbox = { ...fixture.sandbox, runId: run.id, taskId: run.taskId };
    const importer = new LocalManualCodexResultImporter({ managedArtifactRoot: path.join(tempRoot, "artifacts"), runStore: store });

    const bundle = await importer.importResultBundle(
      importRequest({
        artifactRoot: fixture.artifactRoot,
        sandbox,
        policy: fixture.policy,
        overrides: { validationTranscriptPath: path.join(fixture.artifactRoot, "validation.log") },
      }),
    );
    const verifierInput = importer.createVerifierInput(bundle);

    expect(bundle.validationTranscript?.content).toContain("PASS");
    expect(verifierInput).toMatchObject({
      runId: run.id,
      taskId: run.taskId,
      sandbox,
      artifactRoot: fixture.artifactRoot,
      config: { requireChangedFiles: true },
    });
    expect(store.listEvents(run.id).map((event) => event.type)).toContain("verifier_input_created");
  });

  it("rejects manual logs outside the managed artifact directory", async () => {
    const fixture = await createImportFixture();
    await writeImportChange(fixture.worktreePath);
    const outside = path.join(tempRoot, "outside.log");
    await writeFile(outside, "outside\n");
    const importer = new LocalManualCodexResultImporter({ managedArtifactRoot: path.join(tempRoot, "artifacts") });

    await expect(
      importer.importResultBundle(
        importRequest({
          artifactRoot: fixture.artifactRoot,
          sandbox: fixture.sandbox,
          policy: fixture.policy,
          overrides: { manualLogPath: outside },
        }),
      ),
    ).rejects.toMatchObject({ code: "unsafe_path" });
  });

  it("rejects sandbox paths that are not inside the Orynt-managed worktree root", async () => {
    const fixture = await createImportFixture();
    const importer = new LocalManualCodexResultImporter({ managedArtifactRoot: path.join(tempRoot, "artifacts") });

    await expect(
      importer.inspectSandboxChanges(
        importRequest({
          artifactRoot: fixture.artifactRoot,
          sandbox: { ...fixture.sandbox, worktreePath: fixture.repositoryPath },
          policy: fixture.policy,
        }),
      ),
    ).rejects.toBeInstanceOf(CodexResultImporterFailure);
  });

  it("marks malformed logs for manual review without trusting their content", async () => {
    const fixture = await createImportFixture();
    await writeImportChange(fixture.worktreePath);
    await mkdir(fixture.artifactRoot, { recursive: true });
    const malformed = path.join(fixture.artifactRoot, "codex-log.bin");
    await writeFile(malformed, Buffer.from([0, 1, 2, 3]));
    const importer = new LocalManualCodexResultImporter({ managedArtifactRoot: path.join(tempRoot, "artifacts") });

    const bundle = await importer.importResultBundle(
      importRequest({
        artifactRoot: fixture.artifactRoot,
        sandbox: fixture.sandbox,
        policy: fixture.policy,
        overrides: { manualLogPath: malformed },
      }),
    );

    expect(bundle.status).toBe("manual_review_required");
    expect(bundle.failureReasons).toContain("malformed_log");
    expect(bundle.manualLog?.content).toBe("");
  });

  it("emits import lifecycle RunEvents including failure events", async () => {
    const fixture = await createImportFixture();
    await writeImportChange(fixture.worktreePath);
    await mkdir(fixture.artifactRoot, { recursive: true });
    await writeFile(path.join(fixture.artifactRoot, "codex-log.txt"), "Manual Codex fixture log\n");
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const sandbox = { ...fixture.sandbox, runId: run.id, taskId: run.taskId };
    const importer = new LocalManualCodexResultImporter({ managedArtifactRoot: path.join(tempRoot, "artifacts"), runStore: store });

    await importer.importResultBundle(
      importRequest({
        artifactRoot: fixture.artifactRoot,
        sandbox,
        policy: fixture.policy,
        overrides: { manualLogPath: path.join(fixture.artifactRoot, "codex-log.txt") },
      }),
    );
    await expect(
      importer.importResultBundle(
        importRequest({
          artifactRoot: path.join(tempRoot, "outside-artifacts"),
          sandbox,
          policy: fixture.policy,
        }),
      ),
    ).rejects.toBeInstanceOf(CodexResultImporterFailure);

    expect(store.listEvents(run.id).map((event) => event.type)).toEqual([
      "codex_result_import_requested",
      "codex_sandbox_diff_inspected",
      "codex_manual_log_imported",
      "codex_result_redacted",
      "codex_result_imported",
      "codex_result_import_requested",
      "codex_result_import_failed",
    ]);
  });
});
