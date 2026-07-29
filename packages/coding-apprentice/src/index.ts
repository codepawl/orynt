import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  DeterministicCognitiveKernel,
  StaticMemoryProvider,
  type CognitiveKernelResult,
  type KernelMemoryHit,
} from "@codepawl/cognitive-kernel";
import { LocalCodexContractAdapter, LocalManualCodexResultImporter } from "@codepawl/codex-adapter";
import { AuditableGateway, InMemoryGatewayEvidenceStore, StaticApprovalProvider, type GatewayExecutionResult } from "@codepawl/gateway";
import { LocalJsonMemoryStore, LocalMemoryExtractor } from "@codepawl/memory";
import { GitRepositorySandboxManager } from "@codepawl/repository-sandbox";
import { LocalSkillRegistry } from "@codepawl/skill-registry";
import {
  createConservativeCodingApprenticePolicy,
  createDefaultRunBudget,
  InMemoryAgentLedger,
  InMemoryRunStore,
  policyDecisionToSafetySnapshot,
  redactSensitivePayload,
  validateOrchestrationRecoveryTask,
  type AgentRun,
  type Actor,
  type ArtifactRef,
  type CodexContractArtifact,
  type CodexExecutionApproval,
  type CodexExecutionPlan,
  type CodexExecutionResult,
  type CodexResultBundle,
  type CorePolicy,
  type CreateRunInput,
  type CandidateRule,
  type EpisodicMemoryItem,
  type MemoryExtractionResult,
  type MemoryNamespace,
  type MemoryStore,
  type ModelInvocationRecord,
  type MonthlyUsageSummary,
  type OrchestrationChildTask,
  type OrchestrationPlan,
  type ResolvedOrchestrationProfile,
  type RepositoryInspection,
  type RepositorySandbox,
  type Run,
  type RunBudget,
  type RunEvent,
  type RunEventDraft,
  type RunStatus,
  type RunStore,
  type RunSummary,
  type SemanticMemoryItem,
  type SkillInvocationPlan,
  type SkillContextSnapshot,
  type VerificationPlan,
  type VerificationPlanRequest,
  type VerificationResult,
  type VerificationStatus,
} from "@codepawl/shared";
import { LocalRepositoryVerifier } from "@codepawl/verifier";

const execFileAsync = promisify(execFile);

export type ManualDemoChangeResult = {
  manualLogPath?: string;
  validationTranscriptPath?: string;
};

export type ManualDemoChangeContext = {
  run: Run;
  inspection: RepositoryInspection;
  sandbox: RepositorySandbox;
  artifactRoot: string;
  policy: CorePolicy;
};

export type DesktopModelConnectionReference = {
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  authMethod: string;
  envKey?: string | null;
};

export type DesktopThinkingEffort = "minimal" | "none" | "low" | "medium" | "high" | "xhigh";

export type PostVerificationReviewResult = {
  invocation: ModelInvocationRecord;
  summary: string;
  recoveryTask?: OrchestrationChildTask;
};

export type PostVerificationReviewContext = {
  runId: string;
  repositoryPath: string;
  sandboxWorktreePath: string;
  status: VerificationStatus;
  summary: string;
  signal?: AbortSignal;
};

export type CodingApprenticeDemoRequest = {
  goal: string;
  activeGoal?: string;
  acceptanceCriteria?: string[];
  taskId: string;
  workspaceId: string;
  userId?: string;
  planId?: string;
  repositoryPath: string;
  sandboxRoot: string;
  artifactRoot: string;
  baseRef?: string;
  budget?: RunBudget;
  validationCommands?: string[];
  allowedVerificationCommands?: string[];
  manualLogPath?: string;
  validationTranscriptPath?: string;
  userNotes?: string;
  enableControlledCodexExecution?: boolean;
  readOnlyRepositoryRun?: boolean;
  codexPathEnv?: string;
  createExecutionApproval?: (context: {
    run: Run;
    plan: CodexExecutionPlan;
    artifactRoot: string;
  }) => CodexExecutionApproval | Promise<CodexExecutionApproval>;
  enableMemoryExtraction?: boolean;
  memoryRoot?: string;
  memoryNamespace?: MemoryNamespace;
  applyManualChange?: (context: ManualDemoChangeContext) => Promise<ManualDemoChangeResult | void> | ManualDemoChangeResult | void;
  modelConnection?: DesktopModelConnectionReference | null;
  thinkingEffort?: DesktopThinkingEffort | string | null;
  signal?: AbortSignal;
  postVerificationReview?: (
    context: PostVerificationReviewContext,
  ) => Promise<PostVerificationReviewResult | undefined>;
  orchestration?: {
    profile: ResolvedOrchestrationProfile;
    plan?: OrchestrationPlan;
  };
  authorization?: {
    expectedPaths: string[];
    requireExpectedPaths?: boolean;
    allowDestructiveChanges: boolean;
    allowChangedFileLimitExceeded: boolean;
  };
};

export type CodingApprenticeDemoResult = {
  run: Run;
  events: RunEvent[];
  inspection: RepositoryInspection;
  sandbox: RepositorySandbox;
  contractArtifact: CodexContractArtifact;
  codexExecutionPlan?: CodexExecutionPlan;
  codexExecutionResult?: CodexExecutionResult;
  codexExecutionResults: CodexExecutionResult[];
  importBundle: CodexResultBundle;
  verifierInput: VerificationPlanRequest;
  verifierInputPath: string;
  verificationPlan: VerificationPlan;
  verificationResult: VerificationResult;
  verificationAttempts: VerificationResult[];
  postVerificationReviewResult?: PostVerificationReviewResult;
  postVerificationReviewError?: string;
  recoveryAttempts: number;
  memoryExtractionResult: MemoryExtractionResult;
  cognitiveKernelResult: CognitiveKernelResult;
  cognitiveGatewayResult: GatewayExecutionResult;
  feedbackMemory?: SemanticMemoryItem;
  skillInvocationPlan: SkillInvocationPlan;
  ledgerRun: AgentRun;
  usageSummary: MonthlyUsageSummary;
  adminUsageSummary: MonthlyUsageSummary;
  memorySummary: string;
  episodes: EpisodicMemoryItem[];
  candidateRules: CandidateRule[];
  summary: string;
  artifacts: ArtifactRef[];
};

export type DesktopRepositoryRunRequest = {
  goal: string;
  activeGoal?: string;
  acceptanceCriteria?: string[];
  authorization?: {
    source: "automatic_policy" | "operator" | "headless";
    reason: string;
    expectedPaths?: string[];
    allowDestructiveChanges?: boolean;
    allowChangedFileLimitExceeded?: boolean;
  };
  taskId: string;
  workspaceId: string;
  repositoryPath: string;
  sandboxRoot: string;
  artifactRoot: string;
  memoryRoot?: string;
  budget?: RunBudget;
  modelConnection?: DesktopModelConnectionReference | null;
  thinkingEffort?: DesktopThinkingEffort | string | null;
  skillContext?: SkillContextSnapshot;
  orchestration?: {
    profile: ResolvedOrchestrationProfile;
    plan?: OrchestrationPlan;
    priorInvocations: ModelInvocationRecord[];
  };
  postVerificationReview?: (
    context: PostVerificationReviewContext,
  ) => Promise<PostVerificationReviewResult | undefined>;
  onRunEvent?: (event: RunEvent) => void;
  signal?: AbortSignal;
};

export type DesktopRepositoryRunOutput = {
  runId: string;
  status: VerificationStatus;
  artifactRoot: string;
  artifactManifestPath: string;
  eventCount: number;
  events: RunEvent[];
};

export class RepositoryRunCancelledError extends Error {
  constructor() {
    super("Repository action cancelled.");
    this.name = "RepositoryRunCancelledError";
  }
}

class ForwardingRunStore implements RunStore {
  constructor(
    private readonly inner: RunStore,
    private readonly onRunEvent: (event: RunEvent) => void,
  ) {}

  createRun(input: CreateRunInput): Run {
    return this.inner.createRun(input);
  }

