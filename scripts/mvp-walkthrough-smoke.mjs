#!/usr/bin/env node
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { LocalCodingApprenticeDemoOrchestrator } from "../packages/coding-apprentice/dist/index.js";
import { LocalSkillRegistry, LocalSkillReplayPlanner, SkillCandidateBuilder } from "../packages/skill-registry/dist/index.js";
import { InMemoryRunStore, createConservativeCodingApprenticePolicy } from "../packages/shared/dist/index.js";

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
  await writeFile(path.join(repositoryPath, "README.md"), "# Orynt walkthrough fixture\n", "utf8");
  await writeFile(path.join(repositoryPath, "packages", "value.txt"), "initial value\n", "utf8");
  await writeFile(
    path.join(repositoryPath, "scripts", "pass.mjs"),
    [
      'import { readFileSync } from "node:fs";',
      'const value = readFileSync("packages/value.txt", "utf8");',
      'if (!value.includes("controlled codex pass")) {',
      '  console.error("expected fake Codex to update packages/value.txt");',
      "  process.exit(1);",
      "}",
      'console.log("fixture validation passed");',
      "",
    ].join("\n"),
    "utf8",
  );
  await run("git", ["init"], { cwd: repositoryPath });
  await run("git", ["config", "user.email", "walkthrough@example.invalid"], { cwd: repositoryPath });
  await run("git", ["config", "user.name", "Orynt Walkthrough"], { cwd: repositoryPath });
  await run("git", ["add", "."], { cwd: repositoryPath });
  await run("git", ["commit", "-m", "Initial walkthrough fixture"], { cwd: repositoryPath });
  return repositoryPath;
}

