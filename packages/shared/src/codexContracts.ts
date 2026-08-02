import type { ArtifactRef, RunBudget } from "./runSpine";
import type { CorePolicy, PolicyDecision, RepositoryInspection, RepositorySandbox } from "./corePolicy";
import type { CodexResultImportRequest } from "./codexResultImportContracts";
import type { VerificationPlan } from "./verifierContracts";
import type {
  OrchestrationRole,
  OrchestrationThinkingEffort,
} from "./orchestrationContracts";
import type { RepositoryTaskOperation } from "./taskPlanContracts";

export type CodexExecutionMode =
  | "contract_only"
  | "manual_cli"
  | "app_server"
  | "responses_api"
  | "sdk";

export type CodexProvider = {
  id: string;
  name: string;
  kind:
    | "codex_cli"
    | "codex_app_server"
    | "openai_responses"
    | "codex_sdk"
    | "contract_generator";
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

/**
 * Immutable identity for one execution attempt of a semantic repository task.
 *
 * The outer repository-task plan is approved once. Every provider-specific
 * contract and approval derived from it carries this tuple so a provider cannot
 * accidentally execute a different task, retry, path set, or operation set.
 */
export type CodexTaskAttemptBinding = {
  planId: string;
  revision: number;
  digest: string;
  semanticTaskId: string;
  attemptId: string;
  retryIndex: number;
  expectedPaths: string[];
  operations: RepositoryTaskOperation[];
};

const CODEX_TASK_OPERATIONS = new Set<RepositoryTaskOperation>([
  "read",
  "write",
  "delete",
  "rename",
  "dependency",
  "migration",
]);

function cleanTaskBindingString(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

function isExactRepositoryPath(value: string): boolean {
  if (!cleanTaskBindingString(value) || value.startsWith("/") || value.startsWith("\\")) {
    return false;
  }
  if (/^[a-z]:[\\/]/iu.test(value) || value.includes("\\") || /[*?\[\]]/u.test(value)) {
    return false;
  }
  return !value.split("/").some(
    (part) => part.length === 0 || part === "." || part === "..",
  );
}

/** Validate a task-attempt identity before it becomes approval material. */
export function validateCodexTaskAttemptBinding(
  binding: CodexTaskAttemptBinding,
): void {
  if (
    !cleanTaskBindingString(binding.planId) ||
    !Number.isSafeInteger(binding.revision) ||
    binding.revision < 0 ||
    !/^[a-f0-9]{64}$/u.test(binding.digest) ||
    !cleanTaskBindingString(binding.semanticTaskId) ||
    !cleanTaskBindingString(binding.attemptId) ||
    !Number.isSafeInteger(binding.retryIndex) ||
    binding.retryIndex < 0 ||
    new Set(binding.expectedPaths).size !== binding.expectedPaths.length ||
    binding.expectedPaths.some((item) => !isExactRepositoryPath(item)) ||
    binding.operations.length === 0 ||
    new Set(binding.operations).size !== binding.operations.length ||
    binding.operations.some((operation) => !CODEX_TASK_OPERATIONS.has(operation))
  ) {
    throw new Error("Codex task-attempt binding is invalid.");
  }
}

/** Compare every approval-relevant field without accepting partial matches. */
export function codexTaskAttemptBindingsEqual(
  left: CodexTaskAttemptBinding | undefined,
  right: CodexTaskAttemptBinding | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.planId === right.planId &&
    left.revision === right.revision &&
    left.digest === right.digest &&
    left.semanticTaskId === right.semanticTaskId &&
    left.attemptId === right.attemptId &&
    left.retryIndex === right.retryIndex &&
    left.expectedPaths.length === right.expectedPaths.length &&
    left.expectedPaths.every((value, index) => value === right.expectedPaths[index]) &&
    left.operations.length === right.operations.length &&
    left.operations.every((value, index) => value === right.operations[index])
  );
}

export function cloneCodexTaskAttemptBinding(
  binding: CodexTaskAttemptBinding,
): CodexTaskAttemptBinding {
  return {
    ...binding,
    expectedPaths: [...binding.expectedPaths],
    operations: [...binding.operations],
  };
}

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
  taskMode?: "read_only" | "mutation";
  /** Required for production semantic task attempts; absent for legacy contracts. */
  taskBinding?: CodexTaskAttemptBinding;
  modelId?: string;
  modelLabel?: string;
  modelRole?: OrchestrationRole;
  thinkingEffort?: OrchestrationThinkingEffort;
  parentInvocationId?: string;
};

export type CodexContract = {
  id: string;
  runId: string;
  taskId: string;
  provider: CodexProvider;
  executionMode: CodexExecutionMode;
  goal: string;
  markdown: string;
  taskBinding?: CodexTaskAttemptBinding;
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
    modelRole?: OrchestrationRole;
    thinkingEffort?: OrchestrationThinkingEffort;
    parentInvocationId?: string;
    taskMode?: "read_only" | "mutation";
    taskBinding?: CodexTaskAttemptBinding;
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
  taskBinding?: CodexTaskAttemptBinding;
  artifacts: ArtifactRef[];
};

export type CodexExecutionStatus = "blocked" | "approval_required" | "approved" | "running" | "finished" | "failed" | "cancelled";

export type CodexExecutionFailureReason =
  | "approval_missing"
  | "approval_denied"
  | "approval_mismatch"
  | "task_binding_invalid"
  | "codex_missing"
  | "codex_auth_missing"
  | "api_key_missing"
  | "provider_failed"
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
  /** Must exactly match a bound contract when either side carries a binding. */
  taskBinding?: CodexTaskAttemptBinding;
};

export type CodexExecutionApproval = {
  id: string;
  runId: string;
  planId: string;
  status: "pending" | "approved" | "denied";
  approvedBy: string;
  reason: string;
  approvedAt?: string;
  authorizationSource?: "automatic_policy" | "operator" | "headless";
  /** Provider-internal derivation of the outer task-plan approval. */
  taskBinding?: CodexTaskAttemptBinding;
};

export type CodexProcessRef = {
  id: string;
  runId: string;
  planId: string;
  pid?: number;
  status: CodexExecutionStatus;
  taskBinding?: CodexTaskAttemptBinding;
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
  modelRole?: OrchestrationRole;
  thinkingEffort?: OrchestrationThinkingEffort;
  parentInvocationId?: string;
  taskMode?: "read_only" | "mutation";
  taskBinding?: CodexTaskAttemptBinding;
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
  taskBinding?: CodexTaskAttemptBinding;
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
