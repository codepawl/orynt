export const CLOUD_EVIDENCE_SCHEMA_VERSION = "1" as const;
export const CLOUD_EVIDENCE_BUNDLE_VERSION = "1" as const;
export const CLOUD_EVIDENCE_BUNDLE_SOURCE = "openpawl" as const;

export const CLOUD_EVIDENCE_ACCEPTED_FILES = [
  "run.json",
  "trace.json",
  "patch-plan.json",
  "selected-files.json",
  "applied-files.json",
  "report.md",
] as const;

export type CloudEvidenceAcceptedFile = (typeof CLOUD_EVIDENCE_ACCEPTED_FILES)[number];

type JsonObject = Record<string, unknown>;

export type CloudEvidenceArtifactSet = {
  "run.json": JsonObject;
  "trace.json": JsonObject;
  "patch-plan.json": JsonObject;
  "selected-files.json": JsonObject;
  "applied-files.json": JsonObject;
  "report.md": string;
};

export type CloudEvidenceBundleMetadata = {
  bundleVersion: typeof CLOUD_EVIDENCE_BUNDLE_VERSION;
  generatedAt: string;
  runId: string;
  artifactSchemaVersion: typeof CLOUD_EVIDENCE_SCHEMA_VERSION;
  source: typeof CLOUD_EVIDENCE_BUNDLE_SOURCE;
};

export type CloudEvidenceOpenpawlBundle = CloudEvidenceBundleMetadata & {
  artifacts: CloudEvidenceArtifactSet;
};

export type CloudEvidenceValidationIssue = {
  code:
    | "missing_bundle_metadata"
    | "wrong_bundle_version"
    | "missing_required_artifact"
    | "unknown_artifact"
    | "oversized_artifact"
    | "invalid_json"
    | "wrong_schema_version"
    | "invalid_artifact_shape"
    | "run_id_mismatch"
    | "unsafe_payload_text";
  artifact?: string;
  message: string;
};

export type CloudEvidenceValidationResult =
  | {
      ok: true;
      status: "accepted";
      artifacts: CloudEvidenceArtifactSet;
      runId: string;
      schemaVersion: typeof CLOUD_EVIDENCE_SCHEMA_VERSION;
      bundle?: CloudEvidenceBundleMetadata;
    }
  | {
      ok: false;
      status: "rejected" | "blocked";
      issues: ReadonlyArray<CloudEvidenceValidationIssue>;
    };

export function parseCloudEvidenceArtifactBundle(text: string): CloudEvidenceValidationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: "rejected",
      issues: [
        {
          code: "invalid_json",
          message:
            "Preview bundle must be valid JSON. Use openpawl-evidence-bundle.json or the legacy six-artifact JSON shape.",
        },
      ],
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      status: "rejected",
      issues: [
        {
          code: "invalid_artifact_shape",
          message:
            "Preview bundle must be a JSON object. Use openpawl-evidence-bundle.json or the legacy six-artifact JSON shape.",
        },
      ],
    };
  }

  if (looksLikeOpenpawlEvidenceBundle(parsed)) {
    return validateCloudEvidenceOpenpawlBundle(parsed);
  }

  return validateCloudEvidenceArtifactSet(parsed);
}

const JSON_ARTIFACTS = CLOUD_EVIDENCE_ACCEPTED_FILES.filter(
  (file) => file !== "report.md",
) as Exclude<CloudEvidenceAcceptedFile, "report.md">[];

const MAX_ARTIFACT_BYTES: Record<CloudEvidenceAcceptedFile, number> = {
  "run.json": 256 * 1024,
  "trace.json": 5 * 1024 * 1024,
  "patch-plan.json": 1024 * 1024,
  "selected-files.json": 1024 * 1024,
  "applied-files.json": 1024 * 1024,
  "report.md": 512 * 1024,
};

const UNSAFE_PAYLOAD_PATTERNS: ReadonlyArray<RegExp> = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:password|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["']?[^"',\s]{8,}/i,
];

