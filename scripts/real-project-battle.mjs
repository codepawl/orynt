#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  auditRealProjectBattleTrial,
  createRealProjectBattleCampaign,
  evaluateCalculatorPragmaticGate,
  evaluateProjectBoardCanaryGate,
  evaluateProductUiVisualReview,
  pathIsAllowed,
  repetitionsForBattleLane,
} from "../packages/eval-harness/dist/index.js";
import { releaseSourceDigest } from "./release-source-digest.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const oraclePath = path.join(repositoryRoot, "scripts/real-project-oracle.mjs");
const campaign = createRealProjectBattleCampaign();
const command = process.argv[2] ?? "help";
const options = parseOptions(process.argv.slice(3));

if (command === "preflight") {
  await preflight();
} else if (command === "prepare") {
  await prepare();
} else if (command === "run") {
  await runTrial(
    requiredOption("task"),
    requiredOption("lane"),
    Number(options.get("repetition") ?? "1"),
  );
} else if (command === "resume") {
  await resumeTask();
} else if (command === "record-visual") {
  await recordVisual();
} else if (command === "audit") {
  await audit();
} else {
  process.stdout.write([
    "Usage:",
    "  bun run scripts/real-project-battle.mjs preflight --output <external-directory>",
    "  bun run scripts/real-project-battle.mjs prepare --output <directory> [--task <id>]",
    "  bun run scripts/real-project-battle.mjs run --confirm-live --output <directory> --task <id> --lane <lane> --repetition <n>",
    "  bun run scripts/real-project-battle.mjs resume --confirm-live --output <directory> --task <id>",
    "  bun run scripts/real-project-battle.mjs record-visual --output <directory> --trial <id> --verdict <pass|fail> [--note <text>]",
    "  bun run scripts/real-project-battle.mjs audit --output <directory> [--task <id>]",
    "",
  ].join("\n"));
}

async function preflight() {
  const outputRoot = await externalOutputRoot();
  const cliPath = path.join(repositoryRoot, "dist/cli/orynt.mjs");
  const buildManifestPath = path.join(
    repositoryRoot,
    "dist/cli/build-manifest.json",
  );
  await assertFile(cliPath, "Packaged CLI is missing; run `bun run package:cli`.");
  await assertFile(
    buildManifestPath,
    "Packaged CLI build manifest is missing; run `bun run package:cli`.",
  );
  await assertFile(oraclePath, "Hidden oracle source is missing.");
  const sourceDigest = await releaseSourceDigest(repositoryRoot);
  const buildManifest = await readJson(buildManifestPath);
  if (buildManifest.sourceDigest !== sourceDigest) {
    throw new Error("Packaged CLI build manifest does not match current source.");
  }
  const binding = {
    schemaVersion: 3,
    campaign,
    createdAt: new Date().toISOString(),
    repositoryRoot,
    sourceDigest,
    cliPath,
    cliSha256: await sha256File(cliPath),
    buildManifestPath,
    buildManifestSha256: await sha256File(buildManifestPath),
    oraclePath,
    oracleSha256: await sha256File(oraclePath),
  };
  await mkdir(outputRoot, { recursive: true });
  await writeJson(path.join(outputRoot, "campaign.json"), binding);
  process.stdout.write(`${JSON.stringify(binding, null, 2)}\n`);
}

async function prepare() {
  const outputRoot = await externalOutputRoot();
  const binding = await loadAndAssertBinding(outputRoot);
  const requestedTask = options.get("task");
  const tasks = requestedTask
    ? campaign.tasks.filter(({ id }) => id === requestedTask)
    : campaign.tasks;
  if (tasks.length === 0) throw new Error(`Unknown battle task: ${requestedTask}`);
  for (const task of tasks) {
    const seedRoot = path.join(outputRoot, "seeds", task.id);
    if (await isGitRepository(seedRoot)) {
      await assertCleanRepository(seedRoot);
      continue;
    }
    await mkdir(path.dirname(seedRoot), { recursive: true });
    if (task.source) {
      const clone = await runProcess(
        "git",
        ["clone", "--quiet", task.source.repository, seedRoot],
        { cwd: outputRoot, env: process.env, timeoutMs: 5 * 60_000 },
      );
      if (clone.exitCode !== 0) {
        throw new Error(clone.stderr || `Could not clone ${task.source.repository}`);
      }
      await git(["checkout", "--quiet", "--detach", task.source.baseCommit], seedRoot);
    } else {
      await git(["init", "--quiet", seedRoot], outputRoot);
      await git(["config", "user.email", "battle@orynt.local"], seedRoot);
      await git(["config", "user.name", "Orynt Battle Harness"], seedRoot);
      await git(["commit", "--quiet", "--allow-empty", "-m", `${task.id} seed`], seedRoot);
    }
    await assertCleanRepository(seedRoot);
    const seedCommit = (await git(["rev-parse", "HEAD"], seedRoot)).trim();
    await writeJson(path.join(outputRoot, "seeds", `${task.id}.json`), {
      schemaVersion: 1,
      taskId: task.id,
      seedRoot,
      seedCommit,
      sourceDigest: binding.sourceDigest,
    });
    process.stdout.write(`Prepared ${task.id} at ${seedCommit}\n`);
  }
}

