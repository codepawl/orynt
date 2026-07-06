import type {
  Actor,
  ArtifactRef,
  CandidateRule,
  EpisodicMemoryItem,
  MemoryNamespace,
  MemoryRedactionResult,
  PolicyDecision,
  RunStore,
  SkillDefinition,
  SkillExtractionCandidate,
  SkillInvocationFallbackReason,
  SkillInvocationPlan,
  SkillInvocationPlanInput,
  SkillReplayBudgetEstimate,
  SkillReplayPlan,
  SkillReplayPlanner,
  SkillReplayPlannerInput,
  SkillReplayPolicyCheck,
  SkillReplayPreconditionResult,
  SkillReplayRisk,
  SkillReplayStep,
  SkillReplayStopReason,
  SkillReplayValidationExpectation,
  SkillPromotionDecision,
  SkillRegistry,
  SkillStatus,
  SkillSummary,
  SkillQuery,
  SkillCandidateBuilderInput,
} from "@codepawl/shared";
import { ConservativePolicyEngine } from "@codepawl/shared";

export class SkillRegistryFailure extends Error {
  readonly code: "skill_not_found" | "invalid_status_transition" | "invalid_candidate";

  constructor(code: SkillRegistryFailure["code"], message: string) {
    super(message);
    this.name = "SkillRegistryFailure";
    this.code = code;
  }
}

const SENSITIVE_KEY_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential|private[-_\s]?key|raw[-_\s]?value)\b/i;
const KEY_VALUE_SECRET_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential|private[-_\s]?key|raw[-_\s]?value)\b\s*[:=]\s*[^\s,;]+/gi;
const SECRET_VALUE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

function now() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return value === undefined
    ? value
    : typeof globalThis.structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "skill"
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function redactString(value: string, pathLabel: string, paths: string[]): string {
  let redacted = false;
  const next = value
    .replace(PRIVATE_KEY_PATTERN, () => {
      redacted = true;
      return "[REDACTED_PRIVATE_KEY]";
    })
    .replace(KEY_VALUE_SECRET_PATTERN, (_match, key) => {
      redacted = true;
      return `${key}: [REDACTED]`;
    })
    .replace(SECRET_VALUE_PATTERN, () => {
      redacted = true;
      return "[REDACTED]";
    });

  if (SENSITIVE_KEY_PATTERN.test(value) && next === value) {
    paths.push(pathLabel);
    return "[REDACTED]";
  }
  if (redacted) {
    paths.push(pathLabel);
  }
  return next;
}

function redactUnknown<T>(value: T, pathLabel: string, paths: string[]): T {
  if (typeof value === "string") {
    return redactString(value, pathLabel, paths) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => redactUnknown(item, `${pathLabel}[${index}]`, paths)) as T;
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      const nestedPath = pathLabel ? `${pathLabel}.${key}` : key;
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
        paths.push(nestedPath);
      } else {
        output[key] = redactUnknown(nested, nestedPath, paths);
      }
    }
    return output as T;
  }
  return value;
}

function redaction(paths: string[]): MemoryRedactionResult {
  return {
    applied: paths.length > 0,
    redactedPaths: unique(paths),
    redactionCount: paths.length,
  };
}

function namespaceMatches(namespace: MemoryNamespace, query?: Partial<MemoryNamespace>): boolean {
  if (!query) {
    return true;
  }
  return (
    (query.capabilityId === undefined || namespace.capabilityId === query.capabilityId) &&
    (query.workspaceId === undefined || namespace.workspaceId === query.workspaceId) &&
    (query.repositoryPath === undefined || namespace.repositoryPath === query.repositoryPath) &&
    (query.projectId === undefined || namespace.projectId === query.projectId)
  );
}

function textMatches(skill: SkillDefinition, text?: string): boolean {
  return text === undefined || JSON.stringify(skill).toLowerCase().includes(text.toLowerCase());
}

