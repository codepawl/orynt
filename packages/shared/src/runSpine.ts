import {
  ConservativePolicyEngine,
  DryRunSandboxManager,
  appendPolicyDecisionEvent,
  createConservativeCodingApprenticePolicy,
  policyViolationToRunEvent,
  sandboxPlanToArtifacts,
} from "./corePolicy";
import { BoundedContextWorkspace, ConservativeResourceGovernor } from "./contextWorkspace";

export type RunStatus =
  | "created"
  | "preparing"
  | "observing"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "verifying"
  | "learning"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

export const RUN_EVENT_TYPES = [
  "run_started",
  "goal_received",
  "budget_initialized",
  "budget_checked",
  "budget_warning",
  "budget_stop_requested",
  "budget_exceeded",
  "workspace_initialized",
  "workspace_item_added",
  "context_packet_created",
  "context_initialized",
  "policy_checked",
  "sandbox_inspected",
  "sandbox_create_requested",
  "sandbox_create_allowed",
  "sandbox_planned",
  "sandbox_ready_mock",
  "sandbox_created",
  "sandbox_create_failed",
  "sandbox_cleanup_planned",
  "sandbox_cleanup_blocked",
  "codex_detected",
  "codex_missing",
  "codex_contract_requested",
  "codex_contract_created",
  "codex_contract_write_failed",
  "codex_manual_next_step",
  "codex_result_import_requested",
  "codex_sandbox_diff_inspected",
  "codex_manual_log_imported",
  "codex_result_redacted",
  "codex_result_imported",
  "codex_result_import_failed",
  "manual_review_required",
  "verifier_input_created",
  "verification_planned",
  "verification_policy_checked",
  "verification_started",
  "verification_command_started",
  "verification_command_finished",
  "verification_diff_checked",
  "action_proposed",
  "approval_required",
  "action_blocked",
  "action_blocked_or_approved",
  "policy_violation",
  "verification_recorded",
  "verification_failed",
  "verification_passed",
  "memory_extraction_started",
  "memory_episode_written",
  "candidate_rule_proposed",
  "memory_redaction_applied",
  "memory_extraction_finished",
  "memory_extraction_failed",
  "budget_recorded",
  "run_finished",
] as const;

export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

export type RunVerdictStatus = "pass" | "partial" | "fail" | "inconclusive";

export type RunVerdict = {
  status: RunVerdictStatus;
  reason: string;
  confidence: number;
};

export type ActorKind = "user" | "ui" | "runtime" | "policy" | "verifier" | "budget" | "system";

export type Actor = {
  kind: ActorKind;
  id: string;
  displayName?: string;
};

export type ArtifactRef = {
  id: string;
  kind:
    | "diff"
    | "test_output"
    | "log"
    | "summary"
    | "policy_decision"
    | "sandbox_plan"
    | "codex_contract"
    | "codex_contract_metadata"
    | "codex_result_bundle"
    | "verifier_input"
    | "validation_report"
    | "memory_episode"
    | "candidate_rule"
    | "memory_summary";
  uri: string;
  label: string;
  sha256?: string;
};

export type RunBudget = {
  maxSteps: number;
  maxWallTimeMs: number;
  maxModelTokens: number;
  maxUsd?: number;
  stopOnBudgetExceeded: boolean;
};

export type BudgetSnapshot = {
  stepCount: number;
  elapsedMs: number;
  modelTokens: number;
  estimatedUsd: number;
  remainingSteps: number;
  remainingModelTokens: number;
  exceeded: boolean;
};

export type SafetySnapshot = {
  policyMode: "manual" | "safe" | "balanced" | "experimental";
  riskLevel: "low" | "medium" | "high" | "blocked";
  approvalRequired: boolean;
  protectedPathTouched: boolean;
  commandAllowed: boolean;
  reasons: string[];
};

export type RedactionMetadata = {
  applied: boolean;
  redactedPaths: string[];
};

export type TaskState = {
  goal: string;
  activeSubgoal?: string;
  completedSubgoals: string[];
  constraints: string[];
  openQuestions: string[];
  currentArtifacts: ArtifactRef[];
  recentVerdicts: RunVerdict[];
};

export type ApprovalRequest = {
  id: string;
  reason: string;
  riskLevel: SafetySnapshot["riskLevel"];
  proposedActionId: string;
  status: "pending" | "approved" | "denied";
};

export type ExpectedResult = {
  description: string;
};

