export * from "./runSpine.js";
export * from "./corePolicy.js";
export * from "./codexContracts.js";
export * from "./codexResultImportContracts.js";
export * from "./repositoryDiffContracts.js";
export * from "./canonicalEvidenceContracts.js";
export * from "./verifierContracts.js";
export * from "./contextWorkspace.js";
export * from "./memoryContracts.js";
export * from "./skillContracts.js";
export * from "./skillManagerContracts.js";
export * from "./agentLedger.js";
export * from "./orchestrationContracts.js";
export * from "./modelTierContracts.js";
export * from "./taskPlanContracts.js";
export * from "./promptUnderstandingContracts.js";
export * from "./languagePolicy.js";
export * from "./capabilityContracts.js";
export * from "./agentRuntimeContracts.js";
export * from "./multimodalContracts.js";
export * from "./intelligenceContracts.js";
export * from "./contextVmContracts.js";
export * from "./contextControlContracts.js";

import { createMockRunSequence } from "./runSpine.js";
import type { PermissionMode } from "./corePolicy.js";
import type { MonthlyUsageSummary } from "./agentLedger.js";
import type { ArtifactRef, RunEvent, RunSummary } from "./runSpine.js";
import type { CandidateRule, EpisodicMemoryItem, MemoryNamespace, MemoryProvenance, MemoryReviewSnapshot } from "./memoryContracts.js";
import type { SkillDefinition, SkillRegistrySnapshot } from "./skillContracts.js";

export type SurfaceKind = "repository" | "browser" | "desktop" | "files" | "terminal";

export type TaskStatus = "draft" | "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "paused";

export type RiskLevel = "low" | "medium" | "high" | "blocked";

export type Workspace = {
  id: string;
  name: string;
};

export type AgentTask = {
  id: string;
  title: string;
  status: TaskStatus;
  surface: SurfaceKind;
  createdAt: string;
  costUsd: number;
  screenshotCount: number;
  savedAsSkill: boolean;
};

export type AgentStep = {
  id: string;
  taskId: string;
  index: number;
  type: RunEvent["type"];
  title: string;
  detail: string;
  costUsd?: number;
  tokens?: number;
  status: "pending" | "running" | "passed" | "failed" | "blocked";
};

export type PermissionPolicy = {
  mode: PermissionMode;
  allowedSurfaces: Record<SurfaceKind, boolean>;
  askBefore: string[];
  neverAllow: string[];
  domainAllowlist: string[];
  domainDenylist: string[];
};

export type UsageBudget = {
  monthlyLimitUsd: number;
  currentSpendUsd: number;
  runLimitUsd: number;
  screenshotLimitPerRun: number;
  warnAtPercent: number;
};

export type TraceSummary = {
  runId: string;
  eventCount: number;
  artifactCount: number;
  latestVerdict: string;
  modelTokens: number;
};

export type SkillDraft = {
  id: string;
  name: string;
  sourceRunId: string;
  replayModelCalls: number;
  replaySavingsEstimateUsd: number;
};

export type MockRunState = {
  workspace: Workspace;
  activeTask: AgentTask;
  tasks: AgentTask[];
  steps: AgentStep[];
  permissionPolicy: PermissionPolicy;
  usageBudget: UsageBudget;
  usageSummary: MonthlyUsageSummary;
  traceSummary: TraceSummary;
  runSummary: RunSummary;
  events: RunEvent[];
  memoryReview: MemoryReviewSnapshot;
  skillRegistry: SkillRegistrySnapshot;
  skillDraft: SkillDraft;
};

export const MVP_EXECUTABLE_SURFACES = ["repository"] as const satisfies readonly SurfaceKind[];

export const MVP_BLOCKED_SURFACES = ["browser", "desktop", "files", "terminal"] as const satisfies readonly SurfaceKind[];

export function isExecutableMvpSurface(surface: SurfaceKind): boolean {
  return surface === "repository";
}