function artifactRefs(rules: CandidateRule[], episodes: EpisodicMemoryItem[], verificationArtifacts: ArtifactRef[]): ArtifactRef[] {
  const refs = [
    ...rules.flatMap((rule) => rule.provenance.artifactRefs),
    ...rules.flatMap((rule) => rule.evidence.flatMap((evidence) => evidence.artifactRefs)),
    ...episodes.flatMap((episode) => episode.provenance.artifactRefs),
    ...verificationArtifacts,
  ];
  const byId = new Map(refs.map((ref) => [ref.id, ref]));
  return [...byId.values()];
}

function transitionFor(decision: SkillPromotionDecision["decision"]): SkillStatus {
  if (decision === "promote") {
    return "active";
  }
  if (decision === "reject") {
    return "rejected";
  }
  if (decision === "supersede") {
    return "superseded";
  }
  return "archived";
}

function assertValidTransition(current: SkillStatus, next: SkillStatus) {
  const allowed: Record<SkillStatus, SkillStatus[]> = {
    candidate: ["active", "rejected", "superseded", "archived"],
    active: ["superseded", "archived"],
    rejected: ["archived"],
    superseded: ["archived"],
    archived: [],
  };
  if (!allowed[current].includes(next)) {
    throw new SkillRegistryFailure("invalid_status_transition", `invalid skill status transition: ${current} -> ${next}`);
  }
}