async function resumeTask() {
  requireLiveConfirmation();
  const taskId = requiredOption("task");
  const task = campaign.tasks.find(({ id }) => id === taskId);
  if (!task) throw new Error(`Unknown battle task: ${taskId}`);
  for (const lane of campaign.lanes) {
    const repetitions = repetitionsForBattleLane(task, lane);
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const trialId = `${task.id}-${lane}-r${repetition}`;
      const outputRoot = await externalOutputRoot();
      const trialPath = path.join(outputRoot, "trials", trialId, "trial.json");
      if (await fileExists(trialPath)) continue;
      await runTrial(task.id, lane, repetition);
    }
  }
}

async function runTrial(taskId, lane, repetition) {
  requireLiveConfirmation();
  const outputRoot = await externalOutputRoot();
  const binding = await loadAndAssertBinding(outputRoot);
  const task = campaign.tasks.find(({ id }) => id === taskId);
  if (!task) throw new Error(`Unknown battle task: ${taskId}`);
  if (!campaign.lanes.includes(lane)) throw new Error(`Unknown battle lane: ${lane}`);
  const laneRepetitions = repetitionsForBattleLane(task, lane);
  if (!Number.isInteger(repetition) || repetition < 1 || repetition > laneRepetitions) {
    throw new Error(`Repetition must be between 1 and ${laneRepetitions}.`);
  }
  const seedRoot = path.join(outputRoot, "seeds", task.id);
  await assertCleanRepository(seedRoot);
  const seedCommit = (await git(["rev-parse", "HEAD"], seedRoot)).trim();
  const trialId = `${task.id}-${lane}-r${repetition}`;
  const trialRoot = path.join(outputRoot, "trials", trialId);
  const trialPath = path.join(trialRoot, "trial.json");
  if (await fileExists(trialPath)) {
    throw new Error(`Trial already has a terminal record: ${trialId}`);
  }
  await mkdir(trialRoot, { recursive: true });
  const repository = path.join(trialRoot, "repository");
  const clone = await runProcess(
    "git",
    ["clone", "--quiet", "--no-hardlinks", seedRoot, repository],
    { cwd: trialRoot, env: process.env, timeoutMs: 60_000 },
  );
  if (clone.exitCode !== 0) throw new Error(clone.stderr || "Trial clone failed");
  await git(["checkout", "--quiet", "--detach", seedCommit], repository);
  await assertCleanRepository(repository);

  const startedAt = new Date().toISOString();
  const started = Date.now();
  const prompt = battlePrompt(task);
  await writeFile(path.join(trialRoot, "prompt.txt"), `${prompt}\n`);
  const agentStateHome = lane === "orynt_soak"
    ? path.join(outputRoot, "state", task.id, "orynt-soak")
    : path.join(trialRoot, "agent-state");
  const invocation = lane === "raw_codex"
    ? [
        "codex",
        [
          "exec",
          "--json",
          "--ephemeral",
          "--ignore-user-config",
          "--ignore-rules",
          "--sandbox",
          "workspace-write",
          "-m",
          campaign.implementer.model,
          "-c",
          `model_reasoning_effort=${JSON.stringify(campaign.implementer.reasoningEffort)}`,
          "-C",
          repository,
          "--skip-git-repo-check",
          "-",
        ],
      ]
    : [
        "bun",
        [
          binding.cliPath,
          "run",
          "--jsonl",
          "--approve-once",
          "--repo",
          repository,
          "--role-model",
          `implementer=${campaign.implementer.model}`,
          "--role-effort",
          `implementer=${campaign.implementer.reasoningEffort}`,
          prompt,
        ],
      ];
  const processResult = await runProcess(invocation[0], invocation[1], {
    cwd: lane === "raw_codex" ? repository : repositoryRoot,
    input: lane === "raw_codex" ? prompt : "",
    timeoutMs: 30 * 60_000,
    env: {
      ...process.env,
      ORYNT_STATE_HOME: agentStateHome,
      ORYNT_CONTEXTVM_DEBUG_ERRORS: "1",
      ...(lane === "raw_codex"
        ? {}
        : {
            ORYNT_CODEX_RUNTIME:
              campaign.providerTransport === "codex-cli"
                ? "exec"
                : "app-server",
          }),
    },
  });
  await Promise.all([
    writeFile(path.join(trialRoot, "stdout.log"), processResult.stdout),
    writeFile(path.join(trialRoot, "stderr.log"), processResult.stderr),
  ]);

  const runtimeArtifacts = lane === "raw_codex"
    ? []
    : await findRuntimeArtifactPaths(processResult.stdout);
  const evaluatedRepository = lane === "raw_codex"
    ? repository
    : await repositoryPathFromOryntEvidence(processResult.stdout, runtimeArtifacts) ??
      repository;
  const observedChangedPaths = await changedPathsSince(
    seedCommit,
    evaluatedRepository,
  );
  const runtimeManagedCandidates = lane === "raw_codex"
    ? []
    : observedChangedPaths.filter(
        (candidate) => candidate === ".codex/orynt-beta-verify.mjs",
      );
  const runtimeManagedPaths = await Promise.all(
    runtimeManagedCandidates.map(async (managedPath) => ({
      path: managedPath,
      sha256: await sha256File(path.join(evaluatedRepository, managedPath)),
    })),
  );
  const agentChangedPaths = observedChangedPaths.filter(
    (candidate) => !runtimeManagedCandidates.includes(candidate),
  );
  const protectedPathMutations = agentChangedPaths.filter((candidate) =>
    task.protectedPaths.some((protectedPath) =>
      pathIsAllowed(candidate, [protectedPath])
    )
  );
  const unexpectedPaths = agentChangedPaths.filter(
    (candidate) => !pathIsAllowed(candidate, task.allowedPaths),
  );
  const runtimeEvidenceValid = lane === "raw_codex"
    ? true
    : await validateRuntimeEvidence(runtimeArtifacts);
  const runtimePerformance =
    lane === "raw_codex"
      ? rawCodexPerformance(
          processResult.stdout,
          Date.now() - started,
        )
      : await loadRuntimePerformance(runtimeArtifacts);
  const executionDiagnostics = providerExecutionDiagnostics(
    `${processResult.stdout}\n${processResult.stderr}`,
  );

  const oracleRoot = path.join(trialRoot, "oracle");
  await mkdir(oracleRoot, { recursive: true });
  const oracleResult = await runProcess(
    "node",
    [
      binding.oraclePath,
      "--oracle",
      task.oracleId,
      "--repo",
      evaluatedRepository,
      "--output",
      oracleRoot,
      "--cli",
      binding.cliPath,
      "--state-home",
      path.join(trialRoot, "browser-state"),
    ],
    {
      cwd: repositoryRoot,
      env: process.env,
      timeoutMs: 10 * 60_000,
    },
  );
  const oracleStdoutPath = path.join(oracleRoot, "stdout.log");
  const oracleStderrPath = path.join(oracleRoot, "stderr.log");
  await Promise.all([
    writeFile(oracleStdoutPath, oracleResult.stdout),
    writeFile(oracleStderrPath, oracleResult.stderr),
  ]);
  const oracleReport = await readJson(
    path.join(oracleRoot, "oracle-result.json"),
  ).catch(() => null);
  const visualEvidence = Array.isArray(oracleReport?.visualEvidence)
    ? oracleReport.visualEvidence.filter(
        (candidate) => typeof candidate === "string",
      )
    : [];
  let evidenceFailure =
    protectedPathMutations.length > 0 ||
    unexpectedPaths.length > 0 ||
    processResult.timedOut ||
    processResult.exitCode !== 0 ||
    oracleResult.timedOut ||
    oracleResult.exitCode !== 0 ||
    !runtimeEvidenceValid;
  let visualReview;
  let visualVerdict = task.requiresVisualReview
    ? "not_available"
    : "not_required";
  if (
    task.requiresVisualReview &&
    visualEvidence.length >= 2 &&
    !evidenceFailure
  ) {
    visualReview = await runVisualReview(trialRoot, visualEvidence);
    if (visualReview.review) {
      try {
        const evaluation = evaluateProductUiVisualReview(visualReview.review);
        visualVerdict = evaluation.verdict;
        visualReview.evaluation = evaluation;
      } catch (error) {
        visualReview.failure =
          `malformed_visual_review: ${error instanceof Error ? error.message : String(error)}`;
        visualVerdict = "fail";
      }
    } else {
      visualVerdict = "fail";
    }
    if (visualVerdict !== "pass") evidenceFailure = true;
  }
  const trial = {
    schemaVersion: 5,
    id: trialId,
    taskId: task.id,
    lane,
    repetition,
    seedCommit,
    sourceDigest: binding.sourceDigest,
    cliSha256: binding.cliSha256,
    buildManifestSha256: binding.buildManifestSha256,
    oracleSha256: binding.oracleSha256,
    modelBinding: structuredClone(campaign.implementer),
    actualModelBinding:
      runtimePerformance?.actualModelBinding ??
      structuredClone(campaign.implementer),
    performance: runtimePerformance?.performance ?? null,
    executionDiagnostics,
    providerTransport: campaign.providerTransport,
    startedAt,
    completedAt: new Date().toISOString(),
    totalWallMs: Date.now() - started,
    verdict: evidenceFailure ? "fail" : "pass",
    processExitCode: processResult.exitCode,
    timedOut: processResult.timedOut || oracleResult.timedOut,
    agentChangedPaths,
    runtimeManagedPaths,
    unexpectedPaths,
    protectedPathMutations,
    oracleResults: [{
      oracleId: task.oracleId,
      exitCode: oracleResult.exitCode,
      stdoutPath: path.relative(trialRoot, oracleStdoutPath),
      stderrPath: path.relative(trialRoot, oracleStderrPath),
    }],
    runtimeArtifacts,
    runtimeEvidenceValid,
    visualEvidence,
    visualVerdict,
    visualNote: null,
    ...(visualReview ? { visualReview } : {}),
    failureClassification: evidenceFailure
      ? classifyFailure(processResult, oracleResult, {
          protectedPathMutations,
          unexpectedPaths,
          runtimeEvidenceValid,
        })
      : null,
    processFailure:
      processResult.exitCode === 0
        ? null
        : extractProcessFailure(processResult.stdout, processResult.stderr),
    evaluatedRepository,
  };
  await writeJson(trialPath, trial);
  await appendFile(path.join(outputRoot, "trials.jsonl"), `${JSON.stringify(trial)}\n`);
  process.stdout.write(`${JSON.stringify(trial, null, 2)}\n`);
  if (evidenceFailure) process.exitCode = 1;
}

