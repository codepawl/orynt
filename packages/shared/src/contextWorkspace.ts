import type {
  Actor,
  ArtifactRef,
  BudgetSnapshot,
  RedactionMetadata,
  RunBudget,
  RunEvent,
  RunStore,
  SafetySnapshot,
} from "./runSpine";
import type { CorePolicy, RepositoryInspection, RepositorySandbox } from "./corePolicy";
import type { CodexContract } from "./codexContracts";
import type { VerificationPlan, VerificationResult } from "./verifierContracts";

export type WorkspaceItemKind =
  | "goal"
  | "repository"
  | "sandbox"
  | "policy"
  | "codex_contract"
  | "verifier_plan"
  | "verifier_result"
  | "constraint"
  | "artifact"
  | "run_event"
  | "summary";

export type WorkspaceConstraint = {
  id: string;
  description: string;
  source: "user" | "policy" | "runtime" | "verifier";
  priority: "required" | "preferred";
};

export type WorkspaceArtifact = {
  ref: ArtifactRef;
  summary: string;
};

export type WorkspaceItem = {
  id: string;
  kind: WorkspaceItemKind;
  title: string;
  summary: string;
  priority: number;
  tags: string[];
  createdAt: string;
  estimatedTokens: number;
  redaction: RedactionMetadata;
  artifactRefs: ArtifactRef[];
};

export type WorkspaceFocus = {
  activeGoal: string;
  activeSubgoal?: string;
  selectedItemIds: string[];
  riskLevel: SafetySnapshot["riskLevel"];
};

