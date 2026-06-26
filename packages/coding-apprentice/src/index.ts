import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { LocalCodexContractAdapter, LocalManualCodexResultImporter } from "@codepawl/codex-adapter";
import { LocalJsonMemoryStore, LocalMemoryExtractor } from "@codepawl/memory";
import { GitRepositorySandboxManager } from "@codepawl/repository-sandbox";
import {
  createConservativeCodingApprenticePolicy,
  createDefaultRunBudget,
  InMemoryRunStore,
  policyDecisionToSafetySnapshot,
  type Actor,
  type ArtifactRef,
  type CodexContractArtifact,
  type CodexResultBundle,
  type CorePolicy,
  type CandidateRule,
  type EpisodicMemoryItem,
  type MemoryExtractionResult,
  type MemoryNamespace,
  type MemoryStore,
  type RepositoryInspection,
  type RepositorySandbox,
  type Run,
  type RunBudget,
  type RunEvent,
  type RunStore,
  type VerificationPlan,
  type VerificationPlanRequest,
  type VerificationResult,
} from "@codepawl/shared";
import { LocalRepositoryVerifier } from "@codepawl/verifier";

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

export type CodingApprenticeDemoRequest = {
  goal: string;
  taskId: string;
  workspaceId: string;
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
  enableMemoryExtraction?: boolean;
  memoryRoot?: string;
  memoryNamespace?: MemoryNamespace;
  applyManualChange?: (context: ManualDemoChangeContext) => Promise<ManualDemoChangeResult | void> | ManualDemoChangeResult | void;
};

export type CodingApprenticeDemoResult = {
  run: Run;
  events: RunEvent[];
  inspection: RepositoryInspection;
  sandbox: RepositorySandbox;
  contractArtifact: CodexContractArtifact;
  importBundle: CodexResultBundle;
  verifierInput: VerificationPlanRequest;
  verifierInputPath: string;
  verificationPlan: VerificationPlan;
  verificationResult: VerificationResult;
  memoryExtractionResult: MemoryExtractionResult;
  memorySummary: string;
  episodes: EpisodicMemoryItem[];
  candidateRules: CandidateRule[];
  summary: string;
  artifacts: ArtifactRef[];
};

export type LocalCodingApprenticeDemoOrchestratorOptions = {
  runStore?: RunStore;
  memoryStore?: MemoryStore;
  actor?: Actor;
};

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
  private readonly actor: Actor;

  constructor(options: LocalCodingApprenticeDemoOrchestratorOptions = {}) {
    this.runStore = options.runStore ?? new InMemoryRunStore();
    this.memoryStore = options.memoryStore;
    this.actor = options.actor ?? DEFAULT_ACTOR;
  }

  async runDemo(request: CodingApprenticeDemoRequest): Promise<CodingApprenticeDemoResult> {
    const budget = request.budget ?? createDefaultRunBudget();
    const run = this.runStore.createRun({
      goal: request.goal,
      capabilityId: "coding-apprentice",
      taskId: request.taskId,
      workspaceId: request.workspaceId,
      budget,
    });
    const baseRef = request.baseRef ?? "HEAD";
    const managedArtifactRoot = path.resolve(request.artifactRoot);
    const runArtifactRoot = path.join(managedArtifactRoot, run.id);
    await mkdir(runArtifactRoot, { recursive: true });

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
    this.runStore.appendEvent(run.id, {
      type: "sandbox_created",
      actor: this.actor,
      payload: {
        summary: "Repository worktree sandbox created",
        sandbox,
      },
    });

    const codexAdapter = new LocalCodexContractAdapter({
      managedArtifactRoot,
      runStore: this.runStore,
    });
    const contract = codexAdapter.createContract({
      runId: run.id,
      taskId: run.taskId,
      goal: request.goal,
      context: ["Local Coding Apprentice demo flow.", `Repository: ${inspection.gitRoot}`],
      constraints: ["Do not execute Codex automatically.", "Import only managed manual artifacts.", "Verifier owns final success verdict."],
      doneWhen: ["Manual result is imported.", "Verifier input is created.", "Verifier records final evidence."],
      repository: inspection,
      sandbox,
      policy,
      budget,
      validationCommands: request.validationCommands ?? [],
      artifactRoot: runArtifactRoot,
    });
    const contractArtifact = await codexAdapter.writeContractArtifact(contract, runArtifactRoot);

    const manualChangeResult = await request.applyManualChange?.({
      run,
      inspection,
      sandbox,
      artifactRoot: runArtifactRoot,
      policy,
    });
    const manualLogPath = manualChangeResult?.manualLogPath ?? request.manualLogPath;
    const validationTranscriptPath = manualChangeResult?.validationTranscriptPath ?? request.validationTranscriptPath;

    const importer = new LocalManualCodexResultImporter({
      managedArtifactRoot,
      runStore: this.runStore,
    });
    const importBundle = await importer.importResultBundle({
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
    });
    const verifierInput = importer.createVerifierInput(importBundle);
    verifierInput.config = {
      ...verifierInput.config,
      defaultCommands: [],
      requireChangedFiles: true,
      artifactRoot: runArtifactRoot,
    };
    const verifierInputPath = path.join(runArtifactRoot, "verifier-input.json");
    const verifierInputJson = `${JSON.stringify(verifierInput, null, 2)}\n`;
    await writeFile(verifierInputPath, verifierInputJson, { encoding: "utf8" });

    const verifier = new LocalRepositoryVerifier({
      managedArtifactRoot,
      runStore: this.runStore,
    });
    const verificationPlan = verifier.createPlan(verifierInput);
    const verificationResult = await verifier.runVerification(verificationPlan, policy);
    const memoryRoot = path.resolve(request.memoryRoot ?? path.join(runArtifactRoot, "memory"));
    const memoryStore = this.memoryStore ?? new LocalJsonMemoryStore({ memoryRoot });
    const memoryExtractor = new LocalMemoryExtractor({
      memoryStore,
      runStore: this.runStore,
      managedMemoryRoot: memoryRoot,
    });
    const memoryNamespace = request.memoryNamespace ?? {
      capabilityId: run.capabilityId,
      workspaceId: run.workspaceId,
      repositoryPath: inspection.gitRoot,
    };
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
    const summary = verifier.summarizeResult(verificationResult);
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

    const events = this.runStore.listEvents(run.id);
    return {
      run: this.runStore.getRun(run.id) ?? run,
      events,
      inspection,
      sandbox,
      contractArtifact,
      importBundle,
      verifierInput,
      verifierInputPath,
      verificationPlan,
      verificationResult,
      memoryExtractionResult,
      memorySummary: memoryExtractionResult.summary,
      episodes: memoryExtractionResult.episodes,
      candidateRules: memoryExtractionResult.candidateRules,
      summary,
      artifacts: events.flatMap((event) => event.artifacts),
    };
  }
}