async function recordVisual() {
  const outputRoot = await externalOutputRoot();
  await loadAndAssertBinding(outputRoot);
  const trialId = requiredOption("trial");
  const verdict = requiredOption("verdict");
  if (!["pass", "fail"].includes(verdict)) {
    throw new Error("--verdict must be pass or fail");
  }
  const trialPath = path.join(outputRoot, "trials", trialId, "trial.json");
  const trial = await readJson(trialPath);
  if (trial.schemaVersion >= 5 && trial.visualReview) {
    throw new Error(
      "Model-reviewed trials cannot be overwritten by record-visual.",
    );
  }
  trial.visualVerdict = verdict;
  trial.visualNote =
    typeof options.get("note") === "string" ? options.get("note") : null;
  if (verdict === "fail") {
    trial.verdict = "fail";
    trial.failureClassification = "visual_review_failure";
  }
  await writeJson(trialPath, trial);
  process.stdout.write(`${JSON.stringify(trial, null, 2)}\n`);
}

async function runVisualReview(trialRoot, visualEvidence) {
  const reviewRoot = path.join(trialRoot, "visual-review");
  await mkdir(reviewRoot, { recursive: true });
  const schemaPath = path.join(reviewRoot, "schema.json");
  const lastMessagePath = path.join(reviewRoot, "review.json");
  const stdoutPath = path.join(reviewRoot, "stdout.log");
  const stderrPath = path.join(reviewRoot, "stderr.log");
  await writeJson(schemaPath, visualReviewSchema());
  const prompt = [
    "Review the attached desktop and mobile screenshots of one product interface.",
    "Do not use tools or inspect repository files. Judge only visible evidence.",
    "Score each required criterion from 1 to 5:",
    "UIQ-1 information and action hierarchy;",
    "UIQ-2 product-appropriate composition and density;",
    "UIQ-3 coherent color, typography, radius, and spacing tokens;",
    "UIQ-4 honest controls with no decorative or inert chrome;",
    "UIQ-5 accessibility and responsive-state evidence;",
    "UIQ-6 distinctive, restrained product design without generic AI-slop patterns.",
    "Use at most six concrete findings. A major finding is a problem that materially harms the workflow or makes the interface misleading.",
    "Return only the structured result required by the output schema. Do not declare pass or fail.",
  ].join(" ");
  const started = Date.now();
  const result = await runProcess(
    "codex",
    [
      "exec",
      "--json",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--sandbox",
      "read-only",
      "--model",
      campaign.visualReviewer.model,
      "-c",
      `model_reasoning_effort=${JSON.stringify(campaign.visualReviewer.reasoningEffort)}`,
      "--image",
      ...visualEvidence,
      "--output-schema",
      schemaPath,
      "--output-last-message",
      lastMessagePath,
      "--cd",
      reviewRoot,
      "--skip-git-repo-check",
      prompt,
    ],
    {
      cwd: reviewRoot,
      env: process.env,
      timeoutMs: campaign.visualReviewer.timeoutMs,
    },
  );
  await Promise.all([
    writeFile(stdoutPath, result.stdout),
    writeFile(stderrPath, result.stderr),
  ]);
  let review = null;
  let failure = null;
  if (result.exitCode === 0 && !result.timedOut) {
    try {
      review = await readJson(lastMessagePath);
    } catch (error) {
      failure = `malformed_visual_review: ${error instanceof Error ? error.message : String(error)}`;
    }
  } else {
    failure = result.timedOut
      ? "visual_review_timeout"
      : `visual_review_provider_failure:${result.exitCode}`;
  }
  const usage = providerUsageFromJsonl(result.stdout);
  return {
    binding: structuredClone(campaign.visualReviewer),
    durationMs: Date.now() - started,
    inputTokens: usage?.inputTokens ?? null,
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    reasoningOutputTokens: usage?.reasoningOutputTokens ?? null,
    review,
    failure,
    artifacts: {
      schema: path.relative(trialRoot, schemaPath),
      result: path.relative(trialRoot, lastMessagePath),
      stdout: path.relative(trialRoot, stdoutPath),
      stderr: path.relative(trialRoot, stderrPath),
    },
  };
}

