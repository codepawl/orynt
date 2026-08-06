import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const repositoryRoot = path.resolve(import.meta.dirname, "..");
export const builtCli = path.join(
  repositoryRoot,
  "packages",
  "cli",
  "dist",
  "main.js",
);
export const packagedCli = path.join(
  repositoryRoot,
  "dist",
  "cli",
  "npm",
  "orynt.mjs",
);

export async function createFixtureRepository(root) {
  const repositoryPath = path.join(root, "repository");
  await mkdir(path.join(repositoryPath, "packages"), { recursive: true });
  await mkdir(path.join(repositoryPath, "scripts"), { recursive: true });
  await runProcess("git", ["init", "--quiet"], { cwd: repositoryPath });
  await runProcess("git", ["config", "user.email", "orynt-e2e@example.test"], {
    cwd: repositoryPath,
  });
  await runProcess("git", ["config", "user.name", "Orynt E2E"], {
    cwd: repositoryPath,
  });
  await writeFile(
    path.join(repositoryPath, "README.md"),
    "# Disposable Orynt CLI E2E fixture\n",
  );
  await writeFile(
    path.join(repositoryPath, "packages", "value.txt"),
    "initial value\n",
  );
  await writeFile(
    path.join(repositoryPath, "scripts", "pass.mjs"),
    [
      'import { readFileSync } from "node:fs";',
      'const value = readFileSync("packages/value.txt", "utf8").trim();',
      'if (value !== "deterministic cli e2e pass") process.exit(1);',
      'console.log("cli e2e verification passed");',
      "",
    ].join("\n"),
  );
  await runProcess(
    "git",
    ["add", "README.md", "packages/value.txt", "scripts/pass.mjs"],
    { cwd: repositoryPath },
  );
  await runProcess("git", ["commit", "--quiet", "-m", "fixture"], {
    cwd: repositoryPath,
  });
  return repositoryPath;
}

