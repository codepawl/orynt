import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createConservativeCodingApprenticePolicy,
  createDefaultRunBudget,
  InMemoryRunStore,
  type CodexContractRequest,
} from "@codepawl/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CodexAdapterFailure, LocalCodexContractAdapter } from "./index";

let tempRoot = "";

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
