#!/usr/bin/env bun
/**
 * @codepawl/cli - Openpawl command-line interface
 *
 * Commands:
 *   run --repo <path> --task <string> [--dry-run | --write] [--out-dir <path>] [--mock-fixture <path>] [--test-cmd <cmd>]
 *   trace --input <trace.json> [--format markdown|json]
 *   doctor
 *   github-comment --report <report.md> [--token <gh-token>] [--repo <owner/repo>] [--pr <number>]
 */

import * as fs from "fs/promises";
import * as path from "path";
import { resolveProviderConfig, runAgent } from "@codepawl/core";
import type { RunResult } from "@codepawl/core";
import { renderBanner, renderCompactLogo } from "./branding";

// Helpers

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) { i++; continue; }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        result[key] = next;
        i += 2;
      } else {
        result[key] = true;
        i++;
      }
    } else {
      i++;
    }
  }
  return result;
}

function die(msg: string): never {
  console.error(`\nError: ${msg}\n`);
  process.exit(1);
}

function ok(msg: string): void {
  console.log(`${renderCompactLogo()} ${msg}`);
}

function hasHelpFlag(argv: string[]): boolean {
  return argv.includes("--help") || argv.includes("-h") || argv.includes("help");
}

async function findWorkspaceRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(current, "package.json"), "utf-8")
      ) as { workspaces?: unknown };
      if (Array.isArray(packageJson.workspaces)) {
        return current;
      }
    } catch {
      // Keep walking until the filesystem root.
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function getResolutionBase(): Promise<string> {
  return process.env["INIT_CWD"] ?? (await findWorkspaceRoot(process.cwd())) ?? process.cwd();
}

function resolveFromBase(input: string, baseDir: string): string {
  return path.resolve(baseDir, input);
}

function readStringFlag(
  flags: Record<string, string | boolean>,
  name: string
): string | undefined {
  const value = flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    die(`--${name} requires a value.`);
  }
  return value;
}

function readPositiveIntFlag(
  flags: Record<string, string | boolean>,
  name: string
): number | undefined {
  const value = readStringFlag(flags, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    die(`--${name} must be a positive integer.`);
  }
  return parsed;
}

type GithubFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) => Promise<Response>;

type Logger = {
  log: (...args: unknown[]) => void;
};

type PostGithubCommentDeps = {
  githubFetch?: GithubFetch;
  logger?: Logger;
};

export async function postGithubComment(
  {
    reportContent,
    token,
    repoSlug,
    prNumber,
  }: {
    reportContent: string;
    token: string;
    repoSlug: string;
    prNumber: string;
  },
  deps: PostGithubCommentDeps = {}
): Promise<string> {
  const githubFetch = deps.githubFetch ?? fetch;
  const [owner, repoName] = repoSlug.split("/");
  if (!owner || !repoName) {
    throw new Error("--repo must be in format owner/repo");
  }

  const url = `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`;
  const body = JSON.stringify({ body: reportContent });

  const response = await githubFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as { html_url: string };

  deps.logger?.log(`Posted comment to ${url}`);
  return data.html_url;
}

function showGithubCommentHelp(): void {
  console.log(`Usage: codepawl github-comment --report <report.md> [options]

Options:
  --report <path>        Path to report.md (required)
  --token <token>        GitHub token (or set GITHUB_TOKEN)
  --repo <owner/repo>    Repository slug (e.g. codepawl/codepawl)
  --pr <number>          Pull request number
`);
}

async function assertDirectory(dirPath: string, label: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(dirPath);
  } catch {
    die(`${label} does not exist: ${dirPath}`);
  }
  if (!stat.isDirectory()) {
    die(`${label} is not a directory: ${dirPath}`);
  }
}

// run command

