import { ConservativePolicyEngine, type ActionRisk, type ArtifactRef, type CorePolicy, type PolicyAction } from "@codepawl/shared";

export type KernelPhase = "observe" | "retrieve" | "plan" | "ask" | "gate" | "execute" | "verify" | "recover" | "learn" | "summarize";

export type KernelStatus = "completed" | "waiting_for_user" | "blocked" | "failed";

export type KernelMemoryKind = "episodic" | "semantic" | "procedural";

export type KernelMemoryHit = {
  id: string;
  kind: KernelMemoryKind;
  summary: string;
  relevance: number;
  sourceRunId?: string;
};

export type KernelActionPlan = {
  id: string;
  summary: string;
  policyAction: PolicyAction;
  expectedObservation: string;
  confidence: number;
  uncertaintyScore: number;
  openQuestion?: string;
};

export type KernelGatewayEvidence = {
  id: string;
  kind: ArtifactRef["kind"] | "command_log" | "trace";
  label: string;
  uri?: string;
};

export type KernelGatewayResult = {
  actionId: string;
  observation: string;
  evidence: KernelGatewayEvidence[];
};

export type KernelVerification = {
  actionId: string;
  status: "pass" | "fail";
  expectedObservation: string;
  actualObservation: string;
  evidence: KernelGatewayEvidence[];
};

export type KernelActionDecision = {
  actionId: string;
  decision: "allow" | "require_approval" | "block";
  risk: ActionRisk;
  reasons: string[];
};

export type KernelApprovalRequest = {
  id: string;
  actionId: string;
  risk: ActionRisk;
  reason: string;
};

export type CognitiveTaskInput = {
  runId: string;
  taskId: string;
  workspaceId: string;
  goal: string;
  constraints: string[];
  maxSteps: number;
};

export type CognitiveKernelResult = {
  runId: string;
  taskId: string;
  workspaceId: string;
  status: KernelStatus;
  phases: KernelPhase[];
  memoryHits: KernelMemoryHit[];
  actionPlans: KernelActionPlan[];
  actionDecisions: KernelActionDecision[];
  approvalRequests: KernelApprovalRequest[];
  gatewayResults: KernelGatewayResult[];
  verifications: KernelVerification[];
  openQuestions: string[];
  retryCount: number;
  stopReason?: "loop_budget_exceeded";
  summary: string;
};

export interface KernelMemoryProvider {
  retrieve(input: CognitiveTaskInput): Promise<KernelMemoryHit[]> | KernelMemoryHit[];
}

export interface KernelPlanner {
  plan(input: {
    task: CognitiveTaskInput;
    memoryHits: KernelMemoryHit[];
  }): Promise<KernelActionPlan> | KernelActionPlan;
  recover?(input: {
    task: CognitiveTaskInput;
    previousAction: KernelActionPlan;
    verification: KernelVerification;
    retryCount: number;
  }): Promise<KernelActionPlan> | KernelActionPlan;
}

export interface KernelGateway {
  execute(action: KernelActionPlan): Promise<KernelGatewayResult> | KernelGatewayResult;
}

export type DeterministicCognitiveKernelOptions = {
  policy: CorePolicy;
  memoryProvider: KernelMemoryProvider;
  planner: KernelPlanner;
  gateway: KernelGateway;
  uncertaintyThreshold?: number;
};

export class StaticMemoryProvider implements KernelMemoryProvider {
  private readonly memories: KernelMemoryHit[];

  constructor(memories: KernelMemoryHit[]) {
    this.memories = [...memories].sort((left, right) => right.relevance - left.relevance);
  }

  retrieve(): KernelMemoryHit[] {
    return this.memories.map((memory) => ({ ...memory }));
  }
}

export class DeterministicCognitiveKernel {
  private readonly policy: CorePolicy;
  private readonly memoryProvider: KernelMemoryProvider;
  private readonly planner: KernelPlanner;
  private readonly gateway: KernelGateway;
  private readonly policyEngine = new ConservativePolicyEngine();
  private readonly uncertaintyThreshold: number;

