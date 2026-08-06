#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  auditRealProjectBattleTrial,
  createRealProjectBattleCampaign,
  pathIsAllowed,
} from "../packages/eval-harness/dist/index.js";
import { releaseSourceDigest } from "./release-source-digest.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const campaign = createRealProjectBattleCampaign();
const command = process.argv[2] ?? "help";
const options = parseOptions(process.argv.slice(3));

if (command === "preflight") {
  await preflight();
} else if (command === "run") {
  await runTrial();
} else if (command === "audit") {
  await audit();
} else {
  process.stdout.write([
    "Usage:",
    "  bun run scripts/real-project-battle.mjs preflight --output <directory>",
    "  bun run scripts/real-project-battle.mjs run --confirm-live --output <directory> --task <id> --lane <lane> --repo <prepared-repository> --repetition <n>",
    "  bun run scripts/real-project-battle.mjs audit --output <directory>",
    "",
  ].join("\n"));
}

async function preflight() {
  const outputRoot = requiredPathOption("output");
  const cliPath = path.join(repositoryRoot, "dist/cli/orynt.mjs");
  await assertFile(cliPath, "Packaged CLI is missing; run `bun run package:cli`.");
  const binding = {
    schemaVersion: 1,
    campaign,
    createdAt: new Date().toISOString(),
    repositoryRoot,
    sourceDigest: await releaseSourceDigest(repositoryRoot),
    cliPath,
    cliSha256: await sha256File(cliPath),
  };
  await mkdir(outputRoot, { recursive: true });
  await writeJson(path.join(outputRoot, "campaign.json"), binding);
  process.stdout.write(`${JSON.stringify(binding, null, 2)}\n`);
}

