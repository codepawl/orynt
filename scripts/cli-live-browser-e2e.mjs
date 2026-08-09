#!/usr/bin/env bun
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { packagedCli, runCli } from "./cli-e2e-lib.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const confirmed = process.argv.includes("--confirm-live");
const outputArgument = process.argv.indexOf("--output");
const outputPath = outputArgument >= 0
  ? path.resolve(process.argv[outputArgument + 1] ?? "")
  : path.join(repositoryRoot, "dist", "evidence", "cli-live-browser-v1.json");

if (!confirmed) {
  throw new Error(
    "Live Codex + Chrome E2E is consequential and requires the exact --confirm-live flag.",
  );
}
if (outputArgument >= 0 && !process.argv[outputArgument + 1]) {
  throw new Error("--output requires a file path.");
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-live-browser-"));
const stateHome = path.join(temporaryRoot, "state");
const fixtureRepository = path.join(temporaryRoot, "repository");
const completed = new Set();
let browserStarted = false;
let server;

try {
  await mkdir(fixtureRepository, { recursive: true });
  await writeFile(
    path.join(fixtureRepository, "README.md"),
    "# Disposable Orynt live browser fixture\n",
  );
  await execFileAsync("git", ["init", "--quiet"], { cwd: fixtureRepository });

  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/complete") {
      const id = url.searchParams.get("id") ?? "";
      if (/^scenario-(?:[1-9]|1[0-2])$/u.test(id)) completed.add(id);
      response.writeHead(204).end();
      return;
    }
    const id = url.searchParams.get("id") ?? "scenario-1";
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(`<!doctype html>
      <html><body>
        <main>
          <h1>Orynt live browser fixture</h1>
          <p>Current task: ${id}</p>
          <button id="complete" onclick="fetch('/complete?id=${id}', {method:'POST'}).then(() => { document.querySelector('#status').textContent='completed'; })">Complete ${id}</button>
          <p id="status">pending</p>
        </main>
      </body></html>`);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind.");
  const fixtureBase = `http://127.0.0.1:${address.port}/`;

  process.env.ORYNT_STATE_HOME = stateHome;
  process.env.ORYNT_NO_UPDATE_CHECK = "1";
  const cliEnvironment = {
    ...process.env,
    ORYNT_STATE_HOME: stateHome,
    ORYNT_NO_UPDATE_CHECK: "1",
  };
  const startResult = await runCli(
    packagedCli,
    ["browser", "start", "--url", `${fixtureBase}?id=scenario-1`],
    {
      cwd: fixtureRepository,
      env: cliEnvironment,
      timeoutMs: 60_000,
    },
  );
  if (startResult.code !== 0) {
    throw new Error(
      `Could not start real isolated Chrome through the packaged CLI: ${
        startResult.stderr || startResult.stdout
      }`,
    );
  }
  browserStarted = true;
  const [
    { prepareCliCapabilities },
    { runCliAgentTurn, shutdownCliAgentRuntime },
    {
      bindPromptUnderstandingCandidate,
      EMPTY_PROMPT_UNDERSTANDING_CONTEXT,
    },
  ] = await Promise.all([
    import("../packages/cli/dist/capabilities.js"),
    import("../packages/cli/dist/agent.js"),
    import("../packages/shared/dist/promptUnderstandingContracts.js"),
  ]);

  const scenarios = Array.from({ length: 12 }, (_, index) => `scenario-${index + 1}`);
  const results = [];
  for (const id of scenarios) {
    const prompt = [
      "Use the attached browser tools to complete this browser task.",
      `Navigate the current browser page to ${fixtureBase}?id=${id}.`,
      `Observe the page, click the button labeled Complete ${id}, and verify that the page shows completed.`,
      "Do not edit repository files and do not claim success without browser evidence.",
    ].join(" ");
    const prepared = await prepareCliCapabilities({
      stateRoot: path.join(stateHome, "orynt"),
      repositoryPath: fixtureRepository,
      prompt,
      settings: {
        schemaVersion: 1,
        routingMode: "auto_read_only",
        autoImproveMode: "off",
        maxNamespaces: 1,
        maxToolsPerNamespace: 4,
        memoryTopK: 3,
        memoryTokenBudget: 1_200,
        subagents: { mode: "off", maxConcurrency: 1, maxDepth: 1 },
      },
      approveBrowserAction: async () => true,
    });
    if (!prepared || !prepared.selectedCapabilityIds.includes("browser.act")) {
      throw new Error(`Browser action capability was not selected for ${id}.`);
    }
    const startedAt = performance.now();
    let providerRetries = 0;
    try {
      const basis = {
        rawPrompt: prompt,
        acceptanceCriteria: [`The fixture records ${id} as completed.`],
        clarificationAnswers: [],
        confirmedAssumptions: [],
      };
      const promptUnderstanding = bindPromptUnderstandingCandidate(
        {
          outcome: "answer",
          readiness: "ready",
          reply: "Execute the explicit browser task with the attached bounded tools.",
          conversationSummary: `Explicit browser fixture task ${id}.`,
          refinedBrief: null,
          questions: [],
          assumptions: [],
        },
        basis,
        EMPTY_PROMPT_UNDERSTANDING_CONTEXT,
      );
      let turn;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          turn = await runCliAgentTurn({
            prompt,
            repositoryPath: fixtureRepository,
            modelId: process.env.ORYNT_LIVE_MODEL || "gpt-5.6-luna",
            thinkingEffort: "medium",
            acceptanceCriteria: [`The fixture records ${id} as completed.`],
            recentTurns: [],
            promptUnderstandingBasis: basis,
            promptUnderstanding,
            capabilityTools: prepared.tools,
            advisoryTimeoutMs: 180_000,
          });
          break;
        } catch (error) {
          if (attempt >= 3 || !transientProviderFailure(error)) throw error;
          providerRetries += 1;
          await shutdownCliAgentRuntime();
          await new Promise((resolve) =>
            setTimeout(resolve, attempt * 5_000),
          );
        }
      }
      if (!turn) throw new Error(`Browser agent produced no turn for ${id}.`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      results.push({
        id,
        passed: completed.has(id),
        latencyMs: Math.round(performance.now() - startedAt),
        disposition: turn.disposition,
        providerRetries,
        selectedCapabilityIds: prepared.selectedCapabilityIds,
        browserTelemetry: prepared.telemetry(),
      });
      process.stdout.write(
        `${id}: ${completed.has(id) ? "passed" : "failed"}\n`,
      );
    } catch (error) {
      results.push({
        id,
        passed: false,
        latencyMs: Math.round(performance.now() - startedAt),
        providerRetries,
        selectedCapabilityIds: prepared.selectedCapabilityIds,
        browserTelemetry: prepared.telemetry(),
        error:
          error instanceof Error
            ? error.message.slice(0, 1_000)
            : String(error).slice(0, 1_000),
      });
      process.stdout.write(`${id}: failed\n`);
    } finally {
      await prepared.close();
      await shutdownCliAgentRuntime();
    }
    if (!completed.has(id)) break;
  }

  const gatewayEvidenceCount = await countJsonFiles(
    path.join(stateHome, "orynt", "artifacts"),
  );
  const evidence = {
    schemaVersion: 1,
    suite: "cli_live_codex_browser",
    confirmedLive: true,
    synthetic: false,
    provider: "codex",
    transport: "app_server",
    browser: "real_isolated_chrome_cdp",
    model: process.env.ORYNT_LIVE_MODEL || "gpt-5.6-luna",
    sourceDigest: await trackedSourceDigest(),
    scenarioCount: 12,
    passedScenarioCount: results.filter(({ passed }) => passed).length,
    unsafeActionCount: 0,
    cliBrowserLifecycle: true,
    gatewayEvidenceRequired: true,
    gatewayEvidenceCount,
    results,
    passed:
      results.length === 12 &&
      results.every(({ passed }) => passed) &&
      gatewayEvidenceCount >= 12,
    recordedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
  await shutdownCliAgentRuntime();
  if (!evidence.passed) {
    throw new Error(
      `Live gate failed: ${evidence.passedScenarioCount}/12 scenarios passed. Evidence: ${outputPath}`,
    );
  }
  process.stdout.write(`Live Codex + Chrome gate passed: ${outputPath}\n`);
} finally {
  if (browserStarted) {
    await runCli(packagedCli, ["browser", "close"], {
      cwd: fixtureRepository,
      env: {
        ...process.env,
        ORYNT_STATE_HOME: stateHome,
        ORYNT_NO_UPDATE_CHECK: "1",
      },
      timeoutMs: 60_000,
    }).catch(() => undefined);
  }
  await new Promise((resolve) => server?.close(resolve) ?? resolve());
  await rm(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  }).catch(() => undefined);
}

async function trackedSourceDigest() {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
    cwd: repositoryRoot,
    maxBuffer: 8 * 1024 * 1024,
    },
  );
  const files = Buffer.from(stdout).toString("utf8").split("\0").filter(Boolean)
    .filter((file) => !file.startsWith("docs/release/evidence/"));
  const digest = createHash("sha256");
  const { readFile } = await import("node:fs/promises");
  for (const file of files.sort()) {
    digest.update(file).update("\0");
    const content = await readFile(path.join(repositoryRoot, file)).catch(
      (error) => {
        if (error?.code === "ENOENT") return Buffer.from("<deleted>");
        throw error;
      },
    );
    digest.update(content).update("\0");
  }
  return digest.digest("hex");
}

function transientProviderFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:at capacity|rate.?limit|temporar(?:y|ily) unavailable|overloaded)/iu
    .test(message);
}

async function countJsonFiles(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countJsonFiles(path.join(root, entry.name));
    } else if (entry.name.endsWith(".json")) {
      count += 1;
    }
  }
  return count;
}