async function createFakeCodex(root) {
  const binDir = path.join(root, "fake-bin");
  await mkdir(binDir, { recursive: true });
  const codexPath = path.join(binDir, "codex");
  await writeFile(
    codexPath,
    [
      "#!/usr/bin/env node",
      'const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");',
      'const path = require("node:path");',
      'const contract = readFileSync(0, "utf8");',
      'if (!contract.includes("Coding Apprentice")) {',
      '  console.error("contract artifact was not provided to fake Codex");',
      "  process.exit(2);",
      "}",
      'const rawSecret = ["sk", "walkthrough", "runtime", "secret"].join("-");',
      'mkdirSync(path.join(process.cwd(), "packages"), { recursive: true });',
      'writeFileSync(path.join(process.cwd(), "packages", "value.txt"), "controlled codex pass\\n", "utf8");',
      'const outIndex = process.argv.indexOf("--output-last-message");',
      "if (outIndex >= 0 && process.argv[outIndex + 1]) {",
      '  writeFileSync(process.argv[outIndex + 1], `fake Codex completed with token=${rawSecret}\\n`, "utf8");',
      "}",
      'console.log(`fake codex finished with token=${rawSecret}`);',
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(codexPath, 0o755);
  return { binDir, rawSecret: ["sk", "walkthrough", "runtime", "secret"].join("-") };
}

function requireEventTypes(result, expectedTypes) {
  const types = result.events.map((event) => event.type);
  for (const type of expectedTypes) {
    assert(types.includes(type), `missing RunEvent ${type}`);
  }
}

function createReviewedCandidateRule(result, repositoryPath) {
  const now = new Date().toISOString();
  const provenance = {
    runId: result.run.id,
    taskId: result.run.taskId,
    eventIds: result.events.map((event) => event.id),
    artifactRefs: result.artifacts,
    sources: ["verification_result", "run_event"],
    verificationResultId: result.verificationResult.id,
    importBundleId: result.importBundle.id,
  };
  return {
    id: `candidate-rule-${result.run.id}-package-scope`,
    namespace: {
      capabilityId: "coding-apprentice",
      workspaceId: result.run.workspaceId,
      repositoryPath,
    },
    status: "accepted",
    title: "Keep walkthrough fixes scoped",
    rule: "Keep local walkthrough fixture changes inside packages/** and validate them with node scripts/pass.mjs.",
    scope: {
      repositoryPath,
      allowedPaths: ["packages/**"],
      protectedPaths: [".env", "pnpm-lock.yaml"],
      commands: ["node scripts/pass.mjs"],
    },
    evidence: [
      {
        kind: "allowed_scope_pattern",
        summary: "Verifier passed after fake Codex changed only packages/value.txt.",
        eventIds: result.events.map((event) => event.id),
        artifactRefs: result.artifacts,
        confidence: 0.9,
      },
    ],
    provenance,
    redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

async function runWalkthrough() {
  const root = await mkdtemp(path.join(tmpdir(), "orynt-mvp-walkthrough-"));
  const repositoryPath = await createFixtureRepository(root);
  const { binDir: codexPathEnv, rawSecret } = await createFakeCodex(root);
  const sandboxRoot = path.join(root, "sandbox");
  const artifactRoot = path.join(root, "artifacts");
  const memoryRoot = path.join(root, "memory");
  const runStore = new InMemoryRunStore();
  const orchestrator = new LocalCodingApprenticeDemoOrchestrator({ runStore });

  const result = await orchestrator.runDemo({
    goal: "Run the local MVP walkthrough with fake Codex.",
    taskId: "task-local-mvp-walkthrough",
    workspaceId: "workspace-local-mvp",
    repositoryPath,
    sandboxRoot,
    artifactRoot,
    memoryRoot,
    validationCommands: ["node scripts/pass.mjs"],
    allowedVerificationCommands: ["node scripts/pass.mjs"],
    enableControlledCodexExecution: true,
    enableMemoryExtraction: true,
    codexPathEnv,
    createExecutionApproval: ({ run, plan }) => ({
      id: `${plan.id}-approval`,
      runId: run.id,
      planId: plan.id,
      status: "approved",
      approvedBy: "local-operator",
      reason: "Smoke walkthrough explicitly approves the fake Codex fixture.",
      approvedAt: new Date().toISOString(),
    }),
  });

  assert(result.codexExecutionPlan?.status === "approval_required", "expected Codex execution plan to require approval");
  assert(result.codexExecutionResult?.status === "finished", "expected fake Codex execution to finish");
  assert(result.importBundle.status === "imported", "expected imported Codex result bundle");
  assert(result.verificationResult.status === "pass", "expected verifier pass");
  assert(result.episodes.length > 0, "expected memory episodes");
  assert(result.codexExecutionResult.redaction.applied, "expected execution redaction metadata");
  const lastMessage = result.codexExecutionResult.lastMessagePath ? await readFile(result.codexExecutionResult.lastMessagePath, "utf8") : "";
  assert(lastMessage.includes("REDACTED"), "expected redacted last-message artifact");
  assert(!JSON.stringify(result).includes(rawSecret), "raw fake secret leaked into smoke result");
  assert(!lastMessage.includes(rawSecret), "raw fake secret leaked into last-message artifact");

  requireEventTypes(result, [
    "run_started",
    "goal_received",
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
    "verifier_input_created",
    "verification_started",
    "run_finished",
  ]);

  const acceptedRule = result.candidateRules[0]
    ? { ...result.candidateRules[0], status: "accepted", updatedAt: new Date().toISOString() }
    : createReviewedCandidateRule(result, repositoryPath);
  const candidateExtraction = new SkillCandidateBuilder().createCandidateSkill({
    namespace: acceptedRule.namespace,
    acceptedRules: [acceptedRule],
    episodes: result.episodes,
    verificationResult: result.verificationResult,
    sandbox: {
      repositoryPath,
      worktreePath: result.sandbox.worktreePath,
      baseRef: result.sandbox.baseRef,
    },
  });
  const registry = new LocalSkillRegistry();
  const candidateSkill = await registry.createCandidateSkill(candidateExtraction);
  const activeSkill = await registry.promoteSkillManually({
    skillId: candidateSkill.id,
    decision: "promote",
    actor: "local-operator",
    reason: "Smoke walkthrough manually promotes reviewed candidate evidence.",
    runId: result.run.id,
    decidedAt: new Date().toISOString(),
  });
  const replayPlan = new LocalSkillReplayPlanner({ runStore }).createReplayPlan({
    skill: activeSkill,
    runId: result.run.id,
    taskId: result.run.taskId,
    mode: "active_dry_run",
    repositoryPath,
    baseRef: result.sandbox.baseRef,
    policy: createConservativeCodingApprenticePolicy(repositoryPath, sandboxRoot),
    sandbox: result.sandbox,
  });

  assert(activeSkill.status === "active", "expected manually promoted active skill");
  assert(replayPlan.mode === "active_dry_run", "expected active dry-run replay plan");
  assert(replayPlan.dryRunOnly === true && replayPlan.executable === false, "replay plan must remain dry-run only");
  assert(replayPlan.readiness === "ready", `expected ready replay plan, got ${replayPlan.readiness}`);
  assert(runStore.listEvents(result.run.id).some((event) => event.type === "skill_replay_plan_created"), "missing skill replay RunEvent");

  const contractMarkdown = await readFile(result.contractArtifact.markdownPath, "utf8");
  assert(contractMarkdown.includes(result.run.id), "contract artifact should include run context");

  const output = {
    runId: result.run.id,
    repositoryPath,
    sandboxWorktreePath: result.sandbox.worktreePath,
    artifactRoot: path.join(artifactRoot, result.run.id),
    contractArtifactPath: result.contractArtifact.markdownPath,
    verifierInputPath: result.verifierInputPath,
    resultBundleId: result.importBundle.id,
    automaticCandidateRuleCount: result.candidateRules.length,
    promotedSkillId: activeSkill.id,
    replayPlanId: replayPlan.id,
    replayReadiness: replayPlan.readiness,
    eventTypes: runStore.listEvents(result.run.id).map((event) => event.type),
  };

  console.log(JSON.stringify(output, null, 2));
  if (process.env.ORYNT_KEEP_WALKTHROUGH === "1") {
    console.log(`Preserved walkthrough workspace: ${root}`);
  } else {
    await rm(root, { recursive: true, force: true });
  }
}

runWalkthrough().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
