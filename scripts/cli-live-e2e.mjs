#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createFixtureRepository,
  packagedCli,
  parseJsonLines,
  repositoryRoot,
  runCli,
  runProcess,
} from "./cli-e2e-lib.mjs";
import {
  createNodeCliWrapper,
  runOrderedPty,
} from "./cli-pty-harness.mjs";
import { releaseSourceDigest } from "./release-source-digest.mjs";

if (!process.argv.includes("--confirm-live")) {
  throw new Error(
    "Live CLI E2E uses provider quota and requires the exact --confirm-live flag.",
  );
}
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) {
  throw new Error("--output requires a file path.");
}
const outputPath = path.resolve(
  outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : path.join(repositoryRoot, "dist", "evidence", "cli-live-e2e-v1.json"),
);
const onlyScenarioIndex = process.argv.indexOf("--only-scenario");
const onlyScenario =
  onlyScenarioIndex >= 0 ? process.argv[onlyScenarioIndex + 1] : undefined;
if (onlyScenarioIndex >= 0 && !onlyScenario) {
  throw new Error("--only-scenario requires a scenario id.");
}
const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-live-e2e-"));
const stateHome = path.join(root, "state");
const repositoryPath = await createFixtureRepository(root);
const environment = {
  ...process.env,
  ORYNT_NO_UPDATE_CHECK: "1",
  ORYNT_STATE_HOME: stateHome,
};
const results = [];
let scenarioFailure;

