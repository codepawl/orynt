import { ConservativePolicyEngine, type ActionRisk, type ArtifactRef, type CorePolicy, type PolicyAction } from "@codepawl/shared";

export type KernelPhase = "observe" | "retrieve" | "plan" | "ask" | "gate" | "execute" | "verify" | "recover" | "learn" | "summarize";

export type KernelStatus = "completed" | "waiting_for_user" | "blocked" | "failed";

export type KernelMemoryKind = "episodic" | "semantic" | "procedural";

export type KernelMode = "HABIT" | "COMPACT_DELIBERATION" | "DEEP_DELIBERATION" | "RECOVERY" | "EXPLORATION";

export type RiskLevel = "low" | "medium" | "high";

export type NeedState = {
  needs: {
    primaryNeed: string;
    secondaryNeeds: string[];
    urgency: number;
    riskSensitivity: number;
    qualityRequirement: number;
    costSensitivity: number;
  };
  hardConstraints: string[];
  softPreferences: string[];
  riskLevel: RiskLevel;
  uncertainty: number;
  utilityWeights: {
    taskSuccess: number;
    quality: number;
    latency: number;
    moneyCost: number;
    tokenCost: number;
    effort: number;
    safety: number;
    learningValue: number;
  };
};

export type GoalState = {
  goalId: string;
  goal: string;
  priority: "low" | "medium" | "high";
  successCriteria: string[];
  failureCriteria: string[];
  deadline: string | null;
  riskLevel: RiskLevel;
};

export type CompactWorkingState = {
  taskId: string;
  goalId: string;
  mode: KernelMode;
  activeChunks: string[];
  hardConstraints: string[];
  knownFacts: string[];
  hypotheses: Array<{ id: string; text: string; confidence: number; evidenceRefs: string[] }>;
  openQuestions: string[];
  lastAction: string | null;
  nextActionHint: string | null;
  evidenceRefs: string[];
};

export type MemoryRetrievalBudget = {
  semantic: number;
  episodic: number;
  procedural: number;
  maxTotal: number;
};

export type BudgetedMemoryContext = {
  selected: KernelMemoryHit[];
  dropped: KernelMemoryHit[];
  budget: MemoryRetrievalBudget;
  estimatedTokens: number;
};

export type BudgetedOption = {
  id: string;
  name: string;
  summary: string;
  requiredTools: string[];
  requiredInputs: string[];
  estimatedTime: number;
  estimatedEffort: number;
  estimatedTokenCost: number;
  risk: number;
  expectedQuality: number;
};

export type BudgetedAffordance = {
  optionId: string;
  feasible: boolean;
  missingRequirements: string[];
  substitutes: Array<{ missing: string; substitute: string; method: string; extraCost: number; extraEffort: number; risk: number }>;
};

export type TradeoffScore = {
  optionId: string;
  name: string;
  score: number;
  pros: string[];
  cons: string[];
  acceptedTradeoffs: string[];
  uncertainty: number;
};

export type BudgetedDecision = {
  mode: KernelMode;
  selectedOptionId: string | null;
  nextAction: { type: "tool_call" | "execute_skill" | "ask_user" | "final_answer" | "retrieve_more" | "escalate"; name: string; arguments: Record<string, unknown> };
  expectedObservation: string | null;
  confidence: number;
  done: boolean;
  needEscalation: boolean;
};

export type ModuleBudgetTrace = {
  name: string;
  model: "rules" | "small_model" | "medium_model" | "strong_model";
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
  costUsd: number;
  success: boolean;
};

export type TokenBudgetPolicy = {
  workingState: { maxActiveChunks: number; maxChunkWords: number };
  memoryRetrieval: MemoryRetrievalBudget;
  optionGenerator: { maxOptions: number; maxOutputTokens: number };
  tradeoffSimulator: { maxOutputTokens: number };
  policySelector: { maxOutputTokens: number };
  finalResponder: { maxOutputTokens: number };
};

export type OutcomeEvaluation = {
  goalSatisfied: boolean;
  qualityScore: number;
  costScore: number;
  latencyScore: number;
  safetyScore: number;
  userFeedback: string | null;
  lessons: string[];
  reuseProbability: number;
};

