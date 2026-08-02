import { createMockRunSequence, createMockRunState } from "@codepawl/shared";
import type {
  ApprovalDecisionInput,
  CandidateRule,
  CandidateRuleStatus,
  CandidateRuleStatusUpdateInput,
  CreateRunInput,
  EpisodicMemoryItem,
  MemoryMutationOptions,
  MemoryReviewSnapshot,
  MemoryRetrievalHit,
  MemoryRetrievalQuery,
  MemorySummary,
  MemoryStoreEnvelopeV2,
  MemoryTombstone,
  RunEvent,
  SemanticMemoryEditInput,
  SemanticMemoryItem,
  SemanticMemoryQuery,
  SemanticMemoryStatusUpdateInput,
  SkillDefinition,
  LearnedSkillSnapshotV1,
  SkillPromotionDecision,
  SkillRegistrySnapshot,
  SkillReplayMode,
  SkillReplayPlan,
  SkillStatus,
} from "@codepawl/shared";

type UnlistenFn = () => void;

type TauriCoreApi = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

type TauriEventApi = {
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn>;
};

type TauriDialogApi = {
  open(options?: { directory?: boolean; multiple?: boolean; title?: string; defaultPath?: string }): Promise<string | string[] | null>;
};

export type BrowseRepositoryPathUnavailableReason = "not-tauri" | "dialog-import-failed" | "dialog-open-failed";

export type BrowseRepositoryPathResult =
  | { status: "selected"; path: string }
  | { status: "cancelled" }
  | { status: "unavailable"; reason: BrowseRepositoryPathUnavailableReason; message: string };

export type CodexExecutionPreviewStatus = "approval_required" | "running" | "result_ready" | "blocked";

export type CodexExecutionPreview = {
  runId: string;
  planId: string;
  status: CodexExecutionPreviewStatus;
  command: string;
  contractArtifact: string;
  artifactRoot: string;
  blockedReasons: string[];
  approvalRequired: boolean;
  resultReady: boolean;
  verificationSeparate: boolean;
  summary: string;
};

export type RetentionPolicySnapshot = {
  runHistoryDays: number;
  artifactRetentionDays: number;
  cleanupEnabled: boolean;
  summary: string;
};

export type OperatorWorkType = "engineering" | "data-science" | "qa-automation" | "indie-builder";
export type AppearancePreference = "system" | "light" | "dark";
export type ChatFontPreference = "orynt-sans" | "orynt-serif" | "system";
export type MotionPreference = "system" | "reduced";
export type VoiceLanguagePreference = "english";
export type VoiceStylePreference = "buttery" | "precise" | "direct";
export type VoiceSpeedPreference = "slow" | "normal" | "fast";
export type ThinkingEffort = "minimal" | "none" | "low" | "medium" | "high" | "xhigh";

export type OperatorProfileSnapshot = {
  fullName: string;
  callSign: string;
  workType: OperatorWorkType;
};

export type UiPreferencesSnapshot = {
  appearance: AppearancePreference;
  chatFont: ChatFontPreference;
  motion: MotionPreference;
  showMessageBlockMeta: boolean;
};

export type VoicePreferencesSnapshot = {
  language: VoiceLanguagePreference;
  style: VoiceStylePreference;
  speed: VoiceSpeedPreference;
};

export type SettingsSnapshot = {
  workspaceId: string;
  permissionMode: "safe" | "balanced" | "manual";
  thinkingEffort: ThinkingEffort;
  executableSurfaces: string[];
  blockedSurfaces: string[];
  defaultRepositoryPath: string;
  welcomeCompleted: boolean;
  modelConnection: ModelConnectionReference | null;
  codexConnection: CodexConnectionReference | null;
  retentionPolicy: RetentionPolicySnapshot;
  operatorProfile: OperatorProfileSnapshot;
  uiPreferences: UiPreferencesSnapshot;
  voicePreferences: VoicePreferencesSnapshot;
};

export type SettingsUpdateInput = {
  permissionMode?: "safe" | "balanced" | "manual";
  thinkingEffort?: ThinkingEffort;
  defaultRepositoryPath?: string;
  welcomeCompleted?: boolean;
  executableSurfaces?: string[];
  retentionPolicy?: Partial<Pick<RetentionPolicySnapshot, "runHistoryDays" | "artifactRetentionDays" | "cleanupEnabled">>;
  operatorProfile?: Partial<OperatorProfileSnapshot>;
  uiPreferences?: Partial<UiPreferencesSnapshot>;
  voicePreferences?: Partial<VoicePreferencesSnapshot>;
};

export type AgentSkillScope = "project" | "user" | "runtime";
export type AgentSkillHealth = "ready" | "warning" | "blocked";
export type AgentSkillTrust = "trusted" | "community" | "untrusted";

export type InstalledAgentSkill = {
  id: string;
  name: string;
  description: string;
  version: string;
  scope: AgentSkillScope;
  sourceId: string;
  sourceLabel: string;
  digest: string;
  enabled: boolean;
  eligible: boolean;
  managed: boolean;
  pinned: boolean;
  drifted: boolean;
  health: AgentSkillHealth;
  trust: AgentSkillTrust;
  updateVersion?: string | null;
  updateRequiresReview?: boolean;
  path?: string | null;
  manifest?: string;
};

export type SkillCatalogItem = {
  id: string;
  name: string;
  description: string;
  publisher: string;
  version: string;
  sourceId: string;
  sourceLabel: string;
  trust: AgentSkillTrust;
  license?: string | null;
  compatibility?: string | null;
  installedSkillId?: string | null;
  capabilities: string[];
};

export type SkillSourceSnapshot = {
  id: string;
  label: string;
  kind: "github" | "marketplace" | "community" | "local" | "runtime";
  uri: string;
  trust: AgentSkillTrust;
  enabled: boolean;
  stale: boolean;
  lastRefreshedAt?: string | null;
  message?: string | null;
};

export type SkillInventorySnapshot = {
  scannedAt: string;
  skills: InstalledAgentSkill[];
  collisions: Array<{ name: string; skillIds: string[]; message: string }>;
  warnings: string[];
};

export type SkillHubSearchInput = {
  query?: string;
  sourceIds?: string[];
  repositoryPath?: string;
};

export type SkillMutationKind = "install" | "update" | "enable" | "disable" | "pin" | "unpin" | "remove" | "restore";

export type SkillMutationPlan = {
  id: string;
  kind: SkillMutationKind;
  skillId: string;
  skillName: string;
  scope: AgentSkillScope;
  summary: string;
  trust: AgentSkillTrust;
  expiresAt: string;
  approved: boolean;
  changes: Array<{ kind: "add" | "change" | "remove"; label: string; detail: string }>;
  warnings: string[];
};

export type SkillMutationPlanInput = {
  kind: SkillMutationKind;
  skillId: string;
  scope?: Exclude<AgentSkillScope, "runtime">;
  catalogItem?: SkillCatalogItem;
  repositoryPath?: string;
};

export type SkillMutationApprovalInput = {
  planId: string;
  actor: "operator";
  reason: string;
};

export type SkillMutationExecutionResult = {
  planId: string;
  status: "completed" | "recovered";
  inventory: SkillInventorySnapshot;
  message: string;
};

export type SkillContextSnapshot = {
  createdAt: string;
  skillIds: string[];
  digest: string;
  warnings: string[];
};

export type CodexConnectionStatus = "missing" | "authRequired" | "ready" | "failed";

