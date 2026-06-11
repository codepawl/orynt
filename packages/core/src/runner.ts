import * as path from "path";
import * as fs from "fs/promises";
import { StateGraph } from "./agent/orchestration";
import { TraceLedger } from "./ledger/trace";
import { createLlmProvider, resolveProviderConfig } from "./providers/llm";
import { activeLedgers } from "./agent/nodes";
import { resolveContextBudgets } from "./agent/context";
import {
  createIntakeNode,
  createRepoScanNode,
  createReadinessGateNode,
  createScopeAnalysisNode,
  createFileSelectionNode,
  createPatchPlanNode,
  createOptionalPatchApplyNode,
  createValidationNode,
  createValidationRetryNode,
  createTraceExportNode,
  createReportExportNode,
} from "./agent/nodes";
import type { RunOptions, RunResult } from "./state/schema";
import {
  ARTIFACT_SCHEMA_VERSION,
  AppliedFilesArtifactSchema,
  PatchPlanArtifactSchema,
  RunArtifactSchema,
  SelectedFilesArtifactSchema,
  TraceArtifactSchema,
} from "./state/evidence";

/**
 * Default mock fixture path used when no fixture is specified.
 * Consumers may supply their own via RunOptions.mockFixturePath.
 */
const DEFAULT_MOCK_FIXTURE_PATH = path.join(
  new URL(".", import.meta.url).pathname,
  "__tests__",
  "fixtures",
  "mock-llm.json"
);

/**
 * Top-level entry point for running the Openpawl agent workflow.
 *
 * Usage:
 * ```ts
 * import { runAgent } from "@codepawl/core";
 * const result = await runAgent({ query: "add tests", workspaceDir: ".", dryRun: true });
 * ```
 */