export class SkillCandidateBuilder {
  createCandidateSkill(input: SkillCandidateBuilderInput): SkillExtractionCandidate {
    const acceptedRules = input.acceptedRules.filter((rule) => rule.status === "accepted");
    if (acceptedRules.length === 0) {
      throw new SkillRegistryFailure("invalid_candidate", "accepted candidate rule is required");
    }
    if (input.verificationResult.status !== "pass" || input.verificationResult.verdict.status !== "pass") {
      throw new SkillRegistryFailure("invalid_candidate", "successful verification is required");
    }

    const primaryRule = acceptedRules[0];
    const createdAt = now();
    const validationCommands = unique([
      ...(primaryRule.scope.commands ?? []),
      ...input.verificationResult.evidence.flatMap((item) => (item.kind === "command" && item.command ? [item.command] : [])),
      ...(input.codexContract?.metadata.validationCommands ?? []),
    ]);
    const evidenceKinds = unique(input.verificationResult.evidence.map((item) => item.kind));
    const sourceRunIds = unique([
      input.verificationResult.runId,
      ...acceptedRules.map((rule) => rule.provenance.runId),
      ...input.episodes.map((episode) => episode.provenance.runId),
    ]);
    const sourceTaskIds = unique([
      input.verificationResult.taskId,
      ...acceptedRules.map((rule) => rule.provenance.taskId),
      ...input.episodes.map((episode) => episode.provenance.taskId),
    ]);
    const allArtifactRefs = artifactRefs(acceptedRules, input.episodes, input.verificationResult.artifacts);
    const redactedPaths: string[] = [];
    const title = redactString(primaryRule.title, "title", redactedPaths);
    const summary = redactString(
      `${primaryRule.rule} Validation: ${validationCommands.join(", ") || "manual verifier evidence required"}.`,
      "summary",
      redactedPaths,
    );
    const allowedPaths = unique([
      ...primaryRule.scope.allowedPaths,
      ...(input.codexContract?.metadata.allowedPaths ?? []),
      ...(input.verificationResult.diffScope.allowedFiles ?? []),
    ]);
    const protectedPaths = unique([
      ...primaryRule.scope.protectedPaths,
      ...(input.codexContract?.metadata.protectedPaths ?? []),
      ...(input.verificationResult.diffScope.protectedFiles ?? []),
    ]);
    const blockedActions = ["automatic_execution", "codex_auto_run", "browser_automation", "secret_storage"];

    const skill: SkillDefinition = redactUnknown(
      {
        id: `skill-${slug(primaryRule.title)}`,
        namespace: clone(input.namespace),
        capabilityId: `${input.namespace.capabilityId}.manual-skill`,
        title,
        summary,
        status: "candidate",
        confidence: Math.min(
          1,
          Math.max(
            0,
            acceptedRules.reduce((sum, rule) => sum + Math.max(...rule.evidence.map((item) => item.confidence), 0), 0) /
              acceptedRules.length,
          ),
        ),
        preconditions: [
          {
            id: "precondition-accepted-rule",
            kind: "memory_rule_status",
            summary: "At least one accepted candidate rule is required.",
            required: true,
          },
          {
            id: "precondition-verifier-pass",
            kind: "verification_available",
            summary: `Verifier result ${input.verificationResult.id} passed before candidate extraction.`,
            required: true,
          },
          {
            id: "precondition-manual-review",
            kind: "manual_review",
            summary: "User must explicitly promote before this skill becomes active.",
            required: true,
          },
        ],
        steps: [
          {
            id: "step-apply-rule-scope",
            title: "Apply accepted rule scope",
            instruction: primaryRule.rule,
            expectedOutcome: "Work remains inside the accepted repository scope.",
            evidenceRefs: unique(primaryRule.evidence.flatMap((item) => item.eventIds)),
          },
          {
            id: "step-validate",
            title: "Validate with verifier evidence",
            instruction: "Use the captured verifier commands as validation expectations; do not execute automatically.",
            expectedOutcome: "Verifier pass and diff-scope evidence remain satisfied.",
            evidenceRefs: input.verificationResult.evidence.map((item) => item.id),
          },
        ],
        validation: {
          requiresVerifierPass: true,
          requiresDiffWithinScope: true,
          commands: validationCommands,
          expectedEvidenceKinds: evidenceKinds,
        },
        safety: {
          allowedPaths,
          protectedPaths,
          allowedCommands: validationCommands,
          blockedActions,
          requiresManualApproval: true,
          rollbackNotes: "Archive or supersede this skill if later evidence invalidates its scope or validation expectations.",
          secretHandling: "Store only redacted summaries and artifact references; never store secrets or raw sensitive values.",
        },
        provenance: {
          sourceRunIds,
          sourceTaskIds,
          candidateRuleIds: acceptedRules.map((rule) => rule.id),
          episodeIds: input.episodes.map((item) => item.id),
          verificationResultIds: [input.verificationResult.id],
          codexContractIds: input.codexContract ? [input.codexContract.id] : [],
          artifactRefs: allArtifactRefs,
          sourceEventIds: unique(acceptedRules.flatMap((rule) => rule.provenance.eventIds)),
        },
        redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
        promotionDecisions: [],
        createdAt,
        updatedAt: createdAt,
      } satisfies SkillDefinition,
      "",
      redactedPaths,
    );
    const redactedAcceptedRules = redactUnknown(clone(acceptedRules), "acceptedRules", redactedPaths);
    const redactedEpisodes = redactUnknown(clone(input.episodes), "episodes", redactedPaths);
    const redactedVerificationResult = redactUnknown(clone(input.verificationResult), "verificationResult", redactedPaths);
    const redactedCodexContract = input.codexContract ? redactUnknown(clone(input.codexContract), "codexContract", redactedPaths) : undefined;
    const redactedSandbox = input.sandbox ? redactUnknown(clone(input.sandbox), "sandbox", redactedPaths) : undefined;
    skill.redaction = redaction(redactedPaths);

    return {
      id: `skill-extraction-${skill.id}`,
      namespace: clone(input.namespace),
      skill,
      acceptedRules: redactedAcceptedRules,
      episodes: redactedEpisodes,
      verificationResult: redactedVerificationResult,
      codexContract: redactedCodexContract,
      sandbox: redactedSandbox,
      createdAt,
    };
  }
}

export class LocalSkillRegistry implements SkillRegistry {
  private skills: SkillDefinition[];

  constructor(skills: SkillDefinition[] = []) {
    this.skills = clone(skills);
  }

  async createCandidateSkill(input: SkillExtractionCandidate): Promise<SkillDefinition> {
    const skill = clone(input.skill);
    skill.status = "candidate";
    skill.updatedAt = skill.updatedAt || now();
    this.skills = [skill, ...this.skills.filter((item) => item.id !== skill.id)];
    return clone(skill);
  }