export type CodexConnectionPreflightResult = {
  checkedConnectionId: string;
  status: CodexConnectionStatus;
  ready: boolean;
  checkedAt: string;
  executablePath?: string | null;
  authMode?: string | null;
  reasons: string[];
  warnings: string[];
};

export type CodexConnectionReference = {
  connectionId: string;
  label: string;
  status: CodexConnectionStatus;
  lastPreflight?: CodexConnectionPreflightResult | null;
};

export type CodexLoginMethod = "browser" | "deviceCode";

export type CodexLoginLaunchInput = {
  method: CodexLoginMethod;
};

export type CodexLoginLaunchResult = {
  method: CodexLoginMethod;
  command: string;
  message: string;
  loginUrl?: string | null;
};

export type ModelProviderId = "codex-cli" | "openai-api";
export type ModelAuthMethod = "codexCliSession" | "chatgptOAuth" | "deviceCode" | "accessToken" | "apiKeyEnv";
export type ModelConnectionStatus = "missing" | "authRequired" | "ready" | "failed";

export type ModelConnectionPreflightResult = {
  checkedProviderId: ModelProviderId;
  checkedModelId: string;
  status: ModelConnectionStatus;
  ready: boolean;
  checkedAt: string;
  executablePath?: string | null;
  authMode?: ModelAuthMethod | string | null;
  reasons: string[];
  warnings: string[];
};

export type ModelConnectionReference = {
  providerId: ModelProviderId;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  authMethod: ModelAuthMethod;
  envKey?: string | null;
  supportedThinkingEfforts?: ThinkingEffort[] | null;
  defaultThinkingEffort?: ThinkingEffort | null;
  status: ModelConnectionStatus;
  lastPreflight?: ModelConnectionPreflightResult | null;
};

export type ModelConnectionSetupInput = {
  providerId: ModelProviderId;
  modelId: string;
  modelLabel?: string | null;
  authMethod: ModelAuthMethod;
  envKey?: string | null;
  thinkingEffort?: ThinkingEffort | null;
  supportedThinkingEfforts?: ThinkingEffort[] | null;
  defaultThinkingEffort?: ThinkingEffort | null;
};

export type ModelProviderPreflightInput = {
  providerId: ModelProviderId;
  authMethod: ModelAuthMethod;
  envKey?: string | null;
};

export type ModelCatalogOption = {
  id: string;
  label: string;
  description?: string | null;
  ownedBy?: string | null;
  source: ModelProviderId;
  supportedThinkingEfforts?: ThinkingEffort[] | null;
  defaultThinkingEffort?: ThinkingEffort | null;
};

export type ModelCatalogListInput = {
  providerId: ModelProviderId;
  envKey?: string | null;
};

export type ModelCatalogResult = {
  providerId: ModelProviderId;
  fetchedAt: string;
  models: ModelCatalogOption[];
  source?: "live";
  warnings: string[];
};

export type PersistedRunSummary = {
  runId: string;
  taskId: string;
  workspaceId: string;
  goal: string;
  repositoryPath: string;
  status: string;
  checkpointRevision?: number | null;
  runtimeStatus?: DesktopRuntimeStatus | null;
  artifactManifestPath: string;
  eventCount: number;
  artifactCount: number;
  memoryCandidateCount: number;
  skillCount: number;
  updatedAt: string;
};

export type PersistedRunRecord = {
  runId: string;
  taskId: string;
  workspaceId: string;
  goal: string;
  repositoryPath: string;
  status: string;
  checkpointRevision?: number | null;
  runtimeStatus?: DesktopRuntimeStatus | null;
  approval?: DesktopRuntimeApproval | null;
  taskPlan?: DesktopRepositoryTaskPlan | null;
  artifactRoot: string;
  artifactManifestPath: string;
  events: RunEvent[];
  artifacts: Array<{ id: string; kind: string; uri: string; label: string; sha256?: string }>;
  usageSummary: Record<string, unknown>;
  memoryCandidates: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
  skillReplayPlan?: Record<string, unknown> | null;
  modelConnection: ModelConnectionReference | null;
  codexConnection: CodexConnectionReference | null;
  createdAt: string;
  updatedAt: string;
};

export type DesktopRuntimeStatus =
  | "waiting_for_approval"
  | "running"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled"
  | "execution_in_doubt";

export type DesktopRuntimeApproval = {
  id: string;
  actionId: string;
  requestedRevision: number;
  planId?: string;
  planRevision?: number;
  planDigest?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
};

export type DesktopRepositoryTaskPlan = {
  id: string;
  revision: number;
  summary: string;
  digest: string;
  tasks: Array<{
    id: string;
    title: string;
    authority: "read_only" | "single_writer";
    dependencies: string[];
  }>;
};

export type DesktopRunSnapshot = {
  id: string;
  schemaVersion?: 2;
  runId?: string;
  status?: DesktopRuntimeStatus;
  checkpointRevision?: number;
  approval?: DesktopRuntimeApproval | null;
  taskPlan?: DesktopRepositoryTaskPlan | null;
  executionAttemptStatus?: "prepared" | "dispatched" | "completed" | "in_doubt" | null;
  terminal?: boolean;
  summary?: string;
  artifactRoot?: string | null;
  artifactManifestPath?: string | null;
  eventCount?: number;
  events?: RunEvent[];
  verificationStatus?: "pass" | "partial" | "fail" | "inconclusive";
};

export type RunLifecycleInput = {
  runId: string;
  expectedRevision: number;
  reason?: string;
};

export type ArtifactEvidenceStatus = "verified" | "unavailable" | "corrupted";

export type ArtifactEvidenceKind =
  | "artifact_manifest"
  | "contract"
  | "contract_metadata"
  | "event_log"
  | "verifier_input"
  | "verification_result"
  | "redacted_log"
  | "memory_candidates"
  | "memory_store"
  | "usage_summary"
  | "replay_plan";

export type ArtifactEvidenceSummary = {
  artifactId: string;
  label: string;
  kind: ArtifactEvidenceKind;
  status: ArtifactEvidenceStatus;
  uri?: string | null;
  byteSize?: number | null;
  contentType?: string | null;
  reason?: string | null;
};

export type ArtifactEvidenceContent = {
  artifactId: string;
  label: string;
  kind: ArtifactEvidenceKind;
  status: ArtifactEvidenceStatus;
  contentType: string;
  byteSize: number;
  content: string;
};

