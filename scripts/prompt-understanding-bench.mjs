import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  controlledPromptUnderstandingCandidate,
  createPromptUnderstandingBenchmarkReport,
  createPromptUnderstandingScenarios,
} from "../packages/eval-harness/dist/index.js";
import { understandDesktopPrompt } from "../packages/coding-apprentice/dist/promptUnderstanding.js";
import { releaseSourceDigest } from "./release-source-digest.mjs";

function parseArgs(argv) {
  const options = {
    live: false,
    confirmed: false,
    modelId: "gpt-5.6",
    thinkingEffort: "medium",
    providerId: "codex-cli",
    repetitions: 2,
    output: undefined,
    evidenceOutput: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--live") options.live = true;
    else if (argument === "--confirm-live") options.confirmed = true;
    else if (argument === "--model") options.modelId = argv[++index];
    else if (argument === "--thinking-effort") options.thinkingEffort = argv[++index];
    else if (argument === "--provider") options.providerId = argv[++index];
    else if (argument === "--repetitions") options.repetitions = Number(argv[++index]);
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--evidence-output") {
      options.evidenceOutput = argv[++index];
    }
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1 || options.repetitions > 5) {
    throw new Error("--repetitions must be an integer from 1 to 5");
  }
  if (!["codex-cli", "openai-api"].includes(options.providerId)) {
    throw new Error("--provider must be codex-cli or openai-api");
  }
  if (options.live && !options.confirmed) {
    throw new Error("Live mode performs provider calls. Re-run with --confirm-live after approving quota use.");
  }
  return options;
}

function renderMarkdown(report, provenance) {
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  return [
    "# Prompt Understanding Benchmark",
    "",
    `- Mode: ${provenance.mode}`,
    `- Model: ${provenance.modelId}`,
    `- Commit: ${provenance.commit}`,
    `- Scenarios: ${report.scenarioCount}`,
    `- Repetitions: ${report.repetitions}`,
    "",
    "## Metrics",
    "",
    `- Valid output rate: ${percent(report.metrics.validOutputRate)}`,
    `- Outcome/readiness accuracy: ${percent(report.metrics.outcomeReadinessAccuracy)}`,
    `- Follow-up accuracy: ${percent(report.metrics.followUpAccuracy)}`,
    `- Clarification precision: ${percent(report.metrics.clarificationPrecision)}`,
    `- Clarification recall: ${percent(report.metrics.clarificationRecall)}`,
    `- Safety-boundary accuracy: ${percent(report.metrics.safetyBoundaryAccuracy)}`,
    `- Silent scope expansions: ${report.metrics.silentScopeExpansionCount}`,
    "",
    "## Release gate",
    "",
    report.gates.passed ? "PASS" : "FAIL",
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scenarios = createPromptUnderstandingScenarios();
  const output = path.resolve(
    options.output ??
      path.join(
        os.tmpdir(),
        "orynt-prompt-understanding-bench",
        new Date().toISOString().replaceAll(":", "-"),
      ),
  );
  await mkdir(output, { recursive: true });
  const trials = [];
  for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
    for (const scenario of scenarios) {
      const startedAt = performance.now();
      try {
        const result = await understandDesktopPrompt(
          {
            promptBasis: scenario.basis,
            context: scenario.context,
            repositoryPath: process.cwd(),
            modelConnection: {
              providerId: options.providerId,
              providerLabel: options.providerId === "codex-cli" ? "Codex CLI" : "OpenAI API",
              modelId: options.modelId,
              modelLabel: options.modelId,
              authMethod: options.providerId === "codex-cli" ? "codexCliSession" : "environment",
              ...(options.providerId === "openai-api" ? { envKey: "OPENAI_API_KEY" } : {}),
            },
            thinkingEffort: options.thinkingEffort,
          },
          options.live
            ? {}
            : {
                modelTurn: async () =>
                  JSON.stringify(controlledPromptUnderstandingCandidate(scenario)),
              },
        );
        trials.push({
          scenarioId: scenario.id,
          repetition,
          status: "completed",
          result,
          durationMs: performance.now() - startedAt,
        });
      } catch (error) {
        trials.push({
          scenarioId: scenario.id,
          repetition,
          status: error?.code === "understanding_output_invalid" ? "invalid" : "error",
          result: null,
          error: error instanceof Error ? error.message : String(error),
          durationMs: performance.now() - startedAt,
        });
      }
      if (options.live) {
        process.stderr.write(
          `[${trials.length}/${scenarios.length * options.repetitions}] ${scenario.id}: ${trials.at(-1).status}\n`,
        );
      }
    }
  }
  const report = createPromptUnderstandingBenchmarkReport(
    scenarios,
    trials,
    options.repetitions,
  );
  const provenance = {
    benchmarkId: report.benchmarkId,
    mode: options.live ? "live" : "controlled",
    providerId: options.providerId,
    modelId: options.modelId,
    thinkingEffort: options.thinkingEffort,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    createdAt: new Date().toISOString(),
  };
  await Promise.all([
    writeFile(path.join(output, "prompt-understanding-v1.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(path.join(output, "prompt-understanding-v1.trials.jsonl"), `${trials.map((trial) => JSON.stringify(trial)).join("\n")}\n`),
    writeFile(path.join(output, "prompt-understanding-v1.md"), renderMarkdown(report, provenance)),
    writeFile(path.join(output, "prompt-understanding-v1.provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`),
  ]);
  if (options.evidenceOutput) {
    const evidencePath = path.resolve(options.evidenceOutput);
    await mkdir(path.dirname(evidencePath), { recursive: true });
    await writeFile(
      evidencePath,
      `${JSON.stringify({
        schemaVersion: 1,
        suite: "prompt_understanding_live",
        confirmedLive: options.live && options.confirmed,
        sourceDigest: await releaseSourceDigest(process.cwd()),
        providerId: options.providerId,
        modelId: options.modelId,
        thinkingEffort: options.thinkingEffort,
        scenarioCount: report.scenarioCount,
        repetitions: report.repetitions,
        metrics: report.metrics,
        gates: report.gates,
        passed: report.gates.passed,
        recordedAt: new Date().toISOString(),
      }, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
  process.stdout.write(`${JSON.stringify({ output, gates: report.gates, metrics: report.metrics })}\n`);
  if (!report.gates.passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
