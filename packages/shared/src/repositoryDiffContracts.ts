import type { ImportedFileStatus } from "./codexResultImportContracts.js";

export const REPOSITORY_DIFF_ARTIFACT_MAX_BYTES = 2 * 1024 * 1024;
export const REPOSITORY_DIFF_PREVIEW_MAX_BYTES = 64 * 1024;
export const REPOSITORY_DIFF_PREVIEW_MAX_LINES = 300;

export type RepositoryDiffFileV1 = {
  path: string;
  status: ImportedFileStatus;
  previousPath?: string;
  additions: number | null;
  deletions: number | null;
  binary: boolean;
  patch: string;
  truncated: boolean;
};

export type RepositoryDiffArtifactV1 = {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  baseRef: string;
  redacted: true;
  redactionCount: number;
  truncated: boolean;
  maxBytes: number;
  totals: {
    files: number;
    additions: number;
    deletions: number;
    binaryFiles: number;
  };
  files: RepositoryDiffFileV1[];
  generatedAt: string;
};

const FILE_STATUSES = new Set<ImportedFileStatus>([
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "untracked",
  "unknown",
]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Repository diff artifact must be an object.");
  }
  return value as Record<string, unknown>;
}

function boundedString(
  value: unknown,
  label: string,
  maximum: number,
): string {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value.length > maximum
  ) {
    throw new Error(`${label} must be a non-empty bounded string.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function nullableCount(value: unknown, label: string): number | null {
  return value === null ? null : nonNegativeInteger(value, label);
}

export function parseRepositoryDiffArtifactV1(
  value: unknown,
): RepositoryDiffArtifactV1 {
  const candidate = record(value);
  if (candidate.schemaVersion !== 1 || candidate.redacted !== true) {
    throw new Error("Repository diff artifact version or redaction state is invalid.");
  }
  const files = Array.isArray(candidate.files)
    ? candidate.files.map((raw, index): RepositoryDiffFileV1 => {
        const file = record(raw);
        const status = file.status;
        if (typeof status !== "string" || !FILE_STATUSES.has(status as ImportedFileStatus)) {
          throw new Error(`Repository diff file ${index + 1} status is invalid.`);
        }
        if (
          typeof file.binary !== "boolean" ||
          typeof file.truncated !== "boolean" ||
          typeof file.patch !== "string"
        ) {
          throw new Error(`Repository diff file ${index + 1} content is invalid.`);
        }
        return {
          path: boundedString(file.path, `Repository diff file ${index + 1} path`, 1_000),
          status: status as ImportedFileStatus,
          ...(file.previousPath === undefined
            ? {}
            : {
                previousPath: boundedString(
                  file.previousPath,
                  `Repository diff file ${index + 1} previous path`,
                  1_000,
                ),
              }),
          additions: nullableCount(
            file.additions,
            `Repository diff file ${index + 1} additions`,
          ),
          deletions: nullableCount(
            file.deletions,
            `Repository diff file ${index + 1} deletions`,
          ),
          binary: file.binary,
          patch: file.patch,
          truncated: file.truncated,
        };
      })
    : (() => {
        throw new Error("Repository diff artifact files must be an array.");
      })();
  const totals = record(candidate.totals);
  const artifact: RepositoryDiffArtifactV1 = {
    schemaVersion: 1,
    runId: boundedString(candidate.runId, "Repository diff run id", 200),
    taskId: boundedString(candidate.taskId, "Repository diff task id", 200),
    baseRef: boundedString(candidate.baseRef, "Repository diff base ref", 500),
    redacted: true,
    redactionCount: nonNegativeInteger(
      candidate.redactionCount,
      "Repository diff redaction count",
    ),
    truncated: candidate.truncated === true,
    maxBytes: nonNegativeInteger(candidate.maxBytes, "Repository diff maximum bytes"),
    totals: {
      files: nonNegativeInteger(totals.files, "Repository diff total files"),
      additions: nonNegativeInteger(
        totals.additions,
        "Repository diff total additions",
      ),
      deletions: nonNegativeInteger(
        totals.deletions,
        "Repository diff total deletions",
      ),
      binaryFiles: nonNegativeInteger(
        totals.binaryFiles,
        "Repository diff total binary files",
      ),
    },
    files,
    generatedAt: boundedString(
      candidate.generatedAt,
      "Repository diff generated timestamp",
      100,
    ),
  };
  if (
    artifact.maxBytes !== REPOSITORY_DIFF_ARTIFACT_MAX_BYTES ||
    artifact.totals.files !== files.length ||
    artifact.totals.binaryFiles !== files.filter(({ binary }) => binary).length ||
    artifact.totals.additions !==
      files.reduce((total, file) => total + (file.additions ?? 0), 0) ||
    artifact.totals.deletions !==
      files.reduce((total, file) => total + (file.deletions ?? 0), 0)
  ) {
    throw new Error("Repository diff artifact totals are inconsistent.");
  }
  return artifact;
}
