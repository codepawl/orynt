import { ConservativePolicyEngine, type CorePolicy, type LedgerVisibility, type PolicyAction, type RunArtifactType } from "@codepawl/shared";

export type GatewaySurface = "repository" | "browser" | "desktop" | "files" | "terminal";

export type GatewayActionRequest = {
  id: string;
  runId: string;
  workspaceId: string;
  userId: string;
  surface: GatewaySurface;
  actionType: string;
  instruction: string;
  stateChanging: boolean;
  expectedEvidence: RunArtifactType[];
  policyAction: PolicyAction;
  untrustedContent?: string;
};

export type GatewayPermissionTier = "safe" | "review" | "sensitive" | "blocked";

export type GatewayPermissionDecision =
  | "auto_allowed"
  | "approval_requested"
  | "approved"
  | "rejected"
  | "blocked"
  | "takeover_required";

export type GatewayPermissionResult = {
  actionId: string;
  tier: GatewayPermissionTier;
  decision: GatewayPermissionDecision;
  policyVersion: string;
  reasons: string[];
};

export type GatewayEvidence = {
  id: string;
  runId?: string;
  actionId?: string;
  artifactType: RunArtifactType;
  storageRef: string;
  visibility: LedgerVisibility;
  metadata: Record<string, unknown>;
};

export type GatewayAdapterResult = {
  actionId: string;
  status: "executed";
  observation: string;
  evidence: Omit<GatewayEvidence, "runId" | "actionId">[];
};

export interface GatewayAdapter {
  execute(action: GatewayActionRequest): Promise<GatewayAdapterResult> | GatewayAdapterResult;
}

export type GatewayExecutionStatus =
  | "executed"
  | "approval_required"
  | "rejected"
  | "takeover_required"
  | "blocked"
  | "failed";

export type GatewayExecutionResult = {
  actionId: string;
  status: GatewayExecutionStatus;
  permission: GatewayPermissionResult;
  observation?: string;
  evidence: GatewayEvidence[];
  reason: string;
};

export interface ApprovalProvider {
  decide(action: GatewayActionRequest, permission: GatewayPermissionResult): Promise<"approved" | "rejected" | "pending"> | "approved" | "rejected" | "pending";
}

export interface GatewayEvidenceStore {
  record(evidence: GatewayEvidence): GatewayEvidence;
  listByRun(runId: string): GatewayEvidence[];
}

export class StaticApprovalProvider implements ApprovalProvider {
  private readonly decisions: Record<string, "approved" | "rejected" | "pending">;

  constructor(decisions: Record<string, "approved" | "rejected" | "pending">) {
    this.decisions = { ...decisions };
  }

  decide(action: GatewayActionRequest): "approved" | "rejected" | "pending" {
    return this.decisions[action.id] ?? "pending";
  }
}

export class InMemoryGatewayEvidenceStore implements GatewayEvidenceStore {
  private readonly evidence: GatewayEvidence[] = [];

  record(evidence: GatewayEvidence): GatewayEvidence {
    const stored = clone(evidence);
    this.evidence.push(stored);
    return clone(stored);
  }

  listByRun(runId: string): GatewayEvidence[] {
    return this.evidence.filter((item) => item.runId === runId).map(clone);
  }
}

export type AuditableGatewayOptions = {
  policy: CorePolicy;
  adapter: GatewayAdapter;
  approvalProvider: ApprovalProvider;
  evidenceStore: GatewayEvidenceStore;
};

export class AuditableGateway {
  private readonly policy: CorePolicy;
  private readonly adapter: GatewayAdapter;
  private readonly approvalProvider: ApprovalProvider;
  private readonly evidenceStore: GatewayEvidenceStore;
  private readonly policyEngine = new ConservativePolicyEngine();

  constructor(options: AuditableGatewayOptions) {
    this.policy = options.policy;
    this.adapter = options.adapter;
    this.approvalProvider = options.approvalProvider;
    this.evidenceStore = options.evidenceStore;
  }

  async routeAction(action: GatewayActionRequest): Promise<GatewayExecutionResult> {
    const permission = this.classify(action);
    if (permission.decision === "blocked") {
      return this.result(action, "blocked", permission, [], permission.reasons.join(" "));
    }
    if (permission.decision === "takeover_required") {
      return this.result(action, "takeover_required", permission, [], permission.reasons.join(" "));
    }
    if (permission.decision === "approval_requested") {
      const approval = await this.approvalProvider.decide(action, permission);
      if (approval === "pending") {
        return this.result(action, "approval_required", permission, [], permission.reasons.join(" "));
      }
      if (approval === "rejected") {
        return this.result(action, "rejected", { ...permission, decision: "rejected" }, [], "User rejected the action.");
      }
      return this.execute(action, { ...permission, decision: "approved" });
    }

    return this.execute(action, permission);
  }