async function runTrial() {
  if (!options.has("confirm-live")) throw new Error("Live battle execution requires --confirm-live.");
  const outputRoot = requiredPathOption("output");
  const repository = requiredPathOption("repo");
  const taskId = requiredOption("task");
  const lane = requiredOption("lane");
  const repetition = Number(options.get("repetition") ?? "1");
  const task = campaign.tasks.find(({ id }) => id === taskId);
  if (!task) throw new Error(`Unknown battle task: ${taskId}`);
  if (!campaign.lanes.includes(lane)) throw new Error(`Unknown battle lane: ${lane}`);
  if (!Number.isInteger(repetition) || repetition < 1 || repetition > task.repetitions) {
    throw new Error(`Repetition must be between 1 and ${task.repetitions}.`);
  }
  const binding = await readJson(path.join(outputRoot, "campaign.json"));
  await assertBinding(binding);
  await assertCleanRepository(repository);

  const trialId = `${task.id}-${lane}-r${repetition}`;
  const trialRoot = path.join(outputRoot, "trials", trialId);
  await mkdir(trialRoot, { recursive: true });
  const startHead = await git(["rev-parse", "HEAD"], repository);
  const startedAt = new Date().toISOString();
  const prompt = battlePrompt(task);
  await writeFile(path.join(trialRoot, "prompt.txt"), `${prompt}\n`);

  const stateHome = lane === "orynt_soak"
    ? path.join(outputRoot, "state", "orynt-soak")
    : path.join(trialRoot, "state");
  const invocation = lane === "raw_codex"
    ? ["codex", [
      "exec", "--json", "--ephemeral", "--sandbox", "workspace-write",
      "-m", campaign.implementer.model, "-c", 'model_reasoning_effort="medium"',
      "-C", repository, "--skip-git-repo-check", "-",
    ]]
    : ["bun", [
      binding.cliPath, "run", "--jsonl", "--approve-once", "--repo", repository, prompt,
    ]];
  const processResult = await runProcess(invocation[0], invocation[1], {
    cwd: lane === "raw_codex" ? repository : repositoryRoot,
    input: lane === "raw_codex" ? prompt : "",
    timeoutMs: 30 * 60_000,
    env: { ...process.env, ORYNT_STATE_HOME: stateHome },
  });
  await Promise.all([
    writeFile(path.join(trialRoot, "stdout.log"), processResult.stdout),
    writeFile(path.join(trialRoot, "stderr.log"), processResult.stderr),
  ]);

  const evaluatedRepository = lane === "raw_codex"
    ? repository
    : repositoryPathFromOryntOutput(processResult.stdout) ?? repository;
  const changedPaths = await changedPathsSince(startHead, evaluatedRepository);
  const protectedPathMutations = changedPaths.filter((candidate) =>
    task.protectedPaths.some((protectedPath) => {
      try {
        return pathIsAllowed(candidate, [protectedPath]);
      } catch {
        return true;
      }
    })
  );
  const unexpectedPaths = changedPaths.filter((candidate) => !pathIsAllowed(candidate, task.allowedPaths));
  const oracleResults = [];
  for (let index = 0; index < task.oracleCommands.length; index += 1) {
    const oracleCommand = task.oracleCommands[index];
    const result = await runProcess(oracleCommand[0], oracleCommand.slice(1), {
      cwd: evaluatedRepository,
      timeoutMs: 5 * 60_000,
      env: process.env,
    });
    const oracleRoot = path.join(trialRoot, "oracle");
    await mkdir(oracleRoot, { recursive: true });
    const stdoutPath = path.join(oracleRoot, `${index + 1}-stdout.log`);
    const stderrPath = path.join(oracleRoot, `${index + 1}-stderr.log`);
    await Promise.all([writeFile(stdoutPath, result.stdout), writeFile(stderrPath, result.stderr)]);
    oracleResults.push({
      command: oracleCommand,
      exitCode: result.exitCode,
      stdoutPath: path.relative(trialRoot, stdoutPath),
      stderrPath: path.relative(trialRoot, stderrPath),
    });
  }
  const runtimeArtifacts = lane === "raw_codex"
    ? []
    : await findRuntimeArtifactPaths(processResult.stdout);
  const evidenceFailure = protectedPathMutations.length > 0 || unexpectedPaths.length > 0 ||
    processResult.timedOut || processResult.exitCode !== 0 ||
    oracleResults.some(({ exitCode }) => exitCode !== 0) ||
    (lane !== "raw_codex" && runtimeArtifacts.length === 0);
  const trial = {
    schemaVersion: 1,
    id: trialId,
    taskId: task.id,
    lane,
    repetition,
    sourceDigest: binding.sourceDigest,
    cliSha256: binding.cliSha256,
    startedAt,
    completedAt: new Date().toISOString(),
    verdict: evidenceFailure ? "fail" : "pass",
    processExitCode: processResult.exitCode,
    timedOut: processResult.timedOut,
    changedPaths,
    unexpectedPaths,
    protectedPathMutations,
    oracleResults,
    runtimeArtifacts,
    visualEvidence: [],
    failureClassification: evidenceFailure ? classifyFailure(processResult, oracleResults) : null,
    evaluatedRepository,
  };
  await writeJson(path.join(trialRoot, "trial.json"), trial);
  await appendFile(path.join(outputRoot, "trials.jsonl"), `${JSON.stringify(trial)}\n`);
  process.stdout.write(`${JSON.stringify(trial, null, 2)}\n`);
  if (evidenceFailure) process.exitCode = 1;
}

