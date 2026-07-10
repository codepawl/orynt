import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryRunStore, type RunEvent } from "@codepawl/shared";

import { LocalCodingApprenticeDemoOrchestrator, runDesktopRepositoryBeta } from "./index";

const execFileAsync = promisify(execFile);

let tempRoot = "";

async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return String(stdout).trim();
}

async function createFixtureRepository(name = "repo") {
  const repositoryPath = path.join(tempRoot, name);
  await mkdir(path.join(repositoryPath, "packages"), { recursive: true });
  await mkdir(path.join(repositoryPath, "scripts"), { recursive: true });
  await git(["init"], repositoryPath);
  await git(["config", "user.email", "orynt@example.test"], repositoryPath);
  await git(["config", "user.name", "Orynt Test"], repositoryPath);
  await writeFile(path.join(repositoryPath, "README.md"), "# Fixture\n");
  await writeFile(path.join(repositoryPath, "packages", "value.txt"), "initial\n");
  await writeFile(path.join(repositoryPath, "scripts", "pass.mjs"), "console.log('verification ok apiKey=sk-shouldberedacted123');\n");
  await git(["add", "README.md", "packages/value.txt", "scripts/pass.mjs"], repositoryPath);
  await git(["commit", "-m", "initial"], repositoryPath);
  return repositoryPath;
}

async function createFakeCodexBinary() {
  const binDir = path.join(tempRoot, "bin");
  const fakeCodex = path.join(binDir, "codex");
  await mkdir(binDir, { recursive: true });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex >= 0) {
  fs.writeFileSync(process.argv[outputIndex + 1], "Fake Codex completed token=sk-orchestratorsecret123\\n");
}
fs.writeFileSync(path.join(cwd, "packages", "value.txt"), "controlled codex pass\\n");
console.log("fake codex finished");
`,
  );
  await chmod(fakeCodex, 0o755);
  return binDir;
}

async function createFailingFakeCodexBinary() {
  const binDir = path.join(tempRoot, "failing-bin");
  const fakeCodex = path.join(binDir, "codex");
  await mkdir(binDir, { recursive: true });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
console.log('{"type":"thread.started","thread_id":"thread-failing-auth"}');
console.error('HTTP error: 401 Unauthorized');
process.exit(1);
`,
  );
  await chmod(fakeCodex, 0o755);
  return binDir;
}

async function createReadOnlyFakeCodexBinary() {
  const binDir = path.join(tempRoot, "read-only-bin");
  const fakeCodex = path.join(binDir, "codex");
  await mkdir(binDir, { recursive: true });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
let contract = "";
process.stdin.on("data", (chunk) => { contract += chunk; });
process.stdin.on("end", () => {
  const outputIndex = process.argv.indexOf("--output-last-message");
  if (contract.includes("Create a complete runnable implementation")) {
    console.error("read-only prompt was incorrectly framed as an implementation task");
    process.exit(1);
  }
  if (!contract.includes("read-only repository analysis task")) {
    console.error("missing read-only repository contract guidance");
    process.exit(2);
  }
  if (outputIndex >= 0) fs.writeFileSync(process.argv[outputIndex + 1], "Read-only codebase summary completed\\n");
  console.log("read-only fake codex completed");
});
`,
  );
  await chmod(fakeCodex, 0o755);
  return binDir;
}

async function createFakeFullstackCodexBinary() {
  const binDir = path.join(tempRoot, "fullstack-bin");
  const fakeCodex = path.join(binDir, "codex");
  await mkdir(binDir, { recursive: true });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
if (!fs.existsSync(path.join(cwd, ".codex", "orynt-beta-verify.mjs"))) {
  console.error("missing verifier script before execution");
  process.exit(2);
}
fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
fs.mkdirSync(path.join(cwd, "server"), { recursive: true });
fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { start: "node server/index.js", test: "node .codex/orynt-beta-verify.mjs" } }, null, 2));
fs.writeFileSync(path.join(cwd, "index.html"), "<div id=app>Orynt fullstack app</div>\\n<script type=module src=/src/main.js></script>\\n");
fs.writeFileSync(path.join(cwd, "src", "main.js"), "document.querySelector('#app').textContent = 'Orynt fullstack dashboard';\\n");
fs.writeFileSync(path.join(cwd, "server", "index.js"), "import http from 'node:http';\\nhttp.createServer((req,res)=>res.end(JSON.stringify({ok:true}))).listen(3000);\\n");
const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex >= 0) fs.writeFileSync(process.argv[outputIndex + 1], "Fake fullstack Codex completed\\n");
console.log("fake fullstack codex finished");
`,
  );
  await chmod(fakeCodex, 0o755);
  return binDir;
}