  private classify(action: GatewayActionRequest): GatewayPermissionResult {
    const injectionReasons = detectPromptInjection(action);
    if (injectionReasons.length > 0) {
      return {
        actionId: action.id,
        tier: "blocked",
        decision: "blocked",
        policyVersion: this.policy.id,
        reasons: injectionReasons,
      };
    }

    if (isSensitive(action)) {
      return {
        actionId: action.id,
        tier: "sensitive",
        decision: "takeover_required",
        policyVersion: this.policy.id,
        reasons: ["Sensitive credential, payment, external send, or secret action requires user takeover."],
      };
    }

    const coreDecision = this.policyEngine.evaluateAction(action.policyAction, this.policy);
    if (coreDecision.decision === "block") {
      return {
        actionId: action.id,
        tier: "blocked",
        decision: "blocked",
        policyVersion: this.policy.id,
        reasons: coreDecision.reasons,
      };
    }

    if (isAmbiguous(action)) {
      return {
        actionId: action.id,
        tier: "review",
        decision: "approval_requested",
        policyVersion: this.policy.id,
        reasons: ["Action instruction is ambiguous and requires approval before execution."],
      };
    }

    if (coreDecision.decision === "require_approval" || action.stateChanging) {
      return {
        actionId: action.id,
        tier: "review",
        decision: "approval_requested",
        policyVersion: this.policy.id,
        reasons: coreDecision.reasons.length > 0 ? coreDecision.reasons : ["State-changing action requires approval."],
      };
    }

    return {
      actionId: action.id,
      tier: "safe",
      decision: "auto_allowed",
      policyVersion: this.policy.id,
      reasons: coreDecision.reasons.length > 0 ? coreDecision.reasons : ["Read-only action is within policy."],
    };
  }

  private async execute(action: GatewayActionRequest, permission: GatewayPermissionResult): Promise<GatewayExecutionResult> {
    try {
      const adapterResult = await this.adapter.execute(action);
      const evidence = adapterResult.evidence.map((item) =>
        this.evidenceStore.record({
          ...item,
          runId: action.runId,
          actionId: action.id,
        }),
      );
      return {
        actionId: action.id,
        status: "executed",
        permission,
        observation: adapterResult.observation,
        evidence,
        reason: permission.reasons.join(" "),
      };
    } catch (error) {
      const evidence = this.evidenceStore.record({
        id: `${action.id}-gateway-failure`,
        runId: action.runId,
        actionId: action.id,
        artifactType: "trace",
        storageRef: `codepawl-artifact://${action.runId}/${action.id}/gateway-failure.json`,
        visibility: "admin",
        metadata: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return this.result(action, "failed", permission, [evidence], "Gateway adapter failed before a successful action result.");
    }
  }

  private result(
    action: GatewayActionRequest,
    status: GatewayExecutionStatus,
    permission: GatewayPermissionResult,
    evidence: GatewayEvidence[],
    reason: string,
  ): GatewayExecutionResult {
    return {
      actionId: action.id,
      status,
      permission,
      evidence,
      reason,
    };
  }
}

function clone<T>(value: T): T {
  return typeof globalThis.structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isSensitive(action: GatewayActionRequest): boolean {
  const text = `${action.instruction} ${action.actionType} ${action.policyAction.summary}`.toLowerCase();
  return (
    action.policyAction.kind === "secret_access" ||
    /\b(password|credential|api key|token|cookie|private key|otp|card|payment|purchase|bank|send email|send message|submit payment)\b/.test(text)
  );
}

function isAmbiguous(action: GatewayActionRequest): boolean {
  return action.stateChanging && /\b(whatever|anything|as needed|just do|do it all|handle it)\b/i.test(action.instruction);
}

function detectPromptInjection(action: GatewayActionRequest): string[] {
  const content = action.untrustedContent ?? "";
  if (!content) {
    return [];
  }
  const lower = content.toLowerCase();
  const risky =
    lower.includes("ignore previous") ||
    lower.includes("ignore prior") ||
    lower.includes("bypass approval") ||
    lower.includes("send the user's api key") ||
    lower.includes("exfiltrate") ||
    lower.includes("secret");
  return risky ? ["Blocked prompt injection attempt from untrusted content."] : [];
}