export type ActualResult = {
  description: string;
};

export type ActionProposal = {
  id: string;
  type: string;
  intent: string;
  expectedResult: ExpectedResult;
  risk: SafetySnapshot;
  confidence: number;
  estimatedCost: BudgetSnapshot;
  source: "planner" | "skill" | "recovery" | "user";
};

export type ActionDecision = {
  proposalId: string;
  decision: "allow" | "require_approval" | "deny" | "defer";
  reasons: string[];
};

export type LegacyVerificationResult = {
  status: RunVerdictStatus;
  expected: ExpectedResult;
  actual: ActualResult;
  evidence: ArtifactRef[];
  confidence: number;
  failureClass?: string;
};

export type Run = {
  id: string;
  capabilityId: string;
  taskId: string;
  workspaceId: string;
  status: RunStatus;
  goal: string;
  budget: RunBudget;
  createdAt: string;
  updatedAt: string;
};

export type RunEvent<TPayload = unknown> = {
  id: string;
  runId: string;
  sequence: number;
  type: RunEventType;
  timestamp: string;
  actor: Actor;
  payload: TPayload;
  redaction: RedactionMetadata;
  artifacts: ArtifactRef[];
  budget?: BudgetSnapshot;
  safety?: SafetySnapshot;
  verdict?: RunVerdict;
};

export type CreateRunInput = {
  goal: string;
  capabilityId: string;
  taskId: string;
  workspaceId: string;
  budget: RunBudget;
};

export type RunId = {
  id: string;
};

export type ApprovalDecisionInput = {
  runId: string;
  approvalId: string;
  decision: "approved" | "denied";
};

export type RunEventDraft<TPayload = unknown> = {
  type: RunEventType;
  actor: Actor;
  payload: TPayload;
  artifacts?: ArtifactRef[];
  budget?: BudgetSnapshot;
  safety?: SafetySnapshot;
  verdict?: RunVerdict;
  timestamp?: string;
};

export type RunSummary = {
  run: Run;
  eventCount: number;
  latestEvent?: RunEvent;
  latestBudget?: BudgetSnapshot;
  latestSafety?: SafetySnapshot;
  latestVerdict?: RunVerdict;
  artifactCount: number;
};

export interface RunStore {
  createRun(input: CreateRunInput): Run;
  appendEvent<TPayload>(runId: string, event: RunEventDraft<TPayload>): RunEvent<TPayload>;
  listEvents(runId: string): RunEvent[];
  getRun(runId: string): Run | undefined;
  updateRunStatus(runId: string, status: RunStatus): Run;
  summarizeRun(runId: string): RunSummary;
}

const VALID_STATUS_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  created: ["preparing", "cancelled", "failed"],
  preparing: ["observing", "planning", "paused", "cancelled", "failed"],
  observing: ["planning", "awaiting_approval", "cancelled", "failed"],
  planning: ["awaiting_approval", "executing", "verifying", "cancelled", "failed"],
  awaiting_approval: ["executing", "planning", "paused", "cancelled", "failed"],
  executing: ["verifying", "awaiting_approval", "cancelled", "failed"],
  verifying: ["learning", "completed", "failed", "cancelled"],
  learning: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  paused: ["planning", "awaiting_approval", "cancelled", "failed"],
  cancelled: [],
};

const SENSITIVE_KEY_PATTERN = /password|secret|api[-_]?key|token|otp|credential|authorization|cookie|raw[-_]?value|form[-_]?value/i;
const SECRET_LIKE_VALUE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})\b/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return value === undefined
    ? value
    : typeof globalThis.structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
}

function redactValue(value: unknown, path: string, redactedPaths: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, `${path}[${index}]`, redactedPaths));
  }

  if (isRecord(value)) {
    const redacted: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = path ? `${path}.${key}` : key;
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        redacted[key] = "[REDACTED]";
        redactedPaths.push(nestedPath);
        continue;
      }
      redacted[key] = redactValue(nestedValue, nestedPath, redactedPaths);
    }
    return redacted;
  }

  if (typeof value === "string" && SECRET_LIKE_VALUE_PATTERN.test(value)) {
    redactedPaths.push(path || "$");
    return value.replace(SECRET_LIKE_VALUE_PATTERN, "[REDACTED]");
  }

  return value;
}