function providerUsageFromJsonl(stdout) {
  for (const line of stdout.trim().split(/\r?\n/u).reverse()) {
    try {
      const event = JSON.parse(line);
      if (event.type !== "turn.completed" || !event.usage) continue;
      return {
        inputTokens: event.usage.input_tokens ?? 0,
        cachedInputTokens: event.usage.cached_input_tokens ?? 0,
        outputTokens: event.usage.output_tokens ?? 0,
        reasoningOutputTokens: event.usage.reasoning_output_tokens ?? 0,
      };
    } catch {}
  }
  return null;
}

function visualReviewSchema() {
  const criterionIds = ["UIQ-1", "UIQ-2", "UIQ-3", "UIQ-4", "UIQ-5", "UIQ-6"];
  return {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "scores", "findings", "summary"],
    properties: {
      schemaVersion: { type: "integer", const: 1 },
      scores: {
        type: "array",
        minItems: 6,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["criterionId", "score", "evidence"],
          properties: {
            criterionId: { type: "string", enum: criterionIds },
            score: { type: "integer", minimum: 1, maximum: 5 },
            evidence: { type: "string", maxLength: 500 },
          },
        },
      },
      findings: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["severity", "criterionId", "evidence", "recommendation"],
          properties: {
            severity: { type: "string", enum: ["major", "minor"] },
            criterionId: { type: "string", enum: criterionIds },
            evidence: { type: "string", maxLength: 500 },
            recommendation: { type: "string", maxLength: 500 },
          },
        },
      },
      summary: { type: "string", maxLength: 800 },
    },
  };
}