  async listSkills(query: SkillQuery = {}): Promise<SkillDefinition[]> {
    const skills = this.skills.filter(
      (skill) =>
        namespaceMatches(skill.namespace, query.namespace) &&
        (query.statuses === undefined || query.statuses.includes(skill.status)) &&
        textMatches(skill, query.text),
    );
    return clone(query.limit === undefined ? skills : skills.slice(0, query.limit));
  }

  async getSkill(id: string): Promise<SkillDefinition | undefined> {
    const skill = this.skills.find((item) => item.id === id);
    return skill ? clone(skill) : undefined;
  }

  async planSkillInvocation(input: SkillInvocationPlanInput): Promise<SkillInvocationPlan> {
    const matching = this.skills.filter((skill) => namespaceMatches(skill.namespace, input.namespace) && textMatches(skill, input.text));
    const active = matching.find((skill) => skill.status === "active");
    if (active) {
      return {
        id: `skill-invocation-${slug(active.id)}-${slug(input.runId)}`,
        runId: input.runId,
        taskId: input.taskId,
        namespace: clone(input.namespace),
        status: "planned",
        skillId: active.id,
        skillTitle: active.title,
        selectedSkillStatus: active.status,
        executable: false,
        summary: `Approved skill ${active.title} is available for supervised invocation.`,
        plannedSteps: active.steps.map((step) => ({
          id: `invoke-${step.id}`,
          skillStepId: step.id,
          title: step.title,
          instruction: step.instruction,
          expectedOutcome: step.expectedOutcome,
          status: "planned",
        })),
        requiredApprovals: ["operator approval required before invoking an approved skill"],
        createdAt: now(),
      };
    }

    const selected = matching[0];
    const fallbackReason = this.fallbackReasonFor(selected);
    return {
      id: `skill-invocation-fallback-${slug(input.runId)}`,
      runId: input.runId,
      taskId: input.taskId,
      namespace: clone(input.namespace),
      status: "fallback",
      skillId: selected?.id,
      skillTitle: selected?.title,
      selectedSkillStatus: selected?.status,
      executable: false,
      summary: selected
        ? `Skill ${selected.title} is ${selected.status}; using manual fallback planning.`
        : "No matching approved skill is available; using manual fallback planning.",
      plannedSteps:
        selected?.steps.map((step) => ({
          id: `fallback-${step.id}`,
          skillStepId: step.id,
          title: step.title,
          instruction: step.instruction,
          expectedOutcome: step.expectedOutcome,
          status: "skipped" as const,
        })) ?? [],
      requiredApprovals: ["operator review required before creating or promoting a reusable skill"],
      fallbackReason,
      createdAt: now(),
    };
  }

  async updateSkillStatus(decision: SkillPromotionDecision): Promise<SkillDefinition> {
    const skill = this.skills.find((item) => item.id === decision.skillId);
    if (!skill) {
      throw new SkillRegistryFailure("skill_not_found", `skill not found: ${decision.skillId}`);
    }
    const nextStatus = transitionFor(decision.decision);
    assertValidTransition(skill.status, nextStatus);
    const updated: SkillDefinition = {
      ...skill,
      status: nextStatus,
      updatedAt: decision.decidedAt,
      supersededBy: nextStatus === "superseded" ? decision.supersededBy : skill.supersededBy,
      promotionDecisions: [...skill.promotionDecisions, clone(decision)],
    };
    this.skills = this.skills.map((item) => (item.id === updated.id ? updated : item));
    return clone(updated);
  }

  async rejectSkill(decision: SkillPromotionDecision): Promise<SkillDefinition> {
    return this.updateSkillStatus({ ...decision, decision: "reject" });
  }

  async promoteSkillManually(decision: SkillPromotionDecision): Promise<SkillDefinition> {
    return this.updateSkillStatus({ ...decision, decision: "promote" });
  }

