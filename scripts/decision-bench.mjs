#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, chmod, copyFile, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import {
  buildDecisionTrialSchedule,
  createDecisionBenchV1,
  createDecisionBenchmarkReport,
  createDecisionBenchmarkReportV2,
  createDecisionBenchmarkReportV3,
  DECISION_BENCH_V3_METHODS,
  normalizeDecision,
  renderDecisionProtocolPrompt,
  renderDecisionProtocolPromptV2,
  renderDecisionReportJson,
  renderDecisionReportMarkdown,
  renderDecisionTrialsJsonl,
} from "../packages/eval-harness/dist/decisionBench.js";

const HERMES_PIN = {
  version: "0.19.1",
  commit: "efd210d4547ace31ccbe34dd599bbc940d788e8b",
  uvLockSha256: "960cda43f7981a88370226c1d7f5d4c50c5c111ab64a5515549f2dc1c4115b07",
};

function parseArgs(argv) {
  const result = {
    mode: "controlled",
    confirmed: false,
    repetitions: 3,
    seed: 17,
    modelId: "gpt-5.5",
    thinkingEffort: "high",
    timeoutMs: 120_000,
    output: undefined,
    hermesRoot: undefined,
    resume: false,
    benchmarkVersion: "v1",
    scenarioLimit: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--") continue;
    if (item === "--controlled") result.mode = "controlled";
    else if (item === "--live") result.mode = "live";
    else if (item === "--confirm-live") result.confirmed = true;
    else if (item === "--repetitions") result.repetitions = Number(argv[++index]);
    else if (item === "--seed") result.seed = Number(argv[++index]);
    else if (item === "--model") result.modelId = argv[++index];
    else if (item === "--thinking-effort") result.thinkingEffort = argv[++index];
    else if (item === "--timeout-ms") result.timeoutMs = Number(argv[++index]);
    else if (item === "--output") result.output = argv[++index];
    else if (item === "--hermes-root") result.hermesRoot = argv[++index];
    else if (item === "--resume") result.resume = true;
    else if (item === "--v2") result.benchmarkVersion = "v2";
    else if (item === "--v3") result.benchmarkVersion = "v3";
    else if (item === "--scenario-limit") result.scenarioLimit = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${item}`);
  }
  if (!Number.isInteger(result.repetitions) || result.repetitions < 1) throw new Error("--repetitions must be positive");
  return result;
}

function execCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-20_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-20_000); });
    child.once("error", reject);
    child.once("close", (code) => code === 0
      ? resolve(stdout.trim())
      : reject(new Error(`${command} exited ${code}: ${stderr.trim().slice(0, 1_000)}`)));
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function resolveHermesRoot(explicit) {
  if (explicit) return realpath(explicit);
  return realpath(path.join(os.homedir(), ".hermes", "hermes-agent"));
}

async function provenance(options) {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const oryntCommit = await execCapture("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
  const oryntStatus = await execCapture("git", ["status", "--porcelain"], { cwd: repoRoot });
  const result = {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    provider: options.benchmarkVersion === "v3" ? "mixed" : "openai-codex",
    ...(options.benchmarkVersion === "v3"
      ? {
          providers: {
            orynt_responses_ws: "openai-api",
            orynt_app_server: "codex-app-server",
            hermes: "openai-codex",
          },
        }
      : {}),
    modelId: options.modelId,
    thinkingEffort: options.thinkingEffort,
    orynt: { commit: oryntCommit, dirty: oryntStatus.length > 0, workingTreeFingerprint: sha256(oryntStatus) },
  };
  if (options.mode !== "live") return result;
  const hermesRoot = await resolveHermesRoot(options.hermesRoot);
  const commit = await execCapture("git", ["rev-parse", "HEAD"], { cwd: hermesRoot });
  if (commit !== HERMES_PIN.commit) throw new Error(`Hermes commit mismatch: expected ${HERMES_PIN.commit}, got ${commit}`);
  const pyproject = await readFile(path.join(hermesRoot, "pyproject.toml"), "utf8");
  if (!new RegExp(`version\\s*=\\s*"${HERMES_PIN.version.replaceAll(".", "\\.")}"`).test(pyproject)) {
    throw new Error(`Hermes version mismatch: expected ${HERMES_PIN.version}`);
  }
  const lockHash = sha256(await readFile(path.join(hermesRoot, "uv.lock")));
  if (lockHash !== HERMES_PIN.uvLockSha256) throw new Error(`Hermes uv.lock hash mismatch: ${lockHash}`);
  const pythonPath = path.join(hermesRoot, ".venv", "bin", "python");
  const [pythonVersion, uvVersion, codexVersion] = await Promise.all([
    execCapture(pythonPath, ["--version"]),
    execCapture("uv", ["--version"]),
    execCapture("codex", ["--version"]),
  ]);
  return {
    ...result,
    runtimes: { pythonVersion, uvVersion, codexVersion },
    hermes: { root: hermesRoot, commit, version: HERMES_PIN.version, uvLockSha256: lockHash },
  };
}

function controlledResult(trial, scenario) {
  const base =
    trial.methodId === "orynt" || trial.methodId === "orynt_responses_ws"
      ? 100
      : trial.methodId === "orynt_app_server"
        ? 180
        : 240;
  const jitter = ((trial.sequence * 37 + 11) % 31);
  const processStartedMs = 0;
  const processReadyMs =
    trial.methodId === "orynt" || trial.methodId === "orynt_responses_ws"
      ? 12 + jitter / 10
      : 28 + jitter / 10;
  const promptAcceptedMs = processReadyMs + 1;
  const providerDispatchedMs =
    promptAcceptedMs +
    (trial.methodId === "orynt" || trial.methodId === "orynt_responses_ws" ? 5 : 19);
  const firstDeltaMs = providerDispatchedMs + base * 0.55;
  const decisionCommittedMs = promptAcceptedMs + base + jitter;
  return {
    ...trial,
    status: "completed",
    decision: structuredClone(scenario.oracle),
    timing: { processStartedMs, processReadyMs, promptAcceptedMs, providerDispatchedMs, firstDeltaMs, decisionCommittedMs, finishedMs: decisionCommittedMs + 1 },
  };
}

const DECISION_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "actionName", "arguments"],
  properties: {
    kind: { type: "string", enum: ["respond", "clarify", "act", "refuse"] },
    actionName: {
      type: "string",
      enum: ["respond", "request_clarification", "search_web", "read_resource", "update_resource", "send_message", "schedule_event", "refuse"],
    },
    arguments: {
      type: "object",
      additionalProperties: false,
      required: ["answer", "missingFields", "query", "resource", "content", "recipient", "scheduledAt", "refusalCategory"],
      properties: {
        answer: { anyOf: [{ type: "string" }, { type: "null" }] },
        missingFields: {
          anyOf: [
            { type: "array", items: { type: "string" }, maxItems: 8 },
            { type: "null" },
          ],
        },
        query: { anyOf: [{ type: "string" }, { type: "null" }] },
        resource: { anyOf: [{ type: "string" }, { type: "null" }] },
        content: { anyOf: [{ type: "string" }, { type: "null" }] },
        recipient: { anyOf: [{ type: "string" }, { type: "null" }] },
        scheduledAt: { anyOf: [{ type: "string" }, { type: "null" }] },
        refusalCategory: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    },
  },
};

class PersistentWorker {
  constructor(command, args, environment, timeoutMs) {
    this.startedMs = performance.now();
    this.child = spawn(command, args, {
      cwd: path.resolve(import.meta.dirname, ".."),
      env: environment ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.timeoutMs = timeoutMs;
    this.buffer = "";
    this.stderr = "";
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.child.stdout.on("data", (chunk) => this.ingest(chunk.toString("utf8")));
    this.child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-8_000);
    });
    this.child.once("error", (error) => {
      this.rejectReady(error);
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    });
    this.child.once("close", (code) => {
      const error = new Error(`persistent adapter exited ${code}: ${this.stderr.trim().slice(0, 1_000)}`);
      this.rejectReady(error);
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    });
  }

  ingest(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/u);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "ready") {
        this.readyMs = performance.now();
        this.readyChildNs = BigInt(event.monotonicNs);
        this.resolveReady();
        continue;
      }
      const entry = this.pending.get(String(event.requestId));
      if (!entry) continue;
      const eventMs = this.readyMs + Number(BigInt(event.monotonicNs) - this.readyChildNs) / 1e6;
      if (event.type === "prompt_accepted") entry.timing.promptAcceptedMs = eventMs;
      else if (event.type === "provider_dispatched") entry.timing.providerDispatchedMs = eventMs;
      else if (event.type === "first_delta") entry.timing.firstDeltaMs ??= eventMs;
      else if (event.type === "decision_committed") {
        const decision = normalizeDecision(event.decision);
        if (decision && !entry.decision) {
          entry.decision = decision;
          entry.timing.decisionCommittedMs = eventMs;
        }
      } else if (event.type === "finished") {
        clearTimeout(entry.timer);
        this.pending.delete(String(event.requestId));
        entry.timing.finishedMs = eventMs;
        entry.resolve({
          status: entry.decision ? "completed" : "invalid",
          decision: entry.decision,
          timing: entry.timing,
        });
      } else if (event.type === "error") {
        clearTimeout(entry.timer);
        this.pending.delete(String(event.requestId));
        entry.timing.finishedMs = eventMs;
        entry.resolve({
          status: "error",
          decision: entry.decision,
          timing: entry.timing,
          error: String(event.message ?? "adapter error").slice(0, 1_000),
        });
      }
    }
  }

  async run(request) {
    await this.ready;
    const requestId = request.requestId;
    return new Promise((resolve, reject) => {
      const timing = {
        promptAcceptedMs: this.readyMs,
        finishedMs: this.readyMs,
      };
      const entry = { resolve, reject, timing, decision: null };
      entry.timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({
          status: "timeout",
          decision: entry.decision,
          timing: { ...timing, finishedMs: performance.now() },
          error: "persistent adapter timed out",
        });
      }, this.timeoutMs);
      this.pending.set(requestId, entry);
      this.child.stdin.write(`${JSON.stringify(request)}\n`);
    });
  }

  async shutdown() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const closed = new Promise((resolve) => this.child.once("close", resolve));
    this.child.stdin.end();
    this.child.kill("SIGTERM");
    const timer = setTimeout(() => this.child.kill("SIGKILL"), 2_000);
    await closed;
    clearTimeout(timer);
  }
}

async function runAdapter(command, args, request, timeoutMs, environment) {
  const processStartedMs = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.resolve(import.meta.dirname, ".."),
      env: environment ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let buffer = "";
    let stderr = "";
    let readyParentMs;
    let readyChildNs;
    let decision = null;
    const timing = { processStartedMs };
    let settled = false;
    const eventTime = (event) => {
      if (readyParentMs === undefined || readyChildNs === undefined) return performance.now();
      return readyParentMs + Number(BigInt(event.monotonicNs) - readyChildNs) / 1e6;
    };
    const terminate = (signal) => {
      if (process.platform !== "win32" && child.pid) {
        try { process.kill(-child.pid, signal); } catch { child.kill(signal); }
      } else child.kill(signal);
    };
    const timer = setTimeout(() => terminate("SIGTERM"), timeoutMs);
    const hardTimer = setTimeout(() => terminate("SIGKILL"), timeoutMs + 2_000);
    const inspect = (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === "ready") {
        readyParentMs = performance.now();
        readyChildNs = BigInt(event.monotonicNs);
        timing.processReadyMs = readyParentMs;
        child.stdin.end(`${JSON.stringify(request)}\n`);
      } else if (event.type === "prompt_accepted") timing.promptAcceptedMs = eventTime(event);
      else if (event.type === "provider_dispatched") timing.providerDispatchedMs = eventTime(event);
      else if (event.type === "first_delta") timing.firstDeltaMs ??= eventTime(event);
      else if (event.type === "decision_committed") {
        const normalized = normalizeDecision(event.decision);
        if (normalized && decision === null) {
          decision = normalized;
          timing.decisionCommittedMs = eventTime(event);
        }
      } else if (event.type === "error") stderr = `${stderr}\n${String(event.message ?? "adapter error")}`.slice(-8_000);
    };
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? "";
      try { for (const line of lines) inspect(line); } catch (error) { stderr = `${stderr}\n${error}`; }
    });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(hardTimer);
      if (buffer.trim()) {
        try { inspect(buffer); } catch (error) { stderr = `${stderr}\n${error}`; }
      }
      timing.finishedMs = performance.now();
      if (timing.promptAcceptedMs === undefined) timing.promptAcceptedMs = timing.processReadyMs ?? processStartedMs;
      const timedOut = timing.finishedMs - processStartedMs >= timeoutMs;
      resolve({
        status: timedOut ? "timeout" : decision ? "completed" : code === 0 ? "invalid" : "error",
        decision,
        timing,
        error: decision ? undefined : stderr.trim().slice(0, 1_000) || `adapter exited ${code}`,
      });
    });
  });
}

async function liveResult(trial, scenario, options, provenanceRecord) {
  const request = {
    prompt: renderDecisionProtocolPrompt(scenario),
    modelId: options.modelId,
    thinkingEffort: options.thinkingEffort,
    timeoutMs: options.timeoutMs,
  };
  if (trial.methodId === "orynt") {
    return { ...trial, ...await runAdapter(process.execPath, [path.join(import.meta.dirname, "orynt-decision-adapter.mjs")], request, options.timeoutMs) };
  }
  const hermesRoot = provenanceRecord.hermes.root;
  const temporaryHome = await mkdtemp(path.join(os.tmpdir(), "hermes-decision-home-"));
  try {
    const python = path.join(hermesRoot, ".venv", "bin", "python");
    const temporaryAuth = path.join(temporaryHome, "auth.json");
    await copyFile(path.join(os.homedir(), ".hermes", "auth.json"), temporaryAuth);
    await chmod(temporaryAuth, 0o600);
    // Keep HOME so the pinned openai-codex runtime can use the same provider
    // credentials as Orynt. HERMES_HOME isolates Hermes-owned state while the
    // minimum required Hermes credential file is copied with private mode.
    const environment = { ...process.env, HERMES_HOME: temporaryHome };
    return { ...trial, ...await runAdapter(python, [path.join(import.meta.dirname, "hermes-decision-adapter.py"), "--hermes-root", hermesRoot], request, options.timeoutMs, environment) };
  } finally {
    await rm(temporaryHome, { recursive: true, force: true });
  }
}

async function createPersistentWorkers(options, provenanceRecord) {
  const hermesRoot = provenanceRecord.hermes.root;
  const temporaryHome = await mkdtemp(path.join(os.tmpdir(), "hermes-decision-home-"));
  const temporaryAuth = path.join(temporaryHome, "auth.json");
  await copyFile(path.join(os.homedir(), ".hermes", "auth.json"), temporaryAuth);
  await chmod(temporaryAuth, 0o600);
  const oryntAppServer = new PersistentWorker(
    process.execPath,
    [path.join(import.meta.dirname, "orynt-decision-appserver-adapter.mjs")],
    process.env,
    options.timeoutMs,
  );
  const oryntResponses = options.benchmarkVersion === "v3"
    ? new PersistentWorker(
        process.execPath,
        [path.join(import.meta.dirname, "orynt-decision-responses-adapter.mjs")],
        process.env,
        options.timeoutMs,
      )
    : undefined;
  const hermes = new PersistentWorker(
    path.join(hermesRoot, ".venv", "bin", "python"),
    [path.join(import.meta.dirname, "hermes-decision-adapter.py"), "--hermes-root", hermesRoot, "--persistent"],
    { ...process.env, HERMES_HOME: temporaryHome },
    options.timeoutMs,
  );
  try {
    await Promise.all([
      oryntAppServer.ready,
      hermes.ready,
      ...(oryntResponses ? [oryntResponses.ready] : []),
    ]);
  } catch (error) {
    await Promise.allSettled([
      oryntAppServer.shutdown(),
      hermes.shutdown(),
      ...(oryntResponses ? [oryntResponses.shutdown()] : []),
    ]);
    await rm(temporaryHome, { recursive: true, force: true });
    throw error;
  }
  const workers = {
    ...(options.benchmarkVersion === "v3"
      ? {
          orynt_responses_ws: oryntResponses,
          orynt_app_server: oryntAppServer,
        }
      : { orynt: oryntAppServer }),
    hermes,
    async shutdown() {
      await Promise.all([
        oryntAppServer.shutdown(),
        hermes.shutdown(),
        ...(oryntResponses ? [oryntResponses.shutdown()] : []),
      ]);
      await rm(temporaryHome, { recursive: true, force: true });
    },
  };
  return workers;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "live" && !options.confirmed) {
    throw new Error("Live mode performs provider calls. Re-run with --confirm-live after approving quota use.");
  }
  const allScenarios = createDecisionBenchV1();
  const scenarioLimit = options.scenarioLimit
    ? Math.max(1, Math.min(allScenarios.length, options.scenarioLimit))
    : allScenarios.length;
  const scenarioGroups = ["respond", "clarify", "act", "refuse"].map(
    (kind) => allScenarios.filter((scenario) => scenario.kind === kind),
  );
  const scenarios = Array.from({ length: scenarioLimit }, (_, index) => {
    const group = scenarioGroups[index % scenarioGroups.length];
    return group[Math.floor(index / scenarioGroups.length)];
  }).filter(Boolean);
  const methods = options.benchmarkVersion === "v3"
    ? DECISION_BENCH_V3_METHODS
    : undefined;
  const schedule = buildDecisionTrialSchedule(
    scenarios,
    options.repetitions,
    options.seed,
    methods,
  );
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const provenanceRecord = await provenance(options);
  const output = path.resolve(options.output ?? path.join(os.tmpdir(), "orynt-hermes-decision-bench", new Date().toISOString().replaceAll(":", "-")));
  await mkdir(output, { recursive: true });
  const checkpointPath = path.join(output, `decision-${options.benchmarkVersion}.checkpoint.jsonl`);
  const results = [];
  if (options.resume) {
    try {
      const checkpoint = await readFile(checkpointPath, "utf8");
      for (const line of checkpoint.split(/\r?\n/u).filter(Boolean)) results.push(JSON.parse(line));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  } else {
    await writeFile(checkpointPath, "");
  }
  const completedIds = new Set(results.map((result) => result.id));
  const persistentWorkers =
    options.mode === "live" && ["v2", "v3"].includes(options.benchmarkVersion)
      ? await createPersistentWorkers(options, provenanceRecord)
      : undefined;
  try {
    if (options.mode === "live" && results.length === 0) {
      for (const methodId of methods ?? ["orynt", "hermes"]) {
        const warmup = { id: `warmup:${methodId}`, sequence: -1, repetition: 0, scenarioId: scenarios[0].id, methodId };
        const warmupResult = persistentWorkers
          ? {
              ...warmup,
              ...await persistentWorkers[methodId].run({
                requestId: warmup.id,
                prompt: renderDecisionProtocolPromptV2(scenarios[0]),
                cwd: path.resolve(import.meta.dirname, ".."),
                modelId: options.modelId,
                thinkingEffort: options.thinkingEffort,
                outputSchema: DECISION_OUTPUT_SCHEMA,
                timeoutMs: options.timeoutMs,
              }),
            }
          : await liveResult(warmup, scenarios[0], options, provenanceRecord);
        if (warmupResult.status === "error" || warmupResult.status === "timeout") {
          throw new Error(`${methodId} warmup failed: ${warmupResult.error ?? warmupResult.status}`);
        }
      }
    }
    for (const trial of schedule) {
      if (completedIds.has(trial.id)) continue;
      const scenario = scenarioById.get(trial.scenarioId);
      const result = options.mode === "live"
        ? persistentWorkers
          ? {
              ...trial,
              ...await persistentWorkers[trial.methodId].run({
                requestId: trial.id,
                prompt: renderDecisionProtocolPromptV2(scenario),
                cwd: path.resolve(import.meta.dirname, ".."),
                modelId: options.modelId,
                thinkingEffort: options.thinkingEffort,
                outputSchema: DECISION_OUTPUT_SCHEMA,
                timeoutMs: options.timeoutMs,
              }),
            }
          : await liveResult(trial, scenario, options, provenanceRecord)
        : controlledResult(trial, scenario);
      if (options.mode === "live") process.stderr.write(`[${trial.sequence + 1}/${schedule.length}] ${trial.methodId} ${trial.scenarioId}: ${result.status}\n`);
      if (result.status === "error") {
        throw new Error(`${trial.methodId} infrastructure failure on ${trial.scenarioId}: ${result.error ?? "unknown error"}`);
      }
      results.push(result);
      completedIds.add(result.id);
      await appendFile(checkpointPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
    }
  } finally {
    await persistentWorkers?.shutdown();
  }
  const report =
    options.benchmarkVersion === "v3"
      ? createDecisionBenchmarkReportV3(scenarios, results)
      : options.benchmarkVersion === "v2"
        ? createDecisionBenchmarkReportV2(scenarios, results)
        : createDecisionBenchmarkReport(scenarios, results);
  const artifactPrefix = report.benchmarkId;
  await Promise.all([
    writeFile(path.join(output, `${artifactPrefix}.json`), renderDecisionReportJson(report)),
    writeFile(path.join(output, `${artifactPrefix}.trials.jsonl`), renderDecisionTrialsJsonl(report.trials)),
    writeFile(path.join(output, `${artifactPrefix}.md`), renderDecisionReportMarkdown(report)),
    writeFile(path.join(output, `${artifactPrefix}.provenance.json`), `${JSON.stringify({
      ...provenanceRecord,
      benchmarkId: report.benchmarkId,
      lifecycle: ["v2", "v3"].includes(options.benchmarkVersion)
        ? "warm-steady-state"
        : "cold-per-trial",
    }, null, 2)}\n`),
  ]);
  process.stdout.write(`${JSON.stringify({ output, mode: options.mode, scenarioCount: scenarios.length, measuredTrials: schedule.length, winGate: report.winGate }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