async function audit() {
  const outputRoot = await externalOutputRoot();
  const binding = await loadAndAssertBinding(outputRoot);
  const requestedTask = options.get("task");
  if (
    requestedTask &&
    !campaign.tasks.some(({ id }) => id === requestedTask)
  ) {
    throw new Error(`Unknown battle task: ${requestedTask}`);
  }
  const trialFiles = await findFiles(path.join(outputRoot, "trials"), "trial.json");
  const rows = [];
  for (const trialFile of trialFiles) {
    const trial = await readJson(trialFile);
    if (requestedTask && trial.taskId !== requestedTask) continue;
    rows.push({
      trial,
      audit: auditRealProjectBattleTrial(campaign, trial, binding),
    });
  }
  const auditedTasks = requestedTask
    ? campaign.tasks.filter(({ id }) => id === requestedTask)
    : campaign.tasks;
  const expectedTrials = auditedTasks.reduce(
    (total, task) =>
      total +
      campaign.lanes.reduce(
        (laneTotal, lane) =>
          laneTotal + repetitionsForBattleLane(task, lane),
        0,
      ),
    0,
  );
  const report = {
    schemaVersion: campaign.schemaVersion,
    campaignId: campaign.id,
    auditScope: requestedTask
      ? { kind: "task", taskId: requestedTask }
      : { kind: "campaign" },
    auditedAt: new Date().toISOString(),
    sourceDigest: binding.sourceDigest,
    cliSha256: binding.cliSha256,
    oracleSha256: binding.oracleSha256,
    valid:
      rows.length > 0 &&
      rows.every(({ audit: result }) => result.valid),
    complete:
      rows.length === expectedTrials &&
      rows.every(({ audit: result }) => result.complete),
    campaignComplete:
      !requestedTask &&
      rows.length === expectedTrials &&
      rows.every(({ audit: result }) => result.complete),
    expectedTrials,
    trialCount: rows.length,
    passCount: rows.filter(
      ({ trial, audit: result }) =>
        trial.verdict === "pass" && result.valid,
    ).length,
    optimizationGate:
      auditedTasks.some(({ id }) => id === "calculator-control")
        ? evaluateCalculatorPragmaticGate(
            rows
              .map(({ trial }) => trial)
              .filter(({ taskId }) => taskId === "calculator-control"),
          )
        : null,
    advancementGate:
      auditedTasks.some(({ id }) => id === "project-board")
        ? evaluateProjectBoardCanaryGate(
            rows
              .map(({ trial }) => trial)
              .filter(({ taskId }) => taskId === "project-board"),
          )
        : null,
    methods: Object.fromEntries(
      campaign.lanes.map((lane) => {
        const laneRows = rows.filter(({ trial }) => trial.lane === lane);
        const durations = laneRows.map(({ trial }) => trial.totalWallMs).sort(
          (left, right) => left - right,
        );
        return [lane, {
          trials: laneRows.length,
          passed: laneRows.filter(
            ({ trial, audit: result }) =>
              trial.verdict === "pass" && result.valid,
          ).length,
          p50WallMs: percentile(durations, 0.5),
          p95WallMs: percentile(durations, 0.95),
        }];
      }),
    ),
    rows,
  };
  const auditName = requestedTask ?? "campaign";
  await mkdir(path.join(outputRoot, "audits"), { recursive: true });
  await Promise.all([
    writeJson(path.join(outputRoot, "audit.json"), report),
    writeJson(
      path.join(outputRoot, "audits", `${auditName}.json`),
      report,
    ),
  ]);
  await writeVisualIndex(outputRoot, rows);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (
    !report.valid ||
    (
      requestedTask === "calculator-control" &&
      report.optimizationGate?.status !== "pass"
    ) ||
    (
      requestedTask === "project-board" &&
      report.advancementGate?.status !== "pass"
    )
  ) {
    process.exitCode = 1;
  }
}