function createMockSkillRegistry(runId: string, taskId: string, memoryReview: MemoryReviewSnapshot): SkillRegistrySnapshot {
  const rule = memoryReview.candidateRules[0];
  const episode = memoryReview.latestEpisode;
  const skillArtifact: ArtifactRef = {
    id: "mock-skill-definition",
    kind: "skill_definition",
    uri: `orynt-artifact://${runId}/skills/skill-package-scope.json`,
    label: "Candidate skill definition",
    sha256: "mock-skill-definition-sha256",
  };
  const skill: SkillDefinition = {
    id: "skill-keep-package-fixes-scoped",
    namespace: memoryReview.namespace,
    capabilityId: "coding-apprentice.repository-scope",
    title: "Keep package fixes scoped",
    summary: "Apply package-only source fixes, keep protected files untouched, and validate with bun test:contracts. Redacted note: [REDACTED].",
    status: "candidate",
    confidence: 0.86,
    preconditions: [
      {
        id: "precondition-accepted-rule",
        kind: "memory_rule_status",
        summary: `Accepted rule required: ${rule?.id ?? "candidate-rule-package-scope"}`,
        required: true,
      },
      {
        id: "precondition-successful-verifier",
        kind: "verification_available",
        summary: "Successful verifier evidence must be present before manual promotion.",
        required: true,
      },
    ],
    steps: [
      {
        id: "step-review-scope",
        title: "Review repository scope",
        instruction: "Keep edits under packages/** unless a later approved contract expands scope.",
        expectedOutcome: "No protected paths are touched.",
        evidenceRefs: rule?.evidence.flatMap((item) => item.eventIds) ?? [],
      },
      {
        id: "step-validate",
        title: "Validate contracts",
        instruction: "Use verifier commands as validation expectations only; do not execute automatically.",
        expectedOutcome: "Verifier evidence remains passing.",
      },
    ],
    validation: {
      requiresVerifierPass: true,
      requiresDiffWithinScope: true,
      commands: ["bun test:contracts"],
      expectedEvidenceKinds: ["command", "diff_scope"],
    },
    safety: {
      allowedPaths: ["packages/**"],
      protectedPaths: [".env", "bun.lock"],
      allowedCommands: ["bun test:contracts"],
      blockedActions: ["automatic_execution", "codex_auto_run", "browser_automation", "secret_storage"],
      requiresManualApproval: true,
      rollbackNotes: "Archive or supersede this skill if later verifier evidence invalidates the package-scope rule.",
      secretHandling: "Store only redacted summaries and artifact references; never store raw sensitive values.",
    },
    provenance: {
      sourceRunIds: [runId],
      sourceTaskIds: [taskId],
      candidateRuleIds: rule ? [rule.id] : [],
      episodeIds: episode ? [episode.id] : [],
      verificationResultIds: ["mock-verification-result"],
      codexContractIds: ["mock-codex-contract"],
      artifactRefs: [skillArtifact, ...(rule?.provenance.artifactRefs ?? [])],
      sourceEventIds: rule?.provenance.eventIds ?? [],
    },
    redaction: { applied: true, redactedPaths: ["summary"], redactionCount: 1 },
    promotionDecisions: [],
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
  };

  return {
    namespace: memoryReview.namespace,
    skills: [skill],
    summary: {
      skillCount: 1,
      statusCounts: {
        candidate: 1,
        active: 0,
        rejected: 0,
        superseded: 0,
        archived: 0,
      },
      namespaceCount: 1,
    },
  };
}