export function redactSensitivePayload<TPayload>(payload: TPayload): { payload: TPayload; redaction: RedactionMetadata } {
  const redactedPaths: string[] = [];
  const redactedPayload = redactValue(clone(payload), "payload", redactedPaths) as TPayload;

  return {
    payload: redactedPayload,
    redaction: {
      applied: redactedPaths.length > 0,
      redactedPaths,
    },
  };
}

export function canTransitionRunStatus(from: RunStatus, to: RunStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from].includes(to);
}

export function assertValidRunStatusTransition(from: RunStatus, to: RunStatus): void {
  if (from === to) {
    return;
  }
  if (!canTransitionRunStatus(from, to)) {
    throw new Error(`invalid run status transition: ${from} -> ${to}`);
  }
}

export function isRunEventType(value: unknown): value is RunEventType {
  return typeof value === "string" && (RUN_EVENT_TYPES as readonly string[]).includes(value);
}

export function validateRunEvent(event: RunEvent): void {
  if (!event.id || !event.runId || !Number.isInteger(event.sequence) || event.sequence < 1) {
    throw new Error("run event id, runId, and positive integer sequence are required");
  }
  if (!isRunEventType(event.type)) {
    throw new Error(`unknown run event type: ${String(event.type)}`);
  }
  if (!event.timestamp || Number.isNaN(Date.parse(event.timestamp))) {
    throw new Error("run event timestamp must be an ISO date string");
  }
  if (!event.actor?.id || !event.actor.kind) {
    throw new Error("run event actor is required");
  }
}

export class InMemoryRunStore implements RunStore {
  private runs = new Map<string, Run>();
  private events = new Map<string, RunEvent[]>();
  private nextRunNumber = 1;

  createRun(input: CreateRunInput): Run {
    if (!input.goal.trim()) {
      throw new Error("run goal is required");
    }
    if (input.budget.maxSteps <= 0 || input.budget.maxWallTimeMs <= 0 || input.budget.maxModelTokens <= 0) {
      throw new Error("run budget limits must be greater than zero");
    }
    if (!input.budget.stopOnBudgetExceeded) {
      throw new Error("run budget must stop on budget exceeded");
    }

    const now = new Date().toISOString();
    const run: Run = {
      id: `run-${this.nextRunNumber++}`,
      capabilityId: input.capabilityId,
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      status: "created",
      goal: input.goal,
      budget: clone(input.budget),
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(run.id, clone(run));
    this.events.set(run.id, []);
    return clone(run);
  }

  appendEvent<TPayload>(runId: string, event: RunEventDraft<TPayload>): RunEvent<TPayload> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`run not found: ${runId}`);
    }

    const events = this.events.get(runId);
    if (!events) {
      throw new Error(`run event stream not found: ${runId}`);
    }

    const { payload, redaction } = redactSensitivePayload(event.payload);
    const nextEvent: RunEvent<TPayload> = {
      id: `${runId}-event-${events.length + 1}`,
      runId,
      sequence: events.length + 1,
      type: event.type,
      timestamp: event.timestamp ?? new Date().toISOString(),
      actor: clone(event.actor),
      payload,
      redaction,
      artifacts: clone(event.artifacts ?? []),
      budget: event.budget ? clone(event.budget) : undefined,
      safety: event.safety ? clone(event.safety) : undefined,
      verdict: event.verdict ? clone(event.verdict) : undefined,
    };

    validateRunEvent(nextEvent);
    events.push(clone(nextEvent));
    return clone(nextEvent);
  }

  listEvents(runId: string): RunEvent[] {
    return clone(this.events.get(runId) ?? []);
  }

  getRun(runId: string): Run | undefined {
    const run = this.runs.get(runId);
    return run ? clone(run) : undefined;
  }

  updateRunStatus(runId: string, status: RunStatus): Run {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`run not found: ${runId}`);
    }

    assertValidRunStatusTransition(run.status, status);
    const updated = {
      ...run,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.runs.set(runId, updated);
    return clone(updated);
  }

  summarizeRun(runId: string): RunSummary {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`run not found: ${runId}`);
    }

    const events = this.events.get(runId) ?? [];
    const latestEvent = events.at(-1);
    const latestBudget = [...events].reverse().find((event) => event.budget)?.budget;
    const latestSafety = [...events].reverse().find((event) => event.safety)?.safety;
    const latestVerdict = [...events].reverse().find((event) => event.verdict)?.verdict;
    const artifactCount = events.reduce((count, event) => count + event.artifacts.length, 0);

    return clone({
      run,
      eventCount: events.length,
      latestEvent,
      latestBudget,
      latestSafety,
      latestVerdict,
      artifactCount,
    });
  }
}