export type MemoryConsolidationPlan = {
  episodicUpdates: Array<{ event: string; outcomeScore: number; lesson: string }>;
  proceduralUpdates: Array<{ skillId: string; patch: string }>;
  preferenceUpdates: Array<{ preference: string; confidence: number }>;
};

export type BudgetedCostSummary = {
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  costPerSuccessfulTask: number;
};

export type BudgetedTrace = {
  needState: NeedState;
  goalState: GoalState;
  workingState: CompactWorkingState;
  memoryContext: BudgetedMemoryContext;
  options: BudgetedOption[];
  affordances: BudgetedAffordance[];
  tradeoffScores: TradeoffScore[];
  decision: BudgetedDecision;
  moduleBudgets: ModuleBudgetTrace[];
  outcome: OutcomeEvaluation;
  memoryConsolidation: MemoryConsolidationPlan;
  cost: BudgetedCostSummary;
};

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
  budgetedTrace: BudgetedTrace;
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
  tokenBudgetPolicy?: Partial<TokenBudgetPolicy>;
};

const DEFAULT_TOKEN_BUDGET_POLICY: TokenBudgetPolicy = {
  workingState: { maxActiveChunks: 7, maxChunkWords: 15 },
  memoryRetrieval: { semantic: 300, episodic: 300, procedural: 400, maxTotal: 1000 },
  optionGenerator: { maxOptions: 5, maxOutputTokens: 500 },
  tradeoffSimulator: { maxOutputTokens: 600 },
  policySelector: { maxOutputTokens: 300 },
  finalResponder: { maxOutputTokens: 800 },
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
  private readonly tokenBudgetPolicy: TokenBudgetPolicy;

  constructor(options: DeterministicCognitiveKernelOptions) {
    this.policy = options.policy;
    this.memoryProvider = options.memoryProvider;
    this.planner = options.planner;
    this.gateway = options.gateway;
    this.uncertaintyThreshold = options.uncertaintyThreshold ?? 0.8;
    this.tokenBudgetPolicy = {
      ...DEFAULT_TOKEN_BUDGET_POLICY,
      ...options.tokenBudgetPolicy,
      workingState: {
        ...DEFAULT_TOKEN_BUDGET_POLICY.workingState,
        ...options.tokenBudgetPolicy?.workingState,
      },
      memoryRetrieval: {
        ...DEFAULT_TOKEN_BUDGET_POLICY.memoryRetrieval,
        ...options.tokenBudgetPolicy?.memoryRetrieval,
      },
      optionGenerator: {
        ...DEFAULT_TOKEN_BUDGET_POLICY.optionGenerator,
        ...options.tokenBudgetPolicy?.optionGenerator,
      },
      tradeoffSimulator: {
        ...DEFAULT_TOKEN_BUDGET_POLICY.tradeoffSimulator,
        ...options.tokenBudgetPolicy?.tradeoffSimulator,
      },
      policySelector: {
        ...DEFAULT_TOKEN_BUDGET_POLICY.policySelector,
        ...options.tokenBudgetPolicy?.policySelector,
      },
      finalResponder: {
        ...DEFAULT_TOKEN_BUDGET_POLICY.finalResponder,
        ...options.tokenBudgetPolicy?.finalResponder,
      },
    };
  }

  async runTask(task: CognitiveTaskInput): Promise<CognitiveKernelResult> {
    const result = this.createInitialResult(task);
    result.phases.push("observe");
    result.phases.push("retrieve");
    result.memoryHits = await this.memoryProvider.retrieve(task);
    result.budgetedTrace = this.createBudgetedTrace(task, result.memoryHits);
    result.phases.push("plan");

    let action = await this.planner.plan({ task, memoryHits: result.memoryHits });
    result.actionPlans.push(action);
    this.applyActionToBudgetedTrace(result.budgetedTrace, action);
    if (this.shouldAsk(action)) {
      result.phases.push("ask");
      result.status = "waiting_for_user";
      result.openQuestions.push(action.openQuestion ?? "The agent needs clarification before acting.");
      result.summary = `Paused for clarification: ${result.openQuestions[0]}`;
      result.budgetedTrace.decision = {
        ...result.budgetedTrace.decision,
        mode: "DEEP_DELIBERATION",
        nextAction: { type: "ask_user", name: "clarify", arguments: { question: result.openQuestions[0] } },
        needEscalation: true,
      };
      return result;
    }

    while (true) {
      result.phases.push("gate");
      const decision = this.evaluate(action);
      result.actionDecisions.push(decision);
      result.budgetedTrace.decision.needEscalation = decision.decision !== "allow";
      if (decision.decision === "require_approval") {
        result.status = "waiting_for_user";
        result.approvalRequests.push({
          id: `approval-${task.runId}-${action.id}`,
          actionId: action.id,
          risk: decision.risk,
          reason: `Action requires approval: ${decision.reasons.join(" ")}`,
        });
        result.summary = "Paused for explicit approval before execution.";
        result.budgetedTrace.decision.nextAction = { type: "ask_user", name: "request_approval", arguments: { actionId: action.id } };
        return result;
      }
      if (decision.decision === "block") {
        result.status = "blocked";
        result.summary = `Blocked by policy: ${decision.reasons.join(" ")}`;
        result.budgetedTrace.decision.nextAction = { type: "final_answer", name: "blocked_by_policy", arguments: { reasons: decision.reasons } };
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
        this.applyOutcomeToBudgetedTrace(result.budgetedTrace, task, true, result.retryCount);
        return result;
      }

      result.retryCount += 1;
      if (result.retryCount >= task.maxSteps) {
        result.status = "failed";
        result.stopReason = "loop_budget_exceeded";
        result.summary = "Stopped after predictive mismatch exceeded the loop budget.";
        this.applyOutcomeToBudgetedTrace(result.budgetedTrace, task, false, result.retryCount);
        return result;
      }

      result.phases.push("recover");
      result.budgetedTrace.workingState.mode = "RECOVERY";
      result.budgetedTrace.decision.mode = "RECOVERY";
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
      this.applyActionToBudgetedTrace(result.budgetedTrace, action);
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
      budgetedTrace: this.createBudgetedTrace(task, []),
    };
  }

  private createBudgetedTrace(task: CognitiveTaskInput, memoryHits: KernelMemoryHit[]): BudgetedTrace {
    const needState = this.createNeedState(task);
    const goalState = this.createGoalState(task, needState);
    const mode = this.selectMode(needState, task.maxSteps);
    const memoryContext = this.selectMemoryContext(memoryHits);
    const workingState = this.createCompactWorkingState(task, goalState, needState, memoryContext, mode);
    const options = this.generateOptions(workingState).slice(0, this.tokenBudgetPolicy.optionGenerator.maxOptions);
    const affordances = this.filterAffordances(options);
    const tradeoffScores = this.scoreTradeoffs(options, affordances, needState);
    const decision = this.selectDecision(tradeoffScores, mode);
    const moduleBudgets = this.createModuleBudgetTrace(memoryContext, options, tradeoffScores, decision);
    const estimatedTotalTokens = moduleBudgets.reduce((total, module) => total + module.inputTokens + module.outputTokens - module.cachedTokens, 0);
    const estimatedCostUsd = Number((estimatedTotalTokens * 0.000002).toFixed(8));
    const outcome = this.createOutcome(false, needState, 0);
    return {
      needState,
      goalState,
      workingState,
      memoryContext,
      options,
      affordances,
      tradeoffScores,
      decision,
      moduleBudgets,
      outcome,
      memoryConsolidation: this.createMemoryConsolidation(task, outcome),
      cost: {
        estimatedTotalTokens,
        estimatedCostUsd,
        costPerSuccessfulTask: Math.max(estimatedCostUsd, 0.000001),
      },
    };
  }

  private createNeedState(task: CognitiveTaskInput): NeedState {
    const text = `${task.goal} ${task.constraints.join(" ")}`.toLowerCase();
    const isRisky = /delete|production|payment|secret|credential|public api|auth|database|irreversible/.test(text);
    const isUrgent = /urgent|asap|now|critical|blocked|fix/.test(text);
    const riskLevel: RiskLevel = isRisky ? "medium" : "low";
    return {
      needs: {
        primaryNeed: /fix|bug|error|fail/.test(text) ? "fix_bug" : "complete_repository_task",
        secondaryNeeds: ["preserve_quality", "minimize_tokens", "keep_evidence_retrievable"],
        urgency: isUrgent ? 0.72 : 0.35,
        riskSensitivity: isRisky ? 0.82 : 0.45,
        qualityRequirement: isRisky ? 0.9 : 0.78,
        costSensitivity: 0.64,
      },
      hardConstraints: [...task.constraints],
      softPreferences: ["use tools before tokens", "prefer compact state", "retrieve raw evidence only when needed"],
      riskLevel,
      uncertainty: isRisky ? 0.48 : 0.22,
      utilityWeights: {
        taskSuccess: 0.34,
        quality: 0.24,
        latency: -0.08,
        moneyCost: -0.08,
        tokenCost: -0.12,
        effort: -0.06,
        safety: 0.18,
        learningValue: 0.06,
      },
    };
  }

  private createGoalState(task: CognitiveTaskInput, needState: NeedState): GoalState {
    return {
      goalId: this.slug(task.goal),
      goal: task.goal,
      priority: needState.riskLevel === "high" ? "high" : "medium",
      successCriteria: ["task goal satisfied", "hard constraints preserved exactly", "verification evidence recorded"],
      failureCriteria: ["hard constraint violation", "unverified final state", "budget exhausted before useful evidence"],
      deadline: null,
      riskLevel: needState.riskLevel,
    };
  }

  private createCompactWorkingState(
    task: CognitiveTaskInput,
    goalState: GoalState,
    needState: NeedState,
    memoryContext: BudgetedMemoryContext,
    mode: KernelMode,
  ): CompactWorkingState {
    const chunks = [
      this.compactWords(task.goal),
      `mode ${mode.toLowerCase()}`,
      `risk ${needState.riskLevel}`,
      `uncertainty ${needState.uncertainty.toFixed(2)}`,
      `memory hits ${memoryContext.selected.length}`,
      `max steps ${task.maxSteps}`,
      "raw evidence stays in artifacts",
    ].slice(0, this.tokenBudgetPolicy.workingState.maxActiveChunks);
    return {
      taskId: task.taskId,
      goalId: goalState.goalId,
      mode,
      activeChunks: chunks.map((chunk) => this.compactWords(chunk)),
      hardConstraints: [...needState.hardConstraints],
      knownFacts: memoryContext.selected.map((hit) => this.compactWords(hit.summary)).slice(0, 5),
      hypotheses: [
        {
          id: "H1",
          text: "compact state plus retrieval should preserve quality while lowering context cost",
          confidence: 0.74,
          evidenceRefs: memoryContext.selected.map((hit) => hit.id),
        },
      ],
      openQuestions: needState.uncertainty > 0.55 ? ["which missing evidence changes the next action?"] : [],
      lastAction: null,
      nextActionHint: "select cheapest verified next action",
      evidenceRefs: memoryContext.selected.map((hit) => hit.id),
    };
  }

  private selectMemoryContext(memoryHits: KernelMemoryHit[]): BudgetedMemoryContext {
    const budget = this.tokenBudgetPolicy.memoryRetrieval;
    const usedByKind: Record<KernelMemoryKind, number> = { semantic: 0, episodic: 0, procedural: 0 };
    let total = 0;
    const selected: KernelMemoryHit[] = [];
    const dropped: KernelMemoryHit[] = [];
    for (const hit of [...memoryHits].sort((left, right) => right.relevance - left.relevance)) {
      const estimated = this.estimateTokens(hit.summary);
      if (usedByKind[hit.kind] + estimated <= budget[hit.kind] && total + estimated <= budget.maxTotal) {
        selected.push({ ...hit });
        usedByKind[hit.kind] += estimated;
        total += estimated;
      } else {
        dropped.push({ ...hit });
      }
    }
    return { selected, dropped, budget: { ...budget }, estimatedTokens: total };
  }

  private generateOptions(workingState: CompactWorkingState): BudgetedOption[] {
    return [
      {
        id: "O1",
        name: "use_compact_state_and_targeted_tools",
        summary: "Run the next repository action from compact state and targeted evidence.",
        requiredTools: ["policy_engine", "gateway", "artifact_store"],
        requiredInputs: ["goal", "hard_constraints", "compact_working_state"],
        estimatedTime: 1,
        estimatedEffort: 0.2,
        estimatedTokenCost: 120,
        risk: workingState.mode === "RECOVERY" ? 0.34 : 0.18,
        expectedQuality: 0.86,
      },
      {
        id: "O2",
        name: "retrieve_more_evidence_first",
        summary: "Spend extra tool calls to fetch raw evidence before acting.",
        requiredTools: ["artifact_store", "memory_router"],
        requiredInputs: ["evidence_refs"],
        estimatedTime: 2,
        estimatedEffort: 0.35,
        estimatedTokenCost: 220,
        risk: 0.12,
        expectedQuality: 0.82,
      },
      {
        id: "O3",
        name: "deep_deliberation_with_verifier",
        summary: "Use broader context and verifier for high-risk uncertainty.",
        requiredTools: ["strong_model", "verifier", "artifact_store"],
        requiredInputs: ["goal", "raw_evidence", "policy"],
        estimatedTime: 4,
        estimatedEffort: 0.65,
        estimatedTokenCost: 700,
        risk: 0.08,
        expectedQuality: 0.9,
      },
    ];
  }

  private filterAffordances(options: BudgetedOption[]): BudgetedAffordance[] {
    return options.map((option) => ({
      optionId: option.id,
      feasible: true,
      missingRequirements: [],
      substitutes: option.requiredTools.includes("strong_model")
        ? [
            {
              missing: "strong_model",
              substitute: "medium_model_plus_verifier",
              method: "escalate only after confidence gate fails",
              extraCost: -0.35,
              extraEffort: 0.15,
              risk: 0.08,
            },
          ]
        : [],
    }));
  }

  private scoreTradeoffs(options: BudgetedOption[], affordances: BudgetedAffordance[], needState: NeedState): TradeoffScore[] {
    return options
      .map((option) => {
        const affordance = affordances.find((item) => item.optionId === option.id);
        const substitutePenalty = affordance?.substitutes.length ? 0.04 : 0;
        const score =
          option.expectedQuality * needState.utilityWeights.quality +
          (1 - option.risk) * needState.utilityWeights.safety +
          0.82 * needState.utilityWeights.taskSuccess -
          option.estimatedTokenCost * 0.0002 -
          option.estimatedEffort * 0.08 -
          substitutePenalty;
        return {
          optionId: option.id,
          name: option.name,
          score: Number(score.toFixed(4)),
          pros: ["preserves hard constraints", "keeps raw evidence retrievable"],
          cons: option.estimatedTokenCost > 500 ? ["higher token spend"] : ["less exhaustive context"],
          acceptedTradeoffs: affordance?.substitutes.map((substitute) => `${substitute.missing}->${substitute.substitute}`) ?? [],
          uncertainty: Math.min(0.9, needState.uncertainty + option.risk / 2),
        };
      })
      .sort((left, right) => right.score - left.score);
  }

  private selectDecision(scores: TradeoffScore[], mode: KernelMode): BudgetedDecision {
    const top = scores[0];
    return {
      mode,
      selectedOptionId: top?.optionId ?? null,
      nextAction: { type: "tool_call", name: top?.name ?? "no_action", arguments: { optionId: top?.optionId ?? null } },
      expectedObservation: "verified evidence recorded",
      confidence: top ? Math.max(0.35, Math.min(0.95, 1 - top.uncertainty / 2)) : 0.35,
      done: false,
      needEscalation: top ? top.uncertainty > 0.55 : true,
    };
  }

  private createModuleBudgetTrace(
    memoryContext: BudgetedMemoryContext,
    options: BudgetedOption[],
    scores: TradeoffScore[],
    decision: BudgetedDecision,
  ): ModuleBudgetTrace[] {
    return [
      this.moduleBudget("need_appraiser", "rules", 90, 120, true),
      this.moduleBudget("working_state", "rules", 120, 90, true),
      this.moduleBudget("memory_router", "rules", memoryContext.estimatedTokens, memoryContext.selected.length * 12, true),
      this.moduleBudget("option_generator", "rules", 80, Math.min(this.tokenBudgetPolicy.optionGenerator.maxOutputTokens, options.length * 80), true),
      this.moduleBudget("tradeoff_simulator", "rules", options.length * 60, Math.min(this.tokenBudgetPolicy.tradeoffSimulator.maxOutputTokens, scores.length * 70), true),
      this.moduleBudget("policy_selector", "rules", 60, Math.min(this.tokenBudgetPolicy.policySelector.maxOutputTokens, decision.selectedOptionId ? 90 : 40), Boolean(decision.selectedOptionId)),
    ];
  }

  private moduleBudget(name: string, model: ModuleBudgetTrace["model"], inputTokens: number, outputTokens: number, success: boolean): ModuleBudgetTrace {
    const billableTokens = Math.max(0, inputTokens + outputTokens);
    return {
      name,
      model,
      inputTokens,
      outputTokens,
      cachedTokens: 0,
      latencyMs: Math.max(1, Math.round(billableTokens / 10)),
      costUsd: Number((billableTokens * 0.000002).toFixed(8)),
      success,
    };
  }

  private applyActionToBudgetedTrace(trace: BudgetedTrace, action: KernelActionPlan): void {
    trace.workingState.lastAction = action.id;
    trace.workingState.nextActionHint = action.summary;
    trace.decision.expectedObservation = action.expectedObservation;
    trace.decision.confidence = action.confidence;
    trace.decision.needEscalation = action.uncertaintyScore >= this.uncertaintyThreshold;
  }

  private applyOutcomeToBudgetedTrace(trace: BudgetedTrace, task: CognitiveTaskInput, goalSatisfied: boolean, retryCount: number): void {
    trace.outcome = this.createOutcome(goalSatisfied, trace.needState, retryCount);
    trace.memoryConsolidation = this.createMemoryConsolidation(task, trace.outcome);
    trace.decision.done = goalSatisfied;
    trace.cost.costPerSuccessfulTask = goalSatisfied ? trace.cost.estimatedCostUsd : Math.max(trace.cost.estimatedCostUsd * 2, 0.000001);
  }

  private createOutcome(goalSatisfied: boolean, needState: NeedState, retryCount: number): OutcomeEvaluation {
    return {
      goalSatisfied,
      qualityScore: goalSatisfied ? needState.needs.qualityRequirement : 0.35,
      costScore: Math.max(0.1, 0.9 - retryCount * 0.1),
      latencyScore: Math.max(0.1, 0.85 - retryCount * 0.08),
      safetyScore: goalSatisfied ? 0.95 : 0.75,
      userFeedback: null,
      lessons: goalSatisfied ? ["compact state preserved constraints", "evidence stayed retrievable through artifacts"] : ["recover before spending more model budget"],
      reuseProbability: goalSatisfied ? 0.72 : 0.32,
    };
  }

  private createMemoryConsolidation(task: CognitiveTaskInput, outcome: OutcomeEvaluation): MemoryConsolidationPlan {
    return {
      episodicUpdates: [
        {
          event: this.compactWords(task.goal),
          outcomeScore: outcome.qualityScore,
          lesson: outcome.lessons[0] ?? "record budgeted agent outcome",
        },
      ],
      proceduralUpdates: outcome.goalSatisfied
        ? [{ skillId: "coding_apprentice_budgeted_loop", patch: "prefer compact state, targeted evidence retrieval, then verifier" }]
        : [],
      preferenceUpdates: [],
    };
  }

  private selectMode(needState: NeedState, maxSteps: number): KernelMode {
    if (needState.uncertainty > 0.55 || needState.riskLevel === "high") {
      return "DEEP_DELIBERATION";
    }
    if (needState.riskLevel === "medium" || maxSteps > 4) {
      return "COMPACT_DELIBERATION";
    }
    return "HABIT";
  }

  private estimateTokens(text: string): number {
    return Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
  }

  private compactWords(text: string): string {
    return text.trim().replace(/\s+/g, " ").split(" ").slice(0, this.tokenBudgetPolicy.workingState.maxChunkWords).join(" ");
  }

  private slug(value: string): string {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
    return slug || "goal";
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
