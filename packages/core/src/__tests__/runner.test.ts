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

  it("runs explicit bun test command and preserves artifacts on failure", async () => {
    const result = await runAgent({
      query: "add tests for the Openpawl trace ledger",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "bun test --preload ./missing-openpawl-preload.ts",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Validation command failed.");
    expect(result.state.validationResult?.commandsRun[0]?.command).toBe(
      "bun test --preload ./missing-openpawl-preload.ts"
    );
    expect(result.state.validationResult?.commandsRun[0]?.exitCode).not.toBe(0);

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
  });

  it("uses placeholder validation for any dry-run without an explicit command", async () => {
    const result = await runAgent({
      query: "add tests for the Openpawl trace ledger",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: FIXTURE_PATH,
      provider: "mock",
      model: "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B",
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.state.validationResult?.success).toBe(true);
    expect(result.state.validationResult?.commandsRun[0]?.command).toBe("echo placeholder validation skipped");

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);

    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("Placeholder validation");
    expect(result.state.validationResult?.commandsRun[0]?.stdout).toContain("placeholder validation skipped");
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

  it("report.md Next Suggested Human Action references concrete patch-plan path and run ID", async () => {
    const result = await runAgent({
      query: "review current repository changes",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");

    const suggestedActionSection = report
      .split("## 🚀 Next Suggested Human Action\n\n")[1]
      ?.split("\n\n---")[0];

    expect(suggestedActionSection).toContain(result.runId);
    expect(suggestedActionSection).toContain(`.codepawl/runs/${result.runId}/patch-plan.json`);
    expect(report).not.toContain("${runId}");
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
                file: "bun.lock",
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
        {
          matchLastMessage: "Structured Output Retry",
          response: {
            content: JSON.stringify({ unexpected: "still wrong" }),
            usage: { inputTokens: 2, outputTokens: 2 },
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
    expect(result.error).toContain("provider=mock");
    expect(result.error).toContain("purpose=scope_analysis");
    expect(result.error).toContain("category=schema_validation");

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);

    const traceRaw = await fs.readFile(path.join(runDir, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as { events: Array<{ name: string; payload: unknown }> };
    expect(trace.events.some((event) =>
      event.name === "scope_analysis_response" &&
      JSON.stringify(event.payload).includes("\"validationStatus\":\"schema_invalid\"") &&
      JSON.stringify(event.payload).includes("\"parseCategory\":\"schema_validation\"") &&
      JSON.stringify(event.payload).includes("\"contentPreview\"")
    )).toBe(true);
  });

  it("retries malformed scope_analysis JSON once and succeeds with a compact prompt", async () => {
    const retryFixturePath = path.join(tmpDir, "malformed-then-valid-scope.json");
    await fs.writeFile(
      retryFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Repository Scan Result",
          response: {
            content: "{ \"rationale\": The user requests tests }",
            finishReason: "stop",
            usage: { inputTokens: 10, outputTokens: 4 },
          },
        },
        {
          matchLastMessage: "Structured Output Retry",
          response: {
            content: JSON.stringify({
              rationale: "Retry returned valid scope.",
              affectedModules: ["packages/core"],
              proposedFilesToModify: [],
              proposedFilesToCreate: ["packages/core/src/__tests__/trace-ledger.test.ts"],
            }),
            finishReason: "stop",
            usage: { inputTokens: 5, outputTokens: 6 },
          },
        },
        {
          matchLastMessage: "Selected Files Content",
          response: {
            content: JSON.stringify({ rationale: "No code chunks in dry-run.", chunks: [] }),
            usage: { inputTokens: 3, outputTokens: 2 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for the Openpawl trace ledger",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: retryFixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.scopeAnalysisResult?.rationale).toBe("Retry returned valid scope.");

    const traceRaw = await fs.readFile(path.join(tmpDir, ".codepawl", "runs", result.runId, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as { events: Array<{ name: string; payload: Record<string, unknown> }> };
    const retry = trace.events.find((event) => event.name === "provider_structured_retry");
    const response = trace.events.find((event) => event.name === "scope_analysis_response");
    expect(retry?.payload.parseCategory).toBe("malformed_json");
    expect(retry?.payload.finishReason).toBe("stop");
    expect(retry?.payload.contentLength).toBeGreaterThan(0);
    expect(response?.payload.retryAttempt).toBe(1);
  });

  it("retries schema-invalid patch_plan once and succeeds", async () => {
    const retryFixturePath = path.join(tmpDir, "schema-then-valid-patch.json");
    await fs.writeFile(
      retryFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Repository Scan Result",
          response: {
            content: JSON.stringify({
              rationale: "Scope trace tests.",
              affectedModules: ["packages/core"],
              proposedFilesToModify: [],
              proposedFilesToCreate: ["packages/core/src/__tests__/trace-ledger.test.ts"],
            }),
            usage: { inputTokens: 3, outputTokens: 4 },
          },
        },
        {
          matchLastMessage: "Selected Files Content",
          response: {
            content: JSON.stringify({
              rationale: "Missing chunk description.",
              chunks: [{ type: "create", file: "packages/core/src/__tests__/trace-ledger.test.ts" }],
            }),
            finishReason: "stop",
            usage: { inputTokens: 4, outputTokens: 4 },
          },
        },
        {
          matchLastMessage: "Structured Output Retry",
          response: {
            content: JSON.stringify({
              rationale: "Retry returned metadata-only plan.",
              chunks: [
                {
                  type: "create",
                  file: "packages/core/src/__tests__/trace-ledger.test.ts",
                  description: "Create trace ledger tests.",
                },
              ],
            }),
            finishReason: "stop",
            usage: { inputTokens: 3, outputTokens: 5 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for the Openpawl trace ledger",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: retryFixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.patchPlan?.chunks[0]?.description).toBe("Create trace ledger tests.");

    const traceRaw = await fs.readFile(path.join(tmpDir, ".codepawl", "runs", result.runId, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as { events: Array<{ name: string; payload: Record<string, unknown> }> };
    const retry = trace.events.find((event) => event.name === "provider_structured_retry");
    const response = trace.events.find((event) => event.name === "patch_plan_response");
    expect(retry?.payload.parseCategory).toBe("schema_validation");
    expect(retry?.payload.schemaValidationPath).toBe("chunks[0].description");
    expect(response?.payload.retryAttempt).toBe(1);
  });

  it("reports actionable metadata when malformed JSON retry also fails", async () => {
    const retryFailureFixturePath = path.join(tmpDir, "malformed-retry-fails.json");
    await fs.writeFile(
      retryFailureFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Repository Scan Result",
          response: {
            content: "{ \"rationale\": The user requests tests }",
            finishReason: "stop",
            usage: { inputTokens: 10, outputTokens: 4 },
          },
        },
        {
          matchLastMessage: "Structured Output Retry",
          response: {
            content: "{ \"rationale\": Still not quoted }",
            finishReason: "stop",
            usage: { inputTokens: 5, outputTokens: 3 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for the Openpawl trace ledger",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: retryFailureFixturePath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("category=malformed_json");
    expect(result.error).toContain("finish_reason=stop");
    expect(result.error).toContain("content_length=");

    const traceRaw = await fs.readFile(path.join(tmpDir, ".codepawl", "runs", result.runId, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as { events: Array<{ name: string; payload: Record<string, unknown> }> };
    const response = trace.events.find((event) => event.name === "scope_analysis_response");
    expect(response?.payload.parseCategory).toBe("malformed_json");
    expect(response?.payload.finishReason).toBe("stop");
    expect(response?.payload.contentLength).toBeGreaterThan(0);
    expect(response?.payload.responseFormatRequested).toBe(true);
  });

  it("does not write full prompts or secrets to trace metadata", async () => {
    const secretFixturePath = path.join(tmpDir, "secret-preview-redaction.json");
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
    await fs.writeFile(
      secretFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Repository Scan Result",
          response: {
            content: `{ "rationale": ${secret} }`,
            finishReason: "stop",
            usage: { inputTokens: 10, outputTokens: 4 },
          },
        },
        {
          matchLastMessage: "Structured Output Retry",
          response: {
            content: JSON.stringify({
              rationale: "Retry returned valid scope.",
              affectedModules: ["packages/core"],
              proposedFilesToModify: [],
              proposedFilesToCreate: [],
            }),
            finishReason: "stop",
            usage: { inputTokens: 5, outputTokens: 6 },
          },
        },
        {
          matchLastMessage: "Selected Files Content",
          response: {
            content: JSON.stringify({ rationale: "No file changes.", chunks: [] }),
            usage: { inputTokens: 3, outputTokens: 2 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: `add tests for token ${secret}`,
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: secretFixturePath,
    });

    expect(result.success).toBe(true);
    const traceRaw = await fs.readFile(path.join(tmpDir, ".codepawl", "runs", result.runId, "trace.json"), "utf-8");
    expect(traceRaw).not.toContain(secret);
    expect(traceRaw).not.toContain("Repository Scan Result");
    expect(traceRaw).not.toContain("Return JSON object only");
    expect(traceRaw).toContain("sk-[REDACTED]");
  });

  it("records provider_schema_repaired when patch_plan aliases are safely repaired", async () => {
    const repairFixturePath = path.join(tmpDir, "repair-fixture.json");
    await fs.writeFile(
      repairFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Repository Scan Result",
          response: {
            content: JSON.stringify({
              rationale: "Scope existing trace file.",
              affectedModules: ["packages/core/src"],
              proposedFilesToModify: [],
              proposedFilesToCreate: ["packages/core/src/__tests__/trace-ledger.test.ts"],
            }),
            usage: { inputTokens: 3, outputTokens: 2 },
          },
        },
        {
          matchLastMessage: "Selected Files Content",
          response: {
            content: JSON.stringify({
              rationale: "Create a trace ledger test.",
              chunks: [
                {
                  type: "create",
                  path: "packages/core/src/__tests__/trace-ledger.test.ts",
                  summary: "Create trace ledger tests.",
                },
              ],
            }),
            usage: { inputTokens: 3, outputTokens: 2 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for the Openpawl trace ledger",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: repairFixturePath,
    });

    expect(result.success).toBe(true);

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);

    const patchPlanRaw = await fs.readFile(path.join(runDir, "patch-plan.json"), "utf-8");
    const patchPlan = JSON.parse(patchPlanRaw) as { chunks: Array<Record<string, unknown>> };
    expect(patchPlan.chunks[0]?.["file"]).toBe("packages/core/src/__tests__/trace-ledger.test.ts");
    expect(patchPlan.chunks[0]?.["description"]).toBe("Create trace ledger tests.");
    expect(patchPlan.chunks[0]?.["path"]).toBeUndefined();
    expect(patchPlan.chunks[0]?.["summary"]).toBeUndefined();

    const traceRaw = await fs.readFile(path.join(runDir, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as { events: Array<{ name: string; payload: unknown }> };
    expect(trace.events.some((event) =>
      event.name === "provider_schema_repaired" &&
      JSON.stringify(event.payload).includes("\"alias\":\"path\"") &&
      JSON.stringify(event.payload).includes("\"alias\":\"summary\"")
    )).toBe(true);
  });
});