export type WorkspaceSnapshot = {
  id: string;
  runId: string;
  taskId: string;
  goal: string;
  focus: WorkspaceFocus;
  constraints: WorkspaceConstraint[];
  items: WorkspaceItem[];
  artifacts: WorkspaceArtifact[];
  recentEvents: RunEvent[];
  tokenEstimate: number;
  capacity: {
    maxItems: number;
    maxRecentEvents: number;
    maxContextTokens: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type ContextPacket = {
  id: string;
  workspaceId: string;
  runId: string;
  taskId: string;
  goal: string;
  focus: WorkspaceFocus;
  constraints: WorkspaceConstraint[];
  items: Array<Pick<WorkspaceItem, "id" | "kind" | "title" | "summary" | "tags" | "estimatedTokens">>;
  artifacts: WorkspaceArtifact[];
  tokenEstimate: number;
  provenanceItemIds: string[];
  createdAt: string;
};

export type ContextWorkspaceConfig = {
  maxItems: number;
  maxRecentEvents: number;
  maxContextTokens: number;
};

export type ContextWorkspaceInitializeInput = {
  runId: string;
  taskId: string;
  goal: string;
  repository?: RepositoryInspection;
  sandbox?: RepositorySandbox;
  policy?: CorePolicy;
  codexContract?: CodexContract;
  verificationPlan?: VerificationPlan;
  verificationResult?: VerificationResult;
  constraints?: WorkspaceConstraint[];
  artifacts?: WorkspaceArtifact[];
  recentEvents?: RunEvent[];
};

export interface ContextWorkspace {
  initialize(input: ContextWorkspaceInitializeInput): WorkspaceSnapshot;
  addItem(item: Omit<WorkspaceItem, "createdAt" | "estimatedTokens" | "redaction"> & { createdAt?: string }): WorkspaceSnapshot;
  focus(focus: Partial<WorkspaceFocus>): WorkspaceSnapshot;
  summarize(): string;
  createContextPacket(): ContextPacket;
  redact(value: string): { value: string; redaction: RedactionMetadata };
}

export type ResourceStopReason =
  | "step_limit"
  | "wall_time_limit"
  | "token_limit"
  | "command_limit"
  | "file_change_limit"
  | "artifact_limit"
  | "verification_command_limit"
  | "risk_limit"
  | "budget_exceeded";

export type ResourceLimit = {
  id: ResourceStopReason;
  label: string;
  limit: number;
  warningAt: number;
};

export type ResourceUsage = {
  startedAt: string;
  updatedAt: string;
  elapsedMs: number;
  toolSteps: number;
  commandCount: number;
  fileChangeCount: number;
  artifactCount: number;
  verificationCommandCount: number;
  estimatedModelTokens: number;
  riskLevel: SafetySnapshot["riskLevel"];
  estimatedUsd: number;
};

export type ResourceBudget = {
  runId: string;
  limits: ResourceLimit[];
  usage: ResourceUsage;
  stopOnBudgetExceeded: boolean;
};

export type ResourceDecision = {
  id: string;
  runId: string;
  operation: string;
  decision: "allow" | "warn" | "stop";
  reasons: string[];
  stopReason?: ResourceStopReason;
  usage: ResourceUsage;
  checkedAt: string;
};

export type GovernorConfig = {
  warningThreshold: number;
  maxSteps: number;
  maxWallTimeMs: number;
  maxModelTokens: number;
  maxCommands: number;
  maxChangedFiles: number;
  maxArtifacts: number;
  maxVerificationCommands: number;
  stopOnHighRisk: boolean;
};

export interface ResourceGovernor {
  initializeBudget(runId: string, budget?: Partial<ResourceBudget>): ResourceBudget;
  recordUsage(runId: string, usage: Partial<ResourceUsage>): ResourceUsage;
  checkBeforeOperation(runId: string, operation: string, estimatedUsage?: Partial<ResourceUsage>): ResourceDecision;
  shouldStop(runId: string): boolean;
  summarizeBudget(runId: string): string;
  explainDecision(decision: ResourceDecision): string;
}

const DEFAULT_WORKSPACE_CONFIG: ContextWorkspaceConfig = {
  maxItems: 40,
  maxRecentEvents: 12,
  maxContextTokens: 8_000,
};

const DEFAULT_GOVERNOR_CONFIG: GovernorConfig = {
  warningThreshold: 0.8,
  maxSteps: 40,
  maxWallTimeMs: 30 * 60 * 1000,
  maxModelTokens: 120_000,
  maxCommands: 20,
  maxChangedFiles: 12,
  maxArtifacts: 40,
  maxVerificationCommands: 8,
  stopOnHighRisk: true,
};

const WORKSPACE_ACTOR: Actor = { kind: "runtime", id: "context-workspace", displayName: "Context Workspace" };
const GOVERNOR_ACTOR: Actor = { kind: "budget", id: "resource-governor", displayName: "Resource Governor" };
const SENSITIVE_KEY_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential|raw[-_\s]?value|form[-_\s]?value)\b/i;
const KEY_VALUE_SECRET_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential|raw[-_\s]?value|form[-_\s]?value)\b\s*[:=]\s*[^\s,;]+/gi;
const SECRET_VALUE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/g;

