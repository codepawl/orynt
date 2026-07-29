import type { CorePolicy, RepositorySandbox } from "./corePolicy";
import type { ArtifactRef, RunBudget } from "./runSpine";
import type { VerificationPlanRequest } from "./verifierContracts";

export type ImportStatus = "requested" | "inspected" | "redacted" | "imported" | "manual_review_required" | "failed";

export type ImportFailureReason =
  | "unsafe_path"
  | "unmanaged_sandbox"
  | "artifact_path_unsafe"
  | "diff_unavailable"
  | "log_not_found"
  | "malformed_log"
  | "artifact_write_failed"
  | "redaction_failed"
  | "policy_blocked"
  | "no_changes"
  | "protected_path_touched"
  | "unexpected_file_touch"
  | "unauthorized_file_touch"
  | "changed_file_limit_exceeded"
  | "destructive_change_detected";

export type ImportedFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked" | "unknown";

export type ImportedChangedFile = {
  path: string;
  status: ImportedFileStatus;
  previousPath?: string;
};

export type ImportedPatchSummary = {
  baseRef: string;
  hasChanges: boolean;
  changedFiles: ImportedChangedFile[];
  allowedFiles: string[];
  protectedFiles: string[];
  unexpectedFiles: string[];
  unauthorizedFiles?: string[];
  withinAllowedScope: boolean;
  protectedPathTouched: boolean;
  diffStat: string;
  inspectedAt: string;
};

export type ImportedCommandLog = {
  id: string;
  kind: "manual_log" | "validation_transcript";
  path: string;
  content: string;
  sha256: string;
  byteLength: number;
  importedAt: string;
  malformed: boolean;
};

export type ImportedArtifact = ArtifactRef & {
  path: string;
  byteLength?: number;
};

export type ImportRedactionResult = {
  applied: boolean;
  redactedPaths: string[];
  redactionCount: number;
};

export type CodexRunSummary = {
  runId: string;
  taskId: string;
  status: ImportStatus;
  changedFileCount: number;
  hasManualLog: boolean;
  hasValidationTranscript: boolean;
  requiresManualReview: boolean;
  failureReasons: ImportFailureReason[];
  summary: string;
};

export type CodexResultImportRequest = {
  runId: string;
  taskId: string;
  sandbox: RepositorySandbox;
  policy: CorePolicy;
  budget: RunBudget;
  artifactRoot: string;
  manualLogPath?: string;
  validationTranscriptPath?: string;
  userNotes?: string;
  validationCommands?: string[];
  expectedPaths?: string[];
  requireExpectedPaths?: boolean;
  allowDestructiveChanges?: boolean;
  allowChangedFileLimitExceeded?: boolean;
};

export type CodexResultBundle = {
  id: string;
  runId: string;
  taskId: string;
  status: ImportStatus;
  failureReasons: ImportFailureReason[];
  sandbox: RepositorySandbox;
  policy: CorePolicy;
  budget: RunBudget;
  artifactRoot: string;
  patch: ImportedPatchSummary;
  manualLog?: ImportedCommandLog;
  validationTranscript?: ImportedCommandLog;
  userNotes?: string;
  validationCommands: string[];
  redaction: ImportRedactionResult;
  artifacts: ImportedArtifact[];
  createdAt: string;
  summary: CodexRunSummary;
};

export interface CodexResultImporter {
  inspectSandboxChanges(request: CodexResultImportRequest): Promise<ImportedPatchSummary>;
  importManualLog(request: CodexResultImportRequest): Promise<ImportedCommandLog | undefined>;
  importResultBundle(request: CodexResultImportRequest): Promise<CodexResultBundle>;
  summarizeImport(bundle: CodexResultBundle): CodexRunSummary;
  redactImport(bundle: CodexResultBundle): ImportRedactionResult;
  createVerifierInput(bundle: CodexResultBundle): VerificationPlanRequest;
}
