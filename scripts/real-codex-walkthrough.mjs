#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { LocalCodingApprenticeDemoOrchestrator } from "../packages/coding-apprentice/dist/index.js";
import { InMemoryRunStore } from "../packages/shared/dist/index.js";

const execFileAsync = promisify(execFile);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    maxBuffer: 1024 * 1024,
    ...options,
  });
}

async function createFixtureRepository(root) {
  const repositoryPath = path.join(root, "fixture-repo");
  await mkdir(path.join(repositoryPath, "packages"), { recursive: true });
  await mkdir(path.join(repositoryPath, "scripts"), { recursive: true });
  await writeFile(path.join(repositoryPath, "README.md"), "# Orynt real Codex fixture\n", "utf8");
  await writeFile(path.join(repositoryPath, "packages", "value.txt"), "initial value\n", "utf8");
  await writeFile(
    path.join(repositoryPath, "scripts", "pass.mjs"),
    [
      'import { readFileSync } from "node:fs";',
      'const value = readFileSync("packages/value.txt", "utf8").trim();',
      'if (value !== "controlled codex pass") {',
      '  console.error(`expected packages/value.txt to be exactly "controlled codex pass", got "${value}"`);',
      "  process.exit(1);",
      "}",
      'console.log("fixture validation passed");',
      "",
    ].join("\n"),
    "utf8",
  );
  await run("git", ["init"], { cwd: repositoryPath });
  await run("git", ["config", "user.email", "real-codex-walkthrough@example.invalid"], { cwd: repositoryPath });
  await run("git", ["config", "user.name", "Orynt Real Codex Walkthrough"], { cwd: repositoryPath });
  await run("git", ["add", "."], { cwd: repositoryPath });
  await run("git", ["commit", "-m", "Initial real Codex walkthrough fixture"], { cwd: repositoryPath });
  return repositoryPath;
}

function requireEventTypes(result, expectedTypes) {
  const types = result.events.map((event) => event.type);
  for (const type of expectedTypes) {
    assert(types.includes(type), `missing RunEvent ${type}`);
  }
}

async function readOptionalSnippet(filePath) {
  if (!filePath) {
    return "";
  }
  try {
    return (await readFile(filePath, "utf8")).slice(0, 4000);
  } catch {
    return "";
  }
}

async function assertCodexExecutionFinished(result) {
  if (result.codexExecutionResult?.status === "finished") {
    return;
  }
  const executionResult = result.codexExecutionResult;
  const diagnostics = {
    planStatus: result.codexExecutionPlan?.status,
    executablePath: result.codexExecutionPlan?.executablePath,
    status: executionResult?.status,
    exitCode: executionResult?.exitCode,
    timedOut: executionResult?.timedOut,
    failureReasons: executionResult?.failureReasons,
    summary: executionResult?.summary,
    stdoutPath: executionResult?.stdoutPath,
    stderrPath: executionResult?.stderrPath,
    stdout: await readOptionalSnippet(executionResult?.stdoutPath),
    stderr: await readOptionalSnippet(executionResult?.stderrPath),
  };
  throw new Error(`expected real Codex execution to finish\n${JSON.stringify(diagnostics, null, 2)}`);
}

function requireOptIn() {
  if (process.env.ORYNT_RUN_REAL_CODEX === "1") {
    return;
  }
  throw new Error(
    [
      "Real Codex walkthrough is opt-in because it may use local Codex auth, network, and model budget.",
      "Run with: ORYNT_RUN_REAL_CODEX=1 pnpm walkthrough:real-codex",
    ].join("\n"),
  );
}

async function runWalkthrough() {
  requireOptIn();

  const root = await mkdtemp(path.join(tmpdir(), "orynt-real-codex-walkthrough-"));
  const repositoryPath = await createFixtureRepository(root);
  const sandboxRoot = path.join(root, "sandbox");
  const artifactRoot = path.join(root, "artifacts");
  const memoryRoot = path.join(root, "memory");
  const runStore = new InMemoryRunStore();
  const orchestrator = new LocalCodingApprenticeDemoOrchestrator({ runStore });

  const result = await orchestrator.runDemo({
    goal:
      "In this disposable fixture repository, edit only packages/value.txt so it contains exactly: controlled codex pass",
    taskId: "task-real-codex-walkthrough",
    workspaceId: "workspace-local-real-codex",
    repositoryPath,
    sandboxRoot,
    artifactRoot,
    memoryRoot,
    validationCommands: ["node scripts/pass.mjs"],
    allowedVerificationCommands: ["node scripts/pass.mjs"],
    enableControlledCodexExecution: true,
    enableMemoryExtraction: true,
    userNotes: "Real Codex walkthrough must stay inside the disposable fixture repository.",
    createExecutionApproval: ({ run, plan }) => ({
      id: `${plan.id}-approval`,
      runId: run.id,
      planId: plan.id,
      status: "approved",
      approvedBy: "local-operator",
      reason: "Operator explicitly opted into the real Codex walkthrough with ORYNT_RUN_REAL_CODEX=1.",
      approvedAt: new Date().toISOString(),
    }),
  });

  assert(result.codexExecutionPlan?.status === "approval_required", "expected Codex execution plan to require approval");
  await assertCodexExecutionFinished(result);
  assert(result.importBundle.status === "imported", "expected imported Codex result bundle");
  assert(result.verificationResult.status === "pass", `expected verifier pass, got ${result.verificationResult.status}`);
  assert(result.episodes.length > 0, "expected memory episodes");

  requireEventTypes(result, [
    "run_started",
    "goal_received",
    "sandbox_created",
    "codex_contract_created",
    "verification_planned",
    "codex_execution_planned",
    "codex_execution_approval_required",
    "codex_execution_approved",
    "codex_execution_started",
    "codex_execution_output_recorded",
    "codex_execution_finished",
    "codex_execution_result_ready",
    "codex_result_import_requested",
    "codex_result_imported",
    "verifier_input_created",
    "verification_started",
    "verification_passed",
    "memory_extraction_finished",
    "run_finished",
  ]);

  const changedValue = await readFile(path.join(result.sandbox.worktreePath, "packages", "value.txt"), "utf8");
  assert(changedValue.trim() === "controlled codex pass", "expected real Codex to update packages/value.txt");

  const output = {
    runId: result.run.id,
    repositoryPath,
    sandboxWorktreePath: result.sandbox.worktreePath,
    artifactRoot: path.join(artifactRoot, result.run.id),
    contractArtifactPath: result.contractArtifact.markdownPath,
    verifierInputPath: result.verifierInputPath,
    codexExecutablePath: result.codexExecutionPlan.executablePath,
    codexExecutionStatus: result.codexExecutionResult.status,
    verificationStatus: result.verificationResult.status,
    resultBundleId: result.importBundle.id,
    memoryEpisodeCount: result.episodes.length,
    eventTypes: runStore.listEvents(result.run.id).map((event) => event.type),
  };

  console.log(JSON.stringify(output, null, 2));
  if (process.env.ORYNT_KEEP_WALKTHROUGH === "1") {
    console.log(`Preserved real Codex walkthrough workspace: ${root}`);
  } else {
    await rm(root, { recursive: true, force: true });
  }
}

runWalkthrough().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