let mockListeners = new Set<(event: RunEvent) => void>();
const initialMockState = createMockRunState();
let mockMemoryReview: MemoryReviewSnapshot = initialMockState.memoryReview;
let mockSkillRegistry: SkillRegistrySnapshot = initialMockState.skillRegistry;
let mockReviewEventSequence = 20_000;
let mockInstalledAgentSkills: InstalledAgentSkill[] = [
  {
    id: "openai:skill-creator@1.0.0",
    name: "skill-creator",
    description: "Create and validate portable Agent Skills.",
    version: "1.0.0",
    scope: "user",
    sourceId: "openai-curated",
    sourceLabel: "OpenAI curated",
    digest: "sha256:9be1…71c2",
    enabled: true,
    eligible: true,
    managed: true,
    pinned: false,
    drifted: false,
    health: "ready",
    trust: "trusted",
    updateVersion: null,
    manifest: "---\nname: skill-creator\ndescription: Create portable Agent Skills.\n---",
  },
  {
    id: "orynt-builtin:repository-onboarding",
    name: "repository-onboarding",
    description: "Map an unfamiliar repository before making changes.",
    version: "bundled",
    scope: "runtime",
    sourceId: "orynt-builtin",
    sourceLabel: "Orynt built-ins",
    digest: "sha256:01a1…b001",
    enabled: true,
    eligible: true,
    managed: false,
    pinned: false,
    drifted: false,
    health: "ready",
    trust: "trusted",
    updateVersion: null,
  },
  {
    id: "orynt-builtin:change-planner",
    name: "change-planner",
    description: "Plan a bounded repository change from live evidence.",
    version: "bundled",
    scope: "runtime",
    sourceId: "orynt-builtin",
    sourceLabel: "Orynt built-ins",
    digest: "sha256:02a2…b002",
    enabled: true,
    eligible: true,
    managed: false,
    pinned: false,
    drifted: false,
    health: "ready",
    trust: "trusted",
    updateVersion: null,
  },
  {
    id: "orynt-builtin:bug-fixer",
    name: "bug-fixer",
    description: "Reproduce and fix bugs with focused regression tests.",
    version: "bundled",
    scope: "runtime",
    sourceId: "orynt-builtin",
    sourceLabel: "Orynt built-ins",
    digest: "sha256:03a3…b003",
    enabled: true,
    eligible: true,
    managed: false,
    pinned: false,
    drifted: false,
    health: "ready",
    trust: "trusted",
    updateVersion: null,
  },
  {
    id: "orynt-builtin:code-reviewer",
    name: "code-reviewer",
    description: "Review repository changes for correctness and risk.",
    version: "bundled",
    scope: "runtime",
    sourceId: "orynt-builtin",
    sourceLabel: "Orynt built-ins",
    digest: "sha256:04a4…b004",
    enabled: true,
    eligible: true,
    managed: false,
    pinned: false,
    drifted: false,
    health: "ready",
    trust: "trusted",
    updateVersion: null,
  },
  {
    id: "orynt-builtin:release-readiness",
    name: "release-readiness",
    description: "Assess repository release readiness with evidence.",
    version: "bundled",
    scope: "runtime",
    sourceId: "orynt-builtin",
    sourceLabel: "Orynt built-ins",
    digest: "sha256:05a5…b005",
    enabled: true,
    eligible: true,
    managed: false,
    pinned: false,
    drifted: false,
    health: "ready",
    trust: "trusted",
    updateVersion: null,
  },
];
const mockSkillCatalog: SkillCatalogItem[] = [
  {
    id: "openai:docs-writer@1.2.0",
    name: "docs-writer",
    description: "Draft evidence-led product and engineering documentation.",
    publisher: "openai",
    version: "1.2.0",
    sourceId: "openai-curated",
    sourceLabel: "OpenAI curated",
    trust: "trusted",
    license: "MIT",
    compatibility: "Agent Skills",
    capabilities: ["repository-read", "repository-write"],
  },
  {
    id: "community:test-scenarios@0.4.1",
    name: "test-scenarios",
    description: "Generate structured test scenarios from requirements.",
    publisher: "community",
    version: "0.4.1",
    sourceId: "skills-sh",
    sourceLabel: "skills.sh",
    trust: "community",
    license: "Apache-2.0",
    compatibility: "Agent Skills",
    capabilities: ["repository-read"],
  },
];
let mockSkillSources: SkillSourceSnapshot[] = [
  {
    id: "orynt-builtin",
    label: "Orynt built-ins",
    kind: "runtime",
    uri: "orynt://builtins",
    trust: "trusted",
    enabled: true,
    stale: false,
    lastRefreshedAt: null,
    message: "Shipped with this Orynt build. Attach explicitly per run.",
  },
  {
    id: "openai-curated",
    label: "OpenAI curated",
    kind: "github",
    uri: "https://github.com/openai/skills",
    trust: "trusted",
    enabled: true,
    stale: false,
    lastRefreshedAt: new Date().toISOString(),
  },
  {
    id: "skills-sh",
    label: "skills.sh community",
    kind: "community",
    uri: "https://skills.sh",
    trust: "community",
    enabled: true,
    stale: false,
    lastRefreshedAt: new Date().toISOString(),
  },
];
const mockSkillMutationPlans = new Map<string, SkillMutationPlan>();

function mockInventorySnapshot(): SkillInventorySnapshot {
  return {
    scannedAt: new Date().toISOString(),
    skills: structuredClone(mockInstalledAgentSkills),
    collisions: [],
    warnings: [],
  };
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function loadTauriApi(): Promise<{ core: TauriCoreApi; event: TauriEventApi } | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  try {
    const [core, event] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
    return {
      core,
      event,
    };
  } catch {
    return null;
  }
}

type TauriDialogApiLoadResult =
  | { status: "ready"; dialog: TauriDialogApi }
  | { status: "unavailable"; reason: "not-tauri" | "dialog-import-failed"; message: string };

async function loadTauriDialogApi(): Promise<TauriDialogApiLoadResult> {
  if (!isTauriRuntime()) {
    return {
      status: "unavailable",
      reason: "not-tauri",
      message: "Native folder picker is only available in the Orynt desktop app. Open the Tauri window or paste the local path manually.",
    };
  }

  try {
    return {
      status: "ready",
      dialog: await import("@tauri-apps/plugin-dialog"),
    };
  } catch {
    return {
      status: "unavailable",
      reason: "dialog-import-failed",
      message: "Native folder picker could not load. Restart the Orynt desktop app and check Tauri dialog permissions.",
    };
  }
}

function emitMockRunEvent(event: RunEvent) {
  for (const listener of mockListeners) {
    listener(event);
  }
}

function nativeProviderUnavailable(): never {
  throw new Error("Provider connections are only available in the Orynt desktop app. Open the Tauri app to authenticate providers and fetch live models.");
}

function createMockCodexExecutionPreview(runId: string, overrides: Partial<CodexExecutionPreview> = {}): CodexExecutionPreview {
  const status = overrides.status ?? "approval_required";
  return {
    runId,
    planId: `codex-execution-plan-${runId}`,
    status,
    command: "codex exec --json --ephemeral --sandbox workspace-write",
    contractArtifact: `orynt-artifact://${runId}/codex-contract.md`,
    artifactRoot: `orynt-artifact://${runId}/execution/`,
    blockedReasons: [],
    approvalRequired: status === "approval_required",
    resultReady: status === "result_ready",
    verificationSeparate: true,
    summary: "Controlled Codex execution is disabled until this exact plan is approved.",
    ...overrides,
  };
}

function reviewEventType(status: Exclude<CandidateRuleStatus, "candidate">): RunEvent["type"] {
  if (status === "accepted") {
    return "candidate_rule_accepted";
  }
  if (status === "rejected") {
    return "candidate_rule_rejected";
  }
  return "candidate_rule_superseded";
}

function updateStatusCounts(candidateRules: CandidateRule[]): MemoryReviewSnapshot["summary"]["candidateRuleStatusCounts"] {
  return {
    candidate: candidateRules.filter((rule) => rule.status === "candidate").length,
    accepted: candidateRules.filter((rule) => rule.status === "accepted").length,
    rejected: candidateRules.filter((rule) => rule.status === "rejected").length,
    superseded: candidateRules.filter((rule) => rule.status === "superseded").length,
  };
}

function updateSkillStatusCounts(skills: SkillDefinition[]): SkillRegistrySnapshot["summary"]["statusCounts"] {
  return {
    candidate: skills.filter((skill) => skill.status === "candidate").length,
    active: skills.filter((skill) => skill.status === "active").length,
    rejected: skills.filter((skill) => skill.status === "rejected").length,
    superseded: skills.filter((skill) => skill.status === "superseded").length,
    archived: skills.filter((skill) => skill.status === "archived").length,
  };
}