function createMockMemoryReview(runId: string, taskId: string): MemoryReviewSnapshot {
  const namespace: MemoryNamespace = {
    capabilityId: "coding-apprentice",
    workspaceId: "workspace-local-alpha",
    repositoryPath: "/repos/orynt",
  };
  const memoryArtifact: ArtifactRef = {
    id: "mock-memory-episode",
    kind: "memory_episode",
    uri: `orynt-artifact://${runId}/memory/memory-store.json#episode`,
    label: "Episodic memory item",
    sha256: "mock-memory-episode-sha256",
  };
  const ruleArtifact: ArtifactRef = {
    id: "mock-candidate-rule",
    kind: "candidate_rule",
    uri: `orynt-artifact://${runId}/memory/memory-store.json#candidate-rule`,
    label: "Candidate project rule",
    sha256: "mock-candidate-rule-sha256",
  };
  const provenance: MemoryProvenance = {
    runId,
    taskId,
    eventIds: [`${runId}-event-38`, `${runId}-event-43`],
    artifactRefs: [memoryArtifact, ruleArtifact],
    sources: ["verification_result", "import_summary", "run_event"],
    sourceTimestamps: ["2026-06-26T00:00:00.000Z"],
    verificationResultId: "mock-verification-result",
    importBundleId: "mock-codex-result-import",
  };
  const latestEpisode: EpisodicMemoryItem = {
    id: "episode-latest-successful-run",
    namespace,
    kind: "run_episode",
    summary: "Latest successful run episode: verifier passed after a package-only imported correction.",
    content: {
      status: "pass",
      changedFiles: ["packages/shared/src/index.ts"],
      redactedNote: "[REDACTED]",
    },
    provenance,
    retention: { ttlDays: 30, archiveAfterDays: 90 },
    redaction: { applied: true, redactedPaths: ["content.redactedNote"], redactionCount: 1 },
    confidence: 1,
    createdAt: "2026-06-26T00:00:00.000Z",
  };
  const candidateRules: CandidateRule[] = [
    {
      id: "candidate-rule-package-scope",
      namespace,
      status: "candidate",
      title: "Keep package fixes scoped",
      rule: "Keep source-only fixes under packages/** unless the contract says otherwise.",
      scope: { repositoryPath: "/repos/orynt", allowedPaths: ["packages/**"], protectedPaths: [".env", "bun.lock"] },
      evidence: [
        {
          kind: "allowed_scope_pattern",
          summary: "Verifier passed after changed files stayed inside packages/**.",
          eventIds: [`${runId}-event-38`],
          artifactRefs: [memoryArtifact],
          confidence: 0.86,
        },
      ],
      provenance,
      redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
    {
      id: "candidate-rule-redacted-log",
      namespace,
      status: "candidate",
      title: "Avoid secret-bearing logs",
      rule: "Do not persist imported manual logs containing [REDACTED]; keep only redacted summaries and artifact references.",
      scope: { repositoryPath: "/repos/orynt", allowedPaths: ["apps/desktop/**", "packages/**"], protectedPaths: [".env", "*.pem"] },
      evidence: [
        {
          kind: "command_observation",
          summary: "Manual import evidence contained [REDACTED] and was redacted before display.",
          eventIds: [`${runId}-event-18`],
          artifactRefs: [ruleArtifact],
          confidence: 0.78,
        },
      ],
      provenance,
      redaction: { applied: true, redactedPaths: ["rule", "evidence[0].summary"], redactionCount: 2 },
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
  ];

  return {
    namespace,
    latestEpisode,
    episodes: [latestEpisode],
    candidateRules,
    summary: {
      episodeCount: 1,
      candidateRuleCount: candidateRules.length,
      candidateRuleStatusCounts: {
        candidate: candidateRules.length,
        accepted: 0,
        rejected: 0,
        superseded: 0,
      },
      namespaceCount: 1,
    },
  };
}

export function createMockRunState(): MockRunState {
  const mockRun = createMockRunSequence();
  const memoryReview = createMockMemoryReview(mockRun.run.id, mockRun.run.taskId);
  const skillRegistry = createMockSkillRegistry(mockRun.run.id, mockRun.run.taskId, memoryReview);
  const activeTask: AgentTask = {
    id: mockRun.run.taskId,
    title: mockRun.run.goal,
    status: "succeeded",
    surface: "repository",
    createdAt: "2026-06-25T16:00:00.000Z",
    costUsd: 0,
    screenshotCount: 0,
    savedAsSkill: false,
  };

  return {
    workspace: {
      id: "workspace-local-alpha",
      name: "Local Alpha Workspace",
    },
    activeTask,
    tasks: [
      activeTask,
      {
        id: "task-update-page",
        title: "Refactor stale shared type",
        status: "paused",
        surface: "repository",
        createdAt: "2026-06-25T15:20:00.000Z",
        costUsd: 0.18,
        screenshotCount: 0,
        savedAsSkill: true,
      },
      {
        id: "task-check-dashboard",
        title: "Add validation test coverage",
        status: "succeeded",
        surface: "repository",
        createdAt: "2026-06-25T14:10:00.000Z",
        costUsd: 0.31,
        screenshotCount: 0,
        savedAsSkill: true,
      },
    ],
    steps: mockRun.events.map((event) => ({
      id: event.id,
      taskId: activeTask.id,
      index: event.sequence,
      type: event.type,
      title: event.type.replaceAll("_", " "),
      detail: String((event.payload as { summary?: unknown }).summary ?? event.type),
      costUsd: event.budget?.estimatedUsd,
      tokens: event.budget?.modelTokens,
      status: event.verdict?.status === "fail" ? "failed" : "passed",
    })),
    permissionPolicy: {
      mode: "safe",
      allowedSurfaces: {
        repository: true,
        browser: false,
        desktop: false,
        files: false,
        terminal: false,
      },
      askBefore: ["protected_path_change", "destructive_command", "network_access", "secret_access"],
      neverAllow: ["secret_exfiltration", "unapproved_filesystem_write", "unapproved_shell_command"],
      domainAllowlist: [],
      domainDenylist: [],
    },
    usageBudget: {
      monthlyLimitUsd: 25,
      currentSpendUsd: 7.4,
      runLimitUsd: 1,
      screenshotLimitPerRun: 3,
      warnAtPercent: 80,
    },
    usageSummary: {
      workspaceId: "workspace-local-alpha",
      userId: "local-operator",
      month: "2026-07",
      runCount: 1,
      completedRunCount: 1,
      failedRunCount: 0,
      modelCallCount: 0,
      gatewayActionCount: 1,
      permissionDecisionCounts: {
        approved: 1,
      },
      artifactCount: mockRun.summary.artifactCount,
      creditsConsumed: 0.01,
    },
    traceSummary: {
      runId: mockRun.run.id,
      eventCount: mockRun.summary.eventCount,
      artifactCount: mockRun.summary.artifactCount,
      latestVerdict: mockRun.summary.latestVerdict?.status ?? "inconclusive",
      modelTokens: mockRun.summary.latestBudget?.modelTokens ?? 0,
    },
    runSummary: mockRun.summary,
    events: mockRun.events,
    memoryReview,
    skillRegistry,
    skillDraft: {
      id: "candidate-memory-failing-test",
      name: "Candidate repository rule from verified correction",
      sourceRunId: mockRun.run.id,
      replayModelCalls: 0,
      replaySavingsEstimateUsd: 0,
    },
  };
}
