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
let originalProviderEnv: Record<string, string | undefined>;

const REQUIRED_ARTIFACTS = [
  "trace.json",
  "report.md",
  "run.json",
  "patch-plan.json",
  "selected-files.json",
];

async function expectRequiredArtifacts(runDir: string): Promise<void> {
  for (const file of REQUIRED_ARTIFACTS) {
    const stat = await fs.stat(path.join(runDir, file)).catch(() => null);
    expect(stat, `Expected artifact ${file} to exist`).not.toBeNull();
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpawl-test-"));
  originalProviderEnv = {
    OPENPAWL_PROVIDER: process.env["OPENPAWL_PROVIDER"],
    OPENPAWL_MODEL: process.env["OPENPAWL_MODEL"],
    OPENPAWL_API_KEY: process.env["OPENPAWL_API_KEY"],
    OPENPAWL_BASE_URL: process.env["OPENPAWL_BASE_URL"],
  };
  delete process.env["OPENPAWL_PROVIDER"];
  delete process.env["OPENPAWL_MODEL"];
  delete process.env["OPENPAWL_API_KEY"];
  delete process.env["OPENPAWL_BASE_URL"];
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  for (const [key, value] of Object.entries(originalProviderEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
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
    await expectRequiredArtifacts(runDir);
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

    await expectRequiredArtifacts(outDir);

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

  it("returns failure and complete artifacts when validation command fails", async () => {
    const result = await runAgent({
      query: "add tests for auth helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "bun -e \"process.exit(7)\"",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Validation command failed.");
    expect(result.state.validationResult?.success).toBe(false);
    expect(result.state.validationResult?.commandsRun[0]?.exitCode).toBe(7);

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
  });

  it("uses placeholder validation for review-only dry-runs without an explicit command", async () => {
    const result = await runAgent({
      query: "review current repository changes",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.state.validationResult?.success).toBe(true);
    expect(result.state.validationResult?.commandsRun[0]?.command).toBe("echo placeholder validation skipped");

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);

    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("Placeholder validation");
    expect(report).toContain("No changed files available in current context");
    expect(report).not.toContain("auth-helpers.test.ts");
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

  it("trace records provider metadata without raw prompt content", async () => {
    const result = await runAgent({
      query: "add tests for shared helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const traceRaw = await fs.readFile(path.join(runDir, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as {
      events: Array<{ type: string; name: string; payload: Record<string, unknown> }>;
    };
    const llmCall = trace.events.find((event) => event.type === "llm_call" && event.name === "scope_analysis");
    const response = trace.events.find((event) => event.name === "scope_analysis_response");

    expect(llmCall?.payload.provider).toBe("mock");
    expect(llmCall?.payload.model).toBe("deterministic-mock");
    expect(llmCall?.payload.purpose).toBe("scope_analysis");
    expect(llmCall?.payload).not.toHaveProperty("prompt");
    expect(response?.payload.validationStatus).toBe("valid");
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

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
  });
});

describe("runAgent — error handling", () => {
  it("fails fast when openai-compatible provider is missing an API key", async () => {
    await expect(
      runAgent({
        query: "add tests",
        workspaceDir: tmpDir,
        dryRun: true,
        provider: "openai-compatible",
        model: "test-model",
        apiKey: "",
      })
    ).rejects.toThrow("OPENPAWL_API_KEY");
  });

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

  it("throws an error when workspace path is not a directory", async () => {
    const filePath = path.join(tmpDir, "not-a-directory");
    await fs.writeFile(filePath, "not a repo", "utf-8");

    await expect(
      runAgent({
        query: "test",
        workspaceDir: filePath,
        dryRun: true,
        mockFixturePath: FIXTURE_PATH,
      })
    ).rejects.toThrow("not a directory");
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

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
  });

  it("exports artifacts when provider JSON fails schema validation", async () => {
    const invalidFixturePath = path.join(tmpDir, "invalid-provider-output.json");
    await fs.writeFile(
      invalidFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Repository Scan Result",
          response: {
            content: JSON.stringify({ unexpected: "shape" }),
            usage: { inputTokens: 3, outputTokens: 2 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for shared helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: invalidFixturePath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("scope_analysis provider response failed schema validation");

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);

    const traceRaw = await fs.readFile(path.join(runDir, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as { events: Array<{ name: string; payload: unknown }> };
    expect(trace.events.some((event) =>
      event.name === "scope_analysis_response" &&
      JSON.stringify(event.payload).includes("\"validationStatus\":\"invalid\"")
    )).toBe(true);
  });
});