  async summarizeSkills(namespace?: Partial<MemoryNamespace>): Promise<SkillSummary> {
    const skills = this.skills.filter((skill) => namespaceMatches(skill.namespace, namespace));
    const statusCounts: Record<SkillStatus, number> = {
      candidate: 0,
      active: 0,
      rejected: 0,
      superseded: 0,
      archived: 0,
    };
    for (const skill of skills) {
      statusCounts[skill.status] += 1;
    }
    const namespaces = new Set(skills.map((skill) => `${skill.namespace.capabilityId}:${skill.namespace.workspaceId}:${skill.namespace.repositoryPath ?? ""}`));
    return {
      skillCount: skills.length,
      statusCounts,
      namespaceCount: namespaces.size,
    };
  }

  private fallbackReasonFor(skill?: SkillDefinition): SkillInvocationFallbackReason {
    if (!skill) {
      return "no_matching_skill";
    }
    if (skill.status === "rejected") {
      return "skill_rejected";
    }
    if (skill.status === "archived") {
      return "skill_archived";
    }
    if (skill.status === "superseded") {
      return "skill_superseded";
    }
    return "skill_not_active";
  }
}

export type LocalSkillReplayPlannerOptions = {
  runStore?: RunStore;
  actor?: Actor;
};

export class LocalSkillReplayPlanner implements SkillReplayPlanner {
  private readonly runStore?: RunStore;
  private readonly actor: Actor;
  private readonly policyEngine = new ConservativePolicyEngine();

  constructor(options: LocalSkillReplayPlannerOptions = {}) {
    this.runStore = options.runStore;
    this.actor = options.actor ?? { kind: "runtime", id: "skill-replay-planner", displayName: "Skill Replay Planner" };
  }

  createReplayPlan(input: SkillReplayPlannerInput): SkillReplayPlan {
    const createdAt = now();
    this.appendEvent(input.runId, "skill_replay_plan_requested", {
      summary: `Skill replay dry-run plan requested: ${input.skill.title}`,
      skillId: input.skill.id,
      mode: input.mode,
      status: input.skill.status,
    });

    const preconditions = this.checkPreconditions(input);
    const policyChecks = this.checkPolicy(input);
    const budgetEstimate = this.estimateBudget(input);
    const validationExpectations = this.validationExpectations(input, policyChecks);
    const expectedArtifacts = this.expectedArtifacts(input);
    const stopReasons = this.stopReasonsFor(input, preconditions, policyChecks, budgetEstimate);
    const readiness = this.readinessFor(input, budgetEstimate, stopReasons);
    const redactedPaths: string[] = [];
    const rawPlan: SkillReplayPlan = {
      id: `skill-replay-plan-${slug(input.skill.id)}-${slug(input.runId)}`,
      runId: input.runId,
      taskId: input.taskId,
      skillId: input.skill.id,
      skillTitle: input.skill.title,
      skillStatus: input.skill.status,
      mode: input.mode,
      dryRunOnly: true,
      executable: false,
      readiness,
      summary: this.summaryFor(input, readiness, stopReasons),
      preconditions,
      steps: this.stepsFor(input, preconditions, policyChecks, validationExpectations, stopReasons),
      risks: this.risksFor(policyChecks, stopReasons),
      policyChecks,
      validationExpectations,
      budgetEstimate,
      blockedActions: unique(input.skill.safety.blockedActions),
      requiredApprovals: this.requiredApprovalsFor(input, policyChecks),
      expectedArtifacts,
      stopReasons,
      redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
      createdAt,
    };
    const plan = redactUnknown(rawPlan, "replayPlan", redactedPaths);
    plan.redaction = redaction(redactedPaths);

    this.appendEvent(input.runId, stopReasons.some((reason) => reason !== "candidate_preview_only") ? "skill_replay_plan_blocked" : "skill_replay_plan_created", {
      summary: this.summarizeReplayPlan(plan),
      skillId: input.skill.id,
      replayPlanId: plan.id,
      readiness: plan.readiness,
      stopReasons: plan.stopReasons,
    }, plan.expectedArtifacts);

    return plan;
  }

