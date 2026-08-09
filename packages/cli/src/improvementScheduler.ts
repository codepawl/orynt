import { createHash, randomUUID } from "node:crypto";

import { LocalIntelligenceRuntime } from "@codepawl/intelligence-runtime";
import type {
  CapabilityRuntimeSettingsV1,
  ImprovementCandidateV1,
  ImprovementCaseV1,
} from "@codepawl/shared";

export type PreparedImprovementEvaluation = {
  candidate: ImprovementCandidateV1;
  instruction: string;
  baselineCorrect: boolean;
  baselineLatencyMs: number;
  tokenBudget: number;
  tokenUsed: number;
  startedAt: number;
};

export async function prepareImprovementEvaluation(input: {
  stateRoot: string;
  instruction: string;
  maximumModelTokens: number;
  settings: CapabilityRuntimeSettingsV1;
}): Promise<PreparedImprovementEvaluation | undefined> {
  // Public v0.1 keeps candidates in shadow. A candidate must not steer a live
  // instruction before an operator has explicitly approved its promotion.
  void input;
  return undefined;
}

export async function finishImprovementRun(input: {
  stateRoot: string;
  runId: string;
  taskId: string;
  taskTemplateId: string;
  repositoryDomain: string;
  modelTier: string;
  verifierPassed: boolean;
  latencyMs: number;
  artifactRefs: string[];
  settings: CapabilityRuntimeSettingsV1;
  evaluation?: PreparedImprovementEvaluation;
}): Promise<void> {
  if (input.settings.autoImproveMode === "off") return;
  const intelligence = new LocalIntelligenceRuntime(input.stateRoot);
  await intelligence.initialize();
  const runtime = intelligence.improvementRuntime;
  const ledger = runtime.ledger;
  let snapshot = await ledger.load();
  await ledger.appendOutcome({
    schemaVersion: 1,
    id: `outcome-${input.runId}`,
    runId: input.runId,
    taskId: input.taskId,
    capabilityId: "repository-agent",
    capabilityVersion: "1",
    capabilityDigest: "repository-agent-v1",
    taskTemplateId: input.taskTemplateId,
    repositoryDomain: input.repositoryDomain,
    modelTier: input.modelTier,
    verifierPassed: input.verifierPassed,
    policyPassed: true,
    unsafeActionCount: 0,
    latencyMs: input.latencyMs,
    retryCount: 0,
    artifactRefs: input.artifactRefs,
    recordedAt: new Date().toISOString(),
  }, snapshot.revision);

  if (input.evaluation) {
    const improvementCase: ImprovementCaseV1 = {
      id: `case-${randomUUID()}`,
      candidateId: input.evaluation.candidate.id,
      runId: input.runId,
      taskTemplateId: input.taskTemplateId,
      repositoryDomain: input.repositoryDomain,
      modelTier: input.modelTier,
      phase: "canary",
      baselineCorrect: input.evaluation.baselineCorrect,
      candidateCorrect: input.verifierPassed,
      baselineLatencyMs: input.evaluation.baselineLatencyMs,
      candidateLatencyMs: Math.max(0, performance.now() - input.evaluation.startedAt),
      policyPassed: true,
      unsafeActionCount: 0,
      criticalRegression: input.evaluation.baselineCorrect && !input.verifierPassed,
      tokenBudget: input.evaluation.tokenBudget,
      tokenUsed: input.evaluation.tokenUsed,
      artifactRefs: input.artifactRefs,
      recordedAt: new Date().toISOString(),
    };
    await runtime.recordEvaluationCase(improvementCase);
    snapshot = await ledger.load();
  }

  if (input.verifierPassed) {
    await runtime.hygiene(false);
  }
}

export function improvementTaskTemplateId(instruction: string): string {
  const normalized = [...tokenize(instruction)].sort().slice(0, 16).join("-");
  return `task-${createHash("sha256").update(normalized).digest("hex").slice(0, 12)}`;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value.toLowerCase()
      .split(/[^\p{L}\p{N}._-]+/u)
      .filter((token) => token.length > 2),
  );
}