  constructor(options: DeterministicCognitiveKernelOptions) {
    this.policy = options.policy;
    this.memoryProvider = options.memoryProvider;
    this.planner = options.planner;
    this.gateway = options.gateway;
    this.uncertaintyThreshold = options.uncertaintyThreshold ?? 0.8;
  }

  async runTask(task: CognitiveTaskInput): Promise<CognitiveKernelResult> {
    const result = this.createInitialResult(task);
    result.phases.push("observe");
    result.phases.push("retrieve");
    result.memoryHits = await this.memoryProvider.retrieve(task);
    result.phases.push("plan");

    let action = await this.planner.plan({ task, memoryHits: result.memoryHits });
    result.actionPlans.push(action);
    if (this.shouldAsk(action)) {
      result.phases.push("ask");
      result.status = "waiting_for_user";
      result.openQuestions.push(action.openQuestion ?? "The agent needs clarification before acting.");
      result.summary = `Paused for clarification: ${result.openQuestions[0]}`;
      return result;
    }

    while (true) {
      result.phases.push("gate");
      const decision = this.evaluate(action);
      result.actionDecisions.push(decision);
      if (decision.decision === "require_approval") {
        result.status = "waiting_for_user";
        result.approvalRequests.push({
          id: `approval-${task.runId}-${action.id}`,
          actionId: action.id,
          risk: decision.risk,
          reason: `Action requires approval: ${decision.reasons.join(" ")}`,
        });
        result.summary = "Paused for explicit approval before execution.";
        return result;
      }
      if (decision.decision === "block") {
        result.status = "blocked";
        result.summary = `Blocked by policy: ${decision.reasons.join(" ")}`;
        return result;
      }

      result.phases.push("execute");
      const gatewayResult = await this.gateway.execute(action);
      result.gatewayResults.push(gatewayResult);
      result.phases.push("verify");
      const verification = this.verify(action, gatewayResult);
      result.verifications.push(verification);

      if (verification.status === "pass") {
        result.phases.push("learn");
        result.phases.push("summarize");
        result.status = "completed";
        result.summary = `Task completed with ${result.memoryHits.length} memory hit(s) and ${result.gatewayResults.length} gateway result(s).`;
        return result;
      }

      result.retryCount += 1;
      if (result.retryCount >= task.maxSteps) {
        result.status = "failed";
        result.stopReason = "loop_budget_exceeded";
        result.summary = "Stopped after predictive mismatch exceeded the loop budget.";
        return result;
      }

      result.phases.push("recover");
      action =
        (await this.planner.recover?.({
          task,
          previousAction: action,
          verification,
          retryCount: result.retryCount,
        })) ?? {
          ...action,
          id: `${action.id}-recovery-${result.retryCount}`,
          summary: `Recover after mismatch: ${action.summary}`,
        };
      result.actionPlans.push(action);
    }
  }

  private createInitialResult(task: CognitiveTaskInput): CognitiveKernelResult {
    return {
      runId: task.runId,
      taskId: task.taskId,
      workspaceId: task.workspaceId,
      status: "failed",
      phases: [],
      memoryHits: [],
      actionPlans: [],
      actionDecisions: [],
      approvalRequests: [],
      gatewayResults: [],
      verifications: [],
      openQuestions: [],
      retryCount: 0,
      summary: "",
    };
  }

  private shouldAsk(action: KernelActionPlan): boolean {
    return action.uncertaintyScore >= this.uncertaintyThreshold || action.confidence <= 0.3;
  }

  private evaluate(action: KernelActionPlan): KernelActionDecision {
    const decision = this.policyEngine.evaluateAction(action.policyAction, this.policy);
    return {
      actionId: action.id,
      decision: decision.decision,
      risk: decision.risk,
      reasons: decision.reasons,
    };
  }

  private verify(action: KernelActionPlan, gatewayResult: KernelGatewayResult): KernelVerification {
    return {
      actionId: action.id,
      status: gatewayResult.observation === action.expectedObservation ? "pass" : "fail",
      expectedObservation: action.expectedObservation,
      actualObservation: gatewayResult.observation,
      evidence: gatewayResult.evidence,
    };
  }
}