  checkPreconditions(input: SkillReplayPlannerInput): SkillReplayPreconditionResult[] {
    const results = input.skill.preconditions.map((precondition) => {
      const missing = /\bmissing\b/i.test(precondition.summary) || /\bunavailable\b/i.test(precondition.summary);
      const repositoryMismatch =
        precondition.kind === "repository_scope" &&
        input.skill.namespace.repositoryPath !== undefined &&
        input.skill.namespace.repositoryPath !== input.repositoryPath;
      const failed = precondition.required && (missing || repositoryMismatch);
      return {
        id: precondition.id,
        kind: precondition.kind,
        summary: precondition.summary,
        required: precondition.required,
        status: failed ? "failed" : "passed",
        reason: failed
          ? repositoryMismatch
            ? `Skill namespace repository ${input.skill.namespace.repositoryPath} does not match ${input.repositoryPath}.`
            : "Required replay precondition is missing."
          : undefined,
      } satisfies SkillReplayPreconditionResult;
    });

    this.appendEvent(input.runId, "skill_replay_preconditions_checked", {
      summary: `Replay preconditions checked: ${results.filter((item) => item.status === "passed").length}/${results.length} passed`,
      skillId: input.skill.id,
      failedPreconditions: results.filter((item) => item.status === "failed").map((item) => item.id),
    });

    return results;
  }

  checkPolicy(input: SkillReplayPlannerInput): SkillReplayPolicyCheck[] {
    const commandChecks = input.skill.validation.commands.map((command, index) =>
      this.toPolicyCheck(
        this.policyEngine.evaluateAction(
          {
            id: `skill-replay-command-${index + 1}`,
            kind: "command",
            summary: `Validate replay expectation: ${command}`,
            command,
          },
          input.policy,
        ),
        `Validate replay expectation: ${command}`,
      ),
    );

    const scopeCheck = this.toPolicyCheck(
      this.policyEngine.evaluateAction(
        {
          id: "skill-replay-scope",
          kind: "file_write",
          summary: "Check replay allowed scope against protected paths",
          paths: input.skill.safety.allowedPaths,
          estimatedChangedFiles: Math.max(1, input.skill.safety.allowedPaths.length),
        },
        input.policy,
      ),
      "Check replay allowed scope against protected paths",
    );
    const checks = [...commandChecks, scopeCheck];

    this.appendEvent(input.runId, "skill_replay_policy_checked", {
      summary: `Replay policy checked: ${checks.filter((item) => item.decision === "allow").length}/${checks.length} allowed`,
      skillId: input.skill.id,
      blocked: checks.filter((item) => item.decision === "block").map((item) => item.actionId),
      approvals: checks.filter((item) => item.approvalRequired).map((item) => item.actionId),
    });

    return checks;
  }

  estimateBudget(input: SkillReplayPlannerInput): SkillReplayBudgetEstimate {
    const estimatedSteps = Math.max(1, input.skill.steps.length + input.skill.preconditions.length + input.skill.validation.commands.length + 1);
    const estimatedCommands = input.skill.validation.commands.length;
    const estimatedArtifacts = Math.max(1, input.skill.provenance.artifactRefs.length + 1);
    const estimatedModelTokens = estimatedSteps * 600 + estimatedCommands * 400;
    const estimatedWallTimeMs = estimatedSteps * 45_000 + estimatedCommands * 30_000;
    const budget = input.policy.sandbox.budget;
    const stopReasons: SkillReplayStopReason[] = [];
    if (estimatedSteps > budget.maxSteps || estimatedModelTokens > budget.maxModelTokens || estimatedWallTimeMs > budget.maxWallTimeMs) {
      stopReasons.push("budget_exceeded");
    }
    const nearLimit =
      estimatedSteps >= budget.maxSteps * 0.8 ||
      estimatedModelTokens >= budget.maxModelTokens * 0.8 ||
      estimatedWallTimeMs >= budget.maxWallTimeMs * 0.8;
    const decision = stopReasons.length > 0 ? "stop" : nearLimit ? "warn" : "allow";
    const estimate: SkillReplayBudgetEstimate = {
      estimatedSteps,
      estimatedCommands,
      estimatedArtifacts,
      estimatedModelTokens,
      estimatedWallTimeMs,
      decision,
      stopReasons,
    };

    this.appendEvent(input.runId, "skill_replay_budget_estimated", {
      summary: `Replay budget estimated: ${decision}`,
      skillId: input.skill.id,
      estimate,
    });

    return estimate;
  }