function skillEventType(status: Exclude<SkillStatus, "candidate">): RunEvent["type"] {
  if (status === "active") {
    return "skill_promoted_manual";
  }
  if (status === "rejected") {
    return "skill_rejected";
  }
  if (status === "superseded") {
    return "skill_superseded";
  }
  return "skill_archived";
}

function emitCandidateRuleReviewEvent(rule: CandidateRule, runId?: string) {
  const eventRunId = runId ?? rule.provenance.runId;
  emitMockRunEvent({
    id: `${eventRunId}-event-${rule.status}-${rule.id}`,
    runId: eventRunId,
    sequence: mockReviewEventSequence++,
    type: reviewEventType(rule.status as Exclude<CandidateRuleStatus, "candidate">),
    timestamp: new Date().toISOString(),
    actor: { kind: "ui", id: "memory-review-panel", displayName: "Memory Review Panel" },
    payload: {
      summary: `Candidate rule ${rule.status}: ${rule.title}`,
      candidateRuleId: rule.id,
      status: rule.status,
    },
    redaction: { applied: false, redactedPaths: [] },
    artifacts: rule.provenance.artifactRefs.filter((artifact) => artifact.kind === "candidate_rule"),
  });
}

function emitSkillReviewEvent(skill: SkillDefinition, runId?: string) {
  const eventRunId = runId ?? skill.provenance.sourceRunIds[0] ?? "run-1";
  const status = skill.status as Exclude<SkillStatus, "candidate">;
  emitMockRunEvent({
    id: `${eventRunId}-event-${status}-${skill.id}`,
    runId: eventRunId,
    sequence: mockReviewEventSequence++,
    type: skillEventType(status),
    timestamp: new Date().toISOString(),
    actor: { kind: "ui", id: "skill-registry-panel", displayName: "Skill Registry Panel" },
    payload: {
      summary: `Skill ${status}: ${skill.title}`,
      skillId: skill.id,
      status: skill.status,
    },
    redaction: { applied: false, redactedPaths: [] },
    artifacts: skill.provenance.artifactRefs.filter((artifact) => artifact.kind === "skill_definition"),
  });
}

function createMockSkillReplayPlan(skill: SkillDefinition, runId = skill.provenance.sourceRunIds[0] ?? "run-1"): SkillReplayPlan {
  const mode: SkillReplayMode = skill.status === "candidate" ? "candidate_preview" : "active_dry_run";
  const blockedStatus = skill.status !== "active" && skill.status !== "candidate";
  const stopReasons = [
    ...(skill.status === "candidate" ? (["candidate_preview_only"] as const) : []),
    ...(blockedStatus ? (["skill_not_active"] as const) : []),
  ];
  const readiness = blockedStatus ? "blocked" : skill.status === "candidate" ? "preview_only" : "ready";
  return {
    id: `skill-replay-plan-${skill.id}`,
    runId,
    taskId: skill.provenance.sourceTaskIds[0] ?? "task-failing-unit-test",
    skillId: skill.id,
    skillTitle: skill.title,
    skillStatus: skill.status,
    mode,
    dryRunOnly: true,
    executable: false,
    readiness,
    summary:
      skill.status === "candidate"
        ? `${skill.title} is available as a dry-run preview only; candidate skills are not executable.`
        : `${skill.title} dry-run replay plan is ready for manual review.`,
    preconditions: skill.preconditions.map((precondition) => ({
      ...precondition,
      status: "passed",
    })),
    steps: skill.steps.map((step) => ({
      id: `replay-${step.id}`,
      title: step.title,
      kind: "skill_step",
      summary: `${step.instruction} Expected: ${step.expectedOutcome}`,
      dryRunOnly: true,
      status: blockedStatus ? "skipped" : "planned",
    })),
    risks: blockedStatus ? ["blocked"] : ["low"],
    policyChecks: skill.validation.commands.map((command, index) => ({
      actionId: `skill-replay-command-${index + 1}`,
      summary: `Validate replay expectation: ${command}`,
      decision: "allow",
      risk: "low",
      approvalRequired: false,
      reasons: ["Command is on the conservative allowlist."],
      violations: [],
    })),
    validationExpectations: skill.validation.commands.map((command) => ({
      command,
      allowed: true,
      expectedEvidenceKinds: skill.validation.expectedEvidenceKinds,
      requiresVerifierPass: skill.validation.requiresVerifierPass,
      policyDecision: "allow",
      reason: "Command is on the conservative allowlist.",
    })),
    budgetEstimate: {
      estimatedSteps: Math.max(1, skill.steps.length + skill.preconditions.length + skill.validation.commands.length + 1),
      estimatedCommands: skill.validation.commands.length,
      estimatedArtifacts: Math.max(1, skill.provenance.artifactRefs.length + 1),
      estimatedModelTokens: 2_800,
      estimatedWallTimeMs: 180_000,
      decision: "allow",
      stopReasons: [],
    },
    blockedActions: skill.safety.blockedActions,
    requiredApprovals: ["manual approval required before any future skill execution"],
    expectedArtifacts: [
      {
        id: `skill-replay-plan-${skill.id}`,
        kind: "skill_replay_plan",
        uri: `orynt-artifact://${runId}/skills/${skill.id}-replay-plan.json`,
        label: "Skill replay dry-run plan",
      },
    ],
    stopReasons,
    redaction: skill.redaction,
    createdAt: new Date().toISOString(),
  };
}

function emitSkillReplayEvents(plan: SkillReplayPlan) {
  const lifecycle = [
    "skill_replay_plan_requested",
    "skill_replay_preconditions_checked",
    "skill_replay_policy_checked",
    "skill_replay_budget_estimated",
    plan.readiness === "blocked" ? "skill_replay_plan_blocked" : "skill_replay_plan_created",
  ] as const;

  for (const type of lifecycle) {
    emitMockRunEvent({
      id: `${plan.runId}-event-${type}-${plan.skillId}`,
      runId: plan.runId,
      sequence: mockReviewEventSequence++,
      type,
      timestamp: new Date().toISOString(),
      actor: { kind: "ui", id: "skill-registry-panel", displayName: "Skill Registry Panel" },
      payload: {
        summary: `Skill replay ${plan.readiness}: ${plan.skillTitle}`,
        skillId: plan.skillId,
        replayPlanId: plan.id,
        readiness: plan.readiness,
      },
      redaction: { applied: plan.redaction.applied, redactedPaths: plan.redaction.redactedPaths },
      artifacts: type === "skill_replay_plan_created" || type === "skill_replay_plan_blocked" ? plan.expectedArtifacts : [],
    });
  }
}

function applyMockSkillDecision(input: SkillPromotionDecision): SkillDefinition {
  const skill = mockSkillRegistry.skills.find((item) => item.id === input.skillId);
  if (!skill) {
    throw new Error(`skill not found: ${input.skillId}`);
  }
  const status: SkillStatus =
    input.decision === "promote" ? "active" : input.decision === "reject" ? "rejected" : input.decision === "supersede" ? "superseded" : "archived";
  const updated: SkillDefinition = {
    ...skill,
    status,
    supersededBy: status === "superseded" ? (input.supersededBy ?? "skill-replacement-demo") : skill.supersededBy,
    updatedAt: input.decidedAt,
    promotionDecisions: [...skill.promotionDecisions, input],
  };
  const skills = mockSkillRegistry.skills.map((item) => (item.id === updated.id ? updated : item));
  mockSkillRegistry = {
    ...mockSkillRegistry,
    skills,
    summary: {
      ...mockSkillRegistry.summary,
      statusCounts: updateSkillStatusCounts(skills),
    },
  };
  queueMicrotask(() => emitSkillReviewEvent(updated, input.runId));
  return structuredClone(updated);
}

