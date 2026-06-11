import { z } from "zod";

export const ARTIFACT_SCHEMA_VERSION = "1" as const;

export const ArtifactSchemaVersionSchema = z.literal(ARTIFACT_SCHEMA_VERSION);

export const ReadinessGateStatusSchema = z.enum([
  "ready",
  "needs_clarification",
  "unsafe",
  "unsupported"
]);

export const ReadinessGateResultSchema = z.object({
  status: ReadinessGateStatusSchema,
  reasons: z.array(z.string()),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const ValidationDecisionSourceSchema = z.enum([
  "explicit",
  "inferred",
  "placeholder",
  "unavailable"
]);

export const ValidationDecisionSchema = z.object({
  source: ValidationDecisionSourceSchema,
  confidence: z.number(),
  reason: z.string(),
  command: z.string(),
});

export const WriteChunkFileResultSchema = z.object({
  file: z.string(),
  reason: z.string(),
}).strict();

export const PatchChunkArtifactSchema = z.object({
  type: z.enum(["create", "modify", "delete"]),
  file: z.string(),
  description: z.string(),
}).strict();

export const RejectedPatchChunkArtifactSchema = z.object({
  index: z.number(),
  file: z.string(),
  reason: z.string(),
}).strict();

export const SelectedFileArtifactEntrySchema = z.object({
  path: z.string(),
  reason: z.string(),
  content: z.string(),
}).strict();

export const TokenUsageArtifactSchema = z.object({
  input: z.number(),
  output: z.number(),
  total: z.number(),
}).strict();

export const RunArtifactSchema = z.object({
  schemaVersion: ArtifactSchemaVersionSchema,
  runId: z.string(),
  success: z.boolean(),
  mode: z.enum(["dry-run", "write"]),
  error: z.string().nullable(),
  durationMs: z.number(),
  tokenUsage: z.object({
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
  validationMaxRetries: z.number(),
  validationRetryAttempt: z.number(),
  readiness: ReadinessGateResultSchema.optional(),
  validationDecision: ValidationDecisionSchema.optional(),
  writeSummary: z.object({
    attempted: z.number(),
    created: z.number(),
    skipped: z.number(),
    rejected: z.number(),
  }),
  filesCreated: z.array(z.string()),
  filesSkipped: z.array(WriteChunkFileResultSchema),
  filesRejected: z.array(WriteChunkFileResultSchema),
}).strict();

export const PatchPlanArtifactSchema = z.object({
  schemaVersion: ArtifactSchemaVersionSchema,
  runId: z.string(),
  rationale: z.string(),
  chunks: z.array(PatchChunkArtifactSchema),
  groundingNotes: z.array(z.string()).optional(),
  rejectedChunks: z.array(RejectedPatchChunkArtifactSchema).optional(),
}).strict();

export const SelectedFilesArtifactSchema = z.object({
  schemaVersion: ArtifactSchemaVersionSchema,
  runId: z.string(),
  selectedFiles: z.array(SelectedFileArtifactEntrySchema),
}).strict();

export const AppliedFilesArtifactSchema = z.object({
  schemaVersion: ArtifactSchemaVersionSchema,
  runId: z.string(),
  attempted: z.number(),
  created: z.array(z.string()),
  skipped: z.array(WriteChunkFileResultSchema),
  rejected: z.array(WriteChunkFileResultSchema),
}).strict();

export const TraceEventArtifactSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  parentId: z.string().optional(),
  type: z.enum(["node_start", "node_end", "llm_call", "tool_call", "tool_response", "system"]),
  name: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  timestamp: z.string(),
  payload: z.unknown(),
}).strict();

export const TraceStepArtifactSchema = z.object({
  id: z.string(),
  nodeName: z.string(),
  action: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  durationMs: z.number(),
  timestamp: z.string(),
}).strict();

export const TraceArtifactSchema = z.object({
  schemaVersion: ArtifactSchemaVersionSchema,
  traceId: z.string(),
  runId: z.string(),
  totalDurationMs: z.number(),
  stepCount: z.number(),
  llmCallsCount: z.number(),
  tokenUsage: TokenUsageArtifactSchema,
  events: z.array(TraceEventArtifactSchema),
  steps: z.array(TraceStepArtifactSchema),
}).strict().superRefine((artifact, ctx) => {
  if (artifact.traceId !== artifact.runId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["runId"],
      message: "traceId and runId must match for run artifacts",
    });
  }

  for (const [index, event] of artifact.events.entries()) {
    if (event.traceId !== artifact.traceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["events", index, "traceId"],
        message: "trace event traceId must match artifact traceId",
      });
    }
  }
});

const FailureModeCountsSchema = z.object({
  safe_patch_missing: z.number(),
  unsafe_patch_allowed: z.number(),
  validation_expected_but_missing: z.number(),
  validation_unexpected: z.number(),
  irrelevant_file_touch: z.number(),
  report_not_useful: z.number(),
  no_safe_chunk_mismatch: z.number(),
  category_expectation_mismatch: z.number(),
}).strict();

