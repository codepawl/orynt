import type { ArtifactRef, RunBudget } from "./runSpine";
import type { CorePolicy, PolicyDecision, RepositoryInspection, RepositorySandbox } from "./corePolicy";
import type { CodexResultImportRequest } from "./codexResultImportContracts";
import type { VerificationPlan } from "./verifierContracts";

export type CodexExecutionMode = "contract_only" | "manual_cli" | "app_server" | "sdk";

export type CodexProvider = {
  id: string;
  name: string;
  kind: "codex_cli" | "codex_app_server" | "codex_sdk" | "contract_generator";
  version?: string;
};

export type CodexAdapterStatus = {
  provider: CodexProvider;
  available: boolean;
  authenticated?: boolean;
  executionMode: CodexExecutionMode;
  executablePath?: string;
  detectedAt: string;
  reasons: string[];
};

export type CodexContractRequest = {
  runId: string;
  taskId: string;
  goal: string;
  context: string[];
  constraints: string[];
  doneWhen: string[];
  repository: RepositoryInspection;
  sandbox: RepositorySandbox;
  policy: CorePolicy;
  budget: RunBudget;
  validationCommands: string[];
  artifactRoot: string;
  executionMode?: CodexExecutionMode;
  modelId?: string;
  modelLabel?: string;
};

export type CodexContract = {
  id: string;
  runId: string;
  taskId: string;
  provider: CodexProvider;
  executionMode: CodexExecutionMode;
  goal: string;
  markdown: string;
  metadata: {
    id: string;
    runId: string;
    taskId: string;
    providerId: string;
    executionMode: CodexExecutionMode;
    repository: RepositoryInspection;
    sandbox: RepositorySandbox;
    allowedPaths: string[];
    protectedPaths: string[];
    blockedCommands: string[];
    validationCommands: string[];
    modelId?: string;
    modelLabel?: string;
    budget: RunBudget;
    redactionApplied: boolean;
    createdAt: string;
  };
};

export type CodexContractArtifact = {
  contractId: string;
  runId: string;
  taskId: string;
  artifactRoot: string;
  markdownPath: string;
  metadataPath: string;
  markdownSha256: string;
  metadataSha256: string;
  artifacts: ArtifactRef[];
};

export type CodexExecutionStatus = "blocked" | "approval_required" | "approved" | "running" | "finished" | "failed" | "cancelled";

export type CodexExecutionFailureReason =
  | "approval_missing"
  | "approval_denied"
  | "approval_mismatch"
  | "codex_missing"
  | "codex_auth_missing"
  | "policy_blocked"
  | "budget_exceeded"
  | "sandbox_missing"
  | "unmanaged_sandbox"
  | "contract_missing"
  | "artifact_path_unsafe"
  | "verifier_plan_missing"
  | "execution_timeout"
  | "execution_failed"
  | "execution_cancelled"
  | "artifact_write_failed"
  | "redaction_failed";

export type CodexExecutionPolicy = {
  requireApproval: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
  maxExecutionSteps: number;
};

export type CodexExecutionRequest = {
  contract: CodexContract;
  contractArtifact: CodexContractArtifact;
  sandbox: RepositorySandbox;
  policy: CorePolicy;
  budget: RunBudget;
  artifactRoot: string;
  verifierPlan?: VerificationPlan;
  executionPolicy?: Partial<CodexExecutionPolicy>;
};

export type CodexExecutionApproval = {
  id: string;
  runId: string;
  planId: string;
  status: "pending" | "approved" | "denied";
  approvedBy: string;
  reason: string;
  approvedAt?: string;
};

export type CodexProcessRef = {
  id: string;
  runId: string;
  planId: string;
  pid?: number;
  status: CodexExecutionStatus;
  startedAt?: string;
  finishedAt?: string;
};

export type CodexExecutionPlan = {
  id: string;
  runId: string;
  taskId: string;
  status: CodexExecutionStatus;
  provider: CodexProvider;
  executablePath?: string;
  argv: string[];
  cwd: string;
  contractPath: string;
  artifactRoot: string;
  stdoutPath: string;
  stderrPath: string;
  lastMessagePath: string;
  resultPath: string;
  sandbox: RepositorySandbox;
  policy: CorePolicy;
  budget: RunBudget;
  executionPolicy: CodexExecutionPolicy;
  policyDecision?: PolicyDecision;
  verifierPlanId?: string;
  validationCommands: string[];
  approvalRequired: boolean;
  failureReasons: CodexExecutionFailureReason[];
  artifacts: ArtifactRef[];
  createdAt: string;
};

export type CodexExecutionResult = {
  id: string;
  planId: string;
  runId: string;
  taskId: string;
  status: CodexExecutionStatus;
  provider: CodexProvider;
  process: CodexProcessRef;
  sandbox: RepositorySandbox;
  policy: CorePolicy;
  budget: RunBudget;
  artifactRoot: string;
  stdoutPath: string;
  stderrPath: string;
  lastMessagePath?: string;
  resultPath: string;
  stdoutSummary: string;
  stderrSummary: string;
  exitCode: number | null;
  timedOut: boolean;
  failureReasons: CodexExecutionFailureReason[];
  redaction: {
    applied: boolean;
    redactedPaths: string[];
    redactionCount: number;
  };
  validationCommands: string[];
  artifacts: ArtifactRef[];
  startedAt: string;
  completedAt: string;
  summary: string;
};

export interface CodexAdapter {
  detectCodex(runId?: string): Promise<CodexAdapterStatus>;
  createContract(request: CodexContractRequest): CodexContract;
  writeContractArtifact(contract: CodexContract, artifactRoot: string): Promise<CodexContractArtifact>;
  planExecution(request: CodexExecutionRequest): Promise<CodexExecutionPlan>;
  requestExecutionApproval(plan: CodexExecutionPlan): CodexExecutionApproval;
  executeApprovedContract(plan: CodexExecutionPlan, approval: CodexExecutionApproval): Promise<CodexExecutionResult>;
  cancelExecution(ref: CodexProcessRef): Promise<CodexExecutionResult | CodexProcessRef>;
  summarizeExecution(result: CodexExecutionResult): string;
  createResultImportRequest(result: CodexExecutionResult): CodexResultImportRequest;
  summarizeContract(contract: CodexContract): string;
  explainExecutionMode(mode: CodexExecutionMode, status?: CodexAdapterStatus): string;
}

export function codexContractArtifactRefs(artifact: CodexContractArtifact): ArtifactRef[] {
  return artifact.artifacts.map((item) => ({ ...item }));
}
