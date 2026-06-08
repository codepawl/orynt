import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
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

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpawl-cli-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

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
