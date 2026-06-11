import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { runAgent } from "../runner";
import {
  AppliedFilesArtifactSchema,
  PatchPlanArtifactSchema,
  RunArtifactSchema,
  RunArtifactSetSchema,
  SelectedFilesArtifactSchema,
  TraceArtifactSchema,
} from "../state/evidence";

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
  "applied-files.json",
];

async function expectRequiredArtifacts(runDir: string): Promise<void> {
  for (const file of REQUIRED_ARTIFACTS) {
    const stat = await fs.stat(path.join(runDir, file)).catch(() => null);
    expect(stat, `Expected artifact ${file} to exist`).not.toBeNull();
  }
}

async function expectSchemaValidArtifactSet(runDir: string): Promise<void> {
  const run = RunArtifactSchema.parse(JSON.parse(await fs.readFile(path.join(runDir, "run.json"), "utf-8")));
  const trace = TraceArtifactSchema.parse(JSON.parse(await fs.readFile(path.join(runDir, "trace.json"), "utf-8")));
  const patchPlan = PatchPlanArtifactSchema.parse(JSON.parse(await fs.readFile(path.join(runDir, "patch-plan.json"), "utf-8")));
  const selectedFiles = SelectedFilesArtifactSchema.parse(JSON.parse(await fs.readFile(path.join(runDir, "selected-files.json"), "utf-8")));
  const appliedFiles = AppliedFilesArtifactSchema.parse(JSON.parse(await fs.readFile(path.join(runDir, "applied-files.json"), "utf-8")));

  expect(() => RunArtifactSetSchema.parse({
    run,
    trace,
    patchPlan,
    selectedFiles,
    appliedFiles,
  })).not.toThrow();
}

async function writeJsonFixture(filePath: string, payload: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(payload), "utf-8");
}

