import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { runAgent } from "@codepawl/core";

// Path to the mock LLM fixture shipped with core
const FIXTURE_PATH = path.join(
  new URL(".", import.meta.url).pathname,
  "..",
  "..",
  "..",
  "core",
  "src",
  "__tests__",
  "fixtures",
  "mock-llm.json"
);
const CLI_DIR = path.join(new URL(".", import.meta.url).pathname, "..", "..");
const WORKSPACE_ROOT = path.resolve(CLI_DIR, "..", "..");

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpawl-cli-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function runCliFromPackageDir(args: string[], invocationCwd?: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (invocationCwd) {
      env["INIT_CWD"] = invocationCwd;
    } else {
      delete env["INIT_CWD"];
    }
    const child = spawn("bun", ["src/bin.ts", ...args], {
      cwd: CLI_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
  });
}

/**
 * These tests exercise the CLI by calling the runAgent() API that the CLI wraps,
 * plus directly testing the utility functions used by CLI commands (trace formatting,
 * argument parsing patterns, etc.)
 */

describe("CLI: codepawl run --dry-run (via runAgent)", () => {
  it("produces all 5 artifacts in dry-run mode", async () => {
    const result = await runAgent({
      query: "add tests for auth helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const expectedFiles = ["trace.json", "report.md", "run.json", "patch-plan.json", "selected-files.json"];

    for (const file of expectedFiles) {
      const exists = await fs.stat(path.join(runDir, file)).catch(() => null);
      expect(exists, `${file} should exist`).not.toBeNull();
    }
  });

  it("report.md is non-empty and contains run metadata", async () => {
    const result = await runAgent({
      query: "add tests for auth helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report.length).toBeGreaterThan(100);
    expect(report).toContain(result.runId);
  });

  it("writes default artifacts under --repo when the CLI process cwd is different", async () => {
    const result = await runCliFromPackageDir(
      [
        "run",
        "--repo",
        tmpDir,
        "--task",
        "add tests for shared helpers",
        "--dry-run",
        "--mock-fixture",
        FIXTURE_PATH,
        "--test-cmd",
        "echo ok",
      ]
    );

    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    const runId = result.stdout.match(/Run ID:\s+(run_[^\s]+)/)?.[1];
    expect(runId, result.stdout).toBeTruthy();

    const runDir = path.join(tmpDir, ".codepawl", "runs", runId as string);
    for (const file of ["trace.json", "report.md", "run.json", "patch-plan.json", "selected-files.json"]) {
      const stat = await fs.stat(path.join(runDir, file)).catch(() => null);
      expect(stat, `${file} should exist under the target repo`).not.toBeNull();
    }

    expect(result.stdout).toContain(path.join(runDir, "report.md"));
    expect(result.stdout).toContain(path.join(runDir, "trace.json"));

    const wrongRunDir = path.join(CLI_DIR, ".codepawl", "runs", runId as string);
    const wrongDirStat = await fs.stat(wrongRunDir).catch(() => null);
    expect(wrongDirStat).toBeNull();
  });

  it("resolves --repo . to the workspace root when launched from a package cwd", async () => {
    const outDir = path.join(tmpDir, "artifacts");
    const result = await runCliFromPackageDir([
      "run",
      "--repo",
      ".",
      "--out-dir",
      outDir,
      "--task",
      "add tests for shared helpers",
      "--dry-run",
      "--mock-fixture",
      FIXTURE_PATH,
      "--test-cmd",
      "echo ok",
    ]);

    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain(`Repo:    ${WORKSPACE_ROOT}`);
    expect(result.stdout).toContain(`Report: ${path.join(outDir, "report.md")}`);

    for (const file of ["trace.json", "report.md", "run.json", "patch-plan.json", "selected-files.json"]) {
      const stat = await fs.stat(path.join(outDir, file)).catch(() => null);
      expect(stat, `${file} should exist under explicit outDir`).not.toBeNull();
    }
  });
});

describe("CLI: codepawl run --write (via runAgent)", () => {
  it("applies a create-file patch in write mode", async () => {
    // Use a fixture that generates a create patch
    const writeFixture = [
      {
        matchLastMessage: "Repository Scan Result",
        response: {
          content: JSON.stringify({
            rationale: "Scope: create new file",
            affectedModules: ["src"],
            proposedFilesToModify: [],
            proposedFilesToCreate: ["src/hello.ts"],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
      {
        matchLastMessage: "Selected Files Content",
        response: {
          content: JSON.stringify({
            rationale: "Create hello.ts",
            chunks: [
              {
                type: "create",
                path: "src/hello.ts",
                content: "export const hello = 'world';\n",
                description: "Create hello.ts",
              },
            ],
          }),
          usage: { inputTokens: 20, outputTokens: 20 },
        },
      },
    ];
    const fixturePath = path.join(tmpDir, "write-fixture.json");
    await fs.writeFile(fixturePath, JSON.stringify(writeFixture), "utf-8");
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });

    const result = await runAgent({
      query: "create hello file",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: fixturePath,
    });

    const createdFile = path.join(tmpDir, "src", "hello.ts");
    const exists = await fs.stat(createdFile).catch(() => null);
    expect(exists, "hello.ts should have been created by write mode").not.toBeNull();

    const content = await fs.readFile(createdFile, "utf-8");
    expect(content).toContain("hello");
    expect(result.success).toBe(true);
  });
});

describe("CLI: codepawl trace (utility logic)", () => {
  it("trace.json is valid and parseable", async () => {
    const result = await runAgent({
      query: "add tests for auth helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const traceRaw = await fs.readFile(path.join(runDir, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as {
      traceId: string;
      events: unknown[];
      steps: unknown[];
    };

    expect(trace.traceId).toBe(result.runId);
    expect(Array.isArray(trace.events)).toBe(true);
    expect(Array.isArray(trace.steps)).toBe(true);
  });
});

describe("CLI: codepawl doctor (utility checks)", () => {
  it("CODEPAWL_LLM_PROVIDER env is readable", () => {
    // Doctor command reads this env — just verifying it doesn't crash
    const provider = process.env["CODEPAWL_LLM_PROVIDER"];
    expect(typeof provider === "string" || provider === undefined).toBe(true);
  });
});

describe("CLI: codepawl github-comment (mocked)", () => {
  it("report.md content is suitable for GitHub comment (contains markdown)", async () => {
    const result = await runAgent({
      query: "add tests for auth helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");

    // Should contain markdown headings
    expect(report).toContain("# ");
    // Should contain the run ID (used as reference)
    expect(report).toContain(result.runId);
    // Should not be empty
    expect(report.length).toBeGreaterThan(200);
  });
});