export async function createControlledCodex(root) {
  const binRoot = path.join(root, "bin");
  const executable = path.join(binRoot, "codex");
  const helper = path.join(binRoot, "controlled-codex.cjs");
  await mkdir(binRoot, { recursive: true });
  await writeFile(
    helper,
    `const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const args = process.argv.slice(2);
const mode = process.env.ORYNT_E2E_CODEX_MODE || "action";
const input = args[0] === "exec" ? fs.readFileSync(0, "utf8") : "";
const effectiveMode = /"rawPrompt":"say hello"/iu.test(input) ? "answer" : mode;
const invocationLog = process.env.ORYNT_E2E_CODEX_LOG;
const responseDelayMs = Number.parseInt(process.env.ORYNT_E2E_CODEX_DELAY_MS || "0", 10);
if (invocationLog) fs.appendFileSync(invocationLog, JSON.stringify({ args, cwd: process.cwd(), mode: effectiveMode }) + "\\n");
if (args[0] === "--version") {
  console.log("codex-cli 0.146.0");
  process.exit(0);
}
if (args[0] === "app-server" && args[1] === "--help") {
  console.log("Usage: codex app-server --stdio");
  process.exit(0);
}
if (args[0] === "app-server" && args[1] === "--stdio") {
  const readline = require("node:readline");
  const lines = readline.createInterface({ input: process.stdin });
  const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      send({ jsonrpc: "2.0", id: message.id, result: {
        codexHome: "/tmp/controlled-codex",
        platformFamily: "unix",
        platformOs: "linux",
        userAgent: "controlled-codex"
      } });
    } else if (message.method === "account/read") {
      send({ jsonrpc: "2.0", id: message.id, result: {
        account: { type: "chatgpt", email: "private@example.test", planType: "pro" },
        requiresOpenaiAuth: true
      } });
    } else if (message.method === "account/rateLimits/read") {
      send({ jsonrpc: "2.0", id: message.id, result: {
        rateLimits: {
          limitId: "codex",
          primary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 1893456000 },
          secondary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1893416400 },
          credits: { hasCredits: false, unlimited: false, balance: "0" },
          spendControlReached: false
        },
        rateLimitsByLimitId: null
      } });
    } else if (message.method === "account/usage/read") {
      send({ jsonrpc: "2.0", id: message.id, result: {
        summary: {
          lifetimeTokens: 1234,
          peakDailyTokens: 456,
          longestRunningTurnSec: 78,
          currentStreakDays: 4,
          longestStreakDays: 9
        },
        dailyUsageBuckets: [{ startDate: "2026-08-03", tokens: 100 }]
      } });
    }
  });
  return;
}
if (args[0] === "login" && args[1] === "status") {
  console.log("Logged in using ChatGPT");
  process.exit(0);
}
if (args[0] === "debug" && args[1] === "models") {
  console.log(JSON.stringify({ models: [
    { slug: "gpt-5.5", display_name: "GPT-5.5", visibility: "list", priority: 0, supported_reasoning_levels: [{ effort: "high" }], default_reasoning_level: "high", context_window: 272000, effective_context_window_percent: 95 },
    { slug: "gpt-5.6-luna", display_name: "Luna", visibility: "list", priority: 1, supported_reasoning_levels: [{ effort: "medium" }, { effort: "high" }], default_reasoning_level: "medium", context_window: 272000, effective_context_window_percent: 95 },
    { slug: "gpt-5.6-terra", display_name: "Terra", visibility: "list", priority: 2, supported_reasoning_levels: [{ effort: "medium" }, { effort: "high" }], default_reasoning_level: "medium", context_window: 272000, effective_context_window_percent: 95 },
    { slug: "gpt-5.6-sol", display_name: "Sol", visibility: "list", priority: 3, supported_reasoning_levels: [{ effort: "high" }], default_reasoning_level: "high", context_window: 272000, effective_context_window_percent: 95 }
  ] }));
  process.exit(0);
}
if (args[0] !== "exec") {
  console.error("Unsupported controlled Codex invocation: " + args.join(" "));
  process.exit(2);
}
if (effectiveMode === "hang") {
  process.on("SIGTERM", () => process.exit(0));
  setInterval(() => {}, 1000);
  return;
}
const outputIndex = args.indexOf("--output-last-message");
const schemaIndex = args.indexOf("--output-schema");
const schemaPath = schemaIndex >= 0 ? args[schemaIndex + 1] : "";
let output;
if (schemaPath.endsWith("readiness.schema.json")) {
  output = {
    schemaVersion: 2,
    status: "READY",
    missing: null,
  };
} else if (schemaPath.endsWith("understanding.schema.json")) {
  output = effectiveMode === "clarify"
    ? {
        outcome: "repository_action",
        readiness: "clarification_required",
        reply: "The requested change is not specified.",
        conversationSummary: "A repository change was requested without a target or outcome.",
        refinedBrief: null,
        questions: [{
          id: "target",
          prompt: "What should be changed?",
          rationale: "The mutation target is missing.",
          kind: "outcome",
          options: [],
        }],
        assumptions: [],
      }
    : effectiveMode === "answer"
      ? {
          outcome: "answer",
          readiness: "ready",
          reply: "Controlled CLI answer.",
          conversationSummary: "Returned a deterministic answer.",
          refinedBrief: null,
          questions: [],
          assumptions: [],
        }
      : {
          outcome: "repository_action",
          readiness: "ready",
          reply: "The repository mutation is explicit and bounded.",
          conversationSummary: "Update only packages/value.txt and verify it.",
          refinedBrief: {
            goal: "Set packages/value.txt to the requested deterministic value.",
            deliverables: ["Updated packages/value.txt."],
            constraints: ["Do not change any other path."],
            acceptanceCriteria: ["bun run scripts/pass.mjs passes."],
            nonGoals: ["Do not publish or modify the source checkout."],
          },
          questions: [],
          assumptions: [],
        };
} else if (schemaPath.endsWith("turn.schema.json")) {
  const goal = "Set packages/value.txt to exactly deterministic cli e2e pass and run bun run scripts/pass.mjs.";
  output = effectiveMode === "answer"
    ? {
        disposition: "answer",
        reply: "Controlled CLI answer.",
        conversationSummary: "Returned a deterministic answer.",
        action: null,
      }
    : {
    disposition: "action",
    reply: "Prepared one bounded repository action.",
    conversationSummary: goal,
    action: {
      instruction: goal,
      rationale: "The requested path and value are explicit.",
      operations: ["read", "write"],
      estimatedPaths: ["packages/value.txt"],
      estimatedChangedFiles: 1,
      helperTasks: [],
      taskPlan: {
        summary: "Update and verify the fixture value.",
        requirements: [{
          id: "fixture-value",
          text: goal,
          source: "user_prompt",
          kind: "outcome",
          required: true,
        }],
        tasks: [{
          id: "update-fixture-value",
          title: "Update fixture value",
          instruction: goal,
          kind: "change",
          dependencies: [],
          requirementIds: ["fixture-value"],
          authority: "single_writer",
          operations: ["read", "write"],
          expectedPaths: ["packages/value.txt"],
          doneWhen: ["bun run scripts/pass.mjs passes."],
          evidence: [{
            id: "fixture-path-scope",
            requirementIds: ["fixture-value"],
            kind: "path_scope",
            description: "Only the approved fixture path changes.",
            command: null,
            path: "packages/value.txt",
          }],
        }],
        allowedOperations: ["read", "write"],
      },
    },
    };
} else if (schemaPath.endsWith("role.schema.json")) {
  output = {
    summary: "The bounded fixture change is verified.",
    findings: [],
    recommendation: "Accept the verified result.",
    recovery: null,
  };
} else {
  const cwdIndex = args.indexOf("-C");
  const cwd = cwdIndex >= 0 ? args[cwdIndex + 1] : process.cwd();
  fs.writeFileSync(path.join(cwd, "packages", "value.txt"), "deterministic cli e2e pass\\n");
  const verifier = path.join(cwd, ".codex", "orynt-beta-verify.mjs");
  if (fs.existsSync(verifier)) {
    execFileSync(process.execPath, [verifier], { cwd, stdio: "ignore" });
  }
  output = "Updated packages/value.txt and verified the bounded fixture.";
}
if (Number.isFinite(responseDelayMs) && responseDelayMs > 0) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, responseDelayMs);
}
if (outputIndex >= 0) {
  fs.writeFileSync(args[outputIndex + 1], typeof output === "string" ? output : JSON.stringify(output));
}
process.stdout.write(JSON.stringify({
  type: "item.completed",
  item: { id: "message-1", type: "agent_message", text: typeof output === "string" ? output : JSON.stringify(output) },
}) + "\\n");
`,
    { mode: 0o600 },
  );
  await writeFile(
    executable,
    `#!/bin/sh
case "$1:$2" in
  --version:) printf '%s\\n' 'codex-cli 0.146.0'; exit 0 ;;
  app-server:--help) printf '%s\\n' 'Usage: codex app-server --stdio'; exit 0 ;;
  login:status) printf '%s\\n' 'Logged in using controlled E2E fixture'; exit 0 ;;
esac
exec "${process.execPath}" "${helper}" "$@"
`,
    { mode: 0o755 },
  );
  await chmod(executable, 0o755);
  return binRoot;
}

