import type {
  ArtifactRef,
  CandidateRule,
  EpisodicMemoryItem,
  MemoryNamespace,
  MemoryRedactionResult,
  SkillDefinition,
  SkillExtractionCandidate,
  SkillPromotionDecision,
  SkillRegistry,
  SkillStatus,
  SkillSummary,
  SkillQuery,
  SkillCandidateBuilderInput,
} from "@codepawl/shared";

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
}
