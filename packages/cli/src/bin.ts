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
import { runAgent } from "@codepawl/core";
import type { RunResult } from "@codepawl/core";

// Banner

const BANNER = `
  [>.-] Openpawl
        codepawl/core server-side coding-agent workflow
`;

const COMPACT_LOGO = ">.-";

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
  console.log(`${COMPACT_LOGO} ${msg}`);
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

  if (!task || task.trim().length === 0) {
    die("--task is required and must not be empty. e.g. --task \"add tests for shared helpers\"");
  }
  await assertDirectory(resolvedRepo, "Repository path");

  console.log(BANNER);
  console.log(`${COMPACT_LOGO} Starting Openpawl run`);
  console.log(`   Repo:    ${resolvedRepo}`);
  if (resolvedOutDir) console.log(`   OutDir:  ${resolvedOutDir}`);
  console.log(`   Task:    ${task}`);
  console.log(`   Mode:    ${dryRun ? "dry-run (no files modified)" : "write"}`);
  if (testCmd) console.log(`   TestCmd: ${testCmd}`);
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
    });
  } catch (err: unknown) {
    die(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`${COMPACT_LOGO} Run complete`);
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
  console.log(BANNER);
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

  // Check CODEPAWL_LLM_PROVIDER env
  const llmProvider = process.env["CODEPAWL_LLM_PROVIDER"];
  checks.push({
    label: "LLM Provider",
    ok: true,
    detail: llmProvider ? `${llmProvider} (via CODEPAWL_LLM_PROVIDER)` : "mock (default, no API key required)",
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
    console.log(`${COMPACT_LOGO} All checks passed. Openpawl is ready to run.`);
  } else {
    console.log("Some checks failed. Review above and fix before running.");
    process.exit(1);
  }
}

// github-comment command

async function cmdGithubComment(flags: Record<string, string | boolean>): Promise<void> {
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

  if (!token || !repoSlug || !prNumber) {
    // No token/repo/PR: print the report to stdout for CI without permissions.
    console.log("No GitHub token, repo, or PR number provided. Printing report to stdout:\n");
    console.log(reportContent);
    console.log(
      "\nTo post to GitHub, provide: --token <token> --repo <owner/repo> --pr <number>"
    );
    return;
  }

  // Post comment to GitHub PR via REST API
  const [owner, repoName] = repoSlug.split("/");
  if (!owner || !repoName) die("--repo must be in format owner/repo");

  const url = `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`;
  const body = JSON.stringify({ body: reportContent });

  console.log(`${COMPACT_LOGO} Posting report as PR comment to ${url}...`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body,
  });

  if (response.ok) {
    const data = (await response.json()) as { html_url: string };
    ok(`Comment posted: ${data.html_url}`);
  } else {
    const errText = await response.text();
    die(`GitHub API error (${response.status}): ${errText}`);
  }
}

// help

function showHelp(): void {
  console.log(BANNER);
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
  --write                Apply the generated patch to the repository
  --mock-fixture <path>  Path to a JSON LLM mock fixture file
  --test-cmd <cmd>       Validation command; review-only dry-runs use placeholder validation when omitted

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
  codepawl run --repo . --task "fix failing unit test" --write
  codepawl trace --input .codepawl/runs/run_123/trace.json --format markdown
  codepawl doctor
  codepawl github-comment --report .codepawl/runs/run_123/report.md
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

  const flags = parseArgs(argv.slice(1));

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

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