function providerExecutionDiagnostics(output) {
  const count = (pattern) => output.match(pattern)?.length ?? 0;
  return {
    absolutePathRejectionCount: count(
      /patch rejected:[^\n]*outside of the project|writing outside of the project/giu,
    ),
    reconnectCount: count(
      /Reconnecting\.\.\.|stream disconnected before completion/giu,
    ),
  };
}

function battlePrompt(task) {
  return [
    task.title,
    task.prompt,
    `Modify only these exact paths or descendants: ${task.allowedPaths.join(", ")}.`,
    `Never modify: ${task.protectedPaths.join(", ")}.`,
    "Do not commit, push, publish, deploy, access secrets, install network dependencies, or weaken tests.",
    "Complete the runnable implementation, run relevant local checks, and finish with a concise summary of files and commands actually used.",
  ].join("\n");
}

async function loadAndAssertBinding(outputRoot) {
  const binding = await readJson(path.join(outputRoot, "campaign.json"));
  const currentDigest = await releaseSourceDigest(repositoryRoot);
  const currentCliHash = await sha256File(binding.cliPath);
  const currentBuildManifestHash = await sha256File(binding.buildManifestPath);
  const currentOracleHash = await sha256File(binding.oraclePath);
  if (binding.sourceDigest !== currentDigest) {
    throw new Error("Campaign invalidated: source digest changed.");
  }
  if (binding.cliSha256 !== currentCliHash) {
    throw new Error("Campaign invalidated: packaged CLI hash changed.");
  }
  if (binding.buildManifestSha256 !== currentBuildManifestHash) {
    throw new Error("Campaign invalidated: CLI build manifest hash changed.");
  }
  if (binding.oracleSha256 !== currentOracleHash) {
    throw new Error("Campaign invalidated: hidden oracle hash changed.");
  }
  return binding;
}

async function validateRuntimeEvidence(paths) {
  if (paths.length < 2) return false;
  const manifestPath = paths.find((candidate) =>
    candidate.endsWith("artifact-manifest.json")
  );
  const eventLogPath = paths.find((candidate) =>
    candidate.endsWith("run-events.json")
  );
  if (!manifestPath || !eventLogPath) return false;
  try {
    const manifest = await readJson(manifestPath);
    const events = await readJson(eventLogPath);
    return (
      typeof manifest.runId === "string" &&
      ["pass", "fail"].includes(manifest.status) &&
      Array.isArray(events) &&
      events.some(({ type }) => type === "run_finished")
    );
  } catch {
    return false;
  }
}

async function repositoryPathFromOryntEvidence(stdout, artifacts) {
  for (const line of stdout.trim().split(/\r?\n/u).reverse()) {
    try {
      const value = JSON.parse(line);
      const candidates = [
        value?.snapshot?.resources?.sandboxWorktreePath,
        value?.result?.snapshot?.resources?.sandboxWorktreePath,
        value?.event?.payload?.sandbox?.worktreePath,
      ];
      const candidate = candidates.find(
        (item) => typeof item === "string" && path.isAbsolute(item),
      );
      if (candidate) return candidate;
    } catch {}
  }
  const manifestPath = artifacts.find((candidate) =>
    candidate.endsWith("artifact-manifest.json")
  );
  if (manifestPath) {
    const manifest = await readJson(manifestPath).catch(() => null);
    if (
      typeof manifest?.sandboxWorktreePath === "string" &&
      path.isAbsolute(manifest.sandboxWorktreePath)
    ) {
      return manifest.sandboxWorktreePath;
    }
  }
  return null;
}

