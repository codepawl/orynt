export const SYNTHETIC_OPENPAWL_RUN_ID = "run_synthetic_openpawl_bundle_cp005";

export const syntheticOpenpawlEvidenceBundle = {
  bundleVersion: "1",
  generatedAt: "2026-06-12T00:00:00.000Z",
  runId: SYNTHETIC_OPENPAWL_RUN_ID,
  artifactSchemaVersion: "1",
  source: "openpawl",
  artifacts: {
    "run.json": {
      schemaVersion: "1",
      runId: SYNTHETIC_OPENPAWL_RUN_ID,
      success: true,
      mode: "dry-run",
      error: null,
      durationMs: 125,
      tokenUsage: { input: 12, output: 8, total: 20 },
      validationMaxRetries: 0,
      validationRetryAttempt: 0,
      readiness: {
        status: "ready",
        reasons: ["Synthetic CP-005 browser proof fixture."],
        blockers: [],
        warnings: [],
      },
      writeSummary: {
        attempted: 0,
        created: 0,
        skipped: 0,
        rejected: 0,
      },
      filesCreated: [],
      filesSkipped: [],
      filesRejected: [],
    },
    "trace.json": {
      schemaVersion: "1",
      traceId: SYNTHETIC_OPENPAWL_RUN_ID,
      runId: SYNTHETIC_OPENPAWL_RUN_ID,
      totalDurationMs: 125,
      stepCount: 2,
      llmCallsCount: 1,
      tokenUsage: { input: 12, output: 8, total: 20 },
      events: [],
      steps: [],
    },
    "patch-plan.json": {
      schemaVersion: "1",
      runId: SYNTHETIC_OPENPAWL_RUN_ID,
      rationale: "Synthetic Openpawl bundle fixture for CodePawl Cloud Evidence browser proof.",
      chunks: [],
      groundingNotes: ["No customer data. No repository source."],
      rejectedChunks: [],
    },
    "selected-files.json": {
      schemaVersion: "1",
      runId: SYNTHETIC_OPENPAWL_RUN_ID,
      selectedFiles: [
        {
          path: "synthetic/path-only-reference.ts",
          reason: "Path-only synthetic fixture.",
          content: "[redacted synthetic placeholder]",
        },
      ],
    },
    "applied-files.json": {
      schemaVersion: "1",
      runId: SYNTHETIC_OPENPAWL_RUN_ID,
      attempted: 0,
      created: [],
      skipped: [],
      rejected: [],
    },
    "report.md": `## Evidence Summary

- Run ID: ${SYNTHETIC_OPENPAWL_RUN_ID}
- Mode: dry-run
- Status: success
- Readiness: ready
- Validation: passed
- schemaVersion: 1

Synthetic CP-005 fixture only. No customer artifacts or repository source are included.`,
  },
} as const;

