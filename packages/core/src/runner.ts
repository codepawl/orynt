import * as path from "path";
import * as fs from "fs/promises";
import { StateGraph } from "./agent/orchestration";
import { TraceLedger } from "./ledger/trace";
import { MockLlmProvider } from "./providers/llm";
import { activeLedgers } from "./agent/nodes";
import {
  createIntakeNode,
  createRepoScanNode,
  createScopeAnalysisNode,
  createFileSelectionNode,
  createPatchPlanNode,
  createOptionalPatchApplyNode,
  createValidationNode,
  createTraceExportNode,
  createReportExportNode,
} from "./agent/nodes";
import type { RunOptions, RunResult } from "./state/schema";

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
  } = options;

  // Resolve workspace directory
  const resolvedWorkspaceDir = path.resolve(workspaceDir);

  // Validate workspace exists
  try {
    await fs.access(resolvedWorkspaceDir);
  } catch {
    throw new Error(`Workspace directory does not exist: ${resolvedWorkspaceDir}`);
  }

  // Set up trace ledger
  const ledger = new TraceLedger(runId);
  activeLedgers.set(runId, ledger);

  // Set up LLM provider
  // Real providers can be added here via environment variable checks:
  //   CODEPAWL_LLM_PROVIDER=openai => use OpenAI provider (not included in MVP)
  const fixturePath = mockFixturePath ?? DEFAULT_MOCK_FIXTURE_PATH;
  const llm = new MockLlmProvider(fixturePath);

  // Build the state machine graph
  const graph = new StateGraph();

  graph.addNode("intake", createIntakeNode());
  graph.addNode("repo_scan", createRepoScanNode());
  graph.addNode("scope_analysis", createScopeAnalysisNode(llm));
  graph.addNode("file_selection", createFileSelectionNode());
  graph.addNode("patch_plan", createPatchPlanNode(llm));
  graph.addNode("optional_patch_apply", createOptionalPatchApplyNode());
  graph.addNode("validation", createValidationNode());
  graph.addNode("trace_export", createTraceExportNode());
  graph.addNode("report_export", createReportExportNode());

  graph.addEdge("intake", "repo_scan");
  graph.addEdge("repo_scan", "scope_analysis");
  graph.addEdge("scope_analysis", "file_selection");
  graph.addEdge("file_selection", "patch_plan");
  graph.addEdge("patch_plan", "optional_patch_apply");
  graph.addEdge("optional_patch_apply", "validation");
  graph.addEdge("validation", "trace_export");
  graph.addEdge("trace_export", "report_export");

  graph.setEntryPoint("intake");

  const initialState = {
    query,
    messages: [],
    steps: [],
    context: {
      sessionId: runId,
      workspaceDir: resolvedWorkspaceDir,
      dryRun,
      maxIterations,
      temperature,
      testCommand,
      mockFixturePath: fixturePath,
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
  const runDir = path.join(resolvedWorkspaceDir, ".codepawl", "runs", runId);
  if (!finalState) {
    try {
      await fs.mkdir(runDir, { recursive: true });
      const summary = ledger.getSummary();
      await fs.writeFile(
        path.join(runDir, "trace.json"),
        JSON.stringify(summary, null, 2),
        "utf-8"
      );
      const errorReport = `# Openpawl Run Report\n\n**Run ID:** \`${runId}\`\n**Status:** ❌ ABORTED\n\n## Error\n\n\`\`\`\n${runError}\n\`\`\`\n`;
      await fs.writeFile(path.join(runDir, "report.md"), errorReport, "utf-8");
      await fs.writeFile(
        path.join(runDir, "run.json"),
        JSON.stringify({ runId, success: false, error: runError }, null, 2),
        "utf-8"
      );
      await fs.writeFile(
        path.join(runDir, "patch-plan.json"),
        JSON.stringify({ chunks: [], rationale: "Run aborted before patch plan." }, null, 2),
        "utf-8"
      );
      await fs.writeFile(
        path.join(runDir, "selected-files.json"),
        JSON.stringify({ selectedFiles: [] }, null, 2),
        "utf-8"
      );
    } catch { /* best-effort */ }

    activeLedgers.delete(runId);
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

  activeLedgers.delete(runId);
  const traceSummary = ledger.getSummary();

  // If the run completed (finalState exists) but had an error, write best-effort artifacts
  if (runError) {
    try {
      await fs.mkdir(runDir, { recursive: true });
      const summary = traceSummary;
      await fs.writeFile(
        path.join(runDir, "trace.json"),
        JSON.stringify(summary, null, 2),
        "utf-8"
      );
      const errorReport =
        `# Openpawl Run Report\n\n**Run ID:** \`${runId}\`\n**Status:** ❌ FAILED\n\n## Error\n\n\`\`\`\n${runError}\n\`\`\`\n`;
      await fs.writeFile(path.join(runDir, "report.md"), errorReport, "utf-8");
      await fs.writeFile(
        path.join(runDir, "run.json"),
        JSON.stringify({ runId, success: false, error: runError }, null, 2),
        "utf-8"
      );
      await fs.writeFile(
        path.join(runDir, "patch-plan.json"),
        JSON.stringify(
          finalState.patchPlan ?? { chunks: [], rationale: "Run failed before patch plan." },
          null, 2
        ),
        "utf-8"
      );
      await fs.writeFile(
        path.join(runDir, "selected-files.json"),
        JSON.stringify(finalState.fileSelectionResult ?? { selectedFiles: [] }, null, 2),
        "utf-8"
      );
    } catch { /* best-effort */ }
  }

  return {
    runId,
    success: !runError,
    error: runError,
    state: finalState,
    traceSummary,
    reportPath: path.join(runDir, "report.md"),
    tracePath: path.join(runDir, "trace.json"),
  };
}