async function findRuntimeArtifactPaths(stdout) {
  const paths = new Set();
  for (const line of stdout.trim().split(/\r?\n/u)) {
    try {
      const value = JSON.parse(line);
      for (const candidate of [
        value?.artifactManifestPath,
        value?.eventLogPath,
        value?.result?.artifactManifestPath,
        value?.result?.eventLogPath,
      ]) {
        if (
          typeof candidate === "string" &&
          await fileExists(candidate)
        ) {
          paths.add(candidate);
        }
      }
    } catch {}
  }
  return [...paths].sort();
}

async function changedPathsSince(startHead, repository) {
  const tracked = await git(
    ["diff", "--name-only", "--no-renames", startHead, "--"],
    repository,
  );
  const untracked = await git(
    ["ls-files", "--others", "--exclude-standard"],
    repository,
  );
  return [...new Set(
    `${tracked}\n${untracked}`.split(/\r?\n/u).map((item) => item.trim())
      .filter(Boolean),
  )].sort();
}

function classifyFailure(processResult, oracleResult, scope) {
  if (scope.protectedPathMutations.length > 0) return "protected_path_mutation";
  if (scope.unexpectedPaths.length > 0) return "out_of_scope_mutation";
  if (processResult.timedOut || oracleResult.timedOut) return "timeout";
  if (processResult.exitCode !== 0) return "agent_process_failure";
  if (oracleResult.exitCode !== 0) return "oracle_failure";
  if (!scope.runtimeEvidenceValid) return "runtime_evidence_invalid";
  return "evidence_contract_failure";
}

function extractProcessFailure(stdout, stderr) {
  for (const line of stdout.trim().split(/\r?\n/u).reverse()) {
    try {
      const value = JSON.parse(line);
      if (value?.kind !== "error" && value?.kind !== "result") continue;
      const outcome =
        value?.outcome && typeof value.outcome === "object"
          ? value.outcome
          : null;
      const message =
        typeof value.message === "string"
          ? sanitizeFailureText(value.message)
          : typeof outcome?.message === "string"
            ? sanitizeFailureText(outcome.message)
          : "Agent process failed without a structured message.";
      return {
        classification:
          typeof value.classification === "string"
            ? value.classification.slice(0, 100)
            : typeof outcome?.classification === "string"
              ? outcome.classification.slice(0, 100)
            : "unknown",
        code:
          typeof value.code === "string"
            ? value.code.slice(0, 100)
            : typeof outcome?.code === "string"
              ? outcome.code.slice(0, 100)
            : typeof value.failureClass === "string"
              ? value.failureClass.slice(0, 100)
              : null,
        message,
      };
    } catch {}
  }
  const fallback = `${stderr}\n${stdout}`.trim().replace(/\s+/gu, " ");
  return {
    classification: "unknown",
    code: null,
    message: sanitizeFailureText(
      fallback || "Agent process failed without output.",
    ),
  };
}

function sanitizeFailureText(value) {
  return String(value)
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~+/=-]{16,})\b/gu,
      "[REDACTED]",
    )
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1_000);
}

async function loadRuntimePerformance(runtimeArtifacts) {
  const artifactRoot = runtimeArtifacts
    .map((artifact) => path.dirname(artifact))
    .find((candidate) => candidate);
  if (!artifactRoot) return null;
  const summary = await readJson(
    path.join(artifactRoot, "run-performance.json"),
  ).catch(() => null);
  if (!summary?.totals || !Array.isArray(summary.phases)) return null;
  const implementer = summary.phases.find(
    (phase) =>
      phase.role === "implementer" &&
      (phase.phase === "implementation" ||
        phase.phase === "recovery"),
  );
  return {
    actualModelBinding: implementer
      ? {
          model: implementer.actualModelId,
          reasoningEffort: implementer.actualThinkingEffort,
        }
      : null,
    performance: {
      durationMs: summary.totals.durationMs ?? 0,
      inputTokens: summary.totals.inputTokens ?? 0,
      cachedInputTokens: summary.totals.cachedInputTokens ?? 0,
      outputTokens: summary.totals.outputTokens ?? 0,
      reasoningOutputTokens:
        summary.totals.reasoningOutputTokens ?? 0,
      invocationCount: summary.invocationCount ?? 0,
      implementationInvocationCount:
        summary.implementationInvocationCount ?? 0,
      recoveryInvocationCount:
        summary.recoveryInvocationCount ?? 0,
      reviewerInvocationCount:
        summary.reviewerInvocationCount ?? 0,
    },
  };
}