const OPENPAWL_BUNDLE_METADATA_FIELDS = [
  "bundleVersion",
  "generatedAt",
  "runId",
  "artifactSchemaVersion",
  "source",
] as const;

export function validateCloudEvidenceOpenpawlBundle(
  input: JsonObject,
): CloudEvidenceValidationResult {
  const issues: CloudEvidenceValidationIssue[] = [];

  for (const field of OPENPAWL_BUNDLE_METADATA_FIELDS) {
    if (!(field in input)) {
      issues.push({
        code: "missing_bundle_metadata",
        message: `openpawl-evidence-bundle.json must include ${field}.`,
      });
    }
  }

  const artifacts = input["artifacts"];
  if (!isPlainObject(artifacts)) {
    issues.push({
      code: "missing_required_artifact",
      artifact: "artifacts",
      message:
        "openpawl-evidence-bundle.json must include an artifacts object containing the six accepted artifact names.",
    });
  }

  const bundleVersion = input["bundleVersion"];
  if ("bundleVersion" in input && bundleVersion !== CLOUD_EVIDENCE_BUNDLE_VERSION) {
    issues.push({
      code: "wrong_bundle_version",
      artifact: "bundleVersion",
      message: `openpawl-evidence-bundle.json must use bundleVersion ${CLOUD_EVIDENCE_BUNDLE_VERSION}.`,
    });
  }

  const artifactSchemaVersion = input["artifactSchemaVersion"];
  if ("artifactSchemaVersion" in input && artifactSchemaVersion !== CLOUD_EVIDENCE_SCHEMA_VERSION) {
    issues.push({
      code: "wrong_schema_version",
      artifact: "artifactSchemaVersion",
      message: `openpawl-evidence-bundle.json must use artifactSchemaVersion ${CLOUD_EVIDENCE_SCHEMA_VERSION}.`,
    });
  }

  if ("source" in input && input["source"] !== CLOUD_EVIDENCE_BUNDLE_SOURCE) {
    issues.push({
      code: "invalid_artifact_shape",
      artifact: "source",
      message: 'openpawl-evidence-bundle.json must use source "openpawl".',
    });
  }

  const bundleRunId = typeof input["runId"] === "string" ? input["runId"] : undefined;
  if ("runId" in input && !bundleRunId) {
    issues.push({
      code: "missing_bundle_metadata",
      artifact: "runId",
      message: "openpawl-evidence-bundle.json runId must be a non-empty string.",
    });
  }

  if ("generatedAt" in input && typeof input["generatedAt"] !== "string") {
    issues.push({
      code: "missing_bundle_metadata",
      artifact: "generatedAt",
      message: "openpawl-evidence-bundle.json generatedAt must be a string.",
    });
  }

  if (!isPlainObject(artifacts)) {
    return { ok: false, status: "rejected", issues };
  }

  const artifactResult = validateCloudEvidenceArtifactSet(artifacts);
  const acceptedArtifactResult = artifactResult.ok ? artifactResult : undefined;
  if (!artifactResult.ok) {
    issues.push(...artifactResult.issues);
  } else if (bundleRunId && artifactResult.runId !== bundleRunId) {
    issues.push({
      code: "run_id_mismatch",
      artifact: "runId",
      message: "openpawl-evidence-bundle.json runId must match artifacts.run.json runId.",
    });
  }

  if (issues.length > 0) {
    const status = issues.some((issue) => issue.code === "unsafe_payload_text")
      ? "blocked"
      : "rejected";
    return { ok: false, status, issues };
  }

  if (!acceptedArtifactResult) {
    return {
      ok: false,
      status: "rejected",
      issues: [
        {
          code: "invalid_artifact_shape",
          artifact: "artifacts",
          message: "openpawl-evidence-bundle.json artifacts could not be validated.",
        },
      ],
    };
  }

  return {
    ok: true,
    status: "accepted",
    artifacts: acceptedArtifactResult.artifacts,
    runId: acceptedArtifactResult.runId,
    schemaVersion: acceptedArtifactResult.schemaVersion,
    bundle: {
      bundleVersion: CLOUD_EVIDENCE_BUNDLE_VERSION,
      generatedAt: input["generatedAt"] as string,
      runId: acceptedArtifactResult.runId,
      artifactSchemaVersion: CLOUD_EVIDENCE_SCHEMA_VERSION,
      source: CLOUD_EVIDENCE_BUNDLE_SOURCE,
    },
  };
}

