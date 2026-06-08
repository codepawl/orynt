import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { runAgent } from "../runner";
import { SafetyViolationError } from "../safety";

// Path to the bundled mock fixture
const FIXTURE_PATH = path.join(
  new URL(".", import.meta.url).pathname,
  "fixtures",
  "mock-llm.json"
);

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpawl-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("runAgent — dry-run mode", () => {
  it("produces all 5 artifact files in .codepawl/runs/<runId>/", async () => {
    const result = await runAgent({
      query: "add tests for auth helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo 'no tests'",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.runId).toBeTruthy();
    expect(result.runId.startsWith("run_")).toBe(true);

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);

    // All 5 required artifact files must exist
    const requiredFiles = [
      "trace.json",
      "report.md",
      "run.json",
      "patch-plan.json",
      "selected-files.json",
    ];
    for (const file of requiredFiles) {
      const filePath = path.join(runDir, file);
      const stat = await fs.stat(filePath).catch(() => null);
      expect(stat, `Expected artifact ${file} to exist`).not.toBeNull();
    }
  });

  it("writes artifacts to an explicit outDir when provided", async () => {
    const outDir = path.join(tmpDir, "custom-artifacts");
    const result = await runAgent({
      query: "add tests for auth helpers",
      workspaceDir: tmpDir,
      outDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.reportPath).toBe(path.join(outDir, "report.md"));
    expect(result.tracePath).toBe(path.join(outDir, "trace.json"));

    for (const file of ["trace.json", "report.md", "run.json", "patch-plan.json", "selected-files.json"]) {
      const stat = await fs.stat(path.join(outDir, file)).catch(() => null);
      expect(stat, `Expected artifact ${file} to exist in explicit outDir`).not.toBeNull();
    }

    const defaultRunDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const defaultDirStat = await fs.stat(defaultRunDir).catch(() => null);
    expect(defaultDirStat).toBeNull();
  });

  it("does NOT modify any files in the workspace in dry-run mode", async () => {
    // Create a marker file we can track
    const markerPath = path.join(tmpDir, "src", "existing.ts");
    await fs.mkdir(path.dirname(markerPath), { recursive: true });
    await fs.writeFile(markerPath, "export const x = 1;", "utf-8");
    const originalContent = await fs.readFile(markerPath, "utf-8");

    await runAgent({
      query: "fix failing unit test",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo 'dry-run'",
      mockFixturePath: FIXTURE_PATH,
    });

    // Marker file must be unchanged
    const afterContent = await fs.readFile(markerPath, "utf-8");
    expect(afterContent).toBe(originalContent);
  });

  it("returns a traceSummary with traceId matching runId", async () => {
    const result = await runAgent({
      query: "add tests for auth helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.traceSummary.traceId).toBe(result.runId);
    expect(result.traceSummary.events.length).toBeGreaterThan(0);
  });

  it("report.md contains task, run ID, and mode information", async () => {
    const task = "add tests for auth helpers";
    const result = await runAgent({
      query: task,
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");

    expect(report).toContain(result.runId);
    expect(report).toContain("Dry-run");
    expect(report).toContain(task);
  });

  it("trace.json is valid JSON with events array", async () => {
    const result = await runAgent({
      query: "add tests for auth helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const traceRaw = await fs.readFile(path.join(runDir, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as { traceId: string; events: unknown[] };

    expect(trace.traceId).toBe(result.runId);
    expect(Array.isArray(trace.events)).toBe(true);
  });
});

describe("runAgent — write mode safety guardrails", () => {
  it("aborts and writes artifacts when patch targets a lockfile", async () => {
    // Fixture using matchLastMessage to distinguish scope_analysis vs patch_plan calls:
    // scope_analysis messages contain "Repository Scan Result"
    // patch_plan messages contain "Selected Files Content"
    const dangerousFixture = [
      {
        matchLastMessage: "Repository Scan Result",
        response: {
          content: JSON.stringify({
            rationale: "Scope: create a safe new file",
            affectedModules: ["root"],
            proposedFilesToModify: [],
            proposedFilesToCreate: ["src/safe-file.ts"],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
      {
        matchLastMessage: "Selected Files Content",
        response: {
          content: JSON.stringify({
            rationale: "Dangerous patch targeting lockfile",
            chunks: [
              {
                type: "modify",
                path: "bun.lock",
                content: "tampered-content",
                targetContent: "fake lock",
                description: "Tamper the lockfile",
              },
            ],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
    ];
    const dangerousFixturePath = path.join(tmpDir, "dangerous-fixture.json");
    await fs.writeFile(dangerousFixturePath, JSON.stringify(dangerousFixture), "utf-8");
    await fs.writeFile(path.join(tmpDir, "bun.lock"), "fake lock content", "utf-8");

    const result = await runAgent({
      query: "tamper lockfile",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: dangerousFixturePath,
    });

    // Run must have failed due to safety violation
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error?.toLowerCase()).toMatch(/safety|lock|disallowed|violation/i);

    // bun.lock must be unchanged
    const lockContent = await fs.readFile(path.join(tmpDir, "bun.lock"), "utf-8");
    expect(lockContent).toBe("fake lock content");
  });
});

describe("runAgent — error handling", () => {
  it("throws an error when workspace directory does not exist", async () => {
    await expect(
      runAgent({
        query: "test",
        workspaceDir: "/nonexistent/path/12345",
        dryRun: true,
        mockFixturePath: FIXTURE_PATH,
      })
    ).rejects.toThrow("does not exist");
  });

  it("exports artifacts even when a node throws", async () => {
    // Use a fixture with no matching rules so the LLM call throws
    const emptyFixturePath = path.join(tmpDir, "empty-fixture.json");
    await fs.writeFile(emptyFixturePath, "[]", "utf-8");

    const result = await runAgent({
      query: "trigger no-match error",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: emptyFixturePath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();

    // trace.json and report.md must still exist (best-effort export)
    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const traceExists = await fs.stat(path.join(runDir, "trace.json")).catch(() => null);
    const reportExists = await fs.stat(path.join(runDir, "report.md")).catch(() => null);
    expect(traceExists).not.toBeNull();
    expect(reportExists).not.toBeNull();
  });
});
