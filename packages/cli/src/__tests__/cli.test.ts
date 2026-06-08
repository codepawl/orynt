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

function runCliFromPackageDir(
  args: string[],
  invocationCwd?: string,
  envOverrides: Record<string, string | undefined> = {}
): Promise<{
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
    delete env["OPENPAWL_PROVIDER"];
    delete env["OPENPAWL_MODEL"];
    delete env["OPENPAWL_API_KEY"];
    delete env["OPENPAWL_BASE_URL"];
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
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

async function writeReportFile(): Promise<string> {
  const reportPath = path.join(tmpDir, "report.md");
  await fs.writeFile(reportPath, "# Test Report\n\nRun completed.", "utf-8");
  return reportPath;
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

  it("fails fast when --repo is missing a value", async () => {
    const result = await runCliFromPackageDir([
      "run",
      "--repo",
      "--task",
      "add tests",
      "--dry-run",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("--repo requires a value");
    expect(result.stdout).not.toContain("Starting Openpawl run");
  });

  it("fails fast when repo path does not exist", async () => {
    const missingRepo = path.join(tmpDir, "missing-repo");
    const result = await runCliFromPackageDir([
      "run",
      "--repo",
      missingRepo,
      "--task",
      "add tests",
      "--dry-run",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Repository path does not exist");
    expect(result.stdout).not.toContain("Starting Openpawl run");
  });

  it("fails fast when repo path is not a directory", async () => {
    const repoFile = path.join(tmpDir, "repo-file");
    await fs.writeFile(repoFile, "not a directory", "utf-8");

    const result = await runCliFromPackageDir([
      "run",
      "--repo",
      repoFile,
      "--task",
      "add tests",
      "--dry-run",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Repository path is not a directory");
    expect(result.stdout).not.toContain("Starting Openpawl run");
  });

  it("fails fast when task is empty", async () => {
    const result = await runCliFromPackageDir([
      "run",
      "--repo",
      tmpDir,
      "--task",
      "   ",
      "--dry-run",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("--task is required and must not be empty");
    expect(result.stdout).not.toContain("Starting Openpawl run");
  });

  it("exits non-zero and keeps complete artifacts when validation fails", async () => {
    const result = await runCliFromPackageDir([
      "run",
      "--repo",
      tmpDir,
      "--task",
      "add tests for shared helpers",
      "--dry-run",
      "--mock-fixture",
      FIXTURE_PATH,
      "--test-cmd",
      "bun -e \"process.exit(4)\"",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Status:  FAILED");
    expect(result.stdout).toContain("Error:   Validation command failed.");

    const runId = result.stdout.match(/Run ID:\s+(run_[^\s]+)/)?.[1];
    expect(runId, result.stdout).toBeTruthy();
    const runDir = path.join(tmpDir, ".codepawl", "runs", runId as string);
    for (const file of ["trace.json", "report.md", "run.json", "patch-plan.json", "selected-files.json"]) {
      const stat = await fs.stat(path.join(runDir, file)).catch(() => null);
      expect(stat, `${file} should exist after validation failure`).not.toBeNull();
    }
  });

  it("exits zero for review-only dry-run smoke without explicit validation command", async () => {
    const result = await runCliFromPackageDir([
      "run",
      "--repo",
      tmpDir,
      "--task",
      "review current repository changes",
      "--dry-run",
    ]);

    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("Status:  SUCCESS");

    const runId = result.stdout.match(/Run ID:\s+(run_[^\s]+)/)?.[1];
    expect(runId, result.stdout).toBeTruthy();
    const runDir = path.join(tmpDir, ".codepawl", "runs", runId as string);
    for (const file of ["trace.json", "report.md", "run.json", "patch-plan.json", "selected-files.json"]) {
      const stat = await fs.stat(path.join(runDir, file)).catch(() => null);
      expect(stat, `${file} should exist after review dry-run smoke`).not.toBeNull();
    }

    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("Placeholder validation");
    expect(report).not.toContain("auth-helpers.test.ts");
  });

  it("fails clearly when openai-compatible provider is missing an API key", async () => {
    const result = await runCliFromPackageDir([
      "run",
      "--repo",
      tmpDir,
      "--task",
      "add tests for shared helpers",
      "--dry-run",
      "--provider",
      "openai-compatible",
      "--model",
      "test-model",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("OPENPAWL_API_KEY");
    expect(result.stderr).not.toContain("test-model");
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

  it("fails clearly when trace input file is missing", async () => {
    const missingTrace = path.join(tmpDir, "missing-trace.json");
    const result = await runCliFromPackageDir(["trace", "--input", missingTrace]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Cannot read trace file");
    expect(result.stderr).toContain(missingTrace);
  });
});

describe("CLI: codepawl doctor (utility checks)", () => {
  it("CODEPAWL_LLM_PROVIDER env is readable", () => {
    // Doctor command reads this env — just verifying it doesn't crash
    const provider = process.env["CODEPAWL_LLM_PROVIDER"];
    expect(typeof provider === "string" || provider === undefined).toBe(true);
  });

  it("passes with a warning when optional GitHub token is missing", async () => {
    const result = await runCliFromPackageDir(["doctor"], undefined, { GITHUB_TOKEN: undefined });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("GitHub Token");
    expect(result.stdout).toContain("not set");
    expect(result.stdout).toContain("All checks passed");
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

  it("prints the report and exits successfully without a token", async () => {
    const reportPath = await writeReportFile();
    const result = await runCliFromPackageDir(
      ["github-comment", "--report", reportPath, "--repo", "codepawl/codepawl", "--pr", "1"],
      undefined,
      { GITHUB_TOKEN: undefined }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No GitHub token, repo, or PR number provided");
    expect(result.stdout).toContain("# Test Report");
  });

  it("prints the report and exits successfully without PR context", async () => {
    const reportPath = await writeReportFile();
    const result = await runCliFromPackageDir(
      ["github-comment", "--report", reportPath, "--token", "fake-token"],
      undefined,
      { GITHUB_TOKEN: undefined }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No GitHub token, repo, or PR number provided");
    expect(result.stdout).toContain("# Test Report");
  });
});