async function writeScopedWorkspace(packagePath: string, script: string, command: string): Promise<void> {
  const packageDir = path.join(tmpDir, packagePath);
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "package.json"),
    JSON.stringify({
      name: "openpawl-scope-fixture",
      private: true,
      workspaces: ["packages/*", "apps/*"],
    }),
    "utf-8"
  );

  await fs.writeFile(
    path.join(packageDir, "package.json"),
    JSON.stringify({
      name: `@codepawl/${packagePath.split("/")[1] ?? packagePath}`,
      private: true,
      scripts: { [script]: command },
      version: "1.0.0",
    }),
    "utf-8"
  );
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
  it("produces all 6 artifact files in .codepawl/runs/<runId>/", async () => {
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

    // All required artifact files must exist
    await expectRequiredArtifacts(runDir);
    await expectSchemaValidArtifactSet(runDir);
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
    const report = await fs.readFile(path.join(outDir, "report.md"), "utf-8");
    expect(report).toContain(`- Artifact directory: \`${outDir}\``);
    expect(report).toContain(`- Run artifact: \`${path.join(outDir, "run.json")}\``);

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
    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("## Evidence Summary");
    expect(report).toContain("| schemaVersion | `1` |");
    expect(report).toContain("| Failure category | `validation_failed` |");
    expect(report).toContain("### Failure Summary");
    expect(report).toContain("- Category: `validation_failed`");
  });

  it("succeeds when patch plan is empty in dry-run mode", async () => {
    const emptyFixturePath = path.join(tmpDir, "dry-run-empty-chunks.json");
    await fs.writeFile(
      emptyFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope: no-op task",
              affectedModules: ["src"],
              proposedFilesToModify: [],
              proposedFilesToCreate: ["src/__tests__/noop.test.ts"],
            }),
            usage: { inputTokens: 3, outputTokens: 4 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({ rationale: "No code changes in dry-run.", chunks: [] }),
            usage: { inputTokens: 3, outputTokens: 2 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "review current repository changes",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: emptyFixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);

    const applied = JSON.parse(await fs.readFile(path.join(runDir, "applied-files.json"), "utf-8")) as {
      attempted: number;
      created: string[];
      skipped: Array<{ file: string; reason: string }>;
      rejected: Array<{ file: string; reason: string }>;
    };
    expect(applied.attempted).toBe(0);
    expect(applied.created).toEqual([]);
    expect(applied.skipped).toEqual([]);
    expect(applied.rejected).toEqual([]);
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
    expect(result.state.validationResult?.validationDecision).toMatchObject({
      source: "explicit",
      confidence: 1,
      command: "bun test --preload ./missing-openpawl-preload.ts",
    });
    expect(result.state.validationResult?.validationDecision?.reason).toContain("Explicit --test-cmd");

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
    expect(result.state.validationResult?.validationDecision).toMatchObject({
      source: "placeholder",
      confidence: 1,
      command: "echo placeholder validation skipped",
    });
    expect(result.state.validationResult?.validationDecision?.reason).toContain("placeholder");

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);

    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("Placeholder validation");
    expect(result.state.validationResult?.commandsRun[0]?.stdout).toContain("placeholder validation skipped");
    expect(report).toContain("**Validation Decision:** placeholder");
  });

  it("uses placeholder validation in review-only dry-runs with no target files", async () => {
    const noTargetFixturePath = path.join(tmpDir, "inference-no-target.json");
    await writeJsonFixture(noTargetFixturePath, [
      {
        matchLastMessage: "Scope Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Review dry-run has no target file proposals.",
            affectedModules: ["src"],
            proposedFilesToCreate: [],
            proposedFilesToModify: [],
          }),
          usage: { inputTokens: 9, outputTokens: 7 },
        },
      },
      {
        matchLastMessage: "Patch Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "No-op dry-run should keep no target files.",
            chunks: [],
          }),
          usage: { inputTokens: 4, outputTokens: 3 },
        },
      },
    ]);

    const result = await runAgent({
      query: "review current repository changes",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: noTargetFixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.validationResult?.validationDecision?.source).toBe("placeholder");
    expect(result.state.validationResult?.validationDecision?.command).toBe("echo placeholder validation skipped");
  });

  it("infers @codepawl/core test from created core test file", async () => {
    await writeScopedWorkspace("packages/core", "test", "echo ok");

    const fixturePath = path.join(tmpDir, "inference-core-created.json");
    const inferredFile = "packages/core/__tests__/scope-inference-core-created.test.ts";
    const query = "add core tests with created-file inference";
    await writeJsonFixture(fixturePath, [
      {
        matchQuery: query,
        matchLastMessage: "Scope Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Core scope inference fixture for created file priority.",
            affectedModules: ["packages/core"],
            proposedFilesToCreate: [inferredFile],
            proposedFilesToModify: [],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
      {
        matchLastMessage: "Patch Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Create core test file for inference.",
            chunks: [
              {
                type: "create",
                file: inferredFile,
                description: "Create core inference scaffold.",
              },
            ],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
    ]);

    const result = await runAgent({
      query,
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: fixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.validationResult?.validationDecision?.source).toBe("inferred");
    expect(result.state.validationResult?.validationDecision?.command).toBe("bun --filter @codepawl/core test");
    expect(result.state.validationResult?.commandsRun?.[0]?.command).toBe("bun --filter @codepawl/core test");
  });

  it.each([
    ["cli", "packages/cli", "test", "bun --filter @codepawl/cli test"],
    ["shared", "packages/shared", "typecheck", "bun --filter @codepawl/shared typecheck"],
    ["web", "apps/web", "typecheck", "bun --filter @codepawl/web typecheck"],
  ])("infers %s scoped validation command in dry-run", async (
    label: string,
    packagePath: string,
    script: string,
    expectedCommand: string
  ) => {
    await writeScopedWorkspace(packagePath, script, "echo ok");

    const fixturePath = path.join(tmpDir, `inference-${label}.json`);
    const inferredFile = `${packagePath}/__tests__/scope-inference-${label}.test.ts`;
    const query = `add ${label} tests with inferred validation`;
    await writeJsonFixture(fixturePath, [
      {
        matchQuery: query,
        matchLastMessage: "Scope Context Pack",
        response: {
          content: JSON.stringify({
            rationale: `Scope inference fixture for ${label}.`,
            affectedModules: [packagePath],
            proposedFilesToCreate: [inferredFile],
            proposedFilesToModify: [],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
      {
        matchLastMessage: "Patch Context Pack",
        response: {
          content: JSON.stringify({
            rationale: `Patch plan for ${label} validation inference test.`,
            chunks: [
              {
                type: "create",
                file: inferredFile,
                description: `Create ${label} inference scaffold.`,
              },
            ],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
    ]);

    const result = await runAgent({
      query,
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: fixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.validationResult?.validationDecision?.source).toBe("inferred");
    expect(result.state.validationResult?.validationDecision?.command).toBe(expectedCommand);
    expect(result.state.validationResult?.validationDecision?.confidence).toBeGreaterThan(0);
    const report = await fs.readFile(path.join(tmpDir, ".codepawl", "runs", result.runId, "report.md"), "utf-8");
    expect(result.state.validationResult?.validationDecision?.reason).toContain("Inferred");
    expect(result.state.validationResult?.commandsRun?.[0]?.command).toBe(expectedCommand);
    expect(report).toContain("**Validation Decision:** inferred");
  });

  it("uses explicit --test-cmd when inference is possible", async () => {
    await writeScopedWorkspace("packages/core", "test", "echo ok");
    const fixturePath = path.join(tmpDir, "inference-explicit-override.json");
    const inferredFile = "packages/core/__tests__/scope-inference-explicit.test.ts";
    const query = "add core tests with explicit command override";
    await writeJsonFixture(fixturePath, [
      {
        matchQuery: query,
        matchLastMessage: "Scope Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Scope inference fixture with explicit command.",
            affectedModules: ["packages/core"],
            proposedFilesToCreate: [inferredFile],
            proposedFilesToModify: [],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
      {
        matchLastMessage: "Patch Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Explicit override patch plan test.",
            chunks: [
              {
                type: "create",
                file: inferredFile,
                description: "Create core explicit command override scaffold.",
              },
            ],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
    ]);

    const explicitCommand = "echo explicit-validation";
    const result = await runAgent({
      query,
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: fixturePath,
      testCommand: explicitCommand,
    });

    expect(result.success).toBe(true);
    expect(result.state.validationResult?.validationDecision).toMatchObject({
      source: "explicit",
      confidence: 1,
      command: explicitCommand,
    });
    expect(result.state.validationResult?.commandsRun?.[0]?.command).toBe(explicitCommand);
  });

  it("does not infer from unrelated workspace context candidate packages", async () => {
    await writeScopedWorkspace("packages/core", "test", "echo ok");
    await writeScopedWorkspace("packages/cli", "test", "echo ok");

    const fixturePath = path.join(tmpDir, "inference-unrelated-context.json");
    const inferredFile = "packages/core/src/__tests__/scope-inference-noise.test.ts";
    const query = "add core tests with cli context";
    await writeJsonFixture(fixturePath, [
      {
        matchQuery: query,
        matchLastMessage: "Scope Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Core task should prefer core patch target over cli package context.",
            affectedModules: ["packages/core"],
            proposedFilesToCreate: [inferredFile],
            proposedFilesToModify: [],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
      {
        matchLastMessage: "Patch Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Core scope with noisy context.",
            chunks: [
              {
                type: "create",
                file: inferredFile,
                description: "Create core inference scaffold.",
              },
            ],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
    ]);

    const result = await runAgent({
      query,
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: fixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.validationResult?.validationDecision?.source).toBe("inferred");
    expect(result.state.validationResult?.validationDecision?.command).toBe("bun --filter @codepawl/core test");
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
    expect(report).toContain("## Evidence Summary");
    expect(report).toContain("| schemaVersion | `1` |");
    expect(report).toContain("| Failure category | `none` |");
    expect(report).toContain("### Artifact Links");
    expect(report).toContain(`openpawl-artifacts-${result.runId}`);
  });

  it("report.md includes GitHub Actions evidence when provided by workflow env", async () => {
    const previousUrl = process.env["OPENPAWL_GITHUB_ACTIONS_URL"];
    process.env["OPENPAWL_GITHUB_ACTIONS_URL"] = "https://github.com/codepawl/codepawl/actions/runs/123";

    try {
      const result = await runAgent({
        query: "review changes and suggest improvements",
        workspaceDir: tmpDir,
        dryRun: true,
        testCommand: "echo ok",
        mockFixturePath: FIXTURE_PATH,
      });

      const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
      const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");

      expect(report).toContain(
        "| GitHub Actions URL | https://github.com/codepawl/codepawl/actions/runs/123 |",
      );
      expect(report).toContain(`| Artifact name | \`openpawl-artifacts-${result.runId}\` |`);
      expect(report).toContain(`| Artifact directory | \`${runDir}\` |`);
      expect(report).toContain(`| Report path | \`${path.join(runDir, "report.md")}\` |`);
      expect(report).toContain(`| Trace path | \`${path.join(runDir, "trace.json")}\` |`);
    } finally {
      if (previousUrl === undefined) {
        delete process.env["OPENPAWL_GITHUB_ACTIONS_URL"];
      } else {
        process.env["OPENPAWL_GITHUB_ACTIONS_URL"] = previousUrl;
      }
    }
  });

  it("report.md includes a Context Pack section with compaction metadata", async () => {
    const result = await runAgent({
      query: "implement fixes for current repository changes",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
      contextMaxFiles: 2,
    });

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");

    expect(report).toContain("## 🧩 Context Pack");
    expect(report).toContain("Included file count:");
    expect(report).toContain("Omitted file count:");
    expect(report).toContain("Context compacted:");
    expect(report).toContain("Context budget:");
    expect(report).toContain("Full prompts are not stored");
  });

  it("records context-compaction metrics and prompt char counts in trace", async () => {
    const result = await runAgent({
      query: "add tests for shared helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
      contextMaxFiles: 1,
    });

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const traceRaw = await fs.readFile(path.join(runDir, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as {
      events: Array<{ type: string; name: string; payload: Record<string, unknown> }>;
    };

    const contextPackEvent = trace.events.find((event) => event.name === "context_pack_created");
    expect(contextPackEvent?.payload).toBeDefined();
    expect(contextPackEvent?.payload.inputScannedFiles).toBeTypeOf("number");
    expect(contextPackEvent?.payload.candidateFiles).toBeTypeOf("number");
    expect(contextPackEvent?.payload.compactionReason).toBeTypeOf("string");

    const scopeCall = trace.events.find((event) => event.type === "llm_call" && event.name === "scope_analysis");
    const patchCall = trace.events.find((event) => event.type === "llm_call" && event.name === "patch_plan");

    expect(scopeCall?.payload.promptChars).toBeTypeOf("number");
    expect((scopeCall?.payload.promptChars as number)).toBeGreaterThan(0);
    expect(patchCall?.payload.promptChars).toBeTypeOf("number");
    expect((patchCall?.payload.promptChars as number)).toBeGreaterThan(0);

    const scopeResponse = trace.events.find((event) => event.name === "scope_analysis_response");
    expect(scopeResponse?.payload.tokenUsage).toBeTruthy();
  });

  it("uses compact context markers in provider prompts, not raw repo-scan messages", async () => {
    const compactFixturePath = path.join(tmpDir, "compact-prompt-fixture.json");
    await fs.writeFile(
      compactFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope is focused.",
              affectedModules: ["packages/core"],
              proposedModifications: [],
              proposedCreations: [],
            }),
            usage: { inputTokens: 6, outputTokens: 8 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "No-op metadata plan.",
              chunks: [],
            }),
            usage: { inputTokens: 4, outputTokens: 3 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "implement focused fixes for current repository changes",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: compactFixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.scopeAnalysisResult?.rationale).toBe("Scope is focused.");
  });

  it("keeps mock provider deterministic with identical inputs and context budgets", async () => {
    const options = {
      query: "implement focused fixes for current repository changes",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
      contextMaxFiles: 8,
      contextMaxChars: 10_000,
    } satisfies Parameters<typeof runAgent>[0];

    const first = await runAgent(options);
    const second = await runAgent(options);

    expect(second.state.scopeAnalysisResult).toEqual(first.state.scopeAnalysisResult);
    expect(second.state.patchPlan).toEqual(first.state.patchPlan);
    expect(second.traceSummary.tokenUsage.total).toBe(first.traceSummary.tokenUsage.total);
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

describe("runAgent — readiness gate", () => {
  it("classifies a clear task as ready in dry-run", async () => {
    const result = await runAgent({
      query: "add tests for auth helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.success).toBe(true);
    expect(result.state.readinessGateResult?.status).toBe("ready");
    expect(result.state.readinessGateResult?.reasons).toContain(
      "Task appears clear, supported, and safely scoped for this run."
    );
    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);

    const runArtifact = JSON.parse(await fs.readFile(path.join(runDir, "run.json"), "utf-8"));
    // Assert run.json conforms to the stable RunArtifactSchema
    expect(() => RunArtifactSchema.parse(runArtifact)).not.toThrow();
    await expectSchemaValidArtifactSet(runDir);
    expect(runArtifact.readiness?.status).toBe("ready");
  });

  it("blocks vague tasks as needs clarification with no provider calls", async () => {
    const result = await runAgent({
      query: "fix stuff",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.success).toBe(false);
    expect(result.state.readinessGateResult?.status).toBe("needs_clarification");
    expect(result.traceSummary.llmCallsCount).toBe(0);
    expect(result.error).toContain("Readiness gate blocked this run: needs_clarification");

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("## 🚦 Readiness Gate");
    expect(report).toContain("**Status:** needs_clarification");
    expect(report).toContain("Readiness gate blocked execution because the task is under-specified.");
    expect(report).toContain("## Evidence Summary");
    expect(report).toContain("| Failure category | `readiness_blocked` |");
    expect(report).toContain("| Provider calls | `0` |");
    expect(report).toContain("### Failure Summary");
    await expectRequiredArtifacts(runDir);
  });

  it("blocks unsupported tasks and persists artifacts", async () => {
    const result = await runAgent({
      query: "write a poem about repo maintenance",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.success).toBe(false);
    expect(result.state.readinessGateResult?.status).toBe("unsupported");
    expect(result.traceSummary.llmCallsCount).toBe(0);
    expect(result.error).toContain("Readiness gate blocked this run: unsupported");

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);

    const runArtifact = JSON.parse(await fs.readFile(path.join(runDir, "run.json"), "utf-8"));
    // Assert run.json conforms to the stable RunArtifactSchema
    expect(() => RunArtifactSchema.parse(runArtifact)).not.toThrow();
    await expectSchemaValidArtifactSet(runDir);
    expect(runArtifact.readiness?.status).toBe("unsupported");
  });

  it("blocks unsafe write requests before planning", async () => {
    const result = await runAgent({
      query: "delete all env files",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.success).toBe(false);
    expect(result.state.readinessGateResult?.status).toBe("unsafe");
    expect(result.error).toContain("Readiness gate blocked this run: unsafe");
    expect(result.traceSummary.llmCallsCount).toBe(0);

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
  });

  it("blocks destructive repo wipe requests before provider calls", async () => {
    const result = await runAgent({
      query: "wipe repo",
      workspaceDir: tmpDir,
      dryRun: true,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.success).toBe(false);
    expect(result.state.readinessGateResult?.status).toBe("unsafe");
    expect(result.error).toContain("Readiness gate blocked this run: unsafe");
    expect(result.traceSummary.llmCallsCount).toBe(0);

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
  });

  it("supports write mode without explicit validation command when a scoped command is inferred", async () => {
    await writeScopedWorkspace("packages/core", "test", "echo ok");

    const fixturePath = path.join(tmpDir, "write-inferred.json");
    const inferredFile = "packages/core/__tests__/inferred-write.test.ts";
    await writeJsonFixture(fixturePath, [
      {
        matchQuery: "write with inferred command",
        matchLastMessage: "Scope Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Scope fixture for write-mode inference.",
            affectedModules: ["packages/core"],
            proposedFilesToCreate: [inferredFile],
            proposedFilesToModify: [],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
      {
        matchLastMessage: "Patch Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Write fixture for scoped inference.",
            chunks: [
              {
                type: "create",
                file: inferredFile,
                description: "Create test fixture file.",
              },
            ],
          }),
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
    ]);

    const result = await runAgent({
      query: "write with inferred command",
      workspaceDir: tmpDir,
      dryRun: false,
      mockFixturePath: fixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.validationResult?.validationDecision?.source).toBe("inferred");
    expect(result.state.validationResult?.validationDecision?.command).toBe("bun --filter @codepawl/core test");
    expect(result.state.readinessGateResult?.status).toBe("ready");
  });

  it("fails write mode when scoped command is not inferable and no explicit test command is provided", async () => {
    const unavailableFixturePath = path.join(tmpDir, "write-inference-unavailable.json");
    await writeJsonFixture(unavailableFixturePath, [
      {
        matchLastMessage: "Scope Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Scope fixture for write mode unavailable validation.",
            affectedModules: ["src"],
            proposedFilesToCreate: ["src/__tests__/no-inference.test.ts"],
            proposedFilesToModify: [],
          }),
          usage: { inputTokens: 8, outputTokens: 8 },
        },
      },
      {
        matchLastMessage: "Patch Context Pack",
        response: {
          content: JSON.stringify({
            rationale: "Write no-inference validation fixture.",
            chunks: [
              {
                type: "create",
                file: "src/__tests__/no-inference.test.ts",
                description: "Create test file without scoped validation command.",
              },
            ],
          }),
          usage: { inputTokens: 8, outputTokens: 8 },
        },
      },
    ]);

    const result = await runAgent({
      query: "add an integration safety test",
      workspaceDir: tmpDir,
      dryRun: false,
      mockFixturePath: unavailableFixturePath,
    });

    expect(result.success).toBe(false);
    expect(result.state.readinessGateResult?.status).toBe("ready");
    expect(result.state.validationResult?.validationDecision).toMatchObject({
      source: "unavailable",
      confidence: 0,
      command: "",
    });
    expect(result.state.validationResult?.commandsRun).toEqual([]);
    expect(result.state.validationResult?.errors).toContain(
      "No explicit or inferred scoped validation command was found and write mode requires a safe validation command."
    );

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
  });

  it("preserves all 6 artifacts when readiness rejects in write mode", async () => {
    const result = await runAgent({
      query: "write a poem about the architecture",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.success).toBe(false);
    expect(result.state.readinessGateResult?.status).toBe("unsupported");
    expect(result.traceSummary.llmCallsCount).toBe(0);

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
    await expectSchemaValidArtifactSet(runDir);

    const runArtifact = JSON.parse(await fs.readFile(path.join(runDir, "run.json"), "utf-8")) as {
      readiness?: {
        status: string;
      };
      error: string;
    };
    expect(runArtifact.readiness?.status).toBe("unsupported");
    expect(runArtifact.error).toContain("Readiness gate blocked this run: unsupported");
  });
});

describe("runAgent — write mode safety guardrails", () => {
  it("aborts and writes artifacts when patch targets a lockfile", async () => {
    // Fixture using matchLastMessage to distinguish scope_analysis vs patch_plan calls:
    // scope_analysis messages contain "Scope Context Pack"
    // patch_plan messages contain "Patch Context Pack"
    const dangerousFixture = [
      {
        matchLastMessage: "Scope Context Pack",
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
        matchLastMessage: "Patch Context Pack",
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

  it("creates a new allowed test file in write mode", async () => {
    const createFixture = path.join(tmpDir, "write-create-fixture.json");
    await fs.writeFile(
      createFixture,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope: add hello test",
              affectedModules: ["src"],
              proposedFilesToModify: [],
              proposedFilesToCreate: ["src/__tests__/hello.test.ts"],
            }),
            usage: { inputTokens: 10, outputTokens: 10 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Create hello test file",
              chunks: [
                {
                  type: "create",
                  file: "src/__tests__/hello.test.ts",
                  description: "Create hello test file",
                },
              ],
            }),
            usage: { inputTokens: 20, outputTokens: 20 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for hello file",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: createFixture,
    });

    const createdPath = path.join(tmpDir, "src", "__tests__", "hello.test.ts");
    const created = await fs.readFile(createdPath, "utf-8");
    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);

    expect(result.success).toBe(true);
    expect(created).toContain("Generated by Openpawl");
    expect(created).toContain("import { describe, it, expect } from \"vitest\"");
    expect(result.state.validationResult?.success).toBe(true);
    expect(result.state.validationResult?.commandsRun[0]?.command).toBe("echo ok");
    expect(result.state.validationResult?.commandsRun[0]?.stdout).toContain("ok");
    expect(result.state.writeResult?.created).toEqual(["src/__tests__/hello.test.ts"]);
    expect(result.state.writeResult?.skipped).toEqual([]);
    expect(result.state.writeResult?.rejected).toEqual([]);

    await expectRequiredArtifacts(runDir);
    const applied = JSON.parse(await fs.readFile(path.join(runDir, "applied-files.json"), "utf-8")) as {
      created: string[];
      skipped: Array<{ file: string; reason: string }>;
      rejected: Array<{ file: string; reason: string }>;
    };
    expect(applied.created).toEqual(["src/__tests__/hello.test.ts"]);
    expect(applied.skipped).toEqual([]);
    expect(applied.rejected).toEqual([]);

    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("✅ PASSED");
  });

  it("creates a grounded trace-ledger scaffold with the default mock fixture in write mode", async () => {
    const result = await runAgent({
      query: "add tests for the Openpawl trace ledger",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    const createdPath = path.join(tmpDir, "packages", "core", "src", "__tests__", "trace-ledger.generated.test.ts");
    const created = await fs.readFile(createdPath, "utf-8");
    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    const applied = JSON.parse(await fs.readFile(path.join(runDir, "applied-files.json"), "utf-8")) as {
      attempted: number;
      created: string[];
      skipped: Array<{ file: string; reason: string }>;
      rejected: Array<{ file: string; reason: string }>;
    };

    expect(result.success).toBe(true);
    expect(created).toContain("Generated by Openpawl");
    expect(created).toContain("import { describe, it, expect } from \"vitest\"");
    expect(result.state.validationResult?.success).toBe(true);
    expect(result.state.validationResult?.commandsRun[0]?.command).toBe("echo ok");
    expect(result.state.validationResult?.commandsRun[0]?.exitCode).toBe(0);
    expect(result.state.writeResult?.attempted).toBe(1);
    expect(result.state.writeResult?.created).toEqual(["packages/core/src/__tests__/trace-ledger.generated.test.ts"]);
    expect(result.state.writeResult?.skipped).toEqual([]);
    expect(result.state.writeResult?.rejected).toEqual([]);
    expect(applied).toMatchObject({
      schemaVersion: "1",
      runId: result.runId,
      attempted: 1,
      created: ["packages/core/src/__tests__/trace-ledger.generated.test.ts"],
      skipped: [],
      rejected: [],
    });

    await expectRequiredArtifacts(runDir);
  });

  it("fails write mode with empty chunk list and preserves artifacts", async () => {
    const emptyFixturePath = path.join(tmpDir, "write-empty-chunks.json");
    await fs.writeFile(
      emptyFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope: no-op write plan",
              affectedModules: ["src"],
              proposedFilesToModify: [],
              proposedFilesToCreate: ["src/__tests__/noop.test.ts"],
            }),
            usage: { inputTokens: 6, outputTokens: 6 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({ rationale: "No code chunks in write mode.", chunks: [] }),
            usage: { inputTokens: 3, outputTokens: 2 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "update repository docs",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: emptyFixturePath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No safe create chunks available in write mode.");
    expect(result.state.writeResult?.attempted).toBe(0);
    expect(result.state.writeResult?.created).toEqual([]);
    expect(result.state.writeResult?.skipped).toEqual([]);
    expect(result.state.writeResult?.rejected).toEqual([]);

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
    await expectSchemaValidArtifactSet(runDir);
    const runArtifact = JSON.parse(await fs.readFile(path.join(runDir, "run.json"), "utf-8")) as {
      success: boolean;
      error: string | null;
    };
    expect(runArtifact.success).toBe(false);
    expect(runArtifact.error).toContain("No safe create chunks available in write mode.");

    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("**Overall:** Not run");
    expect(report).toContain("Not run");
    expect(report).toContain("| Failure category | `write_policy_blocked` |");
    expect(report).toContain("### Failure Summary");
    expect(report).toContain("Write mode failed before validation because no safe create chunks were available.");
    expect(report).not.toContain("Validation failed — review errors before merging.");
  });

  it("fails write mode when all patch chunks are unsafe", async () => {
    const unsafeFixture = path.join(tmpDir, "write-unsafe-chunks.json");
    const unsafeTargetPath = path.join(tmpDir, "src", "__tests__", "allowed-marker.test.ts");
    await fs.mkdir(path.dirname(unsafeTargetPath), { recursive: true });
    await fs.writeFile(unsafeTargetPath, "export const allowed = true;", "utf-8");
    await fs.writeFile(
      unsafeFixture,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope: adjust test scaffolding",
              affectedModules: ["src"],
              proposedFilesToModify: [],
              proposedFilesToCreate: ["src/__tests__/allowed-marker.test.ts"],
            }),
            usage: { inputTokens: 6, outputTokens: 6 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Unsafe patch plan",
              chunks: [
                {
                  type: "modify",
                  file: "src/__tests__/allowed-marker.test.ts",
                  description: "Attempt unsafe modify chunk",
                },
              ],
            }),
            usage: { inputTokens: 6, outputTokens: 6 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for source files",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: unsafeFixture,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No safe create chunks available in write mode.");
    expect(result.state.writeResult?.attempted).toBe(1);
    expect(result.state.writeResult?.created).toEqual([]);
    expect(result.state.writeResult?.rejected).toEqual([
      {
        file: "src/__tests__/allowed-marker.test.ts",
        reason: "chunk type modify is not supported in write mode; only create chunks are applied",
      },
    ]);
    expect(result.state.writeResult?.skipped).toEqual([]);

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("❌ FAILED");
    expect(report).toContain("No safe create chunks available in write mode.");
    expect(report).toContain("**Attempted chunks:** 1");
    expect(report).toContain("**Created:** 0");
    expect(report).toContain("**Rejected:** 1");
    expect(report).toContain("**Overall:** Not run");
    expect(report).toContain("Write mode failed before validation because no safe create chunks were available.");
    expect(report).not.toContain("Validation failed — review errors before merging.");
  });

  it("skips existing files and fails write mode when no new files are created", async () => {
    const existingPath = path.join(tmpDir, "src", "__tests__", "existing.test.ts");
    await fs.mkdir(path.dirname(existingPath), { recursive: true });
    await fs.writeFile(existingPath, "export const existing = true;", "utf-8");

    const overwriteFixture = path.join(tmpDir, "write-overwrite-fixture.json");
    await fs.writeFile(
      overwriteFixture,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope: existing test file",
              affectedModules: ["src"],
              proposedFilesToModify: [],
              proposedFilesToCreate: ["src/__tests__/existing.test.ts"],
            }),
            usage: { inputTokens: 10, outputTokens: 10 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Create existing test file",
              chunks: [
                {
                  type: "create",
                  file: "src/__tests__/existing.test.ts",
                  description: "Create existing test file",
                },
              ],
            }),
            usage: { inputTokens: 20, outputTokens: 20 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for hello file",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: overwriteFixture,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No safe create chunks available in write mode.");
    expect(result.state.writeResult?.attempted).toBe(1);
    expect(result.state.writeResult?.created).toEqual([]);
    expect(result.state.writeResult?.skipped).toEqual([
      {
        file: "src/__tests__/existing.test.ts",
        reason: "target file already exists",
      },
    ]);
    expect(result.state.writeResult?.rejected).toEqual([]);
    const marker = await fs.readFile(existingPath, "utf-8");
    expect(marker).toBe("export const existing = true;");
    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
  });

  it("rejects invalid write-mode create path and preserves artifacts", async () => {
    const existingSourcePath = path.join(tmpDir, "src", "main.ts");
    await fs.mkdir(path.dirname(existingSourcePath), { recursive: true });
    await fs.writeFile(existingSourcePath, "export const value = 1;", "utf-8");

    const invalidFixture = path.join(tmpDir, "write-invalid-fixture.json");
    await fs.writeFile(
      invalidFixture,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope: add source file",
              affectedModules: ["src"],
              proposedFilesToModify: [],
              proposedFilesToCreate: ["src/main.ts"],
            }),
            usage: { inputTokens: 8, outputTokens: 8 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Disallowed create",
              chunks: [
                {
                  type: "create",
                  file: "src/main.ts",
                  description: "Create source file in non-test path",
                },
              ],
            }),
            usage: { inputTokens: 8, outputTokens: 8 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for source files",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: invalidFixture,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No safe create chunks available in write mode.");
    expect(result.state.writeResult?.attempted).toBe(1);
    expect(result.state.writeResult?.created).toEqual([]);
    expect(result.state.writeResult?.skipped).toEqual([]);
    expect(result.state.writeResult?.rejected).toEqual([
      {
        file: "src/main.ts",
        reason: "only new test files under test paths are allowed in write mode",
      },
    ]);
    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("**Overall:** Not run");
    expect(report).toContain("| Failure category | `write_policy_blocked` |");
    expect(report).toContain("Write mode failed before validation because no safe create chunks were available.");
  });

  it("requires explicit test command in write mode", async () => {
    const result = await runAgent({
      query: "review repository notes and documentation structure",
      workspaceDir: tmpDir,
      dryRun: false,
      mockFixturePath: FIXTURE_PATH,
    });

    expect(result.success).toBe(false);
    expect(result.state.readinessGateResult?.status).toBe("ready");
    expect(result.error).toContain("No safe create chunks available in write mode.");
  });

  it.each([
    {
      query: "add tests for shared helpers",
      expectedFile: "packages/core/src/__tests__/generic.generated.test.ts",
    },
    {
      query: "add unit tests for shared helpers",
      expectedFile: "packages/core/src/parser.test.ts",
    },
    {
      query: "add regression tests for shared helpers",
      expectedFile: "packages/core/src/parser-regression.test.ts",
    },
    {
      query: "create tests for shared helpers",
      expectedFile: "packages/core/src/cli.spec.ts",
    },
    {
      query: "generate tests for shared helpers",
      expectedFile: "packages/core/src/__tests__/generated.spec.ts",
    },
    {
      query: "write tests for shared helpers",
      expectedFile: "packages/core/src/runtime.unit.test.ts",
    },
  ])("maps explicit add-tests intent \"$query\" to safe test chunk in default mock mode", async ({ query, expectedFile }) => {
    const result = await runAgent({
      query,
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: FIXTURE_PATH,
    });

    const createdPath = path.join(tmpDir, expectedFile);
    const created = await fs.readFile(createdPath, "utf-8");
    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);

    expect(result.success).toBe(true);
    expect(result.state.writeResult?.created).toEqual([expectedFile]);
    expect(result.state.writeResult?.skipped).toEqual([]);
    expect(result.state.writeResult?.rejected).toEqual([]);
    expect(created).toContain("Generated by Openpawl");
    expect(result.state.validationResult?.success).toBe(true);
    expect(result.state.validationResult?.commandsRun[0]?.command).toBe("echo ok");

    await expectRequiredArtifacts(runDir);
  });

  it("preserves artifacts and surfaces failure when validation fails after write mode file creation", async () => {
    const failingFixture = path.join(tmpDir, "write-validation-fail.json");
    await fs.writeFile(
      failingFixture,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope: add write test",
              affectedModules: ["src"],
              proposedFilesToModify: [],
              proposedFilesToCreate: ["src/__tests__/validation-fail.test.ts"],
            }),
            usage: { inputTokens: 10, outputTokens: 10 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Write one test file",
              chunks: [
                {
                  type: "create",
                  file: "src/__tests__/validation-fail.test.ts",
                  description: "Create a temporary test file",
                },
              ],
            }),
            usage: { inputTokens: 20, outputTokens: 20 },
          },
        },
      ]),
      "utf-8"
    );

    const createdPath = path.join(tmpDir, "src", "__tests__", "validation-fail.test.ts");

    const result = await runAgent({
      query: "add tests",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "bun -e \"process.exit(3)\"",
      mockFixturePath: failingFixture,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Validation command failed.");

    const created = await fs.readFile(createdPath, "utf-8");
    expect(created).toContain("Generated by Openpawl");

    const runDir = path.join(tmpDir, ".codepawl", "runs", result.runId);
    await expectRequiredArtifacts(runDir);
    await expectSchemaValidArtifactSet(runDir);
    const report = await fs.readFile(path.join(runDir, "report.md"), "utf-8");
    expect(report).toContain("Validation Result");
    expect(report).toContain("❌ FAILED");
    expect(report).toContain("| Failure category | `validation_failed` |");
    expect(report).toContain("### Failure Summary");
  });
});

describe("runAgent — error handling", () => {
  it("real-provider workflow path is exercised with mocked fetch", async () => {
    const originalFetch = globalThis.fetch;
    const requestBodies: Array<Record<string, unknown>> = [];

    const sequence: string[] = [
      JSON.stringify({
        rationale: "Scope plan for mocked real provider run.",
        affectedModules: ["packages/core"],
        proposedFilesToModify: [],
        proposedFilesToCreate: [],
      }),
      JSON.stringify({
        rationale: "Mocked patch metadata-only plan.",
        chunks: [],
      }),
    ];

    try {
      globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const request = new Request(input, init);
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
        requestBodies.push(body);
        const responseContent = sequence.shift();
        if (responseContent === undefined) {
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: sequence[0] ?? "{}" } }],
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: responseContent } }],
          }),
          { status: 200 }
        );
      };

      const result = await runAgent({
        query: "implement fixes for current repository changes",
        workspaceDir: tmpDir,
        dryRun: true,
        provider: "openai-compatible",
        model: "test-model",
        apiKey: "test-key",
        mockFixturePath: FIXTURE_PATH,
      });

    expect(result.success).toBe(true);
    expect(requestBodies.length).toBeGreaterThanOrEqual(2);
    expect(requestBodies[0]).toHaveProperty("model", "test-model");
    expect(requestBodies[1]).toHaveProperty("model", "test-model");
    expect(requestBodies[0]).toHaveProperty("messages");
    expect(requestBodies[1]).toHaveProperty("messages");
    expect(requestBodies[0]).toMatchObject({
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "scope_analysis",
          strict: true,
        },
      },
    });
    expect(requestBodies[1]).toMatchObject({
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "patch_plan",
          strict: true,
        },
      },
    });
  } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses json_object response format when explicitly configured", async () => {
    const originalFetch = globalThis.fetch;
    const requestBodies: Array<Record<string, unknown>> = [];

    const sequence: string[] = [
      JSON.stringify({
        rationale: "Schema override scope response.",
        affectedModules: ["packages/core"],
        proposedModifications: [],
        proposedCreations: ["packages/core/src/__tests__/trace-ledger.test.ts"],
      }),
      JSON.stringify({
        rationale: "Schema override patch metadata-only plan.",
        chunks: [],
      }),
    ];

    try {
      globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const request = new Request(input, init);
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
        requestBodies.push(body);
        const responseContent = sequence.shift();
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: responseContent ?? "{}" } }],
          }),
          { status: 200 }
        );
      };

      const result = await runAgent({
        query: "add tests for current repository changes",
        workspaceDir: tmpDir,
        dryRun: true,
        provider: "openai-compatible",
        model: "test-model",
        apiKey: "test-key",
        structuredOutputMode: "json_object",
        mockFixturePath: FIXTURE_PATH,
      });

      expect(result.success).toBe(true);
      expect(requestBodies.length).toBeGreaterThanOrEqual(2);
      expect(requestBodies[0]).toMatchObject({ response_format: { type: "json_object" } });
      expect(requestBodies[1]).toMatchObject({ response_format: { type: "json_object" } });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

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
    await expectSchemaValidArtifactSet(runDir);
  });

  it("exports artifacts when provider JSON fails schema validation", async () => {
    const invalidFixturePath = path.join(tmpDir, "invalid-provider-output.json");
    await fs.writeFile(
      invalidFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
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
    await expectSchemaValidArtifactSet(runDir);

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
          matchLastMessage: "Scope Context Pack",
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
          matchLastMessage: "Patch Context Pack",
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

  it("retries non-JSON scope_analysis output once and then succeeds", async () => {
    const nonJsonFixturePath = path.join(tmpDir, "non-json-then-valid-scope.json");
    await fs.writeFile(
      nonJsonFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: "We are given a task and will now explain what to do next.",
            finishReason: "stop",
            usage: { inputTokens: 10, outputTokens: 6 },
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
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({ rationale: "No code changes in dry-run.", chunks: [] }),
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
      mockFixturePath: nonJsonFixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.scopeAnalysisResult?.rationale).toBe("Retry returned valid scope.");

    const traceRaw = await fs.readFile(path.join(tmpDir, ".codepawl", "runs", result.runId, "trace.json"), "utf-8");
    const trace = JSON.parse(traceRaw) as { events: Array<{ name: string; payload: Record<string, unknown> }> };
    const retry = trace.events.find((event) => event.name === "provider_structured_retry");
    const response = trace.events.find((event) => event.name === "scope_analysis_response");
    expect(retry?.payload.parseCategory).toBe("non_json_output");
    expect(response?.payload.retryAttempt).toBe(1);
    expect(response?.payload.retryAttempted).toBe(true);
    expect(response?.payload.retrySucceeded).toBe(true);
  });

  it("retries schema-invalid patch_plan once and succeeds", async () => {
    const retryFixturePath = path.join(tmpDir, "schema-then-valid-patch.json");
    await fs.writeFile(
      retryFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
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
          matchLastMessage: "Patch Context Pack",
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
          matchLastMessage: "Scope Context Pack",
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
    expect(response?.payload.retryAttempt).toBe(1);
    expect(response?.payload.retryAttempted).toBe(true);
    expect(response?.payload.retrySucceeded).toBe(false);
    expect(trace.events.some((event) => event.name === "provider_structured_retry_failed")).toBe(true);

    const report = await fs.readFile(path.join(tmpDir, ".codepawl", "runs", result.runId, "report.md"), "utf-8");
    expect(report).toContain("## Error");
    expect(report).toContain("malformed_json");
  });

  it("does not write full prompts or secrets to trace metadata", async () => {
    const secretFixturePath = path.join(tmpDir, "secret-preview-redaction.json");
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
    await fs.writeFile(
      secretFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
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
          matchLastMessage: "Patch Context Pack",
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
    expect(traceRaw).not.toContain("Return JSON object only");
    expect(traceRaw).toContain("sk-[REDACTED]");
    const reportRaw = await fs.readFile(path.join(tmpDir, ".codepawl", "runs", result.runId, "report.md"), "utf-8");
    expect(reportRaw).not.toContain(secret);
    expect(reportRaw).toContain("sk-[REDACTED]");
  });

  it("records provider_schema_repaired when patch_plan aliases are safely repaired", async () => {
    const repairFixturePath = path.join(tmpDir, "repair-fixture.json");
    await fs.writeFile(
      repairFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
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
          matchLastMessage: "Patch Context Pack",
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

  it("rejects natural-language scope proposals as ungrounded and keeps valid paths", async () => {
    const groundingFixturePath = path.join(tmpDir, "grounding-scope-fallback.json");
    const groundedScopeFixtureFile = path.join(tmpDir, "packages/core/src/__tests__/trace-ledger.test.ts");
    await fs.mkdir(path.dirname(groundedScopeFixtureFile), { recursive: true });
    await fs.writeFile(
      groundedScopeFixtureFile,
      "export const marker = true;",
      "utf-8"
    );
    await fs.writeFile(
      groundingFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope for tests with mixed proposals.",
              affectedModules: ["packages/core/src"],
              proposedModifications: [
                "packages/core/src/__tests__/trace-ledger.test.ts",
                "This is not a file path and should be filtered out.",
              ],
              proposedCreations: [
                "tests/python/test_trace_ledger.py",
                "packages/core/src/__tests__/trace-learn.test.ts",
              ],
            }),
            usage: { inputTokens: 12, outputTokens: 10 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "No patch changes required.",
              chunks: [],
            }),
            usage: { inputTokens: 6, outputTokens: 4 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for shared helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: groundingFixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.scopeAnalysisResult?.proposedFilesToModify).toEqual([
      "packages/core/src/__tests__/trace-ledger.test.ts",
    ]);
    expect(result.state.scopeAnalysisResult?.proposedFilesToCreate).toEqual([
      "packages/core/src/__tests__/trace-learn.test.ts",
    ]);
    expect(result.state.scopeAnalysisResult?.rejectedProposedFilesToModify).toHaveLength(1);
    expect(result.state.scopeAnalysisResult?.rejectedProposedFilesToCreate).toHaveLength(1);

    const report = await fs.readFile(
      path.join(tmpDir, ".codepawl", "runs", result.runId, "report.md"),
      "utf-8"
    );
    expect(report).toContain("Rejected/un-grounded scope proposals");
    expect(report).toContain("- modify:");
    expect(report).toContain("This is not a file path");
  });

  it("fails scope grounding with ungrounded_provider_output when proposals are too far from repo", async () => {
    const groundingFixturePath = path.join(tmpDir, "grounding-scope-ungrounded.json");
    const contextFile = path.join(tmpDir, "packages/core/src/__tests__/trace-ledger.test.ts");
    await fs.mkdir(path.dirname(contextFile), { recursive: true });
    await fs.writeFile(contextFile, "export const marker = true;", "utf-8");

    const readmePath = path.join(tmpDir, "README.md");
    await fs.writeFile(readmePath, "# Openpawl fixture", "utf-8");

    await fs.writeFile(
      groundingFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope contains invented paths only.",
              affectedModules: ["packages/core/src"],
              proposedFilesToModify: [
                "a completely unrelated and invented description",
                "tests/python/test_trace_ledger.py",
              ],
              proposedFilesToCreate: [],
            }),
            usage: { inputTokens: 8, outputTokens: 4 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "No-op metadata plan.",
              chunks: [],
            }),
            usage: { inputTokens: 6, outputTokens: 2 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for shared helpers",
      workspaceDir: tmpDir,
      dryRun: false,
      testCommand: "echo ok",
      mockFixturePath: groundingFixturePath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("category=ungrounded_provider_output");
    expect(result.error).toContain("purpose=scope_analysis");
  });

  it("falls back to ContextPack candidates for ungrounded scope proposals in dry-run", async () => {
    const groundingFixturePath = path.join(tmpDir, "grounding-scope-ungrounded.json");
    const groundedFixture = path.join(tmpDir, "packages/core/src/__tests__/trace-ledger.test.ts");
    await fs.mkdir(path.dirname(groundedFixture), { recursive: true });
    await fs.writeFile(groundedFixture, "export const marker = true;", "utf-8");

    const sharedHelperPath = path.join(tmpDir, "packages/core/src/shared-helper.ts");
    await fs.mkdir(path.dirname(sharedHelperPath), { recursive: true });
    await fs.writeFile(sharedHelperPath, "export const helper = true;", "utf-8");

    await fs.writeFile(
      groundingFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope with only ungrounded suggestions.",
              affectedModules: ["packages/core/src"],
              proposedFilesToModify: [
                "a completely unrelated and invented description",
                "this is not a path at all",
              ],
              proposedFilesToCreate: [
                "tests/python/test_trace_ledger.py",
              ],
            }),
            usage: { inputTokens: 8, outputTokens: 4 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "No-op metadata plan.",
              chunks: [],
            }),
            usage: { inputTokens: 6, outputTokens: 2 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for shared helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: groundingFixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.scopeAnalysisResult?.groundingFallbackUsed).toBe(true);
    expect(result.state.scopeAnalysisResult?.proposedFilesToModify).toContain(
      "packages/core/src/__tests__/trace-ledger.test.ts"
    );
    expect(result.state.scopeAnalysisResult?.groundingFallbackFiles?.length).toBeGreaterThan(0);

    const report = await fs.readFile(
      path.join(tmpDir, ".codepawl", "runs", result.runId, "report.md"),
      "utf-8"
    );
    expect(report).toContain("fallback context file(s) were used");
    expect(report).toContain("Rejected/un-grounded scope proposals");
  });

  it("fails when patch_plan only contains ungrounded chunks", async () => {
    const groundingPatchFixturePath = path.join(tmpDir, "grounding-patch-all-ungrounded.json");
    const existingFile = path.join(tmpDir, "packages/core/src/shared-helper.ts");
    await fs.mkdir(path.dirname(existingFile), { recursive: true });
    await fs.writeFile(existingFile, "export const helper = true;", "utf-8");

    await fs.writeFile(
      groundingPatchFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope contains a grounded file.",
              affectedModules: ["packages/core/src"],
              proposedModifications: ["packages/core/src/shared-helper.ts"],
              proposedCreations: [],
            }),
            usage: { inputTokens: 6, outputTokens: 6 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Unusable model patch suggestion.",
              chunks: [
                {
                  type: "create",
                  file: "tests/shell/run_trace_ledger_tests.sh",
                  description: "Invalid invented test runner script path.",
                },
              ],
            }),
            usage: { inputTokens: 6, outputTokens: 2 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for shared helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: groundingPatchFixturePath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("category=ungrounded_provider_output");
    expect(result.error).toContain("purpose=patch_plan");

    const report = await fs.readFile(
      path.join(tmpDir, ".codepawl", "runs", result.runId, "report.md"),
      "utf-8"
    );
    expect(report).toContain("Error in node \"patch_plan\"");
  });

  it("accepts plausible new test file chunks and rejects non-allowed grounded patch paths", async () => {
    const groundingPatchFixturePath = path.join(tmpDir, "grounding-patch-filters.json");
    const groundedPatchFixtureFile = path.join(tmpDir, "packages/core/src/__tests__/trace-ledger.test.ts");
    await fs.mkdir(path.dirname(groundedPatchFixtureFile), { recursive: true });
    await fs.writeFile(
      groundedPatchFixtureFile,
      "export const marker = true;",
      "utf-8"
    );
    await fs.writeFile(
      groundingPatchFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Scope with one existing relevant file.",
              affectedModules: ["packages/core/src"],
              proposedModifications: ["packages/core/src/__tests__/trace-ledger.test.ts"],
              proposedCreations: [],
            }),
            usage: { inputTokens: 9, outputTokens: 7 },
          },
        },
        {
          matchLastMessage: "Patch Context Pack",
          response: {
            content: JSON.stringify({
              rationale: "Create one allowed and one invalid patch chunk.",
              chunks: [
                {
                  type: "create",
                  file: "packages/core/src/__tests__/trace-ledger.generated.test.ts",
                  description: "Create generated test file near affected module.",
                },
                {
                  type: "create",
                  file: "tests/shell/run_trace_ledger_tests.sh",
                  description: "Invalid invented shell script path.",
                },
              ],
            }),
            usage: { inputTokens: 8, outputTokens: 5 },
          },
        },
      ]),
      "utf-8"
    );

    const result = await runAgent({
      query: "add tests for shared helpers",
      workspaceDir: tmpDir,
      dryRun: true,
      mockFixturePath: groundingPatchFixturePath,
    });

    expect(result.success).toBe(true);
    expect(result.state.patchPlan?.chunks.map((chunk) => chunk.file)).toEqual([
      "packages/core/src/__tests__/trace-ledger.generated.test.ts",
    ]);
    expect(result.state.patchPlan?.rejectedChunks).toHaveLength(1);
    expect(result.state.patchPlan?.rejectedChunks?.[0]?.file).toBe("tests/shell/run_trace_ledger_tests.sh");

    const report = await fs.readFile(
      path.join(tmpDir, ".codepawl", "runs", result.runId, "report.md"),
      "utf-8"
    );
    expect(report).toContain("Rejected/un-grounded patch chunks");
    expect(report).toContain("tests/shell/run_trace_ledger_tests.sh");
  });

  it("executes the validation retry loop on failure, cleaning up intermediate files", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".gitignore"),
      `
validation-retry-fixture.json
validate.js
count.txt
`,
      "utf-8"
    );

    const retryFixturePath = path.join(tmpDir, "validation-retry-fixture.json");
    
    // We mock the LLM responses
    const scopeResponse = {
      rationale: "Propose test creation.",
      affectedModules: ["packages/core/src"],
      proposedFilesToModify: [],
      proposedFilesToCreate: ["packages/core/src/__tests__/retry-test.test.ts"]
    };
    
    const firstPatchResponse = {
      rationale: "Initial patch attempt.",
      chunks: [
        {
          type: "create",
          file: "packages/core/src/__tests__/retry-test.test.ts",
          description: "export const value = 'initial';"
        }
      ]
    };
    
    const secondPatchResponse = {
      rationale: "Fixed patch attempt.",
      chunks: [
        {
          type: "create",
          file: "packages/core/src/__tests__/retry-test.test.ts",
          description: "export const value = 'fixed';"
        }
      ]
    };

    await fs.writeFile(
      retryFixturePath,
      JSON.stringify([
        {
          matchLastMessage: "Scope Context Pack",
          response: {
            content: JSON.stringify(scopeResponse),
            finishReason: "stop",
            usage: { inputTokens: 5, outputTokens: 5 }
          }
        },
        {
          matchLastMessage: '"validationSuccess":null',
          response: {
            content: JSON.stringify(firstPatchResponse),
            finishReason: "stop",
            usage: { inputTokens: 5, outputTokens: 5 }
          }
        },
        {
          matchLastMessage: '"validationSuccess":false',
          response: {
            content: JSON.stringify(secondPatchResponse),
            finishReason: "stop",
            usage: { inputTokens: 5, outputTokens: 5 }
          }
        }
      ]),
      "utf-8"
    );

    // Create the validate.js script that fails on first call, then passes on second call
    const validateScriptPath = path.join(tmpDir, "validate.js");
    const countFilePath = path.join(tmpDir, "count.txt");
    await fs.writeFile(
      validateScriptPath,
      `
      const fs = require('fs');
      let count = 0;
      if (fs.existsSync('${countFilePath.replace(/\\/g, "/")}' )) {
        count = parseInt(fs.readFileSync('${countFilePath.replace(/\\/g, "/")}', 'utf8'), 10);
      }
      fs.writeFileSync('${countFilePath.replace(/\\/g, "/")}', (count + 1).toString(), 'utf8');
      if (count === 0) {
        process.exit(1);
      }
      process.exit(0);
      `,
      "utf-8"
    );

    // Run the agent with write mode and validationMaxRetries set to 2
    const result = await runAgent({
      query: "add unit tests",
      workspaceDir: tmpDir,
      dryRun: false,
      validationMaxRetries: 2,
      testCommand: `node ${validateScriptPath}`,
      mockFixturePath: retryFixturePath,
    });

    expect(result.success, `Agent failed with error: ${result.error}. State error: ${result.state.error}. Steps: ${JSON.stringify(result.state.steps.map(s => ({ node: s.nodeName, action: s.action, output: s.output })))}`).toBe(true);
    expect(result.error).toBeNull();
    
    // Check that retry occurred and retry attempt was recorded
    expect(result.state.validationRetryAttempt).toBe(1);

    // Check that count.txt contains 2 runs
    const countVal = await fs.readFile(countFilePath, "utf-8");
    expect(countVal.trim()).toBe("2");

    // Check that report.md details are printed
    const reportPath = path.join(tmpDir, ".codepawl", "runs", result.runId, "report.md");
    const reportContent = await fs.readFile(reportPath, "utf-8");
    expect(reportContent).toContain("Validation Retry Attempts:** 1 / 2");

    // Check that created file exists and has the 'fixed' content
    const createdFileContent = await fs.readFile(
      path.join(tmpDir, "packages/core/src/__tests__/retry-test.test.ts"),
      "utf-8"
    );
    expect(createdFileContent).toContain("fixed");
  });
});
