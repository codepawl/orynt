import type { ArtifactRef, RunBudget } from "./runSpine";
import type { CorePolicy, PolicyDecision, RepositorySandbox } from "./corePolicy";

export type VerificationStatus = "pass" | "partial" | "fail" | "inconclusive";

export type VerificationFailureClass =
  | "policy_blocked"
  | "trusted_evidence_invalid"
  | "command_failed"
  | "command_timeout"
  | "protected_path_touched"
  | "unexpected_file_touch"
  | "unauthorized_file_touch"
  | "changed_file_limit_exceeded"
  | "destructive_change_detected"
  | "no_changes"
  | "diff_unavailable"
  | "verifier_error";

export type VerificationCommand = {
  id: string;
  command: string;
  args: string[];
  displayName: string;
  timeoutMs: number;
  allowed: boolean;
  policyDecision?: PolicyDecision;
};

export type VerifierConfig = {
  defaultCommands: string[];
  commandTimeoutMs: number;
  maxOutputBytes: number;
  requireChangedFiles: boolean;
  authorizedChangedPaths?: string[];
  requireAuthorizedChangedPaths?: boolean;
  allowDestructiveChanges?: boolean;
  allowChangedFileLimitExceeded?: boolean;
  artifactRoot: string;
};

export type VerificationPlan = {
  id: string;
  runId: string;
  taskId: string;
  sandbox: RepositorySandbox;
  policyId: string;
  commands: VerificationCommand[];
  budget: RunBudget;
  config: VerifierConfig;
  createdAt: string;
};

export type DiffScopeResult = {
  baseRef: string;
  changedFiles: string[];
  allowedFiles: string[];
  protectedFiles: string[];
  unexpectedFiles: string[];
  unauthorizedFiles: string[];
  destructiveFiles: string[];
  hasChanges: boolean;
  withinAllowedScope: boolean;
  protectedPathTouched: boolean;
  changedFileLimitExceeded: boolean;
};

export type VerificationEvidence = {
  id: string;
  kind: "command" | "diff_scope" | "policy" | "summary";
  label: string;
  commandId?: string;
  command?: string;
  exitCode?: number | null;
  durationMs?: number;
  timedOut?: boolean;
  stdout?: string;
  stderr?: string;
  diffScope?: DiffScopeResult;
  policyDecision?: PolicyDecision;
  source?: "process_stdio" | "trusted_report";
  artifactRefs?: ArtifactRef[];
  trustedEvidenceValid?: boolean;
};

export type VerificationVerdict = {
  status: VerificationStatus;
  reason: string;
  confidence: number;
  failureClass?: VerificationFailureClass;
};

export type VerificationResult = {
  id: string;
  planId: string;
  runId: string;
  taskId: string;
  status: VerificationStatus;
  verdict: VerificationVerdict;
  evidence: VerificationEvidence[];
  diffScope: DiffScopeResult;
  artifacts: ArtifactRef[];
  startedAt: string;
  completedAt: string;
};

export type VerificationPlanRequest = {
  runId: string;
  taskId: string;
  sandbox: RepositorySandbox;
  policy: CorePolicy;
  budget: RunBudget;
  commands?: string[];
  artifactRoot: string;
  config?: Partial<VerifierConfig>;
};

export type VerificationRunOptions = {
  signal?: AbortSignal;
};

export interface Verifier {
  createPlan(request: VerificationPlanRequest): VerificationPlan;
  checkPolicy(plan: VerificationPlan, policy: CorePolicy): VerificationPlan;
  runVerification(
    plan: VerificationPlan,
    policy: CorePolicy,
    options?: VerificationRunOptions,
  ): Promise<VerificationResult>;
  summarizeResult(result: VerificationResult): string;
  classifyFailure(result: VerificationResult): VerificationFailureClass | undefined;
}