  summarizeReplayPlan(plan: SkillReplayPlan): string {
    if (plan.readiness === "blocked") {
      return `Skill replay dry-run blocked for ${plan.skillTitle}: ${plan.stopReasons.join(", ")}`;
    }
    if (plan.readiness === "preview_only") {
      return `Skill replay dry-run preview only for ${plan.skillTitle}; candidate skills are not executable.`;
    }
    return `Skill replay dry-run plan ready for ${plan.skillTitle}: ${plan.steps.length} planned steps, ${plan.validationExpectations.length} validation expectations.`;
  }

  explainBlockedReplay(plan: SkillReplayPlan): string {
    if (plan.stopReasons.includes("skill_not_active")) {
      return "Replay is blocked because the skill is not active.";
    }
    if (plan.stopReasons.includes("missing_precondition")) {
      return "Replay is blocked because a required precondition failed.";
    }
    if (plan.stopReasons.includes("policy_blocked")) {
      return "Replay is blocked by the conservative policy gate.";
    }
    if (plan.stopReasons.includes("budget_exceeded")) {
      return "Replay is blocked because the dry-run estimate exceeds the configured budget.";
    }
    return plan.readiness === "blocked" ? "Replay is blocked by one or more dry-run stop reasons." : "Replay is not blocked.";
  }

  private toPolicyCheck(decision: PolicyDecision, summary: string): SkillReplayPolicyCheck {
    return {
      actionId: decision.actionId,
      summary,
      decision: decision.decision,
      risk: decision.risk,
      approvalRequired: decision.approvalRequired,
      reasons: decision.reasons,
      violations: decision.violations.map((violation) => violation.message),
    };
  }

  private validationExpectations(input: SkillReplayPlannerInput, policyChecks: SkillReplayPolicyCheck[]): SkillReplayValidationExpectation[] {
    return input.skill.validation.commands.map((command, index) => {
      const check = policyChecks[index];
      return {
        command,
        allowed: check?.decision === "allow",
        expectedEvidenceKinds: input.skill.validation.expectedEvidenceKinds,
        requiresVerifierPass: input.skill.validation.requiresVerifierPass,
        policyDecision: check?.decision,
        reason: check?.reasons.join(" "),
      };
    });
  }

  private expectedArtifacts(input: SkillReplayPlannerInput): ArtifactRef[] {
    return [
      {
        id: `skill-replay-plan-${slug(input.skill.id)}`,
        kind: "skill_replay_plan",
        uri: `orynt-artifact://${input.runId}/skills/${slug(input.skill.id)}-replay-plan.json`,
        label: "Skill replay dry-run plan",
      },
      ...input.skill.provenance.artifactRefs,
    ];
  }

  private stopReasonsFor(
    input: SkillReplayPlannerInput,
    preconditions: SkillReplayPreconditionResult[],
    policyChecks: SkillReplayPolicyCheck[],
    budgetEstimate: SkillReplayBudgetEstimate,
  ): SkillReplayStopReason[] {
    const reasons: SkillReplayStopReason[] = [];
    if (input.mode === "candidate_preview" && input.skill.status === "candidate") {
      reasons.push("candidate_preview_only");
    } else if (input.skill.status !== "active") {
      reasons.push("skill_not_active");
    }
    if (preconditions.some((item) => item.required && item.status === "failed")) {
      reasons.push("missing_precondition");
    }
    if (policyChecks.some((item) => item.decision === "block")) {
      reasons.push("policy_blocked");
    }
    if (budgetEstimate.decision === "stop") {
      reasons.push("budget_exceeded");
    }
    return unique(reasons);
  }