export function validateCloudEvidenceArtifactSet(
  input: Partial<Record<CloudEvidenceAcceptedFile, unknown>>,
): CloudEvidenceValidationResult {
  const issues: CloudEvidenceValidationIssue[] = [];
  const acceptedFileSet = new Set<string>(CLOUD_EVIDENCE_ACCEPTED_FILES);

  for (const artifact of Object.keys(input)) {
    if (!acceptedFileSet.has(artifact)) {
      issues.push({
        code: "unknown_artifact",
        message: `${artifact} is not accepted by the Cloud Evidence Hub intake contract.`,
      });
    }
  }

  for (const artifact of CLOUD_EVIDENCE_ACCEPTED_FILES) {
    if (!(artifact in input)) {
      issues.push({
        code: "missing_required_artifact",
        artifact,
        message: `${artifact} is required for the Cloud Evidence Hub intake contract.`,
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, status: "rejected", issues };
  }

  const artifactSet = input as Record<CloudEvidenceAcceptedFile, unknown>;
  const runArtifact = artifactSet["run.json"];
  const runId = getStringField(runArtifact, "runId");

  if (!runId) {
    issues.push({
      code: "invalid_artifact_shape",
      artifact: "run.json",
      message: "run.json must include a string runId.",
    });
  }

  for (const artifact of JSON_ARTIFACTS) {
    const value = artifactSet[artifact];

    if (!isPlainObject(value)) {
      issues.push({
        code: "invalid_artifact_shape",
        artifact,
        message: `${artifact} must be a JSON object.`,
      });
      continue;
    }

    const sizeBytes = byteSize(JSON.stringify(value));
    if (sizeBytes > MAX_ARTIFACT_BYTES[artifact]) {
      issues.push({
        code: "oversized_artifact",
        artifact,
        message: `${artifact} exceeds the local demo size limit.`,
      });
    }

    if (value["schemaVersion"] !== CLOUD_EVIDENCE_SCHEMA_VERSION) {
      issues.push({
        code: "wrong_schema_version",
        artifact,
        message: `${artifact} must use schemaVersion ${CLOUD_EVIDENCE_SCHEMA_VERSION}.`,
      });
    }

    for (const message of validateArtifactShape(artifact, value)) {
      issues.push({
        code: "invalid_artifact_shape",
        artifact,
        message,
      });
    }

    const artifactRunId = getStringField(value, "runId");
    if (runId && artifactRunId && artifactRunId !== runId) {
      issues.push({
        code: "run_id_mismatch",
        artifact,
        message: `${artifact} runId must match run.json runId.`,
      });
    }
  }

  if (typeof artifactSet["report.md"] !== "string" || artifactSet["report.md"].trim() === "") {
    issues.push({
      code: "invalid_artifact_shape",
      artifact: "report.md",
      message: "report.md must be non-empty Markdown text.",
    });
  } else if (byteSize(artifactSet["report.md"]) > MAX_ARTIFACT_BYTES["report.md"]) {
    issues.push({
      code: "oversized_artifact",
      artifact: "report.md",
      message: "report.md exceeds the local demo size limit.",
    });
  }

  const unsafeIssue = findUnsafePayloadText(artifactSet);
  if (unsafeIssue) {
    issues.push(unsafeIssue);
  }

  if (issues.length > 0) {
    const status = issues.some((issue) => issue.code === "unsafe_payload_text")
      ? "blocked"
      : "rejected";
    return { ok: false, status, issues };
  }

  return {
    ok: true,
    status: "accepted",
    artifacts: artifactSet as CloudEvidenceArtifactSet,
    runId: runId!,
    schemaVersion: CLOUD_EVIDENCE_SCHEMA_VERSION,
  };
}

function looksLikeOpenpawlEvidenceBundle(input: JsonObject): boolean {
  return (
    "artifacts" in input ||
    "bundleVersion" in input ||
    "artifactSchemaVersion" in input ||
    "generatedAt" in input ||
    input["source"] === CLOUD_EVIDENCE_BUNDLE_SOURCE
  );
}

function findUnsafePayloadText(
  artifactSet: Record<CloudEvidenceAcceptedFile, unknown>,
): CloudEvidenceValidationIssue | undefined {
  for (const artifact of CLOUD_EVIDENCE_ACCEPTED_FILES) {
    const text =
      typeof artifactSet[artifact] === "string"
        ? artifactSet[artifact]
        : JSON.stringify(artifactSet[artifact]) ?? "";

    if (UNSAFE_PAYLOAD_PATTERNS.some((pattern) => pattern.test(text))) {
      return {
        code: "unsafe_payload_text",
        artifact,
        message:
          "Artifact text appears to contain secrets or credentials and must be redacted before intake.",
      };
    }
  }

  return undefined;
}

function getStringField(value: unknown, field: string): string | undefined {
  if (!isPlainObject(value)) return undefined;
  const fieldValue = value[field];
  return typeof fieldValue === "string" && fieldValue.length > 0 ? fieldValue : undefined;
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateArtifactShape(
  artifact: Exclude<CloudEvidenceAcceptedFile, "report.md">,
  value: JsonObject,
): string[] {
  switch (artifact) {
    case "run.json":
      return compact([
        typeof value["runId"] === "string" ? undefined : "run.json must include runId.",
        typeof value["success"] === "boolean" ? undefined : "run.json must include success.",
        value["mode"] === "dry-run" || value["mode"] === "write"
          ? undefined
          : "run.json mode must be dry-run or write.",
        isPlainObject(value["tokenUsage"]) ? undefined : "run.json must include tokenUsage.",
        isPlainObject(value["writeSummary"]) ? undefined : "run.json must include writeSummary.",
        Array.isArray(value["filesCreated"])
          ? undefined
          : "run.json must include filesCreated.",
        Array.isArray(value["filesSkipped"])
          ? undefined
          : "run.json must include filesSkipped.",
        Array.isArray(value["filesRejected"])
          ? undefined
          : "run.json must include filesRejected.",
      ]);
    case "trace.json":
      return compact([
        typeof value["traceId"] === "string" ? undefined : "trace.json must include traceId.",
        typeof value["runId"] === "string" ? undefined : "trace.json must include runId.",
        value["traceId"] === value["runId"]
          ? undefined
          : "trace.json traceId must match runId.",
        typeof value["llmCallsCount"] === "number"
          ? undefined
          : "trace.json must include llmCallsCount.",
        Array.isArray(value["events"]) ? undefined : "trace.json must include events.",
        Array.isArray(value["steps"]) ? undefined : "trace.json must include steps.",
      ]);
    case "patch-plan.json":
      return compact([
        typeof value["runId"] === "string" ? undefined : "patch-plan.json must include runId.",
        typeof value["rationale"] === "string"
          ? undefined
          : "patch-plan.json must include rationale.",
        Array.isArray(value["chunks"]) ? undefined : "patch-plan.json must include chunks.",
      ]);
    case "selected-files.json":
      return compact([
        typeof value["runId"] === "string"
          ? undefined
          : "selected-files.json must include runId.",
        Array.isArray(value["selectedFiles"])
          ? undefined
          : "selected-files.json must include selectedFiles.",
      ]);
    case "applied-files.json":
      return compact([
        typeof value["runId"] === "string"
          ? undefined
          : "applied-files.json must include runId.",
        typeof value["attempted"] === "number"
          ? undefined
          : "applied-files.json must include attempted.",
        Array.isArray(value["created"]) ? undefined : "applied-files.json must include created.",
        Array.isArray(value["skipped"]) ? undefined : "applied-files.json must include skipped.",
        Array.isArray(value["rejected"]) ? undefined : "applied-files.json must include rejected.",
      ]);
  }
}

function compact(values: ReadonlyArray<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function byteSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