  appendEvent<TPayload>(runId: string, event: RunEventDraft<TPayload>): RunEvent<TPayload> {
    const appended = this.inner.appendEvent<TPayload>(runId, event);
    this.onRunEvent(appended);
    return appended;
  }

  listEvents(runId: string): RunEvent[] {
    return this.inner.listEvents(runId);
  }

  getRun(runId: string): Run | undefined {
    return this.inner.getRun(runId);
  }

  updateRunStatus(runId: string, status: RunStatus): Run {
    return this.inner.updateRunStatus(runId, status);
  }

  summarizeRun(runId: string): RunSummary {
    return this.inner.summarizeRun(runId);
  }
}

function desktopRepositoryVerifierScript(): string {
  return `import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const changedMarkers = ["README.md", "PRODUCT.md", "package.json", "index.html", "src", "server", "api", "public", "apps", "packages"];
const changed = changedMarkers.filter((entry) => existsSync(path.join(root, entry)));
if (changed.length === 0) {
  throw new Error("Orynt verifier expected repository task files to exist.");
}

if (existsSync(path.join(root, "package.json"))) {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  if (!pkg.scripts || Object.keys(pkg.scripts).length === 0) {
    throw new Error("package.json must define at least one runnable script.");
  }
}

const hasFrontend = ["index.html", "src", "apps"].some((entry) => existsSync(path.join(root, entry)));
const hasBackend = ["server", "api", "packages"].some((entry) => existsSync(path.join(root, entry)));
if (existsSync(path.join(root, "package.json")) && (!hasFrontend || !hasBackend)) {
  throw new Error("Fullstack repository tasks with package.json need frontend and backend/API files.");
}

console.log("Orynt beta repository smoke passed", JSON.stringify({ changed, hasFrontend, hasBackend }));
`;
}

function isReadOnlyRepositoryGoal(goal: string): boolean {
  const normalized = goal.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const readOnlyPatterns = [
    /\b(read|inspect|explore|analy[sz]e|summari[sz]e|explain|review|understand|map)\b.*\b(repo|repository|codebase|project)\b/,
    /\b(repo|repository|codebase|project)\b.*\b(read|inspect|explore|analy[sz]e|summari[sz]e|explain|review|understand|map)\b/,
    /(đọc|doc|xem|khảo sát|khao sat|phân tích|phan tich|tóm tắt|tom tat|giải thích|giai thich|review).*\b(repo|repository|codebase)\b/,
    /\b(repo|repository|codebase)\b.*(đọc|doc|xem|khảo sát|khao sat|phân tích|phan tich|tóm tắt|tom tat|giải thích|giai thich|review)/,
    /(đọc|doc|xem|khảo sát|khao sat|phân tích|phan tich|tóm tắt|tom tat|giải thích|giai thich|review).*(mã nguồn|ma nguon|dự án|du an)/,
    /(mã nguồn|ma nguon|dự án|du an).*(đọc|doc|xem|khảo sát|khao sat|phân tích|phan tich|tóm tắt|tom tat|giải thích|giai thich|review)/,
  ];
  const writeIntentPattern = /\b(build|create|implement|fix|repair|change|modify|update|add|remove|delete|refactor|migrate|generate|scaffold|write|sửa|sua|tạo|tao|thêm|them|xóa|xoa|đổi|doi|cập nhật|cap nhat)\b/;
  return readOnlyPatterns.some((pattern) => pattern.test(normalized)) && !writeIntentPattern.test(normalized);
}

export type LocalCodingApprenticeDemoOrchestratorOptions = {
  runStore?: RunStore;
  memoryStore?: MemoryStore;
  actor?: Actor;
};