  private readinessFor(
    input: SkillReplayPlannerInput,
    budgetEstimate: SkillReplayBudgetEstimate,
    stopReasons: SkillReplayStopReason[],
  ): SkillReplayPlan["readiness"] {
    const blockingReasons = stopReasons.filter((reason) => reason !== "candidate_preview_only");
    if (blockingReasons.length > 0) {
      return "blocked";
    }
    if (input.mode === "candidate_preview" && input.skill.status === "candidate") {
      return "preview_only";
    }
    if (budgetEstimate.decision === "warn") {
      return "warning";
    }
    return "ready";
  }

  private summaryFor(input: SkillReplayPlannerInput, readiness: SkillReplayPlan["readiness"], stopReasons: SkillReplayStopReason[]): string {
    if (readiness === "preview_only") {
      return `${input.skill.title} is available as a dry-run preview only; candidate skills are not executable.`;
    }
    if (readiness === "blocked") {
      return `${input.skill.title} replay planning is blocked: ${stopReasons.join(", ")}.`;
    }
    if (readiness === "warning") {
      return `${input.skill.title} dry-run replay plan has budget warnings and requires manual review.`;
    }
    return `${input.skill.title} dry-run replay plan is ready for manual review.`;
  }

  private stepsFor(
    input: SkillReplayPlannerInput,
    preconditions: SkillReplayPreconditionResult[],
    policyChecks: SkillReplayPolicyCheck[],
    validationExpectations: SkillReplayValidationExpectation[],
    stopReasons: SkillReplayStopReason[],
  ): SkillReplayStep[] {
    const blocked = stopReasons.some((reason) => reason !== "candidate_preview_only");
    return [
      ...preconditions.map((precondition) => ({
        id: `replay-${precondition.id}`,
        title: precondition.summary,
        kind: "precondition" as const,
        summary: precondition.reason ?? precondition.summary,
        dryRunOnly: true as const,
        status: precondition.status === "failed" ? ("blocked" as const) : ("planned" as const),
      })),
      ...input.skill.steps.map((step) => ({
        id: `replay-${step.id}`,
        title: step.title,
        kind: "skill_step" as const,
        summary: `${step.instruction} Expected: ${step.expectedOutcome}`,
        dryRunOnly: true as const,
        status: blocked ? ("skipped" as const) : ("planned" as const),
      })),
      ...policyChecks.map((check) => ({
        id: `replay-${check.actionId}`,
        title: "Policy gate",
        kind: "policy_check" as const,
        summary: check.reasons.join(" "),
        dryRunOnly: true as const,
        status: check.decision === "block" ? ("blocked" as const) : ("planned" as const),
      })),
      ...validationExpectations.map((expectation, index) => ({
        id: `replay-validation-${index + 1}`,
        title: "Validation expectation",
        kind: "validation_expectation" as const,
        summary: expectation.command,
        dryRunOnly: true as const,
        status: expectation.allowed ? ("planned" as const) : ("blocked" as const),
      })),
    ];
  }

  private risksFor(policyChecks: SkillReplayPolicyCheck[], stopReasons: SkillReplayStopReason[]): SkillReplayRisk[] {
    if (stopReasons.some((reason) => reason !== "candidate_preview_only")) {
      return unique(["blocked", ...policyChecks.map((check) => check.risk)]);
    }
    return unique(policyChecks.map((check) => check.risk));
  }

  private requiredApprovalsFor(input: SkillReplayPlannerInput, policyChecks: SkillReplayPolicyCheck[]): string[] {
    const approvals = ["manual approval required before any future skill execution"];
    if (input.skill.safety.requiresManualApproval) {
      approvals.push("skill safety policy requires manual approval");
    }
    approvals.push(...policyChecks.filter((check) => check.approvalRequired).map((check) => check.reasons.join(" ")));
    return unique(approvals);
  }

  private appendEvent(runId: string, type: Parameters<RunStore["appendEvent"]>[1]["type"], payload: unknown, artifacts: ArtifactRef[] = []) {
    this.runStore?.appendEvent(runId, {
      type,
      actor: this.actor,
      payload,
      artifacts,
    });
  }
}