export const PatchQualityEvalMetricRatesSchema = z.object({
  usefulReport: z.number(),
  acceptedPatch: z.number(),
  validationPass: z.number(),
  unsafeBlock: z.number(),
  irrelevantFileTouch: z.number(),
  useful_report_rate: z.number(),
  safe_patch_rate: z.number(),
  validation_pass_rate: z.number(),
  no_safe_chunk_rate: z.number(),
  irrelevant_file_touch_rate: z.number(),
  fallback_manual_pr_rate: z.number().nullable(),
  fallback_manual_pr_rate_reason: z.literal("not_applicable_for_patch_quality_fixtures"),
  failureModeCounts: FailureModeCountsSchema,
}).strict();

export const PatchQualityEvalFixtureSchema = z.object({
  fixtureId: z.string(),
  usefulReport: z.boolean(),
  acceptedPatch: z.boolean(),
  validationPass: z.boolean(),
  unsafeBlock: z.boolean(),
  irrelevantFileTouch: z.boolean(),
  noSafeChunk: z.boolean(),
  passed: z.boolean(),
  failureCategories: z.array(z.string()),
  failureReasons: z.array(z.string()),
  runId: z.string().optional(),
  error: z.string().nullable().optional(),
}).strict();

export const PatchQualityEvalMetricsArtifactSchema = z.object({
  schemaVersion: ArtifactSchemaVersionSchema,
  runId: z.string(),
  outputDir: z.string(),
  metricsPath: z.string(),
  reportPath: z.string(),
  caseCount: z.number(),
  passCount: z.number(),
  failCount: z.number(),
  metricRates: PatchQualityEvalMetricRatesSchema,
  fixtures: z.array(PatchQualityEvalFixtureSchema),
}).strict().superRefine((artifact, ctx) => {
  if (artifact.caseCount !== artifact.fixtures.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["caseCount"],
      message: "caseCount must equal fixtures.length",
    });
  }

  const passCount = artifact.fixtures.filter((fixture) => fixture.passed).length;
  const failCount = artifact.fixtures.length - passCount;
  if (artifact.passCount !== passCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["passCount"],
      message: "passCount must equal passed fixture count",
    });
  }
  if (artifact.failCount !== failCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["failCount"],
      message: "failCount must equal failed fixture count",
    });
  }
});

export const RunArtifactSetSchema = z.object({
  run: RunArtifactSchema,
  trace: TraceArtifactSchema,
  patchPlan: PatchPlanArtifactSchema,
  selectedFiles: SelectedFilesArtifactSchema,
  appliedFiles: AppliedFilesArtifactSchema,
}).strict().superRefine((artifactSet, ctx) => {
  const runId = artifactSet.run.runId;
  const runIdChecks: ReadonlyArray<readonly [string, string]> = [
    ["trace.runId", artifactSet.trace.runId],
    ["patchPlan.runId", artifactSet.patchPlan.runId],
    ["selectedFiles.runId", artifactSet.selectedFiles.runId],
    ["appliedFiles.runId", artifactSet.appliedFiles.runId],
  ];

  for (const [pathLabel, value] of runIdChecks) {
    if (value !== runId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: pathLabel.split("."),
        message: "artifact runId must match run.json runId",
      });
    }
  }

  if (artifactSet.run.filesCreated.length !== artifactSet.run.writeSummary.created) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["run", "filesCreated"],
      message: "filesCreated length must match writeSummary.created",
    });
  }
  if (artifactSet.run.filesSkipped.length !== artifactSet.run.writeSummary.skipped) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["run", "filesSkipped"],
      message: "filesSkipped length must match writeSummary.skipped",
    });
  }
  if (artifactSet.run.filesRejected.length !== artifactSet.run.writeSummary.rejected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["run", "filesRejected"],
      message: "filesRejected length must match writeSummary.rejected",
    });
  }
  if (artifactSet.run.writeSummary.attempted !== artifactSet.appliedFiles.attempted) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["appliedFiles", "attempted"],
      message: "applied attempted count must match run writeSummary.attempted",
    });
  }
  if (artifactSet.run.filesCreated.join("\u0000") !== artifactSet.appliedFiles.created.join("\u0000")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["appliedFiles", "created"],
      message: "applied created files must match run filesCreated",
    });
  }
  if (artifactSet.run.filesSkipped.length !== artifactSet.appliedFiles.skipped.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["appliedFiles", "skipped"],
      message: "applied skipped files must match run filesSkipped count",
    });
  }
  if (artifactSet.run.filesRejected.length !== artifactSet.appliedFiles.rejected.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["appliedFiles", "rejected"],
      message: "applied rejected files must match run filesRejected count",
    });
  }
});

export type RunArtifact = z.infer<typeof RunArtifactSchema>;
export type TraceArtifact = z.infer<typeof TraceArtifactSchema>;
export type PatchPlanArtifact = z.infer<typeof PatchPlanArtifactSchema>;
export type SelectedFilesArtifact = z.infer<typeof SelectedFilesArtifactSchema>;
export type AppliedFilesArtifact = z.infer<typeof AppliedFilesArtifactSchema>;
export type PatchQualityEvalMetricsArtifact = z.infer<typeof PatchQualityEvalMetricsArtifactSchema>;
