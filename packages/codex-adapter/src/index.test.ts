import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  createConservativeCodingApprenticePolicy,
  createDefaultRunBudget,
  InMemoryRunStore,
  type CodexContractRequest,
  type CodexExecutionApproval,
  type CorePolicy,
  type RepositorySandbox,
  type VerificationPlan,
} from "@codepawl/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    validationCommands: ["pnpm test:contracts", "pnpm build:desktop"],
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
  await writeFile(path.join(worktreePath, "packages", "feature.txt"), "new feature\n");
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
    validationCommands: ["pnpm test:contracts"],
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

describe("LocalCodexContractAdapter", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "orynt-codex-adapter-test-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("generates the canonical work-contract sections and policy constraints", () => {
    const request = createRequest();
    const contract = new LocalCodexContractAdapter({ managedArtifactRoot: path.join(tempRoot, "artifacts") }).createContract(request);

    expect(contract.markdown).toContain("## Goal");
    expect(contract.markdown).toContain("## Context");
    expect(contract.markdown).toContain("## Constraints");
    expect(contract.markdown).toContain("## Done when");
    expect(contract.markdown).toContain(`Sandbox path: ${request.sandbox.worktreePath}`);
    expect(contract.markdown).toContain("Allowed paths: apps/**, packages/**, .codex/**, README.md, PRODUCT.md");
    expect(contract.markdown).toContain("Blocked commands: git push, git merge, git branch -D, rm -rf, sudo, credential, secret");
    expect(contract.markdown).toContain("Max model tokens: 120000");
    expect(contract.markdown).toContain("- pnpm test:contracts");
    expect(contract.metadata.validationCommands).toEqual(["pnpm test:contracts", "pnpm build:desktop"]);
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

  it("blocks controlled execution until the matching approval is granted", async () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const request = createRequest({ runId: run.id });
    await mkdir(request.sandbox.worktreePath, { recursive: true });
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env node
console.log("fake codex should not run without approval");
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
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env node
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
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env node
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
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env node
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
    const { binDir } = await createExecutableCodexFixture(`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
const stdin = fs.readFileSync(0, "utf8");
const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex >= 0) {
  fs.writeFileSync(process.argv[outputIndex + 1], "token=sk-fakelastmessagesecret123\\n");
}
fs.writeFileSync(path.join(cwd, "packages", "fake-codex.txt"), "changed by fake codex\\n");
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
    expect(result.stdoutSummary).not.toContain("sk-fakecodexsecret123");
    expect(result.stderrSummary).not.toContain("Bearer fakecodexstderr12345");
    expect(result.redaction.applied).toBe(true);
    expect(result.artifacts.map((item) => item.kind)).toEqual(expect.arrayContaining(["codex_execution_log", "codex_execution_result"]));
    expect(await readFile(path.join(request.sandbox.worktreePath, "packages", "fake-codex.txt"), "utf8")).toContain("changed by fake codex");
    expect(importRequest).toMatchObject({
      runId: run.id,
      taskId: run.taskId,
      sandbox: request.sandbox,
      artifactRoot: request.artifactRoot,
      validationCommands: request.validationCommands,
    });
    expect(importRequest.manualLogPath).toBe(result.lastMessagePath ?? result.stdoutPath);
    expect(store.listEvents(run.id).map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "codex_execution_planned",
        "codex_execution_approval_required",
        "codex_execution_approved",
        "codex_execution_started",
        "codex_execution_output_recorded",
        "codex_execution_finished",
        "codex_execution_result_ready",
      ]),
    );
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
    expect(JSON.parse(await readFile(path.join(fixture.artifactRoot, "codex-result-import.json"), "utf8"))).toMatchObject({
      runId: fixture.sandbox.runId,
      status: "imported",
      patch: { hasChanges: true },
    });
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

  it("imports an optional validation transcript and creates verifier input without running verification", async () => {
    const fixture = await createImportFixture();
    await writeImportChange(fixture.worktreePath);
    await mkdir(fixture.artifactRoot, { recursive: true });
    await writeFile(path.join(fixture.artifactRoot, "validation.log"), "pnpm test:contracts\nPASS\n");
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