function now() {
  return new Date().toISOString();
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function createRedaction(applied: boolean): RedactionMetadata {
  return { applied, redactedPaths: applied ? ["summary"] : [] };
}

function redactString(value: string): { value: string; redaction: RedactionMetadata } {
  let applied = false;
  const next = value
    .replace(KEY_VALUE_SECRET_PATTERN, (_match, key) => {
      applied = true;
      return `${key}: [REDACTED]`;
    })
    .replace(SECRET_VALUE_PATTERN, () => {
      applied = true;
      return "[REDACTED]";
    });
  if (SENSITIVE_KEY_PATTERN.test(value) && next === value) {
    return { value: "[REDACTED]", redaction: createRedaction(true) };
  }
  return { value: next, redaction: createRedaction(applied) };
}

function clone<T>(value: T): T {
  return typeof globalThis.structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function item(id: string, kind: WorkspaceItemKind, title: string, summary: string, priority: number, tags: string[], artifacts: ArtifactRef[] = []): WorkspaceItem {
  const redacted = redactString(summary);
  return {
    id,
    kind,
    title,
    summary: redacted.value,
    priority,
    tags,
    createdAt: now(),
    estimatedTokens: estimateTokens(`${title}\n${redacted.value}`),
    redaction: redacted.redaction,
    artifactRefs: artifacts,
  };
}

function budgetSnapshot(usage: ResourceUsage, config: GovernorConfig): BudgetSnapshot {
  return {
    stepCount: usage.toolSteps,
    elapsedMs: usage.elapsedMs,
    modelTokens: usage.estimatedModelTokens,
    estimatedUsd: usage.estimatedUsd,
    remainingSteps: Math.max(0, config.maxSteps - usage.toolSteps),
    remainingModelTokens: Math.max(0, config.maxModelTokens - usage.estimatedModelTokens),
    exceeded:
      usage.toolSteps >= config.maxSteps ||
      usage.elapsedMs >= config.maxWallTimeMs ||
      usage.estimatedModelTokens >= config.maxModelTokens,
  };
}

function limit(id: ResourceStopReason, label: string, value: number, warningThreshold: number): ResourceLimit {
  return { id, label, limit: value, warningAt: Math.floor(value * warningThreshold) };
}

export function createDefaultGovernorConfig(): GovernorConfig {
  return { ...DEFAULT_GOVERNOR_CONFIG };
}

export function createConservativeCodingApprenticeBudget(runBudget: RunBudget, config = DEFAULT_GOVERNOR_CONFIG): ResourceBudget {
  const startedAt = now();
  return {
    runId: "",
    stopOnBudgetExceeded: runBudget.stopOnBudgetExceeded,
    limits: [
      limit("step_limit", "Tool steps", runBudget.maxSteps || config.maxSteps, config.warningThreshold),
      limit("wall_time_limit", "Wall time", runBudget.maxWallTimeMs || config.maxWallTimeMs, config.warningThreshold),
      limit("token_limit", "Model tokens", runBudget.maxModelTokens || config.maxModelTokens, config.warningThreshold),
      limit("command_limit", "Commands", config.maxCommands, config.warningThreshold),
      limit("file_change_limit", "Changed files", config.maxChangedFiles, config.warningThreshold),
      limit("artifact_limit", "Artifacts", config.maxArtifacts, config.warningThreshold),
      limit("verification_command_limit", "Verification commands", config.maxVerificationCommands, config.warningThreshold),
    ],
    usage: {
      startedAt,
      updatedAt: startedAt,
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
  };
}

export class BoundedContextWorkspace implements ContextWorkspace {
  private snapshot?: WorkspaceSnapshot;
  private readonly config: ContextWorkspaceConfig;
  private readonly runStore?: RunStore;
  private readonly actor: Actor;

  constructor(options: { config?: Partial<ContextWorkspaceConfig>; runStore?: RunStore; actor?: Actor } = {}) {
    this.config = { ...DEFAULT_WORKSPACE_CONFIG, ...options.config };
    this.runStore = options.runStore;
    this.actor = options.actor ?? WORKSPACE_ACTOR;
  }

  initialize(input: ContextWorkspaceInitializeInput): WorkspaceSnapshot {
    const items: WorkspaceItem[] = [item("workspace-goal", "goal", "Goal", input.goal, 100, ["goal"])];
    if (input.repository) {
      items.push(item("workspace-repository", "repository", "Repository", `${input.repository.gitRoot} at ${input.repository.currentCommit}`, 80, ["repository"]));
    }
    if (input.sandbox) {
      items.push(item("workspace-sandbox", "sandbox", "Sandbox", `Worktree ${input.sandbox.worktreePath} on ${input.sandbox.branchName}`, 90, ["sandbox"]));
    }
    if (input.policy) {
      items.push(item("workspace-policy", "policy", "Policy", `Mode ${input.policy.permissionMode}; allowed paths ${input.policy.sandbox.repository.allowedPaths.join(", ")}`, 85, ["policy"]));
    }
    if (input.codexContract) {
      items.push(item("workspace-codex-contract", "codex_contract", "Codex contract", input.codexContract.goal, 70, ["codex"]));
    }
    if (input.verificationPlan) {
      items.push(item("workspace-verifier-plan", "verifier_plan", "Verifier plan", `${input.verificationPlan.commands.length} validation commands planned`, 60, ["verifier"]));
    }
    if (input.verificationResult) {
      items.push(item("workspace-verifier-result", "verifier_result", "Verifier result", input.verificationResult.verdict.reason, 95, ["verifier"]));
    }
    const createdAt = now();
    this.snapshot = this.bound({
      id: `workspace-${input.runId}`,
      runId: input.runId,
      taskId: input.taskId,
      goal: redactString(input.goal).value,
      focus: {
        activeGoal: redactString(input.goal).value,
        selectedItemIds: [],
        riskLevel: "low",
      },
      constraints: input.constraints ?? [],
      items,
      artifacts: input.artifacts ?? [],
      recentEvents: [...(input.recentEvents ?? [])].slice(-this.config.maxRecentEvents),
      tokenEstimate: 0,
      capacity: this.config,
      createdAt,
      updatedAt: createdAt,
    });
    this.runStore?.appendEvent(input.runId, {
      type: "workspace_initialized",
      actor: this.actor,
      payload: { summary: "Initialized bounded ContextWorkspace", workspace: this.snapshot },
    });
    return clone(this.snapshot);
  }

  addItem(input: Omit<WorkspaceItem, "createdAt" | "estimatedTokens" | "redaction"> & { createdAt?: string }): WorkspaceSnapshot {
    const snapshot = this.requireSnapshot();
    const redacted = redactString(input.summary);
    snapshot.items.push({
      ...input,
      summary: redacted.value,
      createdAt: input.createdAt ?? now(),
      estimatedTokens: estimateTokens(`${input.title}\n${redacted.value}`),
      redaction: redacted.redaction,
    });
    this.snapshot = this.bound({ ...snapshot, updatedAt: now() });
    this.runStore?.appendEvent(snapshot.runId, {
      type: "workspace_item_added",
      actor: this.actor,
      payload: { summary: `Added workspace item: ${input.title}`, itemId: input.id, kind: input.kind },
    });
    return clone(this.snapshot);
  }

  focus(focus: Partial<WorkspaceFocus>): WorkspaceSnapshot {
    const snapshot = this.requireSnapshot();
    this.snapshot = this.bound({
      ...snapshot,
      focus: { ...snapshot.focus, ...focus },
      updatedAt: now(),
    });
    return clone(this.snapshot);
  }

  summarize(): string {
    const snapshot = this.requireSnapshot();
    return `${snapshot.goal} | ${snapshot.items.length} bounded items | ${snapshot.tokenEstimate} estimated tokens`;
  }

  createContextPacket(): ContextPacket {
    const snapshot = this.requireSnapshot();
    const selected = snapshot.focus.selectedItemIds.length > 0
      ? snapshot.items.filter((workspaceItem) => snapshot.focus.selectedItemIds.includes(workspaceItem.id))
      : snapshot.items;
    const boundedItems: ContextPacket["items"] = [];
    let tokenEstimate = estimateTokens(snapshot.goal);
    for (const workspaceItem of selected.sort((first, second) => second.priority - first.priority)) {
      if (tokenEstimate + workspaceItem.estimatedTokens > this.config.maxContextTokens) {
        continue;
      }
      tokenEstimate += workspaceItem.estimatedTokens;
      boundedItems.push({
        id: workspaceItem.id,
        kind: workspaceItem.kind,
        title: workspaceItem.title,
        summary: workspaceItem.summary,
        tags: workspaceItem.tags,
        estimatedTokens: workspaceItem.estimatedTokens,
      });
    }
    const packet: ContextPacket = {
      id: `context-packet-${snapshot.runId}-${Date.now()}`,
      workspaceId: snapshot.id,
      runId: snapshot.runId,
      taskId: snapshot.taskId,
      goal: snapshot.goal,
      focus: clone(snapshot.focus),
      constraints: clone(snapshot.constraints),
      items: boundedItems,
      artifacts: clone(snapshot.artifacts),
      tokenEstimate,
      provenanceItemIds: boundedItems.map((workspaceItem) => workspaceItem.id),
      createdAt: now(),
    };
    this.runStore?.appendEvent(snapshot.runId, {
      type: "context_packet_created",
      actor: this.actor,
      payload: { summary: "Created bounded ContextPacket", packet },
    });
    return packet;
  }

  redact(value: string): { value: string; redaction: RedactionMetadata } {
    return redactString(value);
  }

  private requireSnapshot(): WorkspaceSnapshot {
    if (!this.snapshot) {
      throw new Error("ContextWorkspace has not been initialized.");
    }
    return clone(this.snapshot);
  }

  private bound(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
    const items = [...snapshot.items]
      .sort((first, second) => second.priority - first.priority || first.createdAt.localeCompare(second.createdAt))
      .slice(0, this.config.maxItems);
    return {
      ...snapshot,
      items,
      recentEvents: [...snapshot.recentEvents].slice(-this.config.maxRecentEvents),
      tokenEstimate: items.reduce((total, workspaceItem) => total + workspaceItem.estimatedTokens, estimateTokens(snapshot.goal)),
    };
  }
}

export class ConservativeResourceGovernor implements ResourceGovernor {
  private readonly budgets = new Map<string, ResourceBudget>();
  private readonly config: GovernorConfig;
  private readonly runStore?: RunStore;
  private readonly actor: Actor;

  constructor(options: { config?: Partial<GovernorConfig>; runStore?: RunStore; actor?: Actor } = {}) {
    this.config = { ...DEFAULT_GOVERNOR_CONFIG, ...options.config };
    this.runStore = options.runStore;
    this.actor = options.actor ?? GOVERNOR_ACTOR;
  }

  initializeBudget(runId: string, budget?: Partial<ResourceBudget>): ResourceBudget {
    const base = budget ? { ...this.defaultBudget(runId), ...budget, runId } : this.defaultBudget(runId);
    this.budgets.set(runId, clone(base));
    this.runStore?.appendEvent(runId, {
      type: "budget_initialized",
      actor: this.actor,
      payload: { summary: "Initialized ResourceGovernor budget", budget: base },
      budget: budgetSnapshot(base.usage, this.config),
    });
    return clone(base);
  }

  recordUsage(runId: string, usage: Partial<ResourceUsage>): ResourceUsage {
    const budget = this.requireBudget(runId);
    budget.usage = {
      ...budget.usage,
      ...usage,
      updatedAt: now(),
      elapsedMs: usage.elapsedMs ?? Date.now() - Date.parse(budget.usage.startedAt),
    };
    this.budgets.set(runId, budget);
    const decision = this.createDecision(runId, "record_usage", budget.usage);
    this.runStore?.appendEvent(runId, {
      type: "budget_recorded",
      actor: this.actor,
      payload: { summary: "Recorded resource usage", usage: budget.usage },
      budget: budgetSnapshot(budget.usage, this.config),
    });
    if (decision.decision === "warn") {
      this.runStore?.appendEvent(runId, {
        type: "budget_warning",
        actor: this.actor,
        payload: { summary: this.explainDecision(decision), decision },
        budget: budgetSnapshot(budget.usage, this.config),
      });
    }
    if (decision.decision === "stop") {
      this.runStore?.appendEvent(runId, {
        type: "budget_exceeded",
        actor: this.actor,
        payload: { summary: this.explainDecision(decision), decision },
        budget: budgetSnapshot(budget.usage, this.config),
      });
    }
    return clone(budget.usage);
  }

  checkBeforeOperation(runId: string, operation: string, estimatedUsage: Partial<ResourceUsage> = {}): ResourceDecision {
    const budget = this.requireBudget(runId);
    const usage = { ...budget.usage, ...estimatedUsage };
    const decision = this.createDecision(runId, operation, usage);
    this.runStore?.appendEvent(runId, {
      type: "budget_checked",
      actor: this.actor,
      payload: { summary: this.explainDecision(decision), decision },
      budget: budgetSnapshot(usage, this.config),
    });
    if (decision.decision === "warn") {
      this.runStore?.appendEvent(runId, {
        type: "budget_warning",
        actor: this.actor,
        payload: { summary: this.explainDecision(decision), decision },
        budget: budgetSnapshot(usage, this.config),
      });
    }
    if (decision.decision === "stop") {
      this.runStore?.appendEvent(runId, {
        type: "budget_stop_requested",
        actor: this.actor,
        payload: { summary: this.explainDecision(decision), decision },
        budget: budgetSnapshot(usage, this.config),
      });
    }
    return decision;
  }

  shouldStop(runId: string): boolean {
    return Boolean(this.stopReasonFor(this.requireBudget(runId).usage));
  }

  summarizeBudget(runId: string): string {
    const budget = this.requireBudget(runId);
    return `${budget.usage.toolSteps}/${this.config.maxSteps} steps, ${budget.usage.estimatedModelTokens}/${this.config.maxModelTokens} model tokens, ${budget.usage.commandCount}/${this.config.maxCommands} commands`;
  }

  explainDecision(decision: ResourceDecision): string {
    const prefix = decision.decision === "allow" ? "Allowed" : decision.decision === "warn" ? "Warning" : "Stop requested";
    return `${prefix}: ${decision.reasons.join(" ")}`;
  }

  private defaultBudget(runId: string): ResourceBudget {
    const budget = createConservativeCodingApprenticeBudget(
      {
        maxSteps: this.config.maxSteps,
        maxWallTimeMs: this.config.maxWallTimeMs,
        maxModelTokens: this.config.maxModelTokens,
        stopOnBudgetExceeded: true,
      },
      this.config,
    );
    return { ...budget, runId };
  }

  private requireBudget(runId: string): ResourceBudget {
    const budget = this.budgets.get(runId);
    if (!budget) {
      throw new Error(`resource budget not initialized: ${runId}`);
    }
    return clone(budget);
  }

  private createDecision(runId: string, operation: string, usage: ResourceUsage): ResourceDecision {
    const stopReason = this.stopReasonFor(usage);
    const warningReason = this.warningReasonFor(usage);
    return {
      id: `resource-decision-${runId}-${operation}-${Date.now()}`,
      runId,
      operation,
      decision: stopReason ? "stop" : warningReason ? "warn" : "allow",
      reasons: stopReason ? [`Exceeded ${stopReason}.`] : warningReason ? [`Approaching ${warningReason}.`] : ["Budget is within conservative limits."],
      stopReason,
      usage: clone(usage),
      checkedAt: now(),
    };
  }

  private warningReasonFor(usage: ResourceUsage): ResourceStopReason | undefined {
    if (usage.toolSteps >= this.config.maxSteps * this.config.warningThreshold) return "step_limit";
    if (usage.elapsedMs >= this.config.maxWallTimeMs * this.config.warningThreshold) return "wall_time_limit";
    if (usage.estimatedModelTokens >= this.config.maxModelTokens * this.config.warningThreshold) return "token_limit";
    if (usage.commandCount >= this.config.maxCommands * this.config.warningThreshold) return "command_limit";
    if (usage.fileChangeCount >= this.config.maxChangedFiles * this.config.warningThreshold) return "file_change_limit";
    if (usage.artifactCount >= this.config.maxArtifacts * this.config.warningThreshold) return "artifact_limit";
    if (usage.verificationCommandCount >= this.config.maxVerificationCommands * this.config.warningThreshold) return "verification_command_limit";
    return undefined;
  }

  private stopReasonFor(usage: ResourceUsage): ResourceStopReason | undefined {
    if (usage.toolSteps >= this.config.maxSteps) return "step_limit";
    if (usage.elapsedMs >= this.config.maxWallTimeMs) return "wall_time_limit";
    if (usage.estimatedModelTokens >= this.config.maxModelTokens) return "token_limit";
    if (usage.commandCount >= this.config.maxCommands) return "command_limit";
    if (usage.fileChangeCount >= this.config.maxChangedFiles) return "file_change_limit";
    if (usage.artifactCount >= this.config.maxArtifacts) return "artifact_limit";
    if (usage.verificationCommandCount >= this.config.maxVerificationCommands) return "verification_command_limit";
    if (this.config.stopOnHighRisk && (usage.riskLevel === "high" || usage.riskLevel === "blocked")) return "risk_limit";
    return undefined;
  }
}