function demoRequest(repositoryPath: string, overrides: Partial<Parameters<LocalCodingApprenticeDemoOrchestrator["runDemo"]>[0]> = {}) {
  return {
    goal: "Import a manual Codex result and verify it",
    taskId: "task-import-verify",
    workspaceId: "workspace-test",
    repositoryPath,
    sandboxRoot: path.join(tempRoot, "sandboxes"),
    artifactRoot: path.join(tempRoot, "artifacts"),
    validationCommands: ["node scripts/pass.mjs"],
    allowedVerificationCommands: ["node scripts/pass.mjs"],
    ...overrides,
  };
}

describe("LocalCodingApprenticeDemoOrchestrator", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "orynt-coding-apprentice-test-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("runs an imported manual change through verifier and records a complete ordered timeline", async () => {
    const repositoryPath = await createFixtureRepository();
    const orchestrator = new LocalCodingApprenticeDemoOrchestrator();

    const result = await orchestrator.runDemo(
      demoRequest(repositoryPath, {
        applyManualChange: async ({ sandbox, artifactRoot }) => {
          await writeFile(path.join(sandbox.worktreePath, "packages", "value.txt"), "manual pass\n");
          await writeFile(path.join(artifactRoot, "codex-log.md"), "Manual Codex fixture result with token=sk-importsecret123\n");
          return { manualLogPath: path.join(artifactRoot, "codex-log.md") };
        },
      }),
    );

    expect(result.importBundle.status).toBe("imported");
    expect(result.verificationResult.status).toBe("pass");
    expect(result.importBundle.manualLog?.content).not.toContain("sk-importsecret123");
    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining(["codex_contract", "codex_contract_metadata", "codex_result_bundle", "verifier_input", "validation_report"]),
    );
    expect(JSON.parse(await readFile(result.verifierInputPath, "utf8"))).toMatchObject({
      runId: result.run.id,
      taskId: result.run.taskId,
      config: { requireChangedFiles: true },
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "run_started",
      "goal_received",
      "sandbox_inspected",
      "sandbox_create_requested",
      "sandbox_create_allowed",
      "sandbox_created",
      "codex_contract_requested",
      "codex_contract_created",
      "codex_manual_next_step",
      "codex_result_import_requested",
      "codex_sandbox_diff_inspected",
      "codex_manual_log_imported",
      "codex_result_redacted",
      "codex_result_imported",
      "verifier_input_created",
      "verification_planned",
      "verification_policy_checked",
      "verification_started",
      "verification_command_started",
      "verification_command_finished",
      "verification_diff_checked",
      "verification_recorded",
      "verification_passed",
      "memory_extraction_started",
      "memory_redaction_applied",
      "memory_episode_written",
      "memory_episode_written",
      "memory_episode_written",
      "memory_extraction_finished",
      "run_finished",
    ]);
    expect(result.memoryExtractionResult.episodes.map((episode) => episode.kind)).toEqual(
      expect.arrayContaining(["run_episode", "command_observation", "allowed_scope_pattern"]),
    );
  });

  it("runs the desktop repository sidecar and writes the beta artifact manifest", async () => {
    const repositoryPath = await createFixtureRepository("desktop-repo");
    const streamedEvents: RunEvent[] = [];
    const result = await runDesktopRepositoryBeta({
      goal: "Run the desktop beta repository smoke",
      taskId: "task-desktop-repository-smoke",
      workspaceId: "workspace-desktop",
      repositoryPath,
      sandboxRoot: path.join(tempRoot, "desktop-sandboxes"),
      artifactRoot: path.join(tempRoot, "desktop-artifacts"),
      memoryRoot: path.join(tempRoot, "desktop-memory"),
      modelConnection: {
        providerId: "openai-api",
        providerLabel: "OpenAI API",
        modelId: "gpt-5.5",
        modelLabel: "GPT-5.5",
        authMethod: "apiKeyEnv",
        envKey: "ORYNT_TEST_OPENAI_API_KEY",
      },
      thinkingEffort: "high",
      onRunEvent: (event) => streamedEvents.push(event),
    });

    const manifest = JSON.parse(await readFile(result.artifactManifestPath, "utf8")) as {
      runId: string;
      repositoryPath: string;
      modelConnection?: { providerId: string; modelId: string; modelLabel: string; authMethod: string; envKey?: string };
      thinkingEffort?: string;
      budgetedAgent?: {
        mode: string;
        compactWorkingState: { activeChunks: string[]; hardConstraints: string[] };
        selectedOptionId: string;
        cost: { costPerSuccessfulTask?: number };
      };
      artifacts: Record<string, string | null>;
      eventTypes: string[];
    };

    expect(result.status).toBe("pass");
    expect(result.runId).toMatch(/^run-desktop-[a-f0-9]{10}-1$/);
    expect(result.eventCount).toBeGreaterThan(0);
    expect(manifest).toMatchObject({
      runId: result.runId,
      repositoryPath,
      modelConnection: {
        providerId: "openai-api",
        modelId: "gpt-5.5",
        modelLabel: "GPT-5.5",
        authMethod: "apiKeyEnv",
        envKey: "ORYNT_TEST_OPENAI_API_KEY",
      },
      thinkingEffort: "high",
      budgetedAgent: {
        mode: "HABIT",
        compactWorkingState: {
          activeChunks: expect.any(Array),
          hardConstraints: expect.arrayContaining(["supervised repository run"]),
        },
        selectedOptionId: expect.stringMatching(/^O[0-9]+$/),
        cost: {
          costPerSuccessfulTask: expect.any(Number),
        },
      },
      artifacts: {
        contract: expect.stringContaining("codex-contract.md"),
        eventLog: expect.stringContaining("run-events.json"),
        verifierInput: expect.stringContaining("verifier-input.json"),
        verificationResult: expect.stringContaining("verification-result.json"),
        redactedLog: expect.stringContaining("manual-result.redacted.log"),
        memoryStore: expect.stringContaining("memory-store.json"),
      },
    });
    expect(manifest.eventTypes).toContain("run_finished");
    expect(streamedEvents.map((event) => event.type)).toContain("run_started");
    expect(streamedEvents.at(-1)?.type).toBe("run_finished");
  });

  it("accepts a selected subdirectory by resolving the git repository root", async () => {
    const repositoryPath = await createFixtureRepository("desktop-nested-repo");
    const selectedDirectory = path.join(repositoryPath, "packages");
    const result = await runDesktopRepositoryBeta({
      goal: "Run from a selected repository subdirectory",
      taskId: "task-desktop-nested-repository-smoke",
      workspaceId: "workspace-desktop",
      repositoryPath: selectedDirectory,
      sandboxRoot: path.join(tempRoot, "desktop-nested-sandboxes"),
      artifactRoot: path.join(tempRoot, "desktop-nested-artifacts"),
      memoryRoot: path.join(tempRoot, "desktop-nested-memory"),
      modelConnection: {
        providerId: "openai-api",
        providerLabel: "OpenAI API",
        modelId: "gpt-5.5",
        modelLabel: "GPT-5.5",
        authMethod: "apiKeyEnv",
        envKey: "ORYNT_TEST_OPENAI_API_KEY",
      },
      thinkingEffort: "medium",
    });

    const manifest = JSON.parse(await readFile(result.artifactManifestPath, "utf8")) as {
      repositoryPath: string;
      status: string;
    };

    expect(result.status).toBe("pass");
    expect(manifest).toMatchObject({
      repositoryPath,
      status: "pass",
    });
  });

  it("enables controlled Codex execution for the selected Codex CLI provider", async () => {
    const repositoryPath = await createFixtureRepository("desktop-codex-repo");
    const codexPathEnv = await createFakeCodexBinary();
    const previousPath = process.env.PATH;
    process.env.PATH = `${codexPathEnv}${path.delimiter}${previousPath ?? ""}`;
    try {
      const result = await runDesktopRepositoryBeta({
        goal: "Use the selected Codex model for the desktop repository run",
        taskId: "task-desktop-codex-repository-smoke",
        workspaceId: "workspace-desktop",
        repositoryPath,
        sandboxRoot: path.join(tempRoot, "desktop-codex-sandboxes"),
        artifactRoot: path.join(tempRoot, "desktop-codex-artifacts"),
        memoryRoot: path.join(tempRoot, "desktop-codex-memory"),
        modelConnection: {
          providerId: "codex-cli",
          providerLabel: "Codex CLI",
          modelId: "gpt-5.5",
          modelLabel: "GPT-5.5",
          authMethod: "codexCliSession",
        },
        thinkingEffort: "high",
      });
      const manifest = JSON.parse(await readFile(result.artifactManifestPath, "utf8")) as { eventTypes: string[] };

      expect(result.status).toBe("pass");
      expect(manifest.eventTypes).toEqual(
        expect.arrayContaining([
          "codex_execution_started",
          "codex_execution_output_recorded",
          "codex_execution_finished",
          "codex_execution_result_ready",
        ]),
      );
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("treats read-only codebase prompts as inspection runs instead of implementation tasks", async () => {
    const repositoryPath = await createFixtureRepository("desktop-read-codebase-repo");
    const codexPathEnv = await createReadOnlyFakeCodexBinary();
    const previousPath = process.env.PATH;
    process.env.PATH = `${codexPathEnv}${path.delimiter}${previousPath ?? ""}`;
    try {
      const result = await runDesktopRepositoryBeta({
        goal: "đọc codebase của repo này",
        taskId: "task-desktop-read-codebase",
        workspaceId: "workspace-desktop",
        repositoryPath,
        sandboxRoot: path.join(tempRoot, "desktop-read-codebase-sandboxes"),
        artifactRoot: path.join(tempRoot, "desktop-read-codebase-artifacts"),
        memoryRoot: path.join(tempRoot, "desktop-read-codebase-memory"),
        modelConnection: {
          providerId: "codex-cli",
          providerLabel: "Codex CLI",
          modelId: "gpt-5.5",
          modelLabel: "GPT-5.5",
          authMethod: "codexCliSession",
        },
        thinkingEffort: "high",
      });
      const manifest = JSON.parse(await readFile(result.artifactManifestPath, "utf8")) as {
        eventTypes: string[];
        artifacts: { contract: string; verifierInput: string; redactedLog: string | null };
      };
      const contract = await readFile(manifest.artifacts.contract, "utf8");
      const verifierInput = JSON.parse(await readFile(manifest.artifacts.verifierInput, "utf8")) as { config: { requireChangedFiles: boolean } };
      const lastMessage = manifest.artifacts.redactedLog ? await readFile(manifest.artifacts.redactedLog, "utf8") : "";

      expect(result.status).toBe("pass");
      expect(contract).toContain("read-only repository analysis task");
      expect(contract).not.toContain("Create a complete runnable implementation");
      expect(verifierInput.config.requireChangedFiles).toBe(false);
      expect(lastMessage).toContain("Read-only codebase summary completed");
      expect(manifest.eventTypes).toContain("codex_execution_finished");
      expect(manifest.eventTypes).toContain("verification_passed");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("can complete a fullstack web app task through the selected Codex CLI path", async () => {
    const repositoryPath = await createFixtureRepository("desktop-fullstack-repo");
    const codexPathEnv = await createFakeFullstackCodexBinary();
    const previousPath = process.env.PATH;
    process.env.PATH = `${codexPathEnv}${path.delimiter}${previousPath ?? ""}`;
    try {
      const result = await runDesktopRepositoryBeta({
        goal: "Create a complex fullstack tech web app with frontend dashboard and backend API",
        taskId: "task-desktop-fullstack-web",
        workspaceId: "workspace-desktop",
        repositoryPath,
        sandboxRoot: path.join(tempRoot, "desktop-fullstack-sandboxes"),
        artifactRoot: path.join(tempRoot, "desktop-fullstack-artifacts"),
        memoryRoot: path.join(tempRoot, "desktop-fullstack-memory"),
        modelConnection: {
          providerId: "codex-cli",
          providerLabel: "Codex CLI",
          modelId: "gpt-5.5",
          modelLabel: "GPT-5.5",
          authMethod: "codexCliSession",
        },
        thinkingEffort: "high",
      });
      const manifest = JSON.parse(await readFile(result.artifactManifestPath, "utf8")) as {
        eventTypes: string[];
        artifacts: { redactedLog: string | null };
      };

      expect(result.status).toBe("pass");
      expect(manifest.eventTypes).toContain("verification_passed");
      expect(manifest.artifacts.redactedLog).toContain("codex-execution-last-message.redacted.md");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("uses selected provider metadata in repository run ledger and contract context", async () => {
    const repositoryPath = await createFixtureRepository("model-context-repo");
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(
      demoRequest(repositoryPath, {
        modelConnection: {
          providerId: "openai-api",
          providerLabel: "OpenAI API",
          modelId: "gpt-5.5",
          modelLabel: "GPT-5.5",
          authMethod: "apiKeyEnv",
          envKey: "ORYNT_TEST_OPENAI_API_KEY",
        },
        thinkingEffort: "xhigh",
        applyManualChange: async ({ sandbox, artifactRoot }) => {
          await writeFile(path.join(sandbox.worktreePath, "packages", "value.txt"), "manual pass\n");
          await writeFile(path.join(artifactRoot, "codex-log.md"), "Manual Codex fixture result\n");
          return { manualLogPath: path.join(artifactRoot, "codex-log.md") };
        },
      }),
    );

    const contract = await readFile(result.contractArtifact.markdownPath, "utf8");

    expect(result.ledgerRun.primaryModelProvider).toBe("openai-api");
    expect(result.ledgerRun.primaryModelName).toBe("gpt-5.5");
    expect(contract).toContain("Selected model provider: OpenAI API (openai-api).");
    expect(contract).toContain("Selected model: GPT-5.5 (gpt-5.5).");
    expect(contract).toContain("Thinking effort: xhigh.");
  });

  it("returns a verifier no-change failure when imported result has no changed files", async () => {
    const repositoryPath = await createFixtureRepository();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(demoRequest(repositoryPath));

    expect(result.importBundle.status).toBe("manual_review_required");
    expect(result.importBundle.failureReasons).toContain("no_changes");
    expect(result.verificationResult.status).toBe("fail");
    expect(result.verificationResult.verdict.failureClass).toBe("no_changes");
    expect(result.memoryExtractionResult.episodes.map((episode) => episode.kind)).toContain("run_episode");
    expect(result.events.map((event) => event.type)).toContain("manual_review_required");
    expect(result.events.at(-1)?.verdict?.status).toBe("fail");
  });

  it("runs an approved controlled Codex execution through import while keeping verification separate", async () => {
    const repositoryPath = await createFixtureRepository();
    const codexPathEnv = await createFakeCodexBinary();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(
      demoRequest(repositoryPath, {
        enableControlledCodexExecution: true,
        codexPathEnv,
        createExecutionApproval: ({ plan, run }) => ({
          id: `approval-${plan.id}`,
          runId: run.id,
          planId: plan.id,
          status: "approved",
          approvedBy: "operator",
          reason: "Test approves controlled Codex execution.",
          approvedAt: "2026-06-26T00:00:00.000Z",
        }),
      }),
    );

    expect(result.codexExecutionPlan?.status).toBe("approval_required");
    expect(result.codexExecutionResult?.status).toBe("finished");
    expect(result.importBundle.status).toBe("imported");
    expect(result.importBundle.manualLog?.content).not.toContain("sk-orchestratorsecret123");
    expect(result.verificationResult.status).toBe("pass");
    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "verification_planned",
        "codex_execution_planned",
        "codex_execution_approval_required",
        "codex_execution_approved",
        "codex_execution_started",
        "codex_execution_output_recorded",
        "codex_execution_finished",
        "codex_execution_result_ready",
        "codex_result_import_requested",
        "verifier_input_created",
        "verification_started",
      ]),
    );
  });

  it("fails fast instead of importing stdout when controlled Codex execution exits non-zero", async () => {
    const repositoryPath = await createFixtureRepository("desktop-codex-fail-repo");
    const codexPathEnv = await createFailingFakeCodexBinary();
    const runStore = new InMemoryRunStore({ runIdPrefix: "codex-fail" });
    const orchestrator = new LocalCodingApprenticeDemoOrchestrator({ runStore });

    await expect(
      orchestrator.runDemo(
        demoRequest(repositoryPath, {
          enableControlledCodexExecution: true,
          codexPathEnv,
          createExecutionApproval: ({ plan, run }) => ({
            id: `approval-${plan.id}`,
            runId: run.id,
            planId: plan.id,
            status: "approved",
            approvedBy: "operator",
            reason: "Test approves controlled Codex execution.",
            approvedAt: "2026-07-04T02:00:00.000Z",
          }),
        }),
      ),
    ).rejects.toThrow("Controlled Codex execution failed");

    const run = runStore.getRun("run-codex-fail-1");
    const eventTypes = runStore.listEvents("run-codex-fail-1").map((event) => event.type);
    expect(run?.status).toBe("failed");
    expect(eventTypes).toContain("codex_execution_failed");
    expect(eventTypes).not.toContain("codex_execution_result_ready");
    expect(eventTypes).not.toContain("codex_result_import_requested");
    expect(eventTypes).not.toContain("codex_result_imported");
    expect(eventTypes).not.toContain("verification_started");
    expect(eventTypes).not.toContain("run_finished");
  });

  it("records controlled run usage in the canonical agent ledger", async () => {
    const repositoryPath = await createFixtureRepository();
    const codexPathEnv = await createFakeCodexBinary();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(
      demoRequest(repositoryPath, {
        userId: "user-ledger",
        planId: "managed-ai",
        enableControlledCodexExecution: true,
        codexPathEnv,
        createExecutionApproval: ({ plan, run }) => ({
          id: `approval-${plan.id}`,
          runId: run.id,
          planId: plan.id,
          status: "approved",
          approvedBy: "operator",
          reason: "Test approves controlled Codex execution.",
          approvedAt: "2026-07-04T01:00:00.000Z",
        }),
      }),
    );

    expect(result.ledgerRun.id).toBe(result.run.id);
    expect(result.ledgerRun.status).toBe("completed");
    expect(result.ledgerRun.userId).toBe("user-ledger");
    expect(result.ledgerRun.planId).toBe("managed-ai");
    expect(result.ledgerRun.approvalCount).toBe(1);
    expect(result.ledgerRun.estimatedCostUsd).toBeGreaterThan(0);
    expect(result.usageSummary.userId).toBe("user-ledger");
    expect(result.usageSummary.runCount).toBe(1);
    expect(result.usageSummary.gatewayActionCount).toBeGreaterThanOrEqual(1);
    expect(result.artifacts.map((artifact) => artifact.id)).toContain(`${result.importBundle.id}-verifier-input`);
    expect(result.usageSummary.artifactCount).toBe(result.artifacts.length);
    expect(result.usageSummary.permissionDecisionCounts.approved).toBe(1);
    expect(result.usageSummary.estimatedCostUsd).toBeUndefined();
    expect(result.adminUsageSummary.artifactCount).toBe(result.artifacts.length);
    expect(result.adminUsageSummary.estimatedCostUsd).toBeCloseTo(result.ledgerRun.estimatedCostUsd, 8);
  });

  it("attaches a deterministic cognitive kernel trace to the supervised run", async () => {
    const repositoryPath = await createFixtureRepository();
    const orchestrator = new LocalCodingApprenticeDemoOrchestrator();

    const result = await orchestrator.runDemo(
      demoRequest(repositoryPath, {
        applyManualChange: async ({ sandbox }) => {
          await writeFile(path.join(sandbox.worktreePath, "packages", "value.txt"), "manual pass\n");
        },
      }),
    );

    expect(result.cognitiveKernelResult.status).toBe("completed");
    expect(result.cognitiveKernelResult.phases).toEqual(["observe", "retrieve", "plan", "gate", "execute", "verify", "learn", "summarize"]);
    expect(result.cognitiveKernelResult.memoryHits.map((hit) => hit.kind)).toEqual(expect.arrayContaining(["episodic"]));
    expect(result.cognitiveKernelResult.actionDecisions[0]).toMatchObject({ decision: "allow" });
    expect(result.cognitiveKernelResult.gatewayResults[0]).toMatchObject({
      observation: "verification pass",
    });
    expect(result.cognitiveGatewayResult).toMatchObject({
      status: "executed",
      permission: {
        tier: "safe",
        decision: "auto_allowed",
      },
    });
    expect(result.cognitiveGatewayResult.evidence.map((item) => item.artifactType)).toContain("trace");
    expect(result.cognitiveKernelResult.verifications[0]).toMatchObject({
      status: "pass",
      expectedObservation: "verification pass",
      actualObservation: "verification pass",
    });
  });

  it("captures user feedback as candidate semantic memory and falls back when no approved skill is available", async () => {
    const repositoryPath = await createFixtureRepository();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(
      demoRequest(repositoryPath, {
        userNotes: "Correction: run node scripts/pass.mjs before claiming completion token=sk-feedbacksecret123",
        applyManualChange: async ({ sandbox }) => {
          await writeFile(path.join(sandbox.worktreePath, "packages", "value.txt"), "manual pass\n");
        },
      }),
    );

    expect(result.feedbackMemory).toMatchObject({
      status: "candidate",
      sensitivity: "internal",
      confidence: 0.7,
    });
    expect(result.feedbackMemory?.summary).not.toContain("sk-feedbacksecret123");
    expect(result.skillInvocationPlan).toMatchObject({
      status: "fallback",
      fallbackReason: "no_matching_skill",
      executable: false,
    });
    expect(result.skillInvocationPlan.requiredApprovals).toContain("operator review required before creating or promoting a reusable skill");
  });

  it("does not execute blocked verification commands", async () => {
    const repositoryPath = await createFixtureRepository();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(
      demoRequest(repositoryPath, {
        allowedVerificationCommands: [],
        applyManualChange: async ({ sandbox }) => {
          await writeFile(path.join(sandbox.worktreePath, "packages", "value.txt"), "manual pass\n");
        },
      }),
    );

    expect(result.verificationResult.status).toBe("fail");
    expect(result.verificationResult.verdict.failureClass).toBe("policy_blocked");
    expect(result.verificationResult.evidence.filter((item) => item.kind === "command")).toHaveLength(0);
  });

  it("fails verification when imported changes touch paths outside policy scope", async () => {
    const repositoryPath = await createFixtureRepository();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(
      demoRequest(repositoryPath, {
        applyManualChange: async ({ sandbox }) => {
          await writeFile(path.join(sandbox.worktreePath, "outside.txt"), "unexpected\n");
        },
      }),
    );

    expect(result.importBundle.status).toBe("manual_review_required");
    expect(result.importBundle.failureReasons).toContain("unexpected_file_touch");
    expect(result.verificationResult.status).toBe("fail");
    expect(result.verificationResult.verdict.failureClass).toBe("unexpected_file_touch");
  });

  it("preserves artifact references for import and verification handoff", async () => {
    const repositoryPath = await createFixtureRepository();
    const result = await new LocalCodingApprenticeDemoOrchestrator().runDemo(
      demoRequest(repositoryPath, {
        applyManualChange: async ({ sandbox, artifactRoot }) => {
          await writeFile(path.join(sandbox.worktreePath, "packages", "value.txt"), "manual pass\n");
          await writeFile(path.join(artifactRoot, "validation.log"), "node scripts/pass.mjs\nPASS\n");
          return { validationTranscriptPath: path.join(artifactRoot, "validation.log") };
        },
      }),
    );

    const artifactIds = result.events.flatMap((event) => event.artifacts.map((artifact) => artifact.id));
    expect(artifactIds).toContain(`${result.importBundle.id}-json`);
    expect(artifactIds).toContain(`${result.importBundle.id}-verifier-input`);
    expect(result.verificationResult.artifacts.map((artifact) => artifact.kind)).toEqual(["validation_report"]);
    expect(result.summary).toContain("Verification pass");
  });
});