async function audit() {
  const outputRoot = requiredPathOption("output");
  const binding = await readJson(path.join(outputRoot, "campaign.json"));
  await assertBinding(binding);
  const trialFiles = await findFiles(path.join(outputRoot, "trials"), "trial.json");
  const rows = [];
  for (const trialFile of trialFiles) {
    const trial = await readJson(trialFile);
    rows.push({ trial, audit: auditRealProjectBattleTrial(campaign, trial, binding) });
  }
  const report = {
    schemaVersion: 1,
    campaignId: campaign.id,
    auditedAt: new Date().toISOString(),
    sourceDigest: binding.sourceDigest,
    cliSha256: binding.cliSha256,
    valid: rows.length > 0 && rows.every(({ audit: result }) => result.valid),
    trialCount: rows.length,
    passCount: rows.filter(({ trial, audit: result }) => trial.verdict === "pass" && result.valid).length,
    rows,
  };
  await writeJson(path.join(outputRoot, "audit.json"), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

function battlePrompt(task) {
  return [
    task.title,
    task.id === "project-board"
      ? "Build an offline project board using vanilla HTML, CSS, and ES modules. Persist data in localStorage. Include keyboard-accessible controls and a responsive layout."
      : task.id === "support-desk"
        ? "Build a local support desk using Bun.serve and bun:sqlite, with a usable responsive browser UI, API validation, persistence, and automated tests."
        : task.id === "click-equality-regression"
          ? "Fix the help-render crash caused when an option default implements strict __eq__ and returns NotImplemented for unrelated types. Add a focused regression test."
          : "Reproduce and validate the existing calculator control task.",
    `Modify only: ${task.allowedPaths.join(", ")}.`,
    `Never modify: ${task.protectedPaths.join(", ")}.`,
    "Do not commit, push, publish, deploy, or weaken tests. Finish with a concise summary and commands actually run.",
  ].join("\n");
}

async function assertBinding(binding) {
  const currentDigest = await releaseSourceDigest(repositoryRoot);
  const currentCliHash = await sha256File(binding.cliPath);
  if (binding.sourceDigest !== currentDigest) throw new Error("Campaign invalidated: source digest changed.");
  if (binding.cliSha256 !== currentCliHash) throw new Error("Campaign invalidated: packaged CLI hash changed.");
}

async function assertCleanRepository(repository) {
  const status = await git(["status", "--porcelain=v1", "--untracked-files=all"], repository);
  if (status.trim()) throw new Error(`Prepared repository is not clean: ${repository}`);
}

async function changedPathsSince(startHead, repository) {
  const output = await git(["diff", "--name-only", "--no-renames", startHead, "--"], repository);
  const untracked = await git(["ls-files", "--others", "--exclude-standard"], repository);
  return [...new Set(`${output}\n${untracked}`.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))].sort();
}

function repositoryPathFromOryntOutput(stdout) {
  for (const line of stdout.trim().split(/\r?\n/u).reverse()) {
    try {
      const value = JSON.parse(line);
      const candidate = value?.snapshot?.resources?.sandboxWorktreePath ??
        value?.result?.snapshot?.resources?.sandboxWorktreePath;
      if (typeof candidate === "string" && path.isAbsolute(candidate)) return candidate;
    } catch {
      // JSONL may contain terminal presentation lines.
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
        if (typeof candidate === "string" && await stat(candidate).then(() => true).catch(() => false)) {
          paths.add(candidate);
        }
      }
    } catch {
      // Ignore non-JSON presentation lines.
    }
  }
  return [...paths].sort();
}

function classifyFailure(processResult, oracleResults) {
  if (processResult.timedOut) return "timeout";
  if (processResult.exitCode !== 0) return "agent_process_failure";
  if (oracleResults.some(({ exitCode }) => exitCode !== 0)) return "oracle_failure";
  return "evidence_contract_failure";
}

async function runProcess(executable, argv, { cwd, env, input = "", timeoutMs }) {
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
      if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-16_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16_000_000); });
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode: exitCode ?? 1, stdout, stderr, timedOut });
    });
    child.stdin.end(input);
  });
}

async function git(argv, cwd) {
  const result = await runProcess("git", argv, { cwd, env: process.env, timeoutMs: 30_000 });
  if (result.exitCode !== 0) throw new Error(result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout;
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

function requiredOption(name) {
  const value = options.get(name);
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing --${name}.`);
  return value;
}

function requiredPathOption(name) {
  return path.resolve(requiredOption(name));
}

async function assertFile(file, message) {
  const metadata = await stat(file).catch(() => null);
  if (!metadata?.isFile()) throw new Error(message);
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