try {
  await scenario("model-tier-doctor", async () => {
    const result = await runCli(
      packagedCli,
      ["doctor", "--live", "--confirm-live", "--json"],
      { cwd: repositoryPath, env: environment, timeoutMs: 10 * 60_000 },
    );
    assertExit(result, 0, "live doctor");
    const report = JSON.parse(result.stdout);
    for (const tier of ["light", "medium", "heavy"]) {
      const check = report.checks?.find(
        (candidate) => candidate.id === `live.tier.${tier}`,
      );
      if (check?.status !== "pass" || check.evidence?.sentinelMatched !== true) {
        throw new Error(`Live doctor did not prove ${tier}.`);
      }
    }
    return { readyTiers: ["light", "medium", "heavy"] };
  });

  await scenario("prompt-clarification-fail-closed", async () => {
    const result = await runCli(
      packagedCli,
      ["run", "--jsonl", "--approve-once", "-C", repositoryPath, "Fix the repository."],
      { cwd: repositoryPath, env: environment, timeoutMs: 5 * 60_000 },
    );
    assertExit(result, 2, "ambiguous headless prompt");
    const final = parseJsonLines(result.stdout).at(-1);
    if (final?.code !== "PROMPT_CLARIFICATION_REQUIRED") {
      throw new Error(`Expected PROMPT_CLARIFICATION_REQUIRED, got ${JSON.stringify(final)}`);
    }
    return { code: final.code, runCreated: false };
  });

  await scenario("read-only-repository-answer", async () => {
    const result = await runLiveReadOnlyPty({
      root,
      repositoryPath,
      environment,
    });
    const changed = await gitStatus(repositoryPath);
    if (changed) throw new Error(`Read-only source fixture changed: ${changed}`);
    return {
      status: "pass",
      transport: "linux_pty",
      headingObserved: result.headingObserved,
      composerReturned: result.composerReturned,
      contextObserved: result.contextObserved,
      cleanExit: result.cleanExit,
      answerObservedMs: result.timings.heading,
      composerReturnedMs: result.timings["composer-returned"],
      cleanExitMs: result.timings["session-ended"],
      sourceChanged: false,
    };
  });

  await scenario("verified-repository-mutation", async () => {
    const result = await runCli(
      packagedCli,
      [
        "run",
        "--jsonl",
        "--approve-once",
        "-C",
        repositoryPath,
        [
          "In this disposable fixture repository, edit only packages/value.txt",
          "so it contains exactly deterministic cli e2e pass.",
          "Use exact diff or file evidence for packages/value.txt and rely on Orynt's managed verifier.",
          "Do not modify any other user-owned repository file.",
        ].join(" "),
      ],
      { cwd: repositoryPath, env: environment, timeoutMs: 20 * 60_000 },
    );
    assertExit(result, 0, "verified repository mutation");
    const final = parseJsonLines(result.stdout).at(-1);
    if (final?.kind !== "result" || final.status !== "pass") {
      throw new Error(`Mutation run did not pass: ${JSON.stringify(final)}`);
    }
    const manifest = JSON.parse(await readFile(final.artifactManifestPath, "utf8"));
    for (const event of [
      "codex_execution_approved",
      "verification_passed",
      "run_finished",
    ]) {
      if (!manifest.eventTypes?.includes(event)) {
        throw new Error(`Mutation manifest is missing ${event}.`);
      }
    }
    const diffDescriptor = manifest.artifacts?.repositoryDiff;
    if (
      diffDescriptor?.kind !== "repository_diff" ||
      typeof diffDescriptor.path !== "string" ||
      typeof diffDescriptor.sha256 !== "string"
    ) {
      throw new Error("Mutation manifest is missing the repository diff artifact.");
    }
    const diffBytes = await readFile(diffDescriptor.path);
    if (
      createHash("sha256").update(diffBytes).digest("hex") !==
      diffDescriptor.sha256
    ) {
      throw new Error("Mutation repository diff digest did not match the manifest.");
    }
    const repositoryDiff = JSON.parse(String(diffBytes));
    if (
      repositoryDiff.redacted !== true ||
      repositoryDiff.totals?.files !== 1 ||
      !repositoryDiff.files?.[0]?.patch?.includes(
        "+deterministic cli e2e pass",
      )
    ) {
      throw new Error("Mutation repository diff evidence was incomplete.");
    }
    if (await gitStatus(repositoryPath)) {
      throw new Error("Live mutation changed the source fixture instead of its sandbox.");
    }
    return {
      runId: final.runId,
      status: final.status,
      approvalRecorded: true,
      verificationStatus: "pass",
      repositoryDiffRecorded: true,
      sourceChanged: false,
    };
  });

  await scenario("browser-allow-deny-and-evidence", async () => {
    const denied = await runCli(
      packagedCli,
      [
        "browser",
        "attach",
        "--browser-url",
        "http://example.com:9222",
        "--allow-origin",
        "https://example.com",
      ],
      { cwd: repositoryPath, env: environment },
    );
    if (
      denied.code === 0 ||
      !`${denied.stdout}\n${denied.stderr}`.match(/loopback/i)
    ) {
      throw new Error("Packaged CLI did not deny a non-loopback browser endpoint.");
    }
    const browserEvidencePath = path.join(root, "browser-live.json");
    const result = await runProcess(
      process.execPath,
      [
        "scripts/cli-live-browser-e2e.mjs",
        "--confirm-live",
        "--output",
        browserEvidencePath,
      ],
      {
        cwd: repositoryRoot,
        env: environment,
        timeoutMs: 30 * 60_000,
      },
    );
    const evidence = JSON.parse(
      await readFile(browserEvidencePath, "utf8").catch(() => "{}"),
    );
    if (result.code !== 0) {
      const failed = Array.isArray(evidence.results)
        ? evidence.results.find(({ passed }) => passed !== true)
        : undefined;
      throw Object.assign(
        new Error(
          `Live browser CLI failed with ${evidence.passedScenarioCount ?? 0}/${
            evidence.scenarioCount ?? 12
          } scenarios passed${
            failed?.id ? ` at ${failed.id}` : ""
          }: ${
            (result.stderr || result.stdout || "<no output>").slice(-2_000)
          }`,
        ),
        {
          stage: failed?.id ?? "browser-live-child",
          evidence,
        },
      );
    }
    if (
      evidence.passed !== true ||
      evidence.passedScenarioCount !== evidence.scenarioCount ||
      evidence.unsafeActionCount !== 0 ||
      evidence.cliBrowserLifecycle !== true
    ) {
      throw new Error("Live browser evidence was incomplete.");
    }
    return {
      scenarioCount: evidence.scenarioCount,
      passedScenarioCount: evidence.passedScenarioCount,
      gatewayEvidenceCount: evidence.gatewayEvidenceCount,
      unsafeActionCount: evidence.unsafeActionCount,
      cliBrowserLifecycle: evidence.cliBrowserLifecycle,
      denyVerified: true,
    };
  });

  const fullSuitePassed =
    results.length === 5 && results.every(({ passed }) => passed);
  const diagnosticPassed =
    Boolean(onlyScenario) &&
    results.length === 1 &&
    results.every(({ passed }) => passed);
  const evidence = {
    schemaVersion: 1,
    suite: "cli_live_e2e",
    confirmedLive: true,
    synthetic: false,
    executable: "packaged_npm_cli",
    provider: "codex",
    sourceDigest: await releaseSourceDigest(repositoryRoot),
    scenarioCount: results.length,
    passedScenarioCount: results.filter(({ passed }) => passed).length,
    unsafeActionCount: 0,
    diagnostic: Boolean(onlyScenario),
    releaseEligible: !onlyScenario && fullSuitePassed,
    failedScenarioId: results.find(({ passed }) => !passed)?.id,
    results,
    passed: onlyScenario ? diagnosticPassed : fullSuitePassed,
    recordedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
  if (scenarioFailure || !evidence.passed) {
    throw new Error(
      `Live CLI E2E failed${
        evidence.failedScenarioId ? ` at ${evidence.failedScenarioId}` : ""
      }: ${outputPath}`,
      scenarioFailure ? { cause: scenarioFailure } : undefined,
    );
  }
  process.stdout.write(`Live CLI E2E passed: ${outputPath}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}

async function scenario(id, execute) {
  if (scenarioFailure || (onlyScenario && id !== onlyScenario)) return;
  const startedAt = performance.now();
  process.stdout.write(`${id}: running\n`);
  try {
    const details = await execute();
    results.push({
      id,
      passed: true,
      durationMs: Math.round(performance.now() - startedAt),
      ...details,
    });
    process.stdout.write(`${id}: passed\n`);
  } catch (error) {
    scenarioFailure = error;
    results.push({
      id,
      passed: false,
      durationMs: Math.round(performance.now() - startedAt),
      failureStage:
        typeof error === "object" &&
        error !== null &&
        "stage" in error
          ? String(error.stage).slice(0, 120)
          : id,
      error: error instanceof Error ? error.message.slice(0, 2_000) : String(error),
      ...(
        typeof error === "object" &&
        error !== null &&
        "evidence" in error
          ? { childEvidence: error.evidence }
          : {}
      ),
    });
    process.stdout.write(`${id}: failed\n`);
  }
}

function assertExit(result, expected, label) {
  if (result.code !== expected) {
    throw new Error(
      `${label} exited ${String(result.code)} (${String(result.signal)}): ${
        (result.stderr || result.stdout || "<no output>").slice(-4_000)
      }`,
    );
  }
}

async function gitStatus(repositoryPath) {
  const result = await runProcess("git", ["status", "--short"], {
    cwd: repositoryPath,
  });
  assertExit(result, 0, "git status");
  return result.stdout.trim();
}

async function runLiveReadOnlyPty({ root, repositoryPath, environment }) {
  if (process.platform !== "linux") {
    throw new Error("Live interactive repository E2E requires Linux.");
  }
  const prompt =
    "Inspect README.md in this disposable repository and report its first heading. Do not modify files.";
  const wrapperPath = await createNodeCliWrapper({
    root,
    name: "live-read-only-cli.cjs",
    entry: packagedCli,
    args: [
      "--profile",
      "economy",
      "--role-model",
      "coordinator=gpt-5.6-terra",
      "--role-effort",
      "coordinator=low",
      "-C",
      repositoryPath,
      prompt,
    ],
  });
  const transcriptPath = path.join(root, "live-read-only.typescript");
  const result = await runOrderedPty({
    wrapperPath,
    transcriptPath,
    cwd: repositoryPath,
    env: {
      ...environment,
      TERM: "xterm-256color",
      COLUMNS: "100",
      LINES: "30",
    },
    timeoutMs: 15 * 60_000,
    steps: [
      {
        id: "update-consent",
        waitFor: /Check for updates at startup/u,
        send: "n\n",
      },
      {
        id: "retention-consent",
        waitFor: /Clean up old sessions automatically/u,
        send: "n\n",
      },
      {
        id: "safety-prompt",
        waitFor: /Continue in this repository/u,
        send: "y\n",
      },
      {
        id: "safety-acknowledged",
        waitFor: /Safety boundary acknowledged/u,
      },
      {
        id: "heading",
        waitFor: /Disposable Orynt CLI E2E fixture/u,
      },
      {
        id: "composer-returned",
        waitFor:
          /ctx [▰▱]{5} [0-9.]+[kmb]?\/[0-9.]+[kmb]? · [0-9]{1,3}%/u,
        send: "/exit\n",
      },
      {
        id: "session-ended",
        waitFor: /Session ended/u,
      },
    ],
  });
  if (
    result.code !== 0 ||
    !result.visible.includes("Disposable Orynt CLI E2E fixture") ||
    !/ctx [▰▱]{5} [0-9.]+[kmb]?\/[0-9.]+[kmb]? · [0-9]{1,3}%/u.test(
      result.visible,
    ) ||
    !result.visible.includes("Session ended")
  ) {
    throw new Error(`Live read-only PTY failed:\n${result.visible}`);
  }
  return {
    headingObserved: true,
    composerReturned: true,
    contextObserved: true,
    cleanExit: true,
    timings: result.timings,
  };
}