export async function runAgent(options: RunOptions): Promise<RunResult> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const {
    query,
    workspaceDir,
    dryRun,
    maxIterations = 20,
    temperature = 0.2,
    testCommand,
    mockFixturePath,
    outDir,
    provider,
    model,
    apiKey,
    baseUrl,
    includePromptMetadata = false,
    maxTokens,
    scopeAnalysisMaxTokens,
    patchPlanMaxTokens,
    contextMaxFiles,
    contextMaxBytes,
    contextMaxChars,
    structuredOutputMode,
    validationMaxRetries,
  } = options;

  // Resolve workspace directory
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  const resolvedOutputDir = outDir
    ? path.resolve(outDir)
    : path.join(resolvedWorkspaceDir, ".codepawl", "runs", runId);

  // Validate workspace exists and is a directory before starting the workflow.
  let workspaceStat;
  try {
    workspaceStat = await fs.stat(resolvedWorkspaceDir);
  } catch {
    throw new Error(`Workspace directory does not exist: ${resolvedWorkspaceDir}`);
  }
  if (!workspaceStat.isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${resolvedWorkspaceDir}`);
  }

  // Set up LLM provider. Mock remains the default unless explicitly configured.
  const fixturePath = mockFixturePath ?? DEFAULT_MOCK_FIXTURE_PATH;
  const providerConfig = resolveProviderConfig({
    provider,
    model,
    apiKey,
    baseUrl,
    maxTokens,
    scopeAnalysisMaxTokens,
    patchPlanMaxTokens,
    structuredOutputMode,
  });
  const contextBudget = resolveContextBudgets(
    { maxFiles: contextMaxFiles, maxBytes: contextMaxBytes, maxChars: contextMaxChars },
    {
      OPENPAWL_CONTEXT_MAX_FILES: process.env["OPENPAWL_CONTEXT_MAX_FILES"],
      OPENPAWL_CONTEXT_MAX_BYTES: process.env["OPENPAWL_CONTEXT_MAX_BYTES"],
      OPENPAWL_CONTEXT_MAX_CHARS: process.env["OPENPAWL_CONTEXT_MAX_CHARS"],
    }
  );
  const llm = createLlmProvider(providerConfig, fixturePath);

  // Set up trace ledger after startup validation/config resolution succeeds.
  const ledger = new TraceLedger(runId);
  activeLedgers.set(runId, ledger);

  // Build the state machine graph
  const graph = new StateGraph();

  graph.addNode("intake", createIntakeNode());
  graph.addNode("repo_scan", createRepoScanNode());
  graph.addNode("readiness_gate", createReadinessGateNode());
  graph.addNode("scope_analysis", createScopeAnalysisNode(llm));
  graph.addNode("file_selection", createFileSelectionNode());
  graph.addNode("patch_plan", createPatchPlanNode(llm));
  graph.addNode("optional_patch_apply", createOptionalPatchApplyNode());
  graph.addNode("validation", createValidationNode());
  graph.addNode("validation_retry", createValidationRetryNode());
  graph.addNode("trace_export", createTraceExportNode());
  graph.addNode("report_export", createReportExportNode());

  graph.addEdge("intake", "repo_scan");
  graph.addEdge("repo_scan", "readiness_gate");
  graph.addEdge("readiness_gate", "scope_analysis");
  graph.addEdge("scope_analysis", "file_selection");
  graph.addEdge("file_selection", "patch_plan");
  graph.addEdge("patch_plan", "optional_patch_apply");
  graph.addEdge("optional_patch_apply", "validation");

  graph.addConditionalEdge(
    "validation",
    (state) => {
      const validationFailed = state.validationResult?.success === false;
      const currentAttempt = state.validationRetryAttempt ?? 0;
      const maxRetries = state.context.validationMaxRetries ?? 0;

      if (validationFailed && currentAttempt < maxRetries && !state.context.dryRun) {
        return "retry";
      }
      return "continue";
    },
    {
      retry: "validation_retry",
      continue: "trace_export",
    }
  );

  graph.addEdge("validation_retry", "patch_plan");
  graph.addEdge("trace_export", "report_export");

  graph.setEntryPoint("intake");

  const initialState = {
    query,
    messages: [],
    steps: [],
    context: {
      sessionId: runId,
      workspaceDir: resolvedWorkspaceDir,
      outputDir: resolvedOutputDir,
      dryRun,
      maxIterations,
      temperature,
      testCommand,
      mockFixturePath: fixturePath,
      providerName: llm.providerName,
      modelName: llm.modelName,
      includePromptMetadata,
      scopeAnalysisMaxTokens: providerConfig.scopeAnalysisMaxTokens,
      patchPlanMaxTokens: providerConfig.patchPlanMaxTokens,
      contextMaxFiles: contextBudget.maxFiles,
      contextMaxBytes: contextBudget.maxBytes,
      contextMaxChars: contextBudget.maxChars,
      structuredOutputMode: providerConfig.structuredOutputMode,
      validationMaxRetries: validationMaxRetries ?? 0,
    },
    nextNode: null,
    isComplete: false,
    error: null,
  };

  let finalState;
  let runError: string | null = null;

  try {
    finalState = await graph.compileAndRun(initialState, ledger);
    if (finalState.error) {
      runError = finalState.error;
    }
  } catch (err: unknown) {
    runError = err instanceof Error ? err.message : String(err);
  }

  // Always attempt best-effort artifact export — even on failure
  const runDir = resolvedOutputDir;
  if (!finalState) {
    try {
      await fs.mkdir(runDir, { recursive: true });
      const summary = ledger.getSummary();
      const traceArtifact = TraceArtifactSchema.parse({
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
        runId,
        ...summary,
      });
      await fs.writeFile(
        path.join(runDir, "trace.json"),
        JSON.stringify(traceArtifact, null, 2),
        "utf-8"
      );
      const redactedRunError = runError
        ? runError
            .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
            .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-[REDACTED]")
            .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED_TOKEN]")
        : "Unknown runtime error";
      const errorReport = `# Openpawl Run Report

**Run ID:** \`${runId}\`
**Status:** ❌ ABORTED

## Evidence Summary

| Field | Value |
|---|---|
| Artifact schema | \`${ARTIFACT_SCHEMA_VERSION}\` |
| Run ID | \`${runId}\` |
| Status | \`failed\` |
| Failure category | \`runtime_error\` |
| Trace events | \`${summary.events.length}\` |

**Primary outcome:** Run stopped before the normal report exporter completed.

**Next action:** Inspect trace.json and run.json for the terminal failure event.

### Failure Summary

- Category: \`runtime_error\`
- Reason: ${redactedRunError}
- Next action: Inspect trace.json and run.json for the terminal failure event.

### Artifact Links

- GitHub artifact name: \`openpawl-artifacts-${runId}\`
- Artifact directory: \`${runDir}\`
- Run artifact: \`${runDir}/run.json\`
- Trace artifact: \`${runDir}/trace.json\`
- Human report: \`${runDir}/report.md\`

## Error

\`\`\`
${redactedRunError}
\`\`\`
`;
      await fs.writeFile(path.join(runDir, "report.md"), errorReport, "utf-8");
      const abortedRunArtifact = RunArtifactSchema.parse({
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
        runId,
        success: false,
        mode: "dry-run",
        error: runError,
        durationMs: 0,
        tokenUsage: { input: 0, output: 0, total: 0 },
        validationMaxRetries: 0,
        validationRetryAttempt: 0,
        readiness: {
          status: "unsupported",
          reasons: ["Run aborted before graph execution."],
          blockers: ["Runner initialization failed before execution"],
          warnings: [],
        },
        writeSummary: { attempted: 0, created: 0, skipped: 0, rejected: 0 },
        filesCreated: [],
        filesSkipped: [],
        filesRejected: [],
      });
      await fs.writeFile(
        path.join(runDir, "run.json"),
        JSON.stringify(abortedRunArtifact, null, 2),
        "utf-8"
      );
      await fs.writeFile(
        path.join(runDir, "patch-plan.json"),
        JSON.stringify(PatchPlanArtifactSchema.parse({
          schemaVersion: ARTIFACT_SCHEMA_VERSION,
          runId,
          chunks: [],
          rationale: "Run aborted before patch plan.",
        }), null, 2),
        "utf-8"
      );
      await fs.writeFile(
        path.join(runDir, "selected-files.json"),
        JSON.stringify(SelectedFilesArtifactSchema.parse({
          schemaVersion: ARTIFACT_SCHEMA_VERSION,
          runId,
          selectedFiles: [],
        }), null, 2),
        "utf-8"
      );
      await fs.writeFile(
        path.join(runDir, "applied-files.json"),
        JSON.stringify(AppliedFilesArtifactSchema.parse({
          schemaVersion: ARTIFACT_SCHEMA_VERSION,
          runId,
          attempted: 0,
          created: [],
          skipped: [],
          rejected: [],
        }), null, 2),
        "utf-8"
      );
    } catch { /* best-effort */ }

    const traceSummary = ledger.getSummary();
    return {
      runId,
      success: false,
      error: runError,
      state: { ...initialState, steps: [], isComplete: true, error: runError },
      traceSummary,
      reportPath: path.join(runDir, "report.md"),
      tracePath: path.join(runDir, "trace.json"),
    };
  }

  const traceSummary = ledger.getSummary();
  const validationFailed = finalState.validationResult?.success === false;

  // If the run completed (finalState exists) but had an error, write best-effort artifacts.
  // createReportExportNode writes a schema-validated run.json — no extra write needed here.
  if (runError) {
    try {
      await fs.mkdir(runDir, { recursive: true });
      const traceExportNode = createTraceExportNode();
      const reportExportNode = createReportExportNode();
      await traceExportNode(finalState);
      await reportExportNode(finalState);
    } catch { /* best-effort */ }
  }

  activeLedgers.delete(runId);

  return {
    runId,
    success: !runError && !validationFailed,
    error: runError ?? (validationFailed ? "Validation command failed." : null),
    state: finalState,
    traceSummary,
    reportPath: path.join(runDir, "report.md"),
    tracePath: path.join(runDir, "trace.json"),
  };
}