export function cliEnvironment({
  stateHome,
  binRoot,
  mode = "action",
  invocationLog,
  extra = {},
}) {
  return {
    ...process.env,
    ...extra,
    ORYNT_NO_UPDATE_CHECK: "1",
    ORYNT_STATE_HOME: stateHome,
    ORYNT_CODEX_RUNTIME: "exec",
    ORYNT_E2E_CODEX_MODE: mode,
    ...(invocationLog ? { ORYNT_E2E_CODEX_LOG: invocationLog } : {}),
    ...(binRoot
      ? { PATH: `${binRoot}${path.delimiter}${process.env.PATH ?? ""}` }
      : {}),
  };
}

export function runCli(executable, argv, options = {}) {
  return runProcess(process.execPath, [executable, ...argv], options);
}

export async function runProcess(command, argv, options = {}) {
  const {
    cwd = repositoryRoot,
    env = process.env,
    input,
    timeoutMs = 120_000,
    maxOutputBytes = 8 * 1024 * 1024,
  } = options;
  const captureRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-process-"));
  const stdoutPath = path.join(captureRoot, "stdout.log");
  const stderrPath = path.join(captureRoot, "stderr.log");
  const stdoutFile = await open(stdoutPath, "w");
  const stderrFile = await open(stderrPath, "w");
  try {
    return await new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      cwd,
      env,
      shell: false,
      stdio: ["pipe", stdoutFile.fd, stderrFile.fd],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, timeoutMs);
    timer.unref();
    child.once("error", (error) => {
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", async (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await Promise.all([stdoutFile.close(), stderrFile.close()]);
      const [stdout, stderr] = await Promise.all([
        readFile(stdoutPath, "utf8"),
        readFile(stderrPath, "utf8"),
      ]);
      if (
        Buffer.byteLength(stdout) > maxOutputBytes ||
        Buffer.byteLength(stderr) > maxOutputBytes
      ) {
        reject(new Error(`Process output exceeded ${maxOutputBytes} bytes`));
        return;
      }
      resolve({ code, signal, stdout, stderr });
    });
    child.stdin.end(input);
    });
  } finally {
    await Promise.all([
      stdoutFile.close().catch(() => undefined),
      stderrFile.close().catch(() => undefined),
    ]);
    await rm(captureRoot, { recursive: true, force: true });
  }
}

export function parseJsonLines(stdout) {
  return stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function readInvocationLog(filePath) {
  return (await readFile(filePath, "utf8").catch(() => ""))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