export function createDefaultRunBudget(): RunBudget {
  return {
    maxSteps: 40,
    maxWallTimeMs: 30 * 60 * 1000,
    maxModelTokens: 120_000,
    maxUsd: 1,
    stopOnBudgetExceeded: true,
  };
}

export function createMockRunSequence(store: RunStore = new InMemoryRunStore()) {
  const run = store.createRun({
    goal: "Fix a failing unit test in the selected repository",
    capabilityId: "coding-apprentice",
    taskId: "task-failing-unit-test",
    workspaceId: "workspace-local-alpha",
    budget: createDefaultRunBudget(),
  });

  const runtime: Actor = { kind: "runtime", id: "mock-runtime", displayName: "Mock Runtime" };
  const policy: Actor = { kind: "policy", id: "core-policy", displayName: "Core Policy" };
  const verifier: Actor = { kind: "verifier", id: "deterministic-verifier", displayName: "Deterministic Verifier" };
  const budget: Actor = { kind: "budget", id: "resource-governor", displayName: "Resource Governor" };

  store.updateRunStatus(run.id, "preparing");
  store.appendEvent(run.id, {
    type: "run_started",
    actor: runtime,
    payload: { summary: "Mock repository run started", workspaceId: run.workspaceId },
  });
  store.appendEvent(run.id, {
    type: "goal_received",
    actor: { kind: "user", id: "local-user", displayName: "Operator" },
    payload: { summary: run.goal, constraints: ["mock runtime only", "no Codex execution", "no browser automation"] },
  });
  const governor = new ConservativeResourceGovernor({ runStore: store, actor: budget });
  governor.initializeBudget(run.id, {
    usage: {
      startedAt: run.createdAt,
      updatedAt: run.createdAt,
      elapsedMs: 0,
      toolSteps: 0,
      commandCount: 0,
      fileChangeCount: 0,
      artifactCount: 0,
      verificationCommandCount: 0,
      estimatedModelTokens: 0,
      riskLevel: "low",
      estimatedUsd: 0,
    },
  });

  const corePolicy = createConservativeCodingApprenticePolicy("/repos/codepawl", "/tmp/codepawl-worktrees");
  const policyEngine = new ConservativePolicyEngine();
  const sandboxManager = new DryRunSandboxManager();
  governor.checkBeforeOperation(run.id, "inspect_repository");
  const safeInspectionDecision = policyEngine.evaluateAction(
    {
      id: "safe-inspection",
      kind: "command",
      summary: "Inspect repository status",
      command: "git status",
    },
    corePolicy,
  );
  appendPolicyDecisionEvent(store, run.id, corePolicy, safeInspectionDecision, policy);

  const sandboxPlan = sandboxManager.planRepositorySandbox(
    {
      runId: run.id,
      taskId: run.taskId,
      repositoryPath: corePolicy.sandbox.repository.repositoryPath,
      baseRef: corePolicy.sandbox.repository.baseRef,
    },
    corePolicy,
  );
  store.appendEvent(run.id, {
    type: "sandbox_planned",
    actor: policy,
    payload: {
      summary: "Planned isolated repository worktree without executing commands",
      sandboxPlan,
    },
    artifacts: sandboxPlanToArtifacts(sandboxPlan),
    safety: {
      policyMode: corePolicy.permissionMode,
      riskLevel: "low",
      approvalRequired: false,
      protectedPathTouched: false,
      commandAllowed: false,
      reasons: ["dry-run sandbox planning only"],
    },
  });
  store.appendEvent(run.id, {
    type: "sandbox_ready_mock",
    actor: runtime,
    payload: {
      summary: "Dry-run sandbox boundary is ready; no worktree was created",
      sandboxPlanId: sandboxPlan.id,
    },
    safety: {
      policyMode: corePolicy.permissionMode,
      riskLevel: "low",
      approvalRequired: false,
      protectedPathTouched: false,
      commandAllowed: false,
      reasons: ["mock sandbox readiness event"],
    },
  });
  const workspace = new BoundedContextWorkspace({ runStore: store, actor: runtime });
  workspace.initialize({
    runId: run.id,
    taskId: run.taskId,
    goal: run.goal,
    policy: corePolicy,
    constraints: [
      { id: "mock-no-codex", description: "Do not execute Codex in this slice.", source: "runtime", priority: "required" },
      { id: "mock-no-browser", description: "Do not use browser automation.", source: "runtime", priority: "required" },
    ],
    artifacts: sandboxPlanToArtifacts(sandboxPlan).map((ref) => ({ ref, summary: ref.label })),
    recentEvents: store.listEvents(run.id),
  });
  workspace.addItem({
    id: "mock-sandbox-workspace-item",
    kind: "sandbox",
    title: "Sandbox boundary",
    summary: `Dry-run worktree boundary planned at ${sandboxPlan.plannedWorktreePath}`,
    priority: 90,
    tags: ["sandbox", "policy"],
    artifactRefs: sandboxPlanToArtifacts(sandboxPlan),
  });
  store.appendEvent(run.id, {
    type: "codex_missing",
    actor: runtime,
    payload: {
      summary: "Codex CLI was not required for contract-only mode",
      providerId: "codex-contract-provider",
      executionMode: "contract_only",
    },
  });
  governor.checkBeforeOperation(run.id, "generate_codex_contract", { toolSteps: 2, estimatedModelTokens: 1_200 });
  store.appendEvent(run.id, {
    type: "codex_contract_requested",
    actor: runtime,
    payload: {
      summary: "Requested safe Codex work contract generation",
      runId: run.id,
      sandboxPath: sandboxPlan.plannedWorktreePath,
    },
  });
  const codexArtifacts: ArtifactRef[] = [
    {
      id: "mock-codex-contract-md",
      kind: "codex_contract",
      uri: `codepawl-artifact://${run.id}/codex-contract.md`,
      label: "Generated Codex work contract",
      sha256: "mock-codex-contract-md-sha256",
    },
    {
      id: "mock-codex-contract-metadata",
      kind: "codex_contract_metadata",
      uri: `codepawl-artifact://${run.id}/codex-contract.metadata.json`,
      label: "Generated Codex contract metadata",
      sha256: "mock-codex-contract-metadata-sha256",
    },
  ];
  store.appendEvent(run.id, {
    type: "codex_contract_created",
    actor: runtime,
    payload: {
      summary: "Generated safe Codex work contract artifact",
      contractId: `codex-contract-${run.id}`,
      artifactCount: codexArtifacts.length,
    },
    artifacts: codexArtifacts,
  });
  workspace.addItem({
    id: "mock-codex-contract-workspace-item",
    kind: "codex_contract",
    title: "Codex work contract",
    summary: "Safe contract artifact generated for manual review; no provider execution occurred.",
    priority: 75,
    tags: ["codex", "contract"],
    artifactRefs: codexArtifacts,
  });
  store.appendEvent(run.id, {
    type: "codex_manual_next_step",
    actor: runtime,
    payload: {
      summary: "Manual next step: review the generated Codex contract before any provider execution",
      executionMode: "contract_only",
    },
  });
  const importArtifacts: ArtifactRef[] = [
    {
      id: "mock-codex-result-import",
      kind: "codex_result_bundle",
      uri: `codepawl-artifact://${run.id}/codex-result-import.json`,
      label: "Imported manual Codex result bundle",
      sha256: "mock-codex-result-import-sha256",
    },
  ];
  const verifierInputArtifacts: ArtifactRef[] = [
    {
      id: "mock-verifier-input",
      kind: "verifier_input",
      uri: `codepawl-artifact://${run.id}/verifier-input.json`,
      label: "Verifier input from imported Codex result",
      sha256: "mock-verifier-input-sha256",
    },
  ];
  store.appendEvent(run.id, {
    type: "codex_result_import_requested",
    actor: runtime,
    payload: {
      summary: "Requested manual Codex result import from the managed sandbox artifact directory",
      sandboxPath: sandboxPlan.plannedWorktreePath,
    },
  });
  store.appendEvent(run.id, {
    type: "codex_sandbox_diff_inspected",
    actor: runtime,
    payload: {
      summary: "Inspected sandbox diff scope before trusting imported result notes",
      changedFiles: ["packages/shared/src/index.ts"],
      protectedFiles: [],
      unexpectedFiles: [],
    },
  });
  store.appendEvent(run.id, {
    type: "codex_manual_log_imported",
    actor: runtime,
    payload: {
      summary: "Imported optional manual Codex log from the CodePawl-managed artifact directory",
      malformed: false,
    },
  });
  store.appendEvent(run.id, {
    type: "codex_result_redacted",
    actor: runtime,
    payload: {
      summary: "Redacted imported manual result content before persistence",
      redactionCount: 0,
    },
  });
  store.appendEvent(run.id, {
    type: "codex_result_imported",
    actor: runtime,
    payload: {
      summary: "Imported structured manual Codex result bundle for verifier handoff",
      status: "imported",
      changedFileCount: 1,
    },
    artifacts: importArtifacts,
  });
  store.appendEvent(run.id, {
    type: "manual_review_required",
    actor: runtime,
    payload: {
      summary: "Manual review checkpoint remains required before adopting imported work",
      reason: "imported provider output is advisory until deterministic verification passes",
    },
  });
  store.appendEvent(run.id, {
    type: "verifier_input_created",
    actor: verifier,
    payload: {
      summary: "Created verifier input from imported Codex result without running verification",
      commands: ["pnpm test:contracts"],
    },
    artifacts: verifierInputArtifacts,
  });

  store.updateRunStatus(run.id, "observing");
  store.appendEvent(run.id, {
    type: "context_initialized",
    actor: runtime,
    payload: { summary: "Initialized bounded repository context and task state", selectedFiles: ["packages/shared/src/index.ts"] },
  });

  store.updateRunStatus(run.id, "planning");
  workspace.focus({ activeSubgoal: "Plan the next repository action", selectedItemIds: ["workspace-goal", "mock-sandbox-workspace-item", "mock-codex-contract-workspace-item"] });
  workspace.createContextPacket();
  store.appendEvent(run.id, {
    type: "policy_checked",
    actor: policy,
    payload: { summary: "Checked protected paths and command policy before any action" },
    safety: {
      policyMode: "safe",
      riskLevel: "low",
      approvalRequired: false,
      protectedPathTouched: false,
      commandAllowed: true,
      reasons: ["read-only inspection and mock events only"],
    },
  });
  const installDecision = policyEngine.evaluateAction(
    {
      id: "dependency-install",
      kind: "command",
      summary: "Install dependencies",
      command: "pnpm install",
    },
    corePolicy,
  );
  appendPolicyDecisionEvent(store, run.id, corePolicy, installDecision, policy);
  const destructiveDecision = policyEngine.evaluateAction(
    {
      id: "destructive-command",
      kind: "command",
      summary: "Delete files recursively",
      command: "rm -rf .",
    },
    corePolicy,
  );
  appendPolicyDecisionEvent(store, run.id, corePolicy, destructiveDecision, policy);
  if (destructiveDecision.violations[0]) {
    store.appendEvent(run.id, policyViolationToRunEvent(corePolicy, destructiveDecision.violations[0], policy));
  }
  store.appendEvent(run.id, {
    type: "action_proposed",
    actor: runtime,
    payload: {
      summary: "Proposed applying a narrow repository fix after tests identify the failing unit",
      actionId: "mock-action-1",
    },
  });
  store.appendEvent(run.id, {
    type: "action_blocked_or_approved",
    actor: policy,
    payload: { summary: "Approved mock action; no protected paths or sensitive values involved", actionId: "mock-action-1" },
    safety: {
      policyMode: "safe",
      riskLevel: "low",
      approvalRequired: false,
      protectedPathTouched: false,
      commandAllowed: true,
      reasons: ["mock-only action"],
    },
  });

  store.updateRunStatus(run.id, "verifying");
  governor.checkBeforeOperation(run.id, "run_verifier", { toolSteps: 8, commandCount: 2, verificationCommandCount: 1, estimatedModelTokens: 2_000 });
  const validationArtifacts: ArtifactRef[] = [
    {
      id: "mock-verification-result",
      kind: "validation_report",
      uri: `codepawl-artifact://${run.id}/verification-result.json`,
      label: "Verification result",
      sha256: "mock-verification-result-sha256",
    },
  ];
  store.appendEvent(run.id, {
    type: "verification_planned",
    actor: verifier,
    payload: {
      summary: "Planned deterministic repository verification",
      commands: ["pnpm test:contracts"],
    },
  });
  store.appendEvent(run.id, {
    type: "verification_policy_checked",
    actor: verifier,
    payload: {
      summary: "Verified validation commands against CorePolicy allowlist",
      allowedCommands: ["pnpm test:contracts"],
      blockedCommands: [],
    },
    safety: {
      policyMode: "safe",
      riskLevel: "low",
      approvalRequired: false,
      protectedPathTouched: false,
      commandAllowed: true,
      reasons: ["validation command is allowlisted"],
    },
  });
  store.appendEvent(run.id, {
    type: "verification_started",
    actor: verifier,
    payload: { summary: "Started deterministic verifier for sandbox worktree" },
  });
  store.appendEvent(run.id, {
    type: "verification_command_started",
    actor: verifier,
    payload: { summary: "Started verification command: pnpm test:contracts", command: "pnpm test:contracts" },
  });
  store.appendEvent(run.id, {
    type: "verification_command_finished",
    actor: verifier,
    payload: { summary: "Finished verification command: pnpm test:contracts", exitCode: 0, durationMs: 180 },
  });
  store.appendEvent(run.id, {
    type: "verification_diff_checked",
    actor: verifier,
    payload: {
      summary: "Checked diff scope for protected and unexpected paths",
      diffScope: {
        changedFiles: ["packages/shared/src/index.ts"],
        protectedFiles: [],
        unexpectedFiles: [],
        withinAllowedScope: true,
      },
    },
  });
  store.appendEvent(run.id, {
    type: "verification_recorded",
    actor: verifier,
    payload: { summary: "Recorded deterministic validation evidence for the repository run" },
    artifacts: validationArtifacts,
    verdict: {
      status: "pass",
      reason: "Policy-allowed validation and diff scope checks passed",
      confidence: 1,
    },
  });
  workspace.addItem({
    id: "mock-verifier-result-workspace-item",
    kind: "verifier_result",
    title: "Verifier result",
    summary: "Policy-allowed validation and diff scope checks passed.",
    priority: 95,
    tags: ["verifier", "evidence"],
    artifactRefs: validationArtifacts,
  });
  store.appendEvent(run.id, {
    type: "verification_passed",
    actor: verifier,
    payload: { summary: "Verification passed with machine-readable evidence" },
  });
  store.appendEvent(run.id, {
    type: "budget_recorded",
    actor: budget,
    payload: { summary: "Recorded budget usage for the mock run" },
    budget: {
      stepCount: 13,
      elapsedMs: 1400,
      modelTokens: 0,
      estimatedUsd: 0,
      remainingSteps: 27,
      remainingModelTokens: 120_000,
      exceeded: false,
    },
  });

  const memoryArtifacts: ArtifactRef[] = [
    {
      id: "mock-memory-episode",
      kind: "memory_episode",
      uri: `codepawl-artifact://${run.id}/memory/memory-store.json#episode`,
      label: "Episodic memory item",
      sha256: "mock-memory-episode-sha256",
    },
    {
      id: "mock-candidate-rule",
      kind: "candidate_rule",
      uri: `codepawl-artifact://${run.id}/memory/memory-store.json#candidate-rule`,
      label: "Candidate project rule",
      sha256: "mock-candidate-rule-sha256",
    },
  ];
  store.updateRunStatus(run.id, "learning");
  store.appendEvent(run.id, {
    type: "memory_extraction_started",
    actor: runtime,
    payload: {
      summary: "Memory extraction started from redacted verifier and import evidence",
    },
  });
  store.appendEvent(run.id, {
    type: "memory_episode_written",
    actor: runtime,
    payload: {
      summary: "Wrote successful run episode memory with verifier provenance",
      kind: "run_episode",
    },
    artifacts: [memoryArtifacts[0]],
  });
  store.appendEvent(run.id, {
    type: "candidate_rule_proposed",
    actor: runtime,
    payload: {
      summary: "Candidate rule proposed from verified package-only change",
      status: "candidate",
    },
    artifacts: [memoryArtifacts[1]],
  });
  store.appendEvent(run.id, {
    type: "memory_extraction_finished",
    actor: runtime,
    payload: {
      summary: "Memory extraction finished with candidate-only learning output",
      episodeCount: 1,
      candidateRuleCount: 1,
    },
  });

  store.updateRunStatus(run.id, "completed");
  store.appendEvent(run.id, {
    type: "run_finished",
    actor: runtime,
    payload: { summary: "Mock repository run finished with verifier evidence" },
    verdict: {
      status: "pass",
      reason: "Run finished only after verifier evidence was recorded",
      confidence: 1,
    },
  });

  return {
    run: store.getRun(run.id) ?? run,
    events: store.listEvents(run.id),
    summary: store.summarizeRun(run.id),
    store,
  };
}