export const orynt = {
  createCodexExecutionPreview(runId: string): CodexExecutionPreview {
    return createMockCodexExecutionPreview(runId);
  },

  async approveCodexExecution(runId: string, planId: string): Promise<CodexExecutionPreview> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CodexExecutionPreview>("codex_execution_approve", { input: { runId, planId } });
    }

    queueMicrotask(() => {
      emitMockRunEvent({
        id: `${runId}-event-codex-execution-approved`,
        runId,
        sequence: mockReviewEventSequence++,
        type: "codex_execution_approved",
        timestamp: new Date().toISOString(),
        actor: { kind: "ui", id: "codex-execution-panel", displayName: "Codex Execution Panel" },
        payload: {
          summary: "Controlled Codex execution approved by operator",
          planId,
        },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
      });
      emitMockRunEvent({
        id: `${runId}-event-codex-execution-started`,
        runId,
        sequence: mockReviewEventSequence++,
        type: "codex_execution_started",
        timestamp: new Date().toISOString(),
        actor: { kind: "runtime", id: "codex-execution-panel", displayName: "Codex Execution Panel" },
        payload: {
          summary: "Controlled Codex execution started in managed sandbox",
          planId,
        },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    emitMockRunEvent({
      id: `${runId}-event-codex-execution-result-ready`,
      runId,
      sequence: mockReviewEventSequence++,
      type: "codex_execution_result_ready",
      timestamp: new Date().toISOString(),
      actor: { kind: "runtime", id: "codex-execution-panel", displayName: "Codex Execution Panel" },
      payload: {
        summary: "Controlled Codex execution result ready for import",
        planId,
        importReady: true,
      },
      redaction: { applied: false, redactedPaths: [] },
      artifacts: [
        {
          id: `${planId}-result`,
          kind: "codex_execution_result",
          uri: `orynt-artifact://${runId}/execution/codex-execution-result.json`,
          label: "Controlled Codex execution result",
        },
      ],
    });
    return createMockCodexExecutionPreview(runId, {
      planId,
      status: "result_ready",
      approvalRequired: false,
      resultReady: true,
      summary: "Result ready for import. Verification remains separate.",
    });
  },

  async showBlockedCodexExecution(runId: string, planId: string): Promise<CodexExecutionPreview> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CodexExecutionPreview>("codex_execution_blocked_preview", { input: { runId, planId } });
    }

    queueMicrotask(() => {
      emitMockRunEvent({
        id: `${runId}-event-codex-execution-blocked`,
        runId,
        sequence: mockReviewEventSequence++,
        type: "codex_execution_blocked",
        timestamp: new Date().toISOString(),
        actor: { kind: "policy", id: "codex-execution-panel", displayName: "Codex Execution Panel" },
        payload: {
          summary: "Controlled Codex execution blocked: codex_missing",
          planId,
          failureReasons: ["codex_missing"],
        },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
      });
    });
    return createMockCodexExecutionPreview(runId, {
      planId,
      status: "blocked",
      approvalRequired: false,
      blockedReasons: ["codex_missing"],
      summary: "Blocked before execution because Codex is missing from the controlled runtime.",
    });
  },

  async createRun(input: CreateRunInput): Promise<DesktopRunSnapshot> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await tauri.core.invoke<Omit<DesktopRunSnapshot, "id"> & { runId: string }>("run_create", { input });
      return { ...snapshot, id: snapshot.runId };
    }

    const mockRun = createMockRunSequence();
    const runId = mockRun.run.id;
    queueMicrotask(() => {
      for (const event of mockRun.events) {
        emitMockRunEvent(event);
      }
    });

    return {
      schemaVersion: 2,
      id: runId,
      runId,
      status: "waiting_for_approval",
      checkpointRevision: 0,
      approval: {
        id: `approval-${runId}`,
        actionId: `action-${runId}`,
        requestedRevision: 0,
        status: "pending",
      },
      executionAttemptStatus: null,
      terminal: false,
      summary: "Waiting for operator approval.",
      artifactRoot: null,
      artifactManifestPath: null,
      eventCount: mockRun.events.length,
      events: mockRun.events,
    };
  },

  async listPersistedRuns(): Promise<PersistedRunSummary[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<PersistedRunSummary[]>("run_list");
    }

    return [];
  },

  async openPersistedRun(runId: string): Promise<PersistedRunRecord> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<PersistedRunRecord>("run_open", { runId });
    }

    throw new Error(`persisted run not found: ${runId}`);
  },

  async listArtifactEvidence(runId: string): Promise<ArtifactEvidenceSummary[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<ArtifactEvidenceSummary[]>("artifact_list", { runId });
    }

    return [
      {
        artifactId: "artifactManifest",
        label: "Artifact manifest",
        kind: "artifact_manifest",
        status: "verified",
        byteSize: 128,
        contentType: "application/json",
      },
    ];
  },

  async readArtifactEvidence(runId: string, artifactId: string): Promise<ArtifactEvidenceContent> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<ArtifactEvidenceContent>("artifact_read", { input: { runId, artifactId } });
    }

    return {
      artifactId,
      label: artifactId === "artifactManifest" ? "Artifact manifest" : artifactId,
      kind: artifactId === "artifactManifest" ? "artifact_manifest" : "contract",
      status: "verified",
      contentType: "application/json",
      byteSize: 128,
      content: JSON.stringify({ runId, artifactId, mode: "mock-demo" }, null, 2),
    };
  },

  async getSettings(): Promise<SettingsSnapshot> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SettingsSnapshot>("settings_get");
    }

    return {
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      thinkingEffort: "medium",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "",
      welcomeCompleted: false,
      modelConnection: null,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
      operatorProfile: {
        fullName: "Operator",
        callSign: "Operator",
        workType: "engineering",
      },
      uiPreferences: {
        appearance: "dark",
        chatFont: "orynt-sans",
        motion: "system",
        showMessageBlockMeta: false,
      },
      voicePreferences: {
        language: "english",
        style: "buttery",
        speed: "normal",
      },
    };
  },

  async detectCurrentRepositoryPath(): Promise<string | null> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<string | null>("repository_detect_current_path");
    }

    return null;
  },

  async browseRepositoryPath(defaultPath?: string): Promise<BrowseRepositoryPathResult> {
    const dialogResult = await loadTauriDialogApi();
    if (dialogResult.status === "unavailable") {
      return dialogResult;
    }

    try {
      const selected = await dialogResult.dialog.open({
        directory: true,
        multiple: false,
        title: "Choose Orynt local directory",
        defaultPath: defaultPath?.trim() || undefined,
      });
      return typeof selected === "string" ? { status: "selected", path: selected } : { status: "cancelled" };
    } catch {
      return {
        status: "unavailable",
        reason: "dialog-open-failed",
        message: "Native folder picker could not open. Restart the Orynt desktop app or paste the local path manually.",
      };
    }
  },

  async updateSettings(input: SettingsUpdateInput): Promise<SettingsSnapshot> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SettingsSnapshot>("settings_update", { input });
    }

    const currentSettings = await this.getSettings();
    const nextRetentionPolicy = input.retentionPolicy
      ? {
          ...currentSettings.retentionPolicy,
          ...input.retentionPolicy,
        }
      : currentSettings.retentionPolicy;
    const retentionPolicy = input.retentionPolicy
      ? {
          ...nextRetentionPolicy,
          summary: nextRetentionPolicy.cleanupEnabled
            ? `Automatic cleanup after ${nextRetentionPolicy.runHistoryDays} days for runs and ${nextRetentionPolicy.artifactRetentionDays} days for artifacts.`
            : "Cleanup is manual for private beta; automatic retention is planned.",
        }
      : nextRetentionPolicy;

    return {
      ...currentSettings,
      ...input,
      executableSurfaces: input.executableSurfaces ? ["repository"] : currentSettings.executableSurfaces,
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      retentionPolicy,
      operatorProfile: input.operatorProfile ? { ...currentSettings.operatorProfile, ...input.operatorProfile } : currentSettings.operatorProfile,
      uiPreferences: input.uiPreferences ? { ...currentSettings.uiPreferences, ...input.uiPreferences } : currentSettings.uiPreferences,
      voicePreferences: input.voicePreferences ? { ...currentSettings.voicePreferences, ...input.voicePreferences } : currentSettings.voicePreferences,
    };
  },

  async preflightModelProvider(input: ModelProviderPreflightInput): Promise<ModelConnectionPreflightResult> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<ModelConnectionPreflightResult>("model_provider_preflight", { input });
    }

    return nativeProviderUnavailable();
  },

  async listProviderModels(input: ModelCatalogListInput): Promise<ModelCatalogResult> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<ModelCatalogResult>("model_connection_list_models", { input });
    }

    return nativeProviderUnavailable();
  },

  async saveModelConnection(input: ModelConnectionSetupInput): Promise<ModelConnectionReference> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<ModelConnectionReference>("model_connection_save", { input });
    }

    return nativeProviderUnavailable();
  },

  async preflightModelConnection(): Promise<ModelConnectionPreflightResult> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<ModelConnectionPreflightResult>("model_connection_preflight");
    }

    return nativeProviderUnavailable();
  },

  async deleteModelConnection(): Promise<void> {
    const tauri = await loadTauriApi();
    if (tauri) {
      await tauri.core.invoke<void>("model_connection_delete");
      return;
    }

    nativeProviderUnavailable();
  },

  async saveCodexConnection(): Promise<CodexConnectionReference> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CodexConnectionReference>("codex_connection_save", {
        input: { connectionId: "codex-cli", label: "Local Codex CLI" },
      });
    }

    return nativeProviderUnavailable();
  },

  async preflightCodexConnection(): Promise<CodexConnectionPreflightResult> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CodexConnectionPreflightResult>("codex_connection_preflight");
    }

    return nativeProviderUnavailable();
  },

  async launchCodexLogin(input: CodexLoginLaunchInput): Promise<CodexLoginLaunchResult> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CodexLoginLaunchResult>("codex_connection_login", { input });
    }

    return nativeProviderUnavailable();
  },

  async deleteCodexConnection(): Promise<void> {
    const tauri = await loadTauriApi();
    if (tauri) {
      await tauri.core.invoke<void>("codex_connection_delete");
      return;
    }

    nativeProviderUnavailable();
  },

  async cancelRun(input: RunLifecycleInput): Promise<DesktopRunSnapshot | undefined> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await tauri.core.invoke<Omit<DesktopRunSnapshot, "id"> & { runId: string }>("run_cancel", { input });
      return { ...snapshot, id: snapshot.runId };
    }
    return undefined;
  },

  async approve(input: ApprovalDecisionInput): Promise<DesktopRunSnapshot | undefined | void> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await tauri.core.invoke<Omit<DesktopRunSnapshot, "id"> & { runId: string }>("approval_respond", { input });
      return { ...snapshot, id: snapshot.runId };
    }

    queueMicrotask(() => {
      emitMockRunEvent({
        id: `${input.runId}-event-approval-${input.approvalId}`,
        runId: input.runId,
        sequence: 10_000,
        type: "action_blocked_or_approved",
        timestamp: new Date().toISOString(),
        actor: { kind: "policy", id: "mock-policy", displayName: "Mock Policy" },
        payload: {
          summary: `Approval ${input.decision} for ${input.approvalId}`,
          approvalId: input.approvalId,
          decision: input.decision,
        },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
        safety: {
          policyMode: "safe",
          riskLevel: input.decision === "approved" ? "low" : "blocked",
          approvalRequired: false,
          protectedPathTouched: false,
          commandAllowed: input.decision === "approved",
          reasons: [`operator ${input.decision}`],
        },
      });
    });
    return undefined;
  },

  async statusRun(runId: string): Promise<DesktopRunSnapshot> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await tauri.core.invoke<Omit<DesktopRunSnapshot, "id"> & { runId: string }>("run_status", { runId });
      return { ...snapshot, id: snapshot.runId };
    }
    throw new Error(`runtime status not found: ${runId}`);
  },

  async recoverRun(input: RunLifecycleInput): Promise<DesktopRunSnapshot> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await tauri.core.invoke<Omit<DesktopRunSnapshot, "id"> & { runId: string }>("run_recover", { input });
      return { ...snapshot, id: snapshot.runId };
    }
    throw new Error(`runtime recovery unavailable: ${input.runId}`);
  },

  async markRunFailed(input: RunLifecycleInput): Promise<DesktopRunSnapshot> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await tauri.core.invoke<Omit<DesktopRunSnapshot, "id"> & { runId: string }>("run_mark_failed", { input });
      return { ...snapshot, id: snapshot.runId };
    }
    throw new Error(`runtime mark-failed unavailable: ${input.runId}`);
  },

  async listMemoryEpisodes(): Promise<EpisodicMemoryItem[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<EpisodicMemoryItem[]>("memory_list_episodes");
    }

    return structuredClone(mockMemoryReview.episodes);
  },

  async listCandidateRules(): Promise<CandidateRule[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CandidateRule[]>("memory_list_candidate_rules");
    }

    return structuredClone(mockMemoryReview.candidateRules);
  },

  async updateCandidateRuleStatus(input: CandidateRuleStatusUpdateInput): Promise<CandidateRule> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CandidateRule>("memory_update_candidate_rule_status", { input });
    }

    const rule = mockMemoryReview.candidateRules.find((item) => item.id === input.id);
    if (!rule) {
      throw new Error(`candidate rule not found: ${input.id}`);
    }
    const updated: CandidateRule = {
      ...rule,
      status: input.status,
      updatedAt: new Date().toISOString(),
      supersededBy: input.status === "superseded" ? (input.supersededBy ?? "candidate-rule-replacement-demo") : rule.supersededBy,
    };
    const candidateRules = mockMemoryReview.candidateRules.map((item) => (item.id === updated.id ? updated : item));
    mockMemoryReview = {
      ...mockMemoryReview,
      candidateRules,
      summary: {
        ...mockMemoryReview.summary,
        candidateRuleStatusCounts: updateStatusCounts(candidateRules),
      },
    };
    queueMicrotask(() => emitCandidateRuleReviewEvent(updated, input.runId));
    return structuredClone(updated);
  },

  async listSemanticMemory(
    query: SemanticMemoryQuery = {},
  ): Promise<SemanticMemoryItem[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SemanticMemoryItem[]>("memory_list_semantic", {
        input: { query },
      });
    }
    return [];
  },

  async updateSemanticMemoryStatus(
    decision: SemanticMemoryStatusUpdateInput,
    options: MemoryMutationOptions = {},
  ): Promise<SemanticMemoryItem> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SemanticMemoryItem>(
        "memory_update_semantic_status",
        { input: { decision, options } },
      );
    }
    throw new Error(`semantic memory not found: ${decision.id}`);
  },

  async editSemanticMemory(
    edit: SemanticMemoryEditInput,
    options: MemoryMutationOptions = {},
  ): Promise<SemanticMemoryItem> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SemanticMemoryItem>("memory_edit_semantic", {
        input: { edit, options },
      });
    }
    throw new Error(`semantic memory not found: ${edit.id}`);
  },

  async deleteSemanticMemory(
    decision: Omit<SemanticMemoryStatusUpdateInput, "status">,
    options: MemoryMutationOptions = {},
  ): Promise<SemanticMemoryItem> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SemanticMemoryItem>("memory_delete_semantic", {
        input: { decision, options },
      });
    }
    throw new Error(`semantic memory not found: ${decision.id}`);
  },

  async restoreSemanticMemory(
    decision: Omit<SemanticMemoryStatusUpdateInput, "status">,
    options: MemoryMutationOptions = {},
  ): Promise<SemanticMemoryItem> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SemanticMemoryItem>("memory_restore_semantic", {
        input: { decision, options },
      });
    }
    throw new Error(`semantic memory not found: ${decision.id}`);
  },

  async purgeSemanticMemory(
    decision: Omit<SemanticMemoryStatusUpdateInput, "status">,
    options: MemoryMutationOptions = {},
  ): Promise<MemoryTombstone> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<MemoryTombstone>("memory_purge_semantic", {
        input: { decision, options },
      });
    }
    throw new Error(`semantic memory not found: ${decision.id}`);
  },

  async retrieveMemory(query: MemoryRetrievalQuery): Promise<MemoryRetrievalHit[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<MemoryRetrievalHit[]>("memory_retrieve", {
        input: { query },
      });
    }
    return [];
  },

  async summarizeMemory(
    namespace: MemoryRetrievalQuery["namespace"] = {},
  ): Promise<MemorySummary> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<MemorySummary>("memory_summary", {
        input: { namespace },
      });
    }
    return structuredClone(mockMemoryReview.summary);
  },

  async getMemorySnapshot(): Promise<MemoryStoreEnvelopeV2> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<MemoryStoreEnvelopeV2>("memory_snapshot");
    }
    return {
      schemaVersion: 3,
      revision: 0,
      updatedAt: new Date().toISOString(),
      episodes: structuredClone(mockMemoryReview.episodes),
      candidateRules: structuredClone(mockMemoryReview.candidateRules),
      semanticMemory: [],
      tombstones: [],
      auditLog: [],
    };
  },

  async scanAgentSkills(repositoryPath?: string): Promise<SkillInventorySnapshot> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillInventorySnapshot>("skill_inventory_scan", { input: { repositoryPath } });
    }
    return mockInventorySnapshot();
  },

  async listInstalledAgentSkills(repositoryPath?: string): Promise<SkillInventorySnapshot> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillInventorySnapshot>("skill_inventory_list", { input: { repositoryPath } });
    }
    return mockInventorySnapshot();
  },

  async getInstalledAgentSkill(skillId: string): Promise<InstalledAgentSkill> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<InstalledAgentSkill>("skill_inventory_get", { skillId });
    }
    const skill = mockInstalledAgentSkills.find((item) => item.id === skillId);
    if (!skill) {
      throw new Error(`installed skill not found: ${skillId}`);
    }
    return structuredClone(skill);
  },

  async listSkillSources(): Promise<SkillSourceSnapshot[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillSourceSnapshot[]>("skill_hub_list_sources");
    }
    return structuredClone(mockSkillSources);
  },

  async refreshSkillHub(): Promise<SkillSourceSnapshot[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillSourceSnapshot[]>("skill_hub_refresh");
    }
    mockSkillSources = mockSkillSources.map((source) => ({ ...source, stale: false, lastRefreshedAt: new Date().toISOString(), message: null }));
    return structuredClone(mockSkillSources);
  },

  async searchSkillHub(input: SkillHubSearchInput): Promise<SkillCatalogItem[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillCatalogItem[]>("skill_hub_search", { input });
    }
    const normalizedQuery = input.query?.trim().toLowerCase() ?? "";
    const enabledSourceIds = new Set(mockSkillSources.filter((source) => source.enabled).map((source) => source.id));
    return structuredClone(
      mockSkillCatalog
        .filter((item) => enabledSourceIds.has(item.sourceId))
        .filter((item) => !input.sourceIds?.length || input.sourceIds.includes(item.sourceId))
        .filter((item) => !normalizedQuery || `${item.name} ${item.description} ${item.publisher}`.toLowerCase().includes(normalizedQuery))
        .map((item) => ({
          ...item,
          installedSkillId: mockInstalledAgentSkills.find((skill) => skill.name === item.name)?.id ?? null,
        })),
    );
  },

  async getSkillHubItem(skillId: string): Promise<SkillCatalogItem> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillCatalogItem>("skill_hub_get", { skillId });
    }
    const item = mockSkillCatalog.find((candidate) => candidate.id === skillId);
    if (!item) {
      throw new Error(`catalog skill not found: ${skillId}`);
    }
    return structuredClone(item);
  },

  async planSkillMutation(input: SkillMutationPlanInput): Promise<SkillMutationPlan> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillMutationPlan>("skill_mutation_plan", { input });
    }
    const installed = mockInstalledAgentSkills.find((skill) => skill.id === input.skillId);
    const catalogItem = input.catalogItem ?? mockSkillCatalog.find((item) => item.id === input.skillId);
    const skillName = installed?.name ?? catalogItem?.name ?? input.skillId;
    const trust = installed?.trust ?? catalogItem?.trust ?? "untrusted";
    const scope = input.scope ?? (installed?.scope === "project" ? "project" : "user");
    const plan: SkillMutationPlan = {
      id: `skill-plan-${Date.now()}-${input.kind}-${skillName}`,
      kind: input.kind,
      skillId: input.skillId,
      skillName,
      scope,
      summary: `${input.kind[0].toUpperCase()}${input.kind.slice(1)} ${skillName} in ${scope} scope.`,
      trust,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      approved: false,
      changes: [
        {
          kind: input.kind === "remove" ? "remove" : installed ? "change" : "add",
          label: skillName,
          detail:
            input.kind === "install"
              ? `Install ${catalogItem?.version ?? "selected release"} without enabling it.`
              : `${input.kind} the managed skill receipt and local policy.`,
        },
      ],
      warnings: trust === "trusted" ? [] : ["Community content is untrusted until the operator reviews its instructions and capabilities."],
    };
    mockSkillMutationPlans.set(plan.id, plan);
    return structuredClone(plan);
  },

  async approveSkillMutation(input: SkillMutationApprovalInput): Promise<SkillMutationPlan> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillMutationPlan>("skill_mutation_approve", { input });
    }
    const plan = mockSkillMutationPlans.get(input.planId);
    if (!plan) {
      throw new Error(`skill mutation plan not found: ${input.planId}`);
    }
    const approved = { ...plan, approved: true };
    mockSkillMutationPlans.set(plan.id, approved);
    return structuredClone(approved);
  },

  async executeSkillMutation(planId: string, repositoryPath?: string): Promise<SkillMutationExecutionResult> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillMutationExecutionResult>("skill_mutation_execute", { input: { planId, repositoryPath } });
    }
    const plan = mockSkillMutationPlans.get(planId);
    if (!plan?.approved) {
      throw new Error("Operator approval is required before executing this skill change.");
    }
    const currentIndex = mockInstalledAgentSkills.findIndex((skill) => skill.id === plan.skillId);
    const current = currentIndex >= 0 ? mockInstalledAgentSkills[currentIndex] : undefined;
    if (plan.kind === "install") {
      const catalogItem = mockSkillCatalog.find((item) => item.id === plan.skillId);
      if (!catalogItem) {
        throw new Error(`catalog skill not found: ${plan.skillId}`);
      }
      const installed: InstalledAgentSkill = {
        id: catalogItem.id,
        name: catalogItem.name,
        description: catalogItem.description,
        version: catalogItem.version,
        scope: plan.scope,
        sourceId: catalogItem.sourceId,
        sourceLabel: catalogItem.sourceLabel,
        digest: `sha256:mock-${catalogItem.name}`,
        enabled: false,
        eligible: false,
        managed: true,
        pinned: false,
        drifted: false,
        health: "ready",
        trust: catalogItem.trust,
      };
      mockInstalledAgentSkills = [...mockInstalledAgentSkills, installed];
    } else if (plan.kind === "remove") {
      mockInstalledAgentSkills = mockInstalledAgentSkills.filter((skill) => skill.id !== plan.skillId);
    } else if (current) {
      const updated: InstalledAgentSkill = {
        ...current,
        enabled: plan.kind === "enable" ? true : plan.kind === "disable" ? false : current.enabled,
        eligible: plan.kind === "enable" ? current.health !== "blocked" : plan.kind === "disable" ? false : current.eligible,
        pinned: plan.kind === "pin" ? true : plan.kind === "unpin" ? false : current.pinned,
        version: plan.kind === "update" ? (current.updateVersion ?? current.version) : current.version,
        updateVersion: plan.kind === "update" ? null : current.updateVersion,
      };
      mockInstalledAgentSkills = mockInstalledAgentSkills.map((skill) => (skill.id === updated.id ? updated : skill));
    }
    mockSkillMutationPlans.delete(planId);
    return {
      planId,
      status: "completed",
      inventory: mockInventorySnapshot(),
      message: `${plan.skillName} ${plan.kind} completed.`,
    };
  },

  async createSkillContextSnapshot(skillIds: string[], repositoryPath?: string): Promise<SkillContextSnapshot> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillContextSnapshot>("skill_context_snapshot", { input: { skillIds, repositoryPath } });
    }
    const missing = skillIds.filter((id) => !mockInstalledAgentSkills.some((skill) => skill.id === id && skill.enabled && skill.eligible));
    if (missing.length > 0) {
      throw new Error(`Selected skill is no longer eligible: ${missing.join(", ")}`);
    }
    return {
      createdAt: new Date().toISOString(),
      skillIds: [...skillIds],
      digest: `sha256:mock-context-${skillIds.join("-") || "empty"}`,
      warnings: [],
    };
  },

  async listSkills(): Promise<SkillDefinition[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillDefinition[]>("skill_list");
    }

    return structuredClone(mockSkillRegistry.skills);
  },

  async getLearnedSkillSnapshot(): Promise<LearnedSkillSnapshotV1> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<LearnedSkillSnapshotV1>("skill_snapshot");
    }
    return {
      schemaVersion: 2,
      revision: 0,
      updatedAt: new Date().toISOString(),
      skills: structuredClone(mockSkillRegistry.skills),
      replayPlans: [],
      auditLog: [],
    };
  },

  async createCandidateSkill(candidateRuleId: string, runId: string): Promise<SkillDefinition> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await this.getLearnedSkillSnapshot();
      return tauri.core.invoke<SkillDefinition>("skill_create_candidate", {
        input: {
          candidateRuleId,
          runId,
          expectedRevision: snapshot.revision,
          actor: "operator",
          reason: "Created from an accepted rule in Memory Manager.",
        },
      });
    }
    const skill = mockSkillRegistry.skills[0];
    queueMicrotask(() => {
      emitMockRunEvent({
        id: `${skill.provenance.sourceRunIds[0] ?? "run-1"}-event-skill-candidate-${skill.id}`,
        runId: skill.provenance.sourceRunIds[0] ?? "run-1",
        sequence: mockReviewEventSequence++,
        type: "skill_candidate_created",
        timestamp: new Date().toISOString(),
        actor: { kind: "runtime", id: "skill-registry", displayName: "Skill Registry" },
        payload: { summary: `Candidate skill created: ${skill.title}`, skillId: skill.id, status: skill.status },
        redaction: { applied: skill.redaction.applied, redactedPaths: skill.redaction.redactedPaths },
        artifacts: skill.provenance.artifactRefs.filter((artifact) => artifact.kind === "skill_definition"),
      });
    });
    return structuredClone(skill);
  },

  async promoteSkillManually(input: SkillPromotionDecision): Promise<SkillDefinition> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await this.getLearnedSkillSnapshot();
      return tauri.core.invoke<SkillDefinition>("skill_promote_manual", {
        input: { ...input, expectedRevision: snapshot.revision },
      });
    }

    return applyMockSkillDecision({ ...input, decision: "promote" });
  },

  async rejectSkill(input: SkillPromotionDecision): Promise<SkillDefinition> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await this.getLearnedSkillSnapshot();
      return tauri.core.invoke<SkillDefinition>("skill_reject", {
        input: { ...input, expectedRevision: snapshot.revision },
      });
    }

    return applyMockSkillDecision({ ...input, decision: "reject" });
  },

  async supersedeSkill(input: SkillPromotionDecision): Promise<SkillDefinition> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await this.getLearnedSkillSnapshot();
      return tauri.core.invoke<SkillDefinition>("skill_supersede", {
        input: { ...input, expectedRevision: snapshot.revision },
      });
    }

    return applyMockSkillDecision({ ...input, decision: "supersede" });
  },

  async archiveSkill(input: SkillPromotionDecision): Promise<SkillDefinition> {
    const tauri = await loadTauriApi();
    if (tauri) {
      const snapshot = await this.getLearnedSkillSnapshot();
      return tauri.core.invoke<SkillDefinition>("skill_archive", {
        input: { ...input, expectedRevision: snapshot.revision },
      });
    }

    return applyMockSkillDecision({ ...input, decision: "archive" });
  },

  async createSkillReplayPlan(skillId: string, runId?: string): Promise<SkillReplayPlan> {
    const tauri = await loadTauriApi();
    if (tauri) {
      if (!runId) throw new Error("runId is required for learned skill replay");
      const snapshot = await this.getLearnedSkillSnapshot();
      return tauri.core.invoke<SkillReplayPlan>("skill_create_replay_plan", {
        input: {
          skillId,
          runId,
          expectedRevision: snapshot.revision,
          actor: "operator",
          reason: "Requested a non-executable learned skill replay preview.",
        },
      });
    }

    const skill = mockSkillRegistry.skills.find((item) => item.id === skillId);
    if (!skill) {
      throw new Error(`skill not found: ${skillId}`);
    }
    const plan = createMockSkillReplayPlan(skill, runId);
    queueMicrotask(() => emitSkillReplayEvents(plan));
    return structuredClone(plan);
  },

  async onRunEvent(handler: (event: RunEvent) => void): Promise<UnlistenFn> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.event.listen<RunEvent>("run_event", (event) => handler(event.payload));
    }

    mockListeners.add(handler);
    return () => {
      mockListeners.delete(handler);
    };
  },

  resetMockListenersForTest() {
    const resetState = createMockRunState();
    mockListeners = new Set();
    mockMemoryReview = resetState.memoryReview;
    mockSkillRegistry = resetState.skillRegistry;
    mockReviewEventSequence = 20_000;
  },
};