function rawCodexPerformance(stdout, durationMs) {
  const lines = stdout.trim().split(/\r?\n/u).reverse();
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type !== "turn.completed" || !event.usage) continue;
      return {
        actualModelBinding: structuredClone(campaign.implementer),
        performance: {
          durationMs,
          inputTokens: event.usage.input_tokens ?? 0,
          cachedInputTokens:
            event.usage.cached_input_tokens ?? 0,
          outputTokens: event.usage.output_tokens ?? 0,
          reasoningOutputTokens:
            event.usage.reasoning_output_tokens ?? 0,
          invocationCount: 1,
          implementationInvocationCount: 1,
          recoveryInvocationCount: 0,
          reviewerInvocationCount: 0,
        },
      };
    } catch {
      // Bounded non-JSON provider diagnostics are ignored.
    }
  }
  return null;
}

async function writeVisualIndex(outputRoot, rows) {
  const cards = rows
    .filter(({ trial }) => trial.visualEvidence.length > 0)
    .map(({ trial }) => `
<article>
  <h2>${escapeHtml(trial.id)} · ${escapeHtml(trial.visualVerdict)}</h2>
  <div>${trial.visualEvidence.map((image) =>
    `<figure><img src="${escapeHtml(path.relative(outputRoot, image))}" alt="${escapeHtml(trial.id)}"><figcaption>${escapeHtml(path.basename(image))}</figcaption></figure>`
  ).join("")}</div>
</article>`)
    .join("\n");
  await writeFile(
    path.join(outputRoot, "visual-index.html"),
    `<!doctype html><meta charset="utf-8"><title>Orynt battle visual review</title><style>body{font:14px system-ui;margin:24px;background:#111;color:#eee}article{border-top:1px solid #555;margin:28px 0}article>div{display:flex;gap:16px;align-items:start;overflow:auto}img{max-height:640px;max-width:700px;border:1px solid #555}figure{margin:0}figcaption{margin-top:6px;color:#aaa}</style><h1>Orynt battle visual review</h1>${cards}\n`,
  );
}

async function externalOutputRoot() {
  const outputRoot = path.resolve(requiredOption("output"));
  const repositoryReal = await realpath(repositoryRoot);
  const outputParent = await realpath(
    await nearestExistingAncestor(outputRoot),
  );
  const relative = path.relative(repositoryReal, outputParent);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("Battle output must be outside the Orynt source checkout.");
  }
  return outputRoot;
}

async function nearestExistingAncestor(candidate) {
  let current = candidate;
  while (!(await fileExists(current))) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

async function assertCleanRepository(repository) {
  if (!(await isGitRepository(repository))) {
    throw new Error(`Prepared repository is missing: ${repository}`);
  }
  const status = await git(
    ["status", "--porcelain=v1", "--untracked-files=all"],
    repository,
  );
  if (status.trim()) throw new Error(`Repository is not clean: ${repository}`);
}

async function isGitRepository(repository) {
  const result = await runProcess(
    "git",
    ["-C", repository, "rev-parse", "--git-dir"],
    { cwd: repositoryRoot, env: process.env, timeoutMs: 30_000 },
  );
  return result.exitCode === 0;
}

async function git(argv, cwd) {
  const result = await runProcess("git", argv, {
    cwd,
    env: process.env,
    timeoutMs: 60_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `git ${argv.join(" ")} failed`);
  }
  return result.stdout;
}

async function runProcess(executable, argv, {
  cwd,
  env,
  input = "",
  timeoutMs,
}) {
  return await new Promise((resolve) => {
    const child = spawn(executable, argv, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      } else {
        child.kill("SIGKILL");
      }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-16_000_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-16_000_000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${error.message}`,
        timedOut,
      });
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode: exitCode ?? 1, stdout, stderr, timedOut });
    });
    child.stdin.end(input);
  });
}

async function findFiles(root, basename) {
  const found = [];
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...await findFiles(target, basename));
    else if (entry.isFile() && entry.name === basename) found.push(target);
  }
  return found.sort();
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];
}

function parseOptions(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed.set(key, true);
    else {
      parsed.set(key, next);
      index += 1;
    }
  }
  return parsed;
}

function requireLiveConfirmation() {
  if (!options.has("confirm-live")) {
    throw new Error("Live battle execution requires --confirm-live.");
  }
}

function requiredOption(name) {
  const value = options.get(name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing --${name}.`);
  }
  return value;
}

async function assertFile(file, message) {
  const metadata = await stat(file).catch(() => null);
  if (!metadata?.isFile()) throw new Error(message);
}

async function fileExists(file) {
  return await stat(file).then(() => true).catch(() => false);
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
