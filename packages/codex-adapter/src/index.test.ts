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
  type CorePolicy,
  type RepositorySandbox,
} from "@codepawl/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CodexAdapterFailure, CodexResultImporterFailure, LocalCodexContractAdapter, LocalManualCodexResultImporter } from "./index";

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
      branchName: "codepawl/run-1-task-1",
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
  await git(["config", "user.email", "codepawl@example.test"], repositoryPath);
  await git(["config", "user.name", "CodePawl Test"], repositoryPath);
  await writeFile(path.join(repositoryPath, "packages", "README.md"), "initial\n");
  await writeFile(path.join(repositoryPath, "README.md"), "# Fixture\n");
  await git(["add", "README.md", "packages/README.md"], repositoryPath);
  await git(["commit", "-m", "initial"], repositoryPath);
  const baseCommit = await git(["rev-parse", "HEAD"], repositoryPath);
  const worktreePath = path.join(sandboxRoot, "repo-import-worktree");
  await mkdir(sandboxRoot, { recursive: true });
  await git(["worktree", "add", "-b", "codepawl/run-import", worktreePath, "HEAD"], repositoryPath);

  const policy = createConservativeCodingApprenticePolicy(repositoryPath, sandboxRoot);
  const sandbox: RepositorySandbox = {
    id: "sandbox-import",
    runId: "run-import",
    taskId: "task-import",
    repositoryPath,
    gitRoot: repositoryPath,
    worktreePath,
    branchName: "codepawl/run-import",
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

describe("LocalCodexContractAdapter", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "codepawl-codex-adapter-test-"));
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
});

describe("LocalManualCodexResultImporter", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "codepawl-codex-result-import-test-"));
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

  it("rejects sandbox paths that are not inside the CodePawl-managed worktree root", async () => {
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