async function cmdRun(flags: Record<string, string | boolean>): Promise<void> {
  if (flags["help"] === true) {
    showRunHelp();
    return;
  }

  const repo = readStringFlag(flags, "repo") ?? ".";
  const resolutionBase = await getResolutionBase();
  const resolvedRepo = resolveFromBase(repo, resolutionBase);
  const outDir = readStringFlag(flags, "out-dir");
  const resolvedOutDir = outDir ? resolveFromBase(outDir, resolutionBase) : undefined;
  const task = readStringFlag(flags, "task");
  const dryRun = flags["dry-run"] === true || flags["write"] !== true;
  const mockFixture = readStringFlag(flags, "mock-fixture");
  const resolvedMockFixture = mockFixture ? resolveFromBase(mockFixture, resolutionBase) : undefined;
  const testCmd = readStringFlag(flags, "test-cmd");
  if (flags["write"] === true && !testCmd) {
    die("Write mode requires --test-cmd (for example: --write --test-cmd \"bun test\" ).");
  }
  const provider = readStringFlag(flags, "provider");
  const model = readStringFlag(flags, "model");
  const structuredOutputModeRaw = readStringFlag(flags, "response-format");
  const structuredOutputMode = structuredOutputModeRaw === undefined
    ? undefined
    : structuredOutputModeRaw === "json_schema" || structuredOutputModeRaw === "json_object"
      ? structuredOutputModeRaw
      : die(
        `--response-format must be \"json_schema\" or \"json_object\" (got: ${structuredOutputModeRaw}).`
      );
  const includePromptMetadata = flags["include-prompt-metadata"] === true;
  const contextMaxFiles = readPositiveIntFlag(flags, "context-max-files");
  const contextMaxBytes = readPositiveIntFlag(flags, "context-max-bytes");
  const contextMaxChars = readPositiveIntFlag(flags, "context-max-chars");

  if (!task || task.trim().length === 0) {
    die("--task is required and must not be empty. e.g. --task \"add tests for shared helpers\"");
  }
  await assertDirectory(resolvedRepo, "Repository path");
  let providerConfig;
  try {
    providerConfig = resolveProviderConfig({ provider, model });
  } catch (err: unknown) {
    die(err instanceof Error ? err.message : String(err));
  }

  console.log(renderBanner());
  console.log(`${renderCompactLogo()} Starting Openpawl run`);
  console.log(`   Repo:    ${resolvedRepo}`);
  if (resolvedOutDir) console.log(`   OutDir:  ${resolvedOutDir}`);
  console.log(`   Task:    ${task}`);
  console.log(`   Mode:    ${dryRun ? "dry-run (no files modified)" : "write"}`);
  if (!dryRun && testCmd) {
    console.log(`   TestCmd: ${testCmd}`);
  } else {
    console.log("   TestCmd: omitted (dry-run default placeholder)");
  }
  console.log(`   Provider: ${providerConfig.provider}`);
  console.log(`   Model:   ${providerConfig.model ?? "deterministic-mock"}`);
  console.log();

  let result: RunResult;
  try {
    result = await runAgent({
      query: task,
      workspaceDir: resolvedRepo,
      outDir: resolvedOutDir,
      dryRun,
      testCommand: testCmd,
      mockFixturePath: resolvedMockFixture,
      provider,
      model,
      includePromptMetadata,
      structuredOutputMode,
      contextMaxFiles,
      contextMaxBytes,
      contextMaxChars,
    });
  } catch (err: unknown) {
    die(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`${renderCompactLogo()} Run complete`);
  console.log(`   Run ID:  ${result.runId}`);
  console.log(`   Status:  ${result.success ? "SUCCESS" : "FAILED"}`);
  if (result.error) {
    console.log(`   Error:   ${result.error}`);
  }
  console.log(`   Steps:   ${result.traceSummary.stepCount}`);
  console.log(`   Tokens:  ${result.traceSummary.tokenUsage.total}`);
  if (result.reportPath) {
    console.log(`\n   Report: ${result.reportPath}`);
  }
  if (result.tracePath) {
    console.log(`   Trace:  ${result.tracePath}`);
  }
  console.log();

  process.exit(result.success ? 0 : 1);
}

// trace command

async function cmdTrace(flags: Record<string, string | boolean>): Promise<void> {
  const input = readStringFlag(flags, "input");
  const format = readStringFlag(flags, "format") ?? "markdown";

  if (!input) die("--input is required. e.g. --input .codepawl/runs/<run-id>/trace.json");

  let raw: string;
  try {
    raw = await fs.readFile(input, "utf-8");
  } catch {
    die(`Cannot read trace file: ${input}`);
  }

  const trace = JSON.parse(raw) as {
    traceId: string;
    totalDurationMs: number;
    stepCount: number;
    llmCallsCount: number;
    tokenUsage: { input: number; output: number; total: number };
    events: Array<{ timestamp: string; type: string; name: string; severity: string; payload?: unknown }>;
    steps: Array<{ nodeName: string; action: string; durationMs: number; timestamp: string }>;
  };

  if (format === "json") {
    console.log(raw);
    return;
  }

  // Markdown format
  const md = [
    `# Trace: \`${trace.traceId}\``,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| Duration | ${trace.totalDurationMs}ms |`,
    `| Steps | ${trace.stepCount} |`,
    `| LLM Calls | ${trace.llmCallsCount} |`,
    `| Tokens In | ${trace.tokenUsage.input} |`,
    `| Tokens Out | ${trace.tokenUsage.output} |`,
    `| Tokens Total | ${trace.tokenUsage.total} |`,
    ``,
    `## Steps`,
    ``,
    `| # | Node | Action | Duration |`,
    `|---|------|--------|----------|`,
    ...trace.steps.map(
      (s, i) => `| ${i + 1} | \`${s.nodeName}\` | ${s.action} | ${s.durationMs}ms |`
    ),
    ``,
    `## Events`,
    ``,
    `| Timestamp | Type | Name | Severity |`,
    `|-----------|------|------|----------|`,
    ...trace.events.map(
      (e) => `| ${e.timestamp} | \`${e.type}\` | ${e.name} | ${e.severity} |`
    ),
  ].join("\n");

  console.log(md);
}

// doctor command

async function cmdDoctor(): Promise<void> {
  console.log(renderBanner());
  console.log("Openpawl Doctor - system health check\n");

  const checks: Array<{ label: string; ok: boolean; detail?: string }> = [];

  // Check bun availability
  try {
    const { execSync } = await import("child_process");
    const version = execSync("bun --version", { encoding: "utf-8" }).trim();
    checks.push({ label: "Bun runtime", ok: true, detail: `v${version}` });
  } catch {
    checks.push({ label: "Bun runtime", ok: false, detail: "not found in PATH" });
  }

  // Check git availability
  try {
    const { execSync } = await import("child_process");
    const version = execSync("git --version", { encoding: "utf-8" }).trim();
    checks.push({ label: "Git", ok: true, detail: version });
  } catch {
    checks.push({ label: "Git", ok: false, detail: "not found in PATH" });
  }

  const providerName = process.env["OPENPAWL_PROVIDER"] ?? "mock";
  const modelName = process.env["OPENPAWL_MODEL"];
  const apiKeyPresent = Boolean(process.env["OPENPAWL_API_KEY"]);
  const baseUrl = process.env["OPENPAWL_BASE_URL"];
  try {
    const providerConfig = resolveProviderConfig();
    checks.push({
      label: "Openpawl Provider",
      ok: true,
      detail: providerConfig.provider,
    });
    checks.push({
      label: "Openpawl Model",
      ok: true,
      detail: providerConfig.model ?? "deterministic-mock",
    });
  } catch (err: unknown) {
    checks.push({
      label: "Openpawl Provider",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    checks.push({
      label: "Openpawl Model",
      ok: Boolean(modelName),
      detail: modelName ? "configured" : "missing OPENPAWL_MODEL",
    });
  }
  checks.push({
    label: "Openpawl API Key",
    ok: providerName === "mock" || apiKeyPresent,
    detail: providerName === "mock"
      ? "not required for mock provider"
      : apiKeyPresent ? "present (OPENPAWL_API_KEY)" : "missing OPENPAWL_API_KEY",
  });
  checks.push({
    label: "Openpawl Base URL",
    ok: true,
    detail: baseUrl ? "configured (OPENPAWL_BASE_URL)" : "default OpenAI-compatible base URL",
  });

  // Check GITHUB_TOKEN env
  const ghToken = process.env["GITHUB_TOKEN"];
  checks.push({
    label: "GitHub Token",
    ok: true,
    detail: ghToken ? "present (GITHUB_TOKEN)" : "not set (required only for github-comment)",
  });

  // Display results
  let allOk = true;
  for (const check of checks) {
    const mark = check.ok ? "[ok]" : "[fail]";
    console.log(`  ${mark} ${check.label}${check.detail ? ` - ${check.detail}` : ""}`);
    if (!check.ok) allOk = false;
  }

  console.log();
  if (allOk) {
    console.log(`${renderCompactLogo()} All checks passed. Openpawl is ready to run.`);
  } else {
    console.log("Some checks failed. Review above and fix before running.");
    process.exit(1);
  }
}

// github-comment command

async function cmdGithubComment(flags: Record<string, string | boolean>): Promise<void> {
  if (flags["help"] === true) {
    showGithubCommentHelp();
    return;
  }

  const reportPath = readStringFlag(flags, "report");
  const token = readStringFlag(flags, "token") ?? process.env["GITHUB_TOKEN"];
  const repoSlug = readStringFlag(flags, "repo");
  const prNumber = readStringFlag(flags, "pr");

  if (!reportPath) die("--report is required. e.g. --report .codepawl/runs/<run-id>/report.md");

  let reportContent: string;
  try {
    reportContent = await fs.readFile(reportPath, "utf-8");
  } catch {
    die(`Cannot read report file: ${reportPath}`);
  }

  if (!token) {
    die("GitHub token is required. Provide --token or set GITHUB_TOKEN.");
  }
  if (!repoSlug) {
    die("--repo is required for github-comment and must be in owner/repo format.");
  }
  if (!prNumber) {
    die("--pr is required for github-comment.");
  }
  if (!repoSlug.includes("/")) {
    die("--repo must be in format owner/repo");
  }

  const [owner, repoName] = repoSlug.split("/");
  const url = `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`;
  console.log(`${renderCompactLogo()} Posting report as PR comment to ${url}...`);

  const htmlUrl = await postGithubComment({
    reportContent,
    token,
    repoSlug,
    prNumber,
  });

  ok(`Comment posted: ${htmlUrl}`);
}

// help

function showHelp(): void {
  console.log(renderBanner());
  console.log(`Usage: codepawl <command> [options]

Commands:
  run          Execute the Openpawl agent workflow
  trace        Pretty-print a trace.json file
  doctor       Check system readiness
  github-comment  Post a run report as a GitHub PR comment

Run options:
  --repo <path>          Path to the target repository (default: .)
  --task <string>        Coding task description (required)
  --out-dir <path>       Artifact output directory (default: <repo>/.codepawl/runs/<run-id>)
  --dry-run              Scan and plan only; no files are modified (default)
  --write                Apply safe test-file patch chunks, then validate (requires --test-cmd)
  --mock-fixture <path>  Path to a JSON LLM mock fixture file
  --test-cmd <cmd>       Validation command; review-only dry-runs use placeholder validation when omitted
  --provider <name>      Provider override: mock or openai-compatible (default: OPENPAWL_PROVIDER or mock)
  --model <model>        Model override for openai-compatible provider
  --context-max-files <n> Optional context compaction file budget (env: OPENPAWL_CONTEXT_MAX_FILES)
  --context-max-bytes <n> Optional context compaction byte budget (env: OPENPAWL_CONTEXT_MAX_BYTES)
  --context-max-chars <n> Optional context compaction char budget (env: OPENPAWL_CONTEXT_MAX_CHARS)
  --response-format <json_schema|json_object>
                         Response format mode for OpenAI-compatible provider (env: OPENPAWL_RESPONSE_FORMAT)
  --include-prompt-metadata
                         Record redacted prompt metadata in trace; never records API keys

Trace options:
  --input <path>         Path to trace.json (required)
  --format <format>      Output format: markdown (default) or json

GitHub comment options:
  --report <path>        Path to report.md (required)
  --token <token>        GitHub token (or set GITHUB_TOKEN env var)
  --repo <owner/repo>    Repository slug (e.g. codepawl/codepawl)
  --pr <number>          Pull request number

Examples:
  codepawl run --repo . --task "add tests for shared helpers" --dry-run
  codepawl run --repo . --task "Review and analyse this PR" --dry-run
  codepawl run --repo . --task "add tests" --provider openai-compatible --model gpt-4.1-mini --dry-run
  codepawl run --repo . --task "fix failing unit test" --write --test-cmd "bun test"
  codepawl trace --input .codepawl/runs/run_123/trace.json --format markdown
  codepawl doctor
  codepawl github-comment --report .codepawl/runs/run_123/report.md
`);
}

function showRunHelp(): void {
  console.log(`Usage: codepawl run --repo <path> --task <string> [options]

Execute the Openpawl workflow against a target repository. Dry-run is the default.

Options:
  --repo <path>          Target repository path (default: .)
  --task <string>        Coding or review task (required)
  --out-dir <path>       Artifact directory (default: <repo>/.codepawl/runs/<run-id>)
  --dry-run              Plan and report without modifying files (default)
  --write                Apply safe test-file patch chunks, then validate (requires --test-cmd)
  --mock-fixture <path>  Optional deterministic mock fixture
  --test-cmd <cmd>       Required for write mode; review-only dry-runs use placeholder validation when omitted
  --provider <name>      mock or openai-compatible (env: OPENPAWL_PROVIDER)
  --model <model>        Provider model override (env: OPENPAWL_MODEL)
  --response-format <json_schema|json_object>
                         OpenAI-compatible response format override (env: OPENPAWL_RESPONSE_FORMAT)
  --context-max-files <n> Optional context compaction file budget (env: OPENPAWL_CONTEXT_MAX_FILES)
  --context-max-bytes <n> Optional context compaction byte budget (env: OPENPAWL_CONTEXT_MAX_BYTES)
  --context-max-chars <n> Optional context compaction char budget (env: OPENPAWL_CONTEXT_MAX_CHARS)
  --include-prompt-metadata
                         Record prompt counts/size metadata in trace, not prompt text

Provider env:
  OPENPAWL_PROVIDER      mock | openai-compatible
  OPENPAWL_MODEL         Required for openai-compatible
  OPENPAWL_API_KEY       Required for openai-compatible; never printed
  OPENPAWL_BASE_URL      Optional OpenAI-compatible base URL
  OPENPAWL_MAX_TOKENS    Optional structured-output token cap
  OPENPAWL_CONTEXT_MAX_FILES
                         Optional context compaction file budget
  OPENPAWL_CONTEXT_MAX_BYTES
                         Optional context compaction byte budget
  OPENPAWL_CONTEXT_MAX_CHARS
                         Optional context compaction char budget
  OPENPAWL_SCOPE_ANALYSIS_MAX_TOKENS
                         Optional scope_analysis token cap override
  OPENPAWL_PATCH_PLAN_MAX_TOKENS
                         Optional patch_plan token cap override
  OPENPAWL_RESPONSE_FORMAT
                         Optional response format mode: json_schema (default) or json_object

Examples:
  codepawl run --repo . --task "review current repository changes" --dry-run
  codepawl run --repo . --task "add tests for shared helpers" --dry-run
  codepawl run --repo . --task "add tests" --provider openai-compatible --model gpt-4.1-mini --dry-run
  codepawl run --repo . --task "add tests for shared helpers" --write --test-cmd "bun test"
`);
}

// Entry point

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === "help" || command === "-h" || command === "--help") {
    showHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log("codepawl v0.1.0 (Openpawl MVP)");
    return;
  }

  const commandArgs = argv.slice(1);
  const flags = parseArgs(commandArgs);
  if (hasHelpFlag(commandArgs)) {
    flags["help"] = true;
  }

  switch (command) {
    case "run":
      await cmdRun(flags);
      break;
    case "trace":
      await cmdTrace(flags);
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "github-comment":
      await cmdGithubComment(flags);
      break;
    default:
      die(`Unknown command: "${command}". Run "codepawl --help" for usage.`);
  }
}

const isCliEntrypoint = (() => {
  const metaMain = (import.meta as { readonly main?: string | boolean }).main;
  return metaMain === true || metaMain === import.meta.url;
})();

if (isCliEntrypoint) {
  main().catch((err: unknown) => {
    console.error("Fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