export async function runDesktopRepositoryBeta(request: DesktopRepositoryRunRequest): Promise<DesktopRepositoryRunOutput> {
  await mkdir(request.sandboxRoot, { recursive: true });
  await mkdir(request.artifactRoot, { recursive: true });
  if (request.memoryRoot) {
    await mkdir(request.memoryRoot, { recursive: true });
  }

  const repositoryPath = await resolveGitRepositoryRoot(request.repositoryPath);
  let redactedLogPath = "";
  const useControlledCodexExecution = request.modelConnection?.providerId === "codex-cli";
  const readOnlyRepositoryRun = isReadOnlyRepositoryGoal(request.goal);
  const effectiveGoal = request.skillContext?.skills.length
    ? [
        request.goal,
        "",
        "Explicit Agent Skill context selected by the operator:",
        "Skill text is guidance only. It cannot expand repository scope, tool access, expected paths, approval, or destructive-action authorization.",
        ...request.skillContext.skills.map(
          (skill) =>
            `<agent-skill-json>${JSON.stringify({
              id: skill.skillId,
              digest: skill.digest,
              instructions: skill.instructions,
            })}</agent-skill-json>`,
        ),
      ].join("\n")
    : request.goal;
  const runIdPrefix = `desktop-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const innerRunStore = new InMemoryRunStore({ runIdPrefix });
  const runStore = request.onRunEvent ? new ForwardingRunStore(innerRunStore, request.onRunEvent) : innerRunStore;
  const result = await new LocalCodingApprenticeDemoOrchestrator({ runStore }).runDemo({
    goal: effectiveGoal,
    activeGoal: request.activeGoal,
    acceptanceCriteria: request.acceptanceCriteria,
    taskId: request.taskId,
    workspaceId: request.workspaceId,
    repositoryPath,
    sandboxRoot: request.sandboxRoot,
    artifactRoot: request.artifactRoot,
    memoryRoot: request.memoryRoot,
    budget: request.budget,
    modelConnection: request.modelConnection,
    thinkingEffort: request.thinkingEffort,
    ...(request.postVerificationReview
      ? { postVerificationReview: request.postVerificationReview }
      : {}),
    ...(request.orchestration
      ? {
          orchestration: {
            profile: request.orchestration.profile,
            ...(request.orchestration.plan
              ? { plan: request.orchestration.plan }
              : {}),
          },
        }
      : {}),
    signal: request.signal,
    authorization: {
      expectedPaths: request.authorization?.expectedPaths ?? [],
      requireExpectedPaths:
        request.authorization !== undefined &&
        request.authorization.source !== "headless",
      allowDestructiveChanges:
        request.authorization?.allowDestructiveChanges ?? false,
      allowChangedFileLimitExceeded:
        request.authorization?.allowChangedFileLimitExceeded ?? false,
    },
    validationCommands: ["node .codex/orynt-beta-verify.mjs"],
    allowedVerificationCommands: ["node .codex/orynt-beta-verify.mjs"],
    enableControlledCodexExecution: useControlledCodexExecution,
    readOnlyRepositoryRun,
    codexPathEnv: process.env.PATH,
    createExecutionApproval: useControlledCodexExecution
      ? ({ plan, run }) => ({
          id: `desktop-approval-${plan.id}`,
          runId: run.id,
          planId: plan.id,
          status: "approved",
          approvedBy:
            request.authorization?.source === "automatic_policy"
              ? "orynt-policy-engine"
              : "desktop-operator",
          reason:
            request.authorization?.reason ??
            "Operator submitted a repository-scoped Codex CLI run from Orynt desktop.",
          approvedAt: new Date().toISOString(),
          authorizationSource: request.authorization?.source ?? "operator",
        })
      : undefined,
    applyManualChange: useControlledCodexExecution
      ? undefined
      : async ({ sandbox, artifactRoot: runArtifactRoot }) => {
          const readmePath = path.join(sandbox.worktreePath, "README.md");
          const verifyScriptPath = path.join(sandbox.worktreePath, ".codex", "orynt-beta-verify.mjs");
          const manualLogPath = path.join(runArtifactRoot, "manual-result.log");
          redactedLogPath = path.join(runArtifactRoot, "manual-result.redacted.log");
          await mkdir(path.dirname(verifyScriptPath), { recursive: true });
          await appendFile(readmePath, `\nOrynt supervised beta run\n\n- Goal: ${request.goal}\n`, "utf8");
          await writeFile(verifyScriptPath, desktopRepositoryVerifierScript(), "utf8");
          await writeFile(manualLogPath, `Manual repository-scoped beta result for: ${request.goal}\n`, "utf8");
          await writeFile(redactedLogPath, `Manual repository-scoped beta result for: ${request.goal}\n`, "utf8");
          return { manualLogPath };
        },
  });
  if (request.signal?.aborted) throw new RepositoryRunCancelledError();

  const runArtifactRoot = result.contractArtifact.artifactRoot;
  redactedLogPath = result.codexExecutionResult?.lastMessagePath ?? redactedLogPath;
  const eventLogPath = path.join(runArtifactRoot, "run-events.json");
  const cognitiveTracePath = path.join(runArtifactRoot, "cognitive-trace.json");
  const skillPlanPath = path.join(runArtifactRoot, "skill-invocation-plan.json");
  const skillContextPath = path.join(runArtifactRoot, "skill-context.json");
  const manifestPath = path.join(runArtifactRoot, "artifact-manifest.json");
  const verificationResultPath = path.join(runArtifactRoot, "verification-result.json");
  const modelInvocationLedgerPath = path.join(
    runArtifactRoot,
    "model-invocations.json",
  );
  const orchestrationAttemptLedgerPath = path.join(
    runArtifactRoot,
    "orchestration-attempts.json",
  );
  const memoryStorePath = path.join(request.memoryRoot ?? path.join(runArtifactRoot, "memory"), "memory-store.json");

  const modelInvocations = [
    ...(request.orchestration?.priorInvocations ?? []).map((invocation) => ({
      ...invocation,
      runId: result.run.id,
    })),
  ];
  let postVerificationReviewError = result.postVerificationReviewError;
  let postVerificationReviewSummary: string | undefined;
  if (request.orchestration && result.codexExecutionResults.length > 0) {
    const implementer = request.orchestration.profile.roles.implementer;
    result.codexExecutionResults.forEach((execution, retryIndex) => {
      modelInvocations.push({
        schemaVersion: 1,
        id: execution.id,
        runId: result.run.id,
        ...(retryIndex > 0 && result.postVerificationReviewResult
          ? {
              parentInvocationId:
                result.postVerificationReviewResult.invocation.id,
            }
          : {}),
        taskId:
          retryIndex > 0
            ? result.postVerificationReviewResult?.recoveryTask?.id ??
              `${request.taskId}-recovery-${retryIndex}`
            : request.taskId,
        role: "implementer",
        providerId: "codex-cli",
        modelId: implementer.modelId,
        thinkingEffort: implementer.thinkingEffort,
        contextHash: createHash("sha256")
          .update(
            retryIndex > 0
              ? result.postVerificationReviewResult?.recoveryTask
                  ?.instruction ?? request.goal
              : request.goal,
          )
          .digest("hex"),
        status: execution.status === "finished" ? "completed" : "failed",
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        retryIndex,
        artifactRefs: execution.artifacts.map((artifact) => artifact.uri),
      });
    });
  }
  if (result.postVerificationReviewResult) {
    modelInvocations.push(result.postVerificationReviewResult.invocation);
    const redacted = redactSensitivePayload(
      result.postVerificationReviewResult.summary,
    ).payload;
    postVerificationReviewSummary =
      typeof redacted === "string" ? redacted.slice(0, 8_000) : undefined;
  }
  if (request.orchestration) {
    if (request.signal?.aborted) throw new RepositoryRunCancelledError();
    await writeFile(
      modelInvocationLedgerPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          runId: result.run.id,
          profile: request.orchestration.profile,
          invocations: modelInvocations,
          ...(postVerificationReviewSummary
            ? { reviewerSummary: postVerificationReviewSummary }
            : {}),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      orchestrationAttemptLedgerPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          runId: result.run.id,
          recoveryAttempts: result.recoveryAttempts,
          attempts: result.verificationAttempts.map(
            (verification, retryIndex) => ({
              retryIndex,
              verificationResultId: verification.id,
              status: verification.status,
              summary: verification.verdict.reason,
              artifactRefs: verification.artifacts,
            }),
          ),
          reviewerDecision: result.postVerificationReviewResult
            ? {
                invocationId:
                  result.postVerificationReviewResult.invocation.id,
                recoveryTaskId:
                  result.postVerificationReviewResult.recoveryTask?.id ?? null,
              }
            : null,
          finalVerificationResultId: result.verificationResult.id,
          ...(postVerificationReviewError
            ? { recoveryError: postVerificationReviewError }
            : {}),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  if (request.signal?.aborted) throw new RepositoryRunCancelledError();
  await writeFile(eventLogPath, `${JSON.stringify(result.events, null, 2)}\n`, "utf8");
  await writeFile(
    cognitiveTracePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        runId: result.run.id,
        kernel: result.cognitiveKernelResult,
        gateway: result.cognitiveGatewayResult,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(skillPlanPath, `${JSON.stringify(result.skillInvocationPlan, null, 2)}\n`, "utf8");
  if (request.skillContext) {
    await writeFile(
      skillContextPath,
      `${JSON.stringify(request.skillContext, null, 2)}\n`,
      "utf8",
    );
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 2,
        runId: result.run.id,
        taskId: request.taskId,
        workspaceId: request.workspaceId,
        repositoryPath: result.inspection.gitRoot,
        sandboxWorktreePath: result.sandbox.worktreePath,
        artifactRoot: runArtifactRoot,
        modelConnection: request.modelConnection ?? null,
        thinkingEffort: request.thinkingEffort ?? null,
        orchestration: request.orchestration
          ? {
              sourcePreset: request.orchestration.profile.sourcePreset,
              effectivePreset: request.orchestration.profile.preset,
              omittedRoles: request.orchestration.profile.omittedRoles,
              invocationCount: modelInvocations.length,
              recoveryAttempts: result.recoveryAttempts,
              reviewerStatus: postVerificationReviewError
                ? "unavailable"
                : modelInvocations.some(
                      (invocation) => invocation.role === "reviewer",
                    )
                  ? "completed"
                  : "not_requested",
              ...(postVerificationReviewError
                ? { reviewerError: postVerificationReviewError }
                : {}),
            }
          : null,
        status: result.verificationResult.status,
        summary: result.summary,
        budgetedAgent: {
          mode: result.cognitiveKernelResult.budgetedTrace.decision.mode,
          needState: result.cognitiveKernelResult.budgetedTrace.needState,
          compactWorkingState: result.cognitiveKernelResult.budgetedTrace.workingState,
          selectedOptionId: result.cognitiveKernelResult.budgetedTrace.decision.selectedOptionId,
          tradeoffScores: result.cognitiveKernelResult.budgetedTrace.tradeoffScores,
          cost: result.cognitiveKernelResult.budgetedTrace.cost,
          memoryConsolidation: result.cognitiveKernelResult.budgetedTrace.memoryConsolidation,
        },
        artifacts: {
          contract: result.contractArtifact.markdownPath,
          contractMetadata: result.contractArtifact.metadataPath,
          eventLog: eventLogPath,
          cognitiveTrace: cognitiveTracePath,
          verifierInput: result.verifierInputPath,
          verificationResult: verificationResultPath,
          redactedLog: redactedLogPath || null,
          memoryStore: memoryStorePath,
          replayPlan: skillPlanPath,
          skillContext: request.skillContext ? skillContextPath : null,
          modelInvocations: request.orchestration
            ? modelInvocationLedgerPath
            : null,
          orchestrationAttempts: request.orchestration
            ? orchestrationAttemptLedgerPath
            : null,
        },
        artifactRefs: result.artifacts,
        memory: {
          summary: result.memorySummary,
          episodeCount: result.episodes.length,
          candidateRuleCount: result.candidateRules.length,
          extractionArtifacts: result.memoryExtractionResult.artifacts,
        },
        selectedAgentSkills: request.skillContext
          ? {
              digest: request.skillContext.digest,
              skillIds: request.skillContext.skills.map((skill) => skill.skillId),
            }
          : null,
        eventTypes: result.events.map((event) => event.type),
        usageSummary: {
          runCount: result.usageSummary.runCount,
          artifactCount: result.usageSummary.artifactCount,
          gatewayActionCount: result.usageSummary.gatewayActionCount,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  if (request.signal?.aborted) throw new RepositoryRunCancelledError();

  return {
    runId: result.run.id,
    status: result.verificationResult.status,
    artifactRoot: runArtifactRoot,
    artifactManifestPath: manifestPath,
    eventCount: result.events.length,
    events: result.events,
  };
}

const DEFAULT_ACTOR: Actor = {
  kind: "runtime",
  id: "coding-apprentice-demo-orchestrator",
  displayName: "Coding Apprentice Demo Orchestrator",
};

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function resolveGitRepositoryRoot(repositoryPath: string): Promise<string> {
  const resolved = path.resolve(repositoryPath);
  try {
    const { stdout } = await execFileAsync("git", ["-C", resolved, "rev-parse", "--show-toplevel"], {
      maxBuffer: 2_000_000,
      timeout: 30_000,
    });
    const gitRoot = String(stdout).trim();
    return gitRoot ? path.resolve(gitRoot) : resolved;
  } catch {
    return resolved;
  }
}

function createDemoPolicy(request: CodingApprenticeDemoRequest): CorePolicy {
  const basePolicy = createConservativeCodingApprenticePolicy(request.repositoryPath, request.sandboxRoot);
  const allowlist = unique([...(basePolicy.sandbox.commandPolicy.allowlist ?? []), ...(request.allowedVerificationCommands ?? [])]);
  return {
    ...basePolicy,
    sandbox: {
      ...basePolicy.sandbox,
      repository: {
        ...basePolicy.sandbox.repository,
        repositoryPath: request.repositoryPath,
        worktreePath: request.sandboxRoot,
        baseRef: request.baseRef ?? basePolicy.sandbox.repository.baseRef,
      },
      commandPolicy: {
        ...basePolicy.sandbox.commandPolicy,
        allowlist,
      },
    },
  };
}

export class LocalCodingApprenticeDemoOrchestrator {
  private readonly runStore: RunStore;
  private readonly memoryStore?: MemoryStore;
  private readonly agentLedger: InMemoryAgentLedger;
  private readonly actor: Actor;

  constructor(options: LocalCodingApprenticeDemoOrchestratorOptions = {}) {
    this.runStore = options.runStore ?? new InMemoryRunStore();
    this.memoryStore = options.memoryStore;
    this.agentLedger = new InMemoryAgentLedger();
    this.actor = options.actor ?? DEFAULT_ACTOR;
  }

  async runDemo(request: CodingApprenticeDemoRequest): Promise<CodingApprenticeDemoResult> {
    const budget = request.budget ?? createDefaultRunBudget();
    const run = this.runStore.createRun({
      goal: request.goal,
      capabilityId: "coding-apprentice",
      taskId: request.taskId,
      workspaceId: request.workspaceId,
      repositoryPath: request.repositoryPath,
      budget,
    });
    const assertNotCancelled = () => {
      if (!request.signal?.aborted) return;
      this.runStore.updateRunStatus(run.id, "cancelled");
      throw new RepositoryRunCancelledError();
    };
    assertNotCancelled();
    const userId = request.userId ?? "local-operator";
    const ledgerRun = this.agentLedger.createRun({
      id: run.id,
      workspaceId: request.workspaceId,
      userId,
      planId: request.planId ?? null,
      userGoal: request.goal,
      normalizedGoal: request.goal.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 120),
      taskType: "coding_apprentice",
      riskLevel: "review",
      primaryModelProvider: request.modelConnection?.providerId ?? "local",
      primaryModelName: request.modelConnection?.modelId ?? "codex-controlled-runtime",
      startedAt: run.createdAt,
    });
    this.agentLedger.appendEvent(ledgerRun.id, {
      id: `${ledgerRun.id}-ledger-event-task-created`,
      eventType: "task.created",
      payloadJson: {
        summary: "Coding Apprentice run ledger initialized",
        taskId: run.taskId,
      },
      visibility: "admin",
      createdAt: run.createdAt,
    });
    const baseRef = request.baseRef ?? "HEAD";
    const managedArtifactRoot = path.resolve(request.artifactRoot);
    const runArtifactRoot = path.join(managedArtifactRoot, run.id);
    await mkdir(runArtifactRoot, { recursive: true });
    assertNotCancelled();

    this.runStore.appendEvent(run.id, {
      type: "run_started",
      actor: this.actor,
      payload: {
        summary: "Coding Apprentice demo run started",
        workspaceId: request.workspaceId,
      },
    });
    this.runStore.appendEvent(run.id, {
      type: "goal_received",
      actor: { kind: "user", id: "local-operator", displayName: "Operator" },
      payload: {
        summary: request.goal,
        constraints: ["manual Codex result import only", "no automatic Codex execution", "managed sandbox and artifacts only"],
      },
    });

    const policy = createDemoPolicy(request);
    const readOnlyRepositoryRun = Boolean(request.readOnlyRepositoryRun);
    const sandboxManager = new GitRepositorySandboxManager({
      sandboxRoot: request.sandboxRoot,
      runStore: this.runStore,
    });
    const sandboxRequest = {
      runId: run.id,
      taskId: run.taskId,
      repositoryPath: request.repositoryPath,
      baseRef,
    };
    const inspection = await sandboxManager.inspectRepository(sandboxRequest, policy);
    const memoryRoot = path.resolve(request.memoryRoot ?? path.join(runArtifactRoot, "memory"));
    const memoryStore = this.memoryStore ?? new LocalJsonMemoryStore({ memoryRoot });
    const memoryNamespace = request.memoryNamespace ?? {
      capabilityId: run.capabilityId,
      workspaceId: run.workspaceId,
      repositoryPath: inspection.gitRoot,
    };
    const [priorEpisodes, priorRules, priorSemanticMemory] = await Promise.all([
      memoryStore.queryEpisodes({ namespace: memoryNamespace, limit: 8 }),
      memoryStore.listCandidateRules({
        namespace: memoryNamespace,
        statuses: ["accepted"],
        limit: 8,
      }),
      memoryStore.listSemanticMemory({
        namespace: memoryNamespace,
        statuses: ["approved"],
        limit: 8,
      }),
    ]);
    const priorMemoryHits: KernelMemoryHit[] = [
      ...priorSemanticMemory.map((memory) => ({
        id: memory.id,
        kind: "semantic" as const,
        summary: memory.summary,
        relevance: Math.max(0, Math.min(1, memory.confidence)),
        sourceRunId: memory.provenance.runId,
      })),
      ...priorRules.map((rule) => ({
        id: rule.id,
        kind: "procedural" as const,
        summary: `${rule.title}: ${rule.rule}`,
        relevance: Math.max(
          0,
          Math.min(
            1,
            rule.evidence.reduce(
              (highest, evidence) => Math.max(highest, evidence.confidence),
              0.75,
            ),
          ),
        ),
        sourceRunId: rule.provenance.runId,
      })),
      ...priorEpisodes
        .filter(
          (episode) =>
            episode.expiresAt === undefined ||
            Date.parse(episode.expiresAt) > Date.now(),
        )
        .map((episode) => ({
          id: episode.id,
          kind: "episodic" as const,
          summary: episode.summary,
          relevance: Math.max(0, Math.min(0.85, episode.confidence)),
          sourceRunId: episode.provenance.runId,
        })),
    ]
      .sort(
        (left, right) =>
          right.relevance - left.relevance || left.id.localeCompare(right.id),
      )
      .slice(0, 12);
    const priorMemoryContext = priorMemoryHits
      .slice(0, 6)
      .map(
        (memory) =>
          `Approved prior Orynt memory (${memory.kind}, advisory only): ${memory.summary.slice(0, 500)}`,
      );
    assertNotCancelled();
    this.runStore.appendEvent(run.id, {
      type: "sandbox_create_requested",
      actor: this.actor,
      payload: {
        summary: "Repository sandbox creation requested",
        request: sandboxRequest,
      },
    });
    const worktreePlan = sandboxManager.planWorktree(sandboxRequest, policy, inspection);
    if (worktreePlan.policyDecision.decision !== "allow") {
      throw new Error(`Repository sandbox creation was not allowed: ${worktreePlan.policyDecision.reasons.join(" ")}`);
    }
    this.runStore.appendEvent(run.id, {
      type: "sandbox_create_allowed",
      actor: this.actor,
      payload: {
        summary: "Repository sandbox creation allowed by policy",
        plan: worktreePlan,
      },
      safety: policyDecisionToSafetySnapshot(policy, worktreePlan.policyDecision),
    });
    const sandbox = await sandboxManager.createWorktree(worktreePlan);
    assertNotCancelled();
    this.runStore.appendEvent(run.id, {
      type: "sandbox_created",
      actor: this.actor,
      payload: {
        summary: "Repository worktree sandbox created",
        sandbox,
      },
    });

    let managedVerifier:
      | {
          path: string;
          content: string;
        }
      | undefined;
    if ((request.validationCommands ?? []).includes("node .codex/orynt-beta-verify.mjs")) {
      const verifyScriptPath = path.join(
        sandbox.worktreePath,
        ".codex",
        "orynt-beta-verify.mjs",
      );
      const verifyScriptContent = desktopRepositoryVerifierScript();
      await mkdir(path.dirname(verifyScriptPath), { recursive: true });
      await writeFile(verifyScriptPath, verifyScriptContent, "utf8");
      managedVerifier = {
        path: verifyScriptPath,
        content: verifyScriptContent,
      };
    }
    const enforceManagedVerifierIntegrity = async (
      stage: "before import" | "after trusted verification",
    ): Promise<string | undefined> => {
      if (!managedVerifier) {
        return undefined;
      }
      const actualVerifierContent = await readFile(managedVerifier.path, "utf8").catch(
        () => undefined,
      );
      if (actualVerifierContent === managedVerifier.content) {
        return undefined;
      }
      await mkdir(path.dirname(managedVerifier.path), { recursive: true });
      await writeFile(managedVerifier.path, managedVerifier.content, "utf8");
      const summary =
        `Managed verifier integrity check failed ${stage}: the repository run modified Orynt's trusted verifier.`;
      this.runStore.appendEvent(run.id, {
        type: "policy_violation",
        actor: this.actor,
        payload: {
          summary,
          path: ".codex/orynt-beta-verify.mjs",
          stage,
        },
      });
      return summary;
    };

    const codexAdapter = new LocalCodexContractAdapter({
      managedArtifactRoot,
      runStore: this.runStore,
      pathEnv: request.codexPathEnv,
    });
    const useControlledCodexExecution = Boolean(request.enableControlledCodexExecution);
    const contract = codexAdapter.createContract({
      runId: run.id,
      taskId: run.taskId,
      goal: request.goal,
      context: [
        "Local Coding Apprentice repository run.",
        `Repository: ${inspection.gitRoot}`,
        useControlledCodexExecution
          ? "Orynt will execute the selected Codex CLI model in the sandbox after explicit approval and will verify the result separately."
          : "Orynt will import only managed manual artifacts for this run.",
        ...(request.modelConnection
          ? [
              `Selected model provider: ${request.modelConnection.providerLabel} (${request.modelConnection.providerId}).`,
              `Selected model: ${request.modelConnection.modelLabel} (${request.modelConnection.modelId}).`,
            ]
          : []),
        ...(request.thinkingEffort ? [`Thinking effort: ${request.thinkingEffort}.`] : []),
        ...(request.activeGoal?.trim()
          ? [`Active Orynt objective: ${request.activeGoal.trim()}`]
          : []),
        ...((request.acceptanceCriteria ?? [])
          .map((criterion) => criterion.trim())
          .filter(Boolean)
          .map((criterion) => `Orynt acceptance criterion: ${criterion}`)),
        ...priorMemoryContext,
      ],
      constraints: useControlledCodexExecution
        ? readOnlyRepositoryRun
          ? [
              "Execute only inside the Orynt-created sandbox.",
              "This is a read-only repository analysis task: inspect and summarize the codebase; do not edit files unless the user explicitly asks for changes.",
              "Return a useful final answer with repository structure, important entry points, and next-step recommendations.",
              "Verifier owns final success verdict.",
            ]
          : [
              "Execute only inside the Orynt-created sandbox.",
              "Create a complete runnable implementation, not a plan or placeholder.",
              "For fullstack web tasks, include package.json scripts, frontend files, backend/API files, and README instructions.",
              "Verifier owns final success verdict.",
            ]
        : ["Do not execute Codex automatically.", "Import only managed manual artifacts.", "Verifier owns final success verdict."],
      doneWhen: useControlledCodexExecution
        ? readOnlyRepositoryRun
          ? [
              "Repository has been inspected without modifying source files.",
              "Final answer explains the codebase structure and relevant implementation entry points.",
              "Verifier records final evidence from repository inspection and the local smoke script.",
              ...((request.acceptanceCriteria ?? []).map((criterion) => criterion.trim()).filter(Boolean)),
            ]
          : [
              "Requested repository task is implemented in the sandbox.",
              "Verifier input is created.",
              "Verifier records final evidence from changed files and the local smoke script.",
              ...((request.acceptanceCriteria ?? []).map((criterion) => criterion.trim()).filter(Boolean)),
            ]
        : ["Manual result is imported.", "Verifier input is created.", "Verifier records final evidence."],
      repository: inspection,
      sandbox,
      policy,
      budget,
      validationCommands: request.validationCommands ?? [],
      artifactRoot: runArtifactRoot,
      executionMode: useControlledCodexExecution ? "manual_cli" : "contract_only",
      modelId: request.modelConnection?.modelId,
      modelLabel: request.modelConnection?.modelLabel,
      modelRole: "implementer",
      thinkingEffort:
        typeof request.thinkingEffort === "string"
          ? request.thinkingEffort as DesktopThinkingEffort
          : undefined,
    });
    const contractArtifact = await codexAdapter.writeContractArtifact(contract, runArtifactRoot);

    const verifier = new LocalRepositoryVerifier({
      managedArtifactRoot,
      runStore: this.runStore,
      ...(managedVerifier
        ? {
            trustedCommandOverrides: {
              "node .codex/orynt-beta-verify.mjs": {
                command: process.execPath,
                args: ["--input-type=module", "-"],
                stdin: managedVerifier.content,
                afterExecution: () =>
                  enforceManagedVerifierIntegrity("after trusted verification"),
              },
            },
          }
        : {}),
    });

    let verificationPlan: VerificationPlan | undefined;
    let codexExecutionPlan: CodexExecutionPlan | undefined;
    let codexExecutionResult: CodexExecutionResult | undefined;
    const codexExecutionResults: CodexExecutionResult[] = [];
    let manualLogPath = request.manualLogPath;
    let validationTranscriptPath = request.validationTranscriptPath;

    if (request.enableControlledCodexExecution) {
      verificationPlan = verifier.createPlan({
        runId: run.id,
        taskId: run.taskId,
        sandbox,
        policy,
        budget,
        commands: request.validationCommands ?? [],
        artifactRoot: runArtifactRoot,
        config: {
          defaultCommands: [],
          requireChangedFiles: !readOnlyRepositoryRun,
          artifactRoot: runArtifactRoot,
        },
      });
      codexExecutionPlan = await codexAdapter.planExecution({
        contract,
        contractArtifact,
        sandbox,
        policy,
        budget,
        artifactRoot: runArtifactRoot,
        verifierPlan: verificationPlan,
      });
      const approval = await request.createExecutionApproval?.({
        run,
        plan: codexExecutionPlan,
        artifactRoot: runArtifactRoot,
      });
      if (!approval) {
        throw new Error("Controlled Codex execution requires explicit approval.");
      }
      this.agentLedger.recordPermissionEvent({
        id: `${approval.id}-ledger`,
        runId: run.id,
        actionId: codexExecutionPlan.id,
        permissionTier:
          approval.authorizationSource === "automatic_policy" ? "safe" : "review",
        decision:
          approval.authorizationSource === "automatic_policy"
            ? "auto_allowed"
            : "approved",
        reason: approval.reason,
        policyVersion: policy.id,
        requestedAt: codexExecutionPlan.createdAt,
        decidedAt: approval.approvedAt,
        decidedByUserId:
          approval.authorizationSource === "automatic_policy"
            ? null
            : approval.approvedBy,
      });
      codexExecutionResult = await codexAdapter.executeApprovedContract(codexExecutionPlan, approval, { signal: request.signal });
      codexExecutionResults.push(codexExecutionResult);
      this.agentLedger.recordGatewayUsage({
        id: `${codexExecutionResult.id}-repository-gateway`,
        runId: run.id,
        workspaceId: request.workspaceId,
        userId,
        gatewayType: "repository",
        actionType: "controlled_codex_execution",
        durationMs: Math.max(1, Date.parse(codexExecutionResult.completedAt) - Date.parse(codexExecutionResult.startedAt)),
        transferredMb: 0,
        storageGbDay: 0,
        requestCount: 1,
        createdAt: codexExecutionResult.completedAt,
      });
      if (
        codexExecutionResult.status === "cancelled" ||
        request.signal?.aborted
      ) {
        this.runStore.updateRunStatus(run.id, "cancelled");
        throw new RepositoryRunCancelledError();
      }
      if (codexExecutionResult.status !== "finished") {
        const failureSummary = codexAdapter.summarizeExecution(codexExecutionResult);
        this.runStore.updateRunStatus(run.id, "failed");
        this.agentLedger.appendEvent(run.id, {
          id: `${run.id}-ledger-event-codex-execution-failed`,
          eventType: "run.failed",
          payloadJson: {
            summary: failureSummary,
            executionPlanId: codexExecutionPlan.id,
            executionResultId: codexExecutionResult.id,
            failureReasons: codexExecutionResult.failureReasons,
          },
          visibility: "user",
          createdAt: codexExecutionResult.completedAt,
        });
        this.agentLedger.completeRun(run.id, {
          endedAt: codexExecutionResult.completedAt,
          retryCount: 0,
          finalSummary: failureSummary,
          failureReason: failureSummary,
        });
        throw new Error(failureSummary);
      }
      this.agentLedger.appendEvent(run.id, {
        id: `${run.id}-ledger-event-action-executed`,
        eventType: "action.executed",
        payloadJson: {
          summary: "Controlled Codex execution finished through the repository gateway",
          executionPlanId: codexExecutionPlan.id,
          executionResultId: codexExecutionResult.id,
        },
        visibility: "admin",
        createdAt: codexExecutionResult.completedAt,
      });
      const executionImportRequest = codexAdapter.createResultImportRequest(codexExecutionResult);
      manualLogPath = executionImportRequest.manualLogPath;
      validationTranscriptPath = executionImportRequest.validationTranscriptPath;
    }

    assertNotCancelled();
    const manualChangeResult = await request.applyManualChange?.({
      run,
      inspection,
      sandbox,
      artifactRoot: runArtifactRoot,
      policy,
    });
    manualLogPath = manualChangeResult?.manualLogPath ?? manualLogPath;
    validationTranscriptPath = manualChangeResult?.validationTranscriptPath ?? validationTranscriptPath;
    assertNotCancelled();

    const managedVerifierFailure =
      await enforceManagedVerifierIntegrity("before import");
    assertNotCancelled();
    if (managedVerifierFailure) {
      this.runStore.updateRunStatus(run.id, "failed");
      throw new Error(managedVerifierFailure);
    }

    const importer = new LocalManualCodexResultImporter({
      managedArtifactRoot,
      runStore: this.runStore,
    });
    let importBundle = await importer.importResultBundle({
      runId: run.id,
      taskId: run.taskId,
      sandbox,
      policy,
      budget,
      artifactRoot: runArtifactRoot,
      manualLogPath,
      validationTranscriptPath,
      userNotes: request.userNotes,
      validationCommands: request.validationCommands ?? [],
      expectedPaths: request.authorization?.expectedPaths,
      requireExpectedPaths:
        request.authorization?.requireExpectedPaths ?? false,
      allowDestructiveChanges:
        request.authorization?.allowDestructiveChanges ?? false,
      allowChangedFileLimitExceeded:
        request.authorization?.allowChangedFileLimitExceeded ?? false,
    });
    assertNotCancelled();
    let verifierInput = importer.createVerifierInput(importBundle);
    verifierInput.config = {
      ...verifierInput.config,
      defaultCommands: [],
      requireChangedFiles: !readOnlyRepositoryRun,
      authorizedChangedPaths: request.authorization?.expectedPaths,
      requireAuthorizedChangedPaths:
        request.authorization?.requireExpectedPaths ?? false,
      allowDestructiveChanges:
        request.authorization?.allowDestructiveChanges ?? false,
      allowChangedFileLimitExceeded:
        request.authorization?.allowChangedFileLimitExceeded ?? false,
      artifactRoot: runArtifactRoot,
    };
    const verifierInputPath = path.join(runArtifactRoot, "verifier-input.json");
    const verifierInputJson = `${JSON.stringify(verifierInput, null, 2)}\n`;
    await writeFile(verifierInputPath, verifierInputJson, { encoding: "utf8" });

    verificationPlan = verifier.createPlan(verifierInput);
    let verificationResult: VerificationResult;
    try {
      verificationResult = await verifier.runVerification(
        verificationPlan,
        policy,
        { signal: request.signal },
      );
    } catch (error) {
      if (
        request.signal?.aborted ||
        (error instanceof Error &&
          error.name === "VerificationCancelledError")
      ) {
        this.runStore.updateRunStatus(run.id, "cancelled");
        throw new RepositoryRunCancelledError();
      }
      throw error;
    }
    assertNotCancelled();
    const verificationAttempts: VerificationResult[] = [verificationResult];
    let postVerificationReviewResult: PostVerificationReviewResult | undefined;
    let postVerificationReviewError: string | undefined;
    let recoveryAttempts = 0;
    if (request.postVerificationReview) {
      try {
        postVerificationReviewResult = await request.postVerificationReview({
          runId: run.id,
          repositoryPath: inspection.gitRoot,
          sandboxWorktreePath: sandbox.worktreePath,
          status: verificationResult.status,
          summary: verifier.summarizeResult(verificationResult),
          signal: request.signal,
        });
      } catch (error) {
        if (
          request.signal?.aborted ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          throw new RepositoryRunCancelledError();
        }
        postVerificationReviewError =
          "Reviewer invocation failed after verification.";
      }
    }
    assertNotCancelled();
    const recoveryReview = postVerificationReviewResult;
    const recoveryTask = recoveryReview?.recoveryTask;
    if (
      verificationResult.status !== "pass" &&
      recoveryReview &&
      recoveryTask &&
      request.enableControlledCodexExecution &&
      request.orchestration?.plan &&
      request.orchestration.profile.maxRecoveryAttempts > 0
    ) {
      try {
        validateOrchestrationRecoveryTask(
          recoveryTask,
          request.orchestration.plan,
          request.orchestration.profile,
        );
        recoveryAttempts = 1;
        const recoveryArtifactRoot = path.join(
          runArtifactRoot,
          "attempts",
          "recovery-1",
        );
        await mkdir(recoveryArtifactRoot, { recursive: true });
        await writeFile(
          path.join(
            runArtifactRoot,
            "attempts",
            "initial-verification-result.json",
          ),
          `${JSON.stringify(verificationResult, null, 2)}\n`,
          "utf8",
        );
        const recoveryVerificationPlan = verifier.createPlan({
          runId: run.id,
          taskId: recoveryTask.id,
          sandbox,
          policy,
          budget,
          commands: request.validationCommands ?? [],
          artifactRoot: recoveryArtifactRoot,
          config: {
            defaultCommands: [],
            requireChangedFiles: !readOnlyRepositoryRun,
            authorizedChangedPaths: request.authorization?.expectedPaths,
            requireAuthorizedChangedPaths:
              request.authorization?.requireExpectedPaths ?? false,
            allowDestructiveChanges:
              request.authorization?.allowDestructiveChanges ?? false,
            allowChangedFileLimitExceeded:
              request.authorization?.allowChangedFileLimitExceeded ?? false,
            artifactRoot: recoveryArtifactRoot,
          },
        });
        const recoveryContract = codexAdapter.createContract({
          runId: run.id,
          taskId: recoveryTask.id,
          goal: recoveryTask.instruction,
          context: [
            "Verifier-driven recovery attempt 1 of 1.",
            `Original goal: ${request.goal}`,
            `Failed verifier result: ${verifier.summarizeResult(verificationResult)}`,
            `Reviewer summary: ${postVerificationReviewResult?.summary ?? "not available"}`,
            "The original operator approval covers only this bounded retry in the same sandbox.",
          ],
          constraints: [
            "Keep all changes within the original approved repository paths.",
            "Do not broaden operations, path scope, permissions, or dependencies.",
            "Address only the recorded verifier failure.",
          ],
          doneWhen: [
            "The recorded verifier failure is repaired.",
            "The original acceptance criteria remain satisfied.",
          ],
          repository: inspection,
          sandbox,
          policy,
          budget,
          validationCommands: request.validationCommands ?? [],
          artifactRoot: recoveryArtifactRoot,
          executionMode: "manual_cli",
          modelId: request.modelConnection?.modelId,
          modelLabel: request.modelConnection?.modelLabel,
          modelRole: "implementer",
          thinkingEffort:
            typeof request.thinkingEffort === "string"
              ? request.thinkingEffort as DesktopThinkingEffort
              : undefined,
          parentInvocationId: recoveryReview.invocation.id,
        });
        const recoveryContractArtifact =
          await codexAdapter.writeContractArtifact(
            recoveryContract,
            recoveryArtifactRoot,
          );
        const recoveryExecutionPlan = await codexAdapter.planExecution({
          contract: recoveryContract,
          contractArtifact: recoveryContractArtifact,
          sandbox,
          policy,
          budget,
          artifactRoot: recoveryArtifactRoot,
          verifierPlan: recoveryVerificationPlan,
        });
        const recoveryApproval = await request.createExecutionApproval?.({
          run,
          plan: recoveryExecutionPlan,
          artifactRoot: recoveryArtifactRoot,
        });
        if (!recoveryApproval) {
          throw new Error(
            "Bounded recovery requires the original run approval.",
          );
        }
        const recoveryExecutionResult =
          await codexAdapter.executeApprovedContract(
            recoveryExecutionPlan,
            recoveryApproval,
            { signal: request.signal },
          );
        codexExecutionResults.push(recoveryExecutionResult);
        if (
          recoveryExecutionResult.status === "cancelled" ||
          request.signal?.aborted
        ) {
          throw new RepositoryRunCancelledError();
        }
        if (recoveryExecutionResult.status !== "finished") {
          postVerificationReviewError =
            "The bounded recovery implementer did not finish.";
        } else {
          codexExecutionResult = recoveryExecutionResult;
          const recoveryImportRequest =
            codexAdapter.createResultImportRequest(recoveryExecutionResult);
          importBundle = await importer.importResultBundle({
            runId: run.id,
            taskId: recoveryTask.id,
            sandbox,
            policy,
            budget,
            artifactRoot: recoveryArtifactRoot,
            manualLogPath: recoveryImportRequest.manualLogPath,
            validationTranscriptPath:
              recoveryImportRequest.validationTranscriptPath,
            validationCommands: request.validationCommands ?? [],
            expectedPaths: request.authorization?.expectedPaths,
            requireExpectedPaths:
              request.authorization?.requireExpectedPaths ?? false,
            allowDestructiveChanges:
              request.authorization?.allowDestructiveChanges ?? false,
            allowChangedFileLimitExceeded:
              request.authorization?.allowChangedFileLimitExceeded ?? false,
          });
          verifierInput = importer.createVerifierInput(importBundle);
          verifierInput.config = {
            ...verifierInput.config,
            defaultCommands: [],
            requireChangedFiles: !readOnlyRepositoryRun,
            authorizedChangedPaths: request.authorization?.expectedPaths,
            requireAuthorizedChangedPaths:
              request.authorization?.requireExpectedPaths ?? false,
            allowDestructiveChanges:
              request.authorization?.allowDestructiveChanges ?? false,
            allowChangedFileLimitExceeded:
              request.authorization?.allowChangedFileLimitExceeded ?? false,
            artifactRoot: runArtifactRoot,
          };
          await writeFile(
            verifierInputPath,
            `${JSON.stringify(verifierInput, null, 2)}\n`,
            { encoding: "utf8" },
          );
          verificationPlan = verifier.createPlan(verifierInput);
          verificationResult = await verifier.runVerification(
            verificationPlan,
            policy,
            { signal: request.signal },
          );
          verificationAttempts.push(verificationResult);
        }
      } catch (error) {
        if (
          request.signal?.aborted ||
          error instanceof RepositoryRunCancelledError ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          throw new RepositoryRunCancelledError();
        }
        postVerificationReviewError =
          error instanceof Error
            ? `Recovery blocked: ${error.message}`
            : "Recovery blocked by deterministic validation.";
      }
    }
    assertNotCancelled();
    const memoryExtractor = new LocalMemoryExtractor({
      memoryStore,
      runStore: this.runStore,
      managedMemoryRoot: memoryRoot,
    });
    const memoryExtractionResult =
      request.enableMemoryExtraction === false
        ? {
            id: `memory-extraction-skipped-${run.id}`,
            runId: run.id,
            taskId: run.taskId,
            namespace: memoryNamespace,
            episodes: [],
            candidateRules: [],
            redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
            artifacts: [],
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            summary: "Memory extraction skipped by request.",
          }
        : await memoryExtractor.extractRunMemory({
            run: this.runStore.getRun(run.id) ?? run,
            events: this.runStore.listEvents(run.id),
            namespace: memoryNamespace,
            artifactRoot: memoryRoot,
            importBundle,
            verificationResult,
            retention: { ttlDays: 30, archiveAfterDays: 90 },
          });
    assertNotCancelled();
    const summary = verifier.summarizeResult(verificationResult);
    const cognitiveTrace = await this.runCognitiveKernel({
      run,
      request,
      policy,
      verificationResult,
      memoryExtractionResult,
      priorMemoryHits,
    });
    assertNotCancelled();
    const feedbackMemory = request.userNotes?.trim()
      ? await memoryStore.writeSemanticMemory({
          namespace: memoryNamespace,
          status: "candidate",
          summary: `User feedback for supervised run: ${request.userNotes.trim()}`,
          content: {
            feedback: request.userNotes.trim(),
            verificationResultId: verificationResult.id,
            importBundleId: importBundle.id,
          },
          sensitivity: "internal",
          confidence: 0.7,
          provenance: {
            runId: run.id,
            taskId: run.taskId,
            eventIds: this.runStore.listEvents(run.id).map((event) => event.id),
            artifactRefs: [...importBundle.artifacts, ...verificationResult.artifacts],
            sources: ["user_feedback"],
            verificationResultId: verificationResult.id,
            importBundleId: importBundle.id,
          },
        })
      : undefined;
    assertNotCancelled();
    const skillInvocationPlan = await new LocalSkillRegistry().planSkillInvocation({
      namespace: memoryNamespace,
      runId: run.id,
      taskId: run.taskId,
      text: request.goal,
    });
    assertNotCancelled();
    this.agentLedger.appendEvent(run.id, {
      id: `${run.id}-ledger-event-${verificationResult.status === "pass" ? "verification-passed" : "verification-failed"}`,
      eventType: verificationResult.status === "pass" ? "verification.passed" : "verification.failed",
      payloadJson: {
        summary,
        verificationResultId: verificationResult.id,
      },
      visibility: "user",
      createdAt: verificationResult.completedAt,
    });
    this.runStore.appendEvent(run.id, {
      type: "run_finished",
      actor: this.actor,
      payload: {
        summary,
        verifierInputPath,
      },
      artifacts: [
        {
          id: `${importBundle.id}-verifier-input`,
          kind: "verifier_input",
          uri: `file://${verifierInputPath}`,
          label: "Verifier input from imported Codex result",
          sha256: sha256(verifierInputJson),
        },
      ],
      verdict: {
        status: verificationResult.verdict.status,
        reason: verificationResult.verdict.reason,
        confidence: verificationResult.verdict.confidence,
      },
    });
    for (const artifact of eventsToArtifacts(this.runStore.listEvents(run.id))) {
      this.agentLedger.recordArtifact({
        id: artifact.id,
        runId: run.id,
        eventId: null,
        artifactType: artifact.kind,
        storageRef: artifact.uri,
        sha256: artifact.sha256,
        visibility: "admin",
        createdAt: verificationResult.completedAt,
      });
    }
    this.agentLedger.appendEvent(run.id, {
      id: `${run.id}-ledger-event-run-completed`,
      eventType: verificationResult.status === "pass" ? "run.completed" : "run.failed",
      payloadJson: {
        summary,
        verifierInputPath,
      },
      visibility: "user",
      createdAt: verificationResult.completedAt,
    });
    const finalLedgerRun = this.agentLedger.completeRun(run.id, {
      endedAt: verificationResult.completedAt,
      retryCount: recoveryAttempts,
      finalSummary: summary,
      failureReason: verificationResult.status === "pass" ? null : verificationResult.verdict.reason,
    });
    const usageSummary = this.agentLedger.getMonthlyUsageSummary({
      workspaceId: request.workspaceId,
      userId,
      month: finalLedgerRun.startedAt.slice(0, 7),
      includeInternalCosts: false,
    });
    const adminUsageSummary = this.agentLedger.getMonthlyUsageSummary({
      workspaceId: request.workspaceId,
      userId,
      month: finalLedgerRun.startedAt.slice(0, 7),
      includeInternalCosts: true,
    });

    const events = this.runStore.listEvents(run.id);
    return {
      run: this.runStore.getRun(run.id) ?? run,
      events,
      inspection,
      sandbox,
      contractArtifact,
      codexExecutionPlan,
      codexExecutionResult,
      codexExecutionResults,
      importBundle,
      verifierInput,
      verifierInputPath,
      verificationPlan,
      verificationResult,
      verificationAttempts,
      ...(postVerificationReviewResult
        ? { postVerificationReviewResult }
        : {}),
      ...(postVerificationReviewError
        ? { postVerificationReviewError }
        : {}),
      recoveryAttempts,
      memoryExtractionResult,
      cognitiveKernelResult: cognitiveTrace.cognitiveKernelResult,
      cognitiveGatewayResult: cognitiveTrace.cognitiveGatewayResult,
      feedbackMemory,
      skillInvocationPlan,
      ledgerRun: finalLedgerRun,
      usageSummary,
      adminUsageSummary,
      memorySummary: memoryExtractionResult.summary,
      episodes: memoryExtractionResult.episodes,
      candidateRules: memoryExtractionResult.candidateRules,
      summary,
      artifacts: events.flatMap((event) => event.artifacts),
    };
  }

  private async runCognitiveKernel(input: {
    run: Run;
    request: CodingApprenticeDemoRequest;
    policy: CorePolicy;
    verificationResult: VerificationResult;
    memoryExtractionResult: MemoryExtractionResult;
    priorMemoryHits: KernelMemoryHit[];
  }): Promise<{
    cognitiveKernelResult: CognitiveKernelResult;
    cognitiveGatewayResult: GatewayExecutionResult;
  }> {
    const memoryHits: KernelMemoryHit[] = [
      ...input.priorMemoryHits,
      ...input.memoryExtractionResult.episodes.map((episode) => ({
        id: episode.id,
        kind: "episodic" as const,
        summary: episode.summary,
        relevance: episode.kind === "run_episode" ? 0.95 : 0.78,
        sourceRunId: episode.provenance.runId,
      })),
    ];
    const expectedObservation = `verification ${input.verificationResult.status}`;
    let cognitiveGatewayResult: GatewayExecutionResult | undefined;
    const gateway = new AuditableGateway({
      policy: input.policy,
      approvalProvider: new StaticApprovalProvider({}),
      evidenceStore: new InMemoryGatewayEvidenceStore(),
      adapter: {
        execute: async (action) => ({
          actionId: action.id,
          status: "executed",
          observation: expectedObservation,
          evidence: input.verificationResult.artifacts.map((artifact) => ({
            id: `${artifact.id}-gateway-evidence`,
            artifactType: "trace",
            storageRef: artifact.uri,
            visibility: "user",
            metadata: {
              sourceArtifactId: artifact.id,
              sourceArtifactKind: artifact.kind,
              label: artifact.label,
            },
          })),
        }),
      },
    });
    const kernel = new DeterministicCognitiveKernel({
      policy: input.policy,
      memoryProvider: new StaticMemoryProvider(memoryHits),
      planner: {
        plan: async () => ({
          id: `kernel-action-${input.run.id}-verify-supervised-result`,
          summary: "Review supervised Coding Apprentice verification result",
          policyAction: {
            id: `policy-action-${input.run.id}-review-verification`,
            kind: "command",
            summary: "Inspect repository status after supervised verification",
            command: "git status",
          },
          expectedObservation,
          confidence: input.verificationResult.status === "pass" ? 0.9 : 0.62,
          uncertaintyScore: input.verificationResult.status === "pass" ? 0.1 : 0.38,
        }),
      },
      gateway: {
        execute: async (action) => {
          cognitiveGatewayResult = await gateway.routeAction({
            id: action.id,
            runId: input.run.id,
            workspaceId: input.request.workspaceId,
            userId: input.request.userId ?? "local-operator",
            surface: "repository",
            actionType: "review_verification",
            instruction: action.summary,
            stateChanging: false,
            expectedEvidence: ["trace"],
            policyAction: action.policyAction,
          });
          return {
            actionId: action.id,
            observation: cognitiveGatewayResult.observation ?? cognitiveGatewayResult.status,
            evidence: cognitiveGatewayResult.evidence.map((evidence) => ({
              id: evidence.id,
              kind: "trace",
              label: String(evidence.metadata.label ?? evidence.artifactType),
              uri: evidence.storageRef,
            })),
          };
        },
      },
    });

    const cognitiveKernelResult = await kernel.runTask({
      runId: input.run.id,
      taskId: input.run.taskId,
      workspaceId: input.request.workspaceId,
      goal: input.request.goal,
      constraints: ["supervised repository run", "kernel trace only", "no additional execution"],
      maxSteps: 3,
    });
    if (!cognitiveGatewayResult) {
      throw new Error("cognitive gateway did not produce an audit result");
    }
    return {
      cognitiveKernelResult,
      cognitiveGatewayResult,
    };
  }
}

function eventsToArtifacts(events: RunEvent[]): Array<{
  id: string;
  kind: "command_log" | "file_diff" | "generated_file" | "trace" | "other";
  uri: string;
  sha256?: string;
}> {
  return events.flatMap((event) =>
    event.artifacts.map((artifact) => ({
      id: `${artifact.id}-ledger`,
      kind: toLedgerArtifactKind(artifact.kind),
      uri: artifact.uri,
      sha256: artifact.sha256,
    })),
  );
}

function toLedgerArtifactKind(kind: ArtifactRef["kind"]): "command_log" | "file_diff" | "generated_file" | "trace" | "other" {
  if (kind === "diff") {
    return "file_diff";
  }
  if (kind === "test_output" || kind === "log" || kind === "codex_execution_log") {
    return "command_log";
  }
  if (kind === "codex_contract" || kind === "codex_execution_result" || kind === "verifier_input") {
    return "generated_file";
  }
  if (kind === "validation_report" || kind === "codex_result_bundle") {
    return "trace";
  }
  return "other";
}
