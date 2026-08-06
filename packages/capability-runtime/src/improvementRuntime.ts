import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  IMMUTABLE_AUTO_IMPROVEMENT_TARGETS,
  type ActiveImprovementV2,
  type ImprovementCaseV1,
  type ImprovementCandidateV1,
  type ImprovementTargetArtifactV1,
} from "@codepawl/shared";

import { evaluateImprovementCandidate } from "./index.js";
import { LocalCapabilityLedger } from "./ledger.js";

/** @deprecated Use ActiveImprovementV2. */
export type ActiveImprovementV1 = ActiveImprovementV2;

export type ImprovementHygieneResult = {
  checked: number;
  quarantined: string[];
  rolledBack: string[];
  issues: Array<{ candidateId: string; reason: string }>;
};

export class LocalImprovementRuntime {
  readonly root: string;
  readonly ledger: LocalCapabilityLedger;

  constructor(stateRoot: string) {
    if (!path.isAbsolute(stateRoot)) {
      throw new Error("Improvement state root must be absolute.");
    }
    this.root = path.join(stateRoot, "intelligence", "improvements");
    this.ledger = new LocalCapabilityLedger(
      path.join(stateRoot, "intelligence"),
    );
  }

  async writeCandidateArtifact(
    candidateId: string,
    kind: "baseline" | "proposed",
    value: unknown,
  ): Promise<{ ref: string; digest: string }> {
    const safeId = safeSegment(candidateId);
    const directory = path.join(this.root, "artifacts", safeId);
    const content = `${JSON.stringify(value, null, 2)}\n`;
    const digest = createHash("sha256").update(content).digest("hex");
    const fileName = `${kind}-${digest}.json`;
    const filePath = path.join(directory, fileName);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(filePath, content, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    return {
      ref: `orynt-artifact://improvements/${safeId}/${fileName}`,
      digest,
    };
  }

  async createCandidate(input: {
    targetId: string;
    targetClass: Extract<
      ImprovementCandidateV1["targetClass"],
      "learned_skill" | "user_overlay" | "memory_profile" | "router_weights"
    >;
    targetScope: ImprovementCandidateV1["targetScope"];
    artifact: ImprovementTargetArtifactV1;
    hypothesis: string;
    sourceEpisodeIds: string[];
    sourceTaskTemplateIds: string[];
  }): Promise<ImprovementCandidateV1> {
    if (input.sourceEpisodeIds.length < 5 ||
      new Set(input.sourceTaskTemplateIds).size < 3) {
      throw new Error("Improvement candidate requires five episodes across three task templates.");
    }
    if (input.artifact.kind !== input.targetClass) {
      throw new Error("Improvement artifact kind does not match its target class.");
    }
    const artifactContent = JSON.stringify(input.artifact);
    const proposedDigest = createHash("sha256")
      .update(artifactContent)
      .digest("hex");
    const id = `candidate-${safeSegment(input.targetClass)}-${proposedDigest.slice(0, 16)}`;
    const existing = (await this.ledger.load()).candidates.find(
      (candidate) => candidate.id === id,
    );
    if (existing) return existing;
    const proposed = await this.writeCandidateArtifact(id, "proposed", input.artifact);
    const candidate: ImprovementCandidateV1 = {
      schemaVersion: 1,
      id,
      targetId: input.targetId,
      targetClass: input.targetClass,
      targetScope: input.targetScope,
      baseDigest: "none",
      proposedDigest,
      hypothesis: input.hypothesis,
      patchArtifactRef: proposed.ref,
      proposedArtifactRef: proposed.ref,
      artifactDigest: proposed.digest,
      risk: input.targetClass === "router_weights" ? "behavioral" : "low",
      sourceEpisodeIds: [...new Set(input.sourceEpisodeIds)],
      sourceTaskTemplateIds: [...new Set(input.sourceTaskTemplateIds)],
      evaluationCases: [],
      evaluation: emptyEvaluation(),
      status: "shadow",
      createdAt: new Date().toISOString(),
    };
    const ledger = await this.ledger.load();
    await this.ledger.upsertCandidate(candidate, ledger.revision);
    return candidate;
  }

  async recordEvaluationCase(
    improvementCase: ImprovementCaseV1,
  ): Promise<ImprovementCandidateV1> {
    const snapshot = await this.ledger.load();
    const candidate = snapshot.candidates.find(
      ({ id }) => id === improvementCase.candidateId,
    );
    if (!candidate) {
      throw new Error(`Improvement candidate not found: ${improvementCase.candidateId}`);
    }
    if (improvementCase.tokenUsed > improvementCase.tokenBudget) {
      throw new Error("Improvement evaluation exceeded its token budget.");
    }
    const cases = [
      ...(candidate.evaluationCases ?? []).filter(
        ({ id }) => id !== improvementCase.id,
      ),
      structuredClone(improvementCase),
    ];
    const next: ImprovementCandidateV1 = {
      ...candidate,
      evaluationCases: cases,
      evaluation: evaluationFromCases(cases),
      status: candidate.status === "shadow" ? "canary" : candidate.status,
    };
    await this.ledger.upsertCandidate(next, snapshot.revision);
    return next;
  }

  async loadActiveArtifacts(): Promise<
    Array<ActiveImprovementV1 & { artifact: ImprovementTargetArtifactV1 }>
  > {
    const registry = await this.ledger.load();
    const output: Array<
      ActiveImprovementV1 & { artifact: ImprovementTargetArtifactV1 }
    > = [];
    for (const active of Object.values(registry.activeTargets)) {
      const artifact = await this.readArtifact(active.artifactRef, active.artifactDigest);
      if (!isTargetArtifact(artifact) || artifact.kind !== active.targetClass) {
        throw new Error(`Active improvement artifact is invalid: ${active.candidateId}`);
      }
      output.push({ ...active, artifact });
    }
    return output;
  }

  async promote(
    candidateId: string,
    expectedLedgerRevision?: number,
  ): Promise<ActiveImprovementV1> {
    const snapshot = await this.ledger.load();
    if (
      expectedLedgerRevision !== undefined &&
      snapshot.revision !== expectedLedgerRevision
    ) {
      throw Object.assign(new Error("Improvement ledger revision conflict."), {
        code: "revision_conflict",
      });
    }
    const candidate = snapshot.candidates.find(({ id }) => id === candidateId);
    if (!candidate) throw new Error(`Improvement candidate not found: ${candidateId}`);
    if (IMMUTABLE_AUTO_IMPROVEMENT_TARGETS.has(candidate.targetClass)) {
      throw new Error(`Immutable improvement target cannot be promoted: ${candidate.targetClass}`);
    }
    const decision = evaluateImprovementCandidate(candidate);
    if (decision.decision !== "promote") {
      throw new Error(`Candidate remains shadow: ${decision.reasonCodes.join(", ")}`);
    }
    const artifactRef =
      candidate.proposedArtifactRef ?? candidate.patchArtifactRef;
    const artifactDigest = await this.verifyArtifact(
      artifactRef,
      candidate.artifactDigest,
    );
    const key = targetKey(candidate);
    const previous = snapshot.activeTargets[key];
    const activatedAt = new Date().toISOString();
    const active: ActiveImprovementV1 = {
      candidateId: candidate.id,
      targetId: candidate.targetId,
      targetClass: candidate.targetClass,
      targetScope: candidate.targetScope,
      artifactRef,
      artifactDigest,
      ...(previous ? { previousArtifactRef: previous.artifactRef } : {}),
      activatedAt,
    };
    await this.ledger.activate(
      candidate.id,
      active,
      activatedAt,
      snapshot.revision,
    );
    return active;
  }

  async rollback(candidateId: string): Promise<void> {
    const snapshot = await this.ledger.load();
    const candidate = snapshot.candidates.find(({ id }) => id === candidateId);
    if (!candidate) throw new Error(`Improvement candidate not found: ${candidateId}`);
    const key = targetKey(candidate);
    const current = snapshot.activeTargets[key];
    let replacement: ActiveImprovementV2 | undefined;
    if (current?.candidateId === candidateId) {
      const previousDigest = current.previousArtifactRef
        ? await this.verifyArtifact(current.previousArtifactRef)
        : undefined;
      replacement = current.previousArtifactRef
        ? {
            ...current,
            candidateId: `rollback-${candidateId}`,
            artifactRef: current.previousArtifactRef,
            artifactDigest: previousDigest!,
            activatedAt: new Date().toISOString(),
          }
        : undefined;
    }
    await this.ledger.rollbackActivation(
      candidateId,
      replacement,
      new Date().toISOString(),
      snapshot.revision,
    );
  }

  async hygiene(checkOnly = false): Promise<ImprovementHygieneResult> {
    const snapshot = await this.ledger.load();
    const registry = snapshot;
    const result: ImprovementHygieneResult = {
      checked: snapshot.candidates.length,
      quarantined: [],
      rolledBack: [],
      issues: [],
    };
    for (const candidate of snapshot.candidates) {
      const ref = candidate.proposedArtifactRef ?? candidate.patchArtifactRef;
      try {
        await this.verifyArtifact(ref, candidate.artifactDigest);
      } catch (error) {
        result.issues.push({
          candidateId: candidate.id,
          reason: error instanceof Error ? error.message : String(error),
        });
        if (checkOnly) continue;
        const active = registry.activeTargets[targetKey(candidate)];
        if (active?.candidateId === candidate.id) {
          await this.rollback(candidate.id);
          result.rolledBack.push(candidate.id);
        } else if (
          candidate.status !== "rolled_back" &&
          candidate.status !== "rejected" &&
          candidate.status !== "quarantined"
        ) {
          const current = await this.ledger.load();
          await this.ledger.quarantineCandidate(
            candidate.id,
            ["artifact_missing_or_digest_mismatch"],
            new Date().toISOString(),
            current.revision,
          );
          result.quarantined.push(candidate.id);
        }
      }
    }
    return result;
  }

  private async verifyArtifact(
    reference: string,
    expectedDigest?: string,
  ): Promise<string> {
    const match = reference.match(
      /^orynt-artifact:\/\/improvements\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+\.json)$/u,
    );
    if (!match) {
      throw new Error("Candidate artifact reference is not locally resolvable.");
    }
    const filePath = path.join(this.root, "artifacts", match[1]!, match[2]!);
    const resolved = path.resolve(filePath);
    const artifactRoot = path.resolve(path.join(this.root, "artifacts"));
    if (!resolved.startsWith(`${artifactRoot}${path.sep}`)) {
      throw new Error("Candidate artifact escaped the managed root.");
    }
    const content = await readFile(resolved, "utf8");
    const digest = createHash("sha256").update(content).digest("hex");
    if (expectedDigest && digest !== expectedDigest) {
      throw new Error("Candidate artifact digest mismatch.");
    }
    return digest;
  }

  private async readArtifact(
    reference: string,
    expectedDigest?: string,
  ): Promise<unknown> {
    await this.verifyArtifact(reference, expectedDigest);
    const match = reference.match(
      /^orynt-artifact:\/\/improvements\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+\.json)$/u,
    )!;
    return JSON.parse(
      await readFile(path.join(this.root, "artifacts", match[1]!, match[2]!), "utf8"),
    );
  }
}

function emptyEvaluation(): ImprovementCandidateV1["evaluation"] {
  return {
    pairedCaseCount: 0,
    baselineCorrectness: 0,
    candidateCorrectness: 0,
    correctnessDelta: 0,
    bootstrapLowerBound95: 0,
    baselineP95LatencyMs: 0,
    candidateP95LatencyMs: 0,
    policyPassRate: 0,
    unsafeActionCount: 0,
    criticalRegressionCount: 0,
    canaryEligibleRunCount: 0,
    canaryVerifierFailureCount: 0,
    repositoryDomainCount: 0,
    modelTierCount: 0,
  };
}

function evaluationFromCases(
  cases: ImprovementCaseV1[],
): ImprovementCandidateV1["evaluation"] {
  if (cases.length === 0) return emptyEvaluation();
  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const p95 = (values: number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
  };
  const baselineCorrectness = mean(cases.map(({ baselineCorrect }) => Number(baselineCorrect)));
  const candidateCorrectness = mean(cases.map(({ candidateCorrect }) => Number(candidateCorrect)));
  const correctnessDelta = candidateCorrectness - baselineCorrectness;
  const standardError = Math.sqrt(
    Math.max(0.000001, candidateCorrectness * (1 - candidateCorrectness) / cases.length) +
    Math.max(0.000001, baselineCorrectness * (1 - baselineCorrectness) / cases.length),
  );
  const canary = cases.filter(({ phase }) => phase === "canary");
  return {
    pairedCaseCount: cases.length,
    baselineCorrectness,
    candidateCorrectness,
    correctnessDelta,
    bootstrapLowerBound95: correctnessDelta - 1.96 * standardError,
    baselineP95LatencyMs: p95(cases.map(({ baselineLatencyMs }) => baselineLatencyMs)),
    candidateP95LatencyMs: p95(cases.map(({ candidateLatencyMs }) => candidateLatencyMs)),
    policyPassRate: mean(cases.map(({ policyPassed }) => Number(policyPassed))),
    unsafeActionCount: cases.reduce((sum, item) => sum + item.unsafeActionCount, 0),
    criticalRegressionCount: cases.filter(({ criticalRegression }) => criticalRegression).length,
    canaryEligibleRunCount: canary.length,
    canaryVerifierFailureCount: canary.filter(({ candidateCorrect }) => !candidateCorrect).length,
    repositoryDomainCount: new Set(cases.map(({ repositoryDomain }) => repositoryDomain)).size,
    modelTierCount: new Set(cases.map(({ modelTier }) => modelTier)).size,
  };
}

function isTargetArtifact(value: unknown): value is ImprovementTargetArtifactV1 {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    ["learned_skill", "user_overlay", "memory_profile", "router_weights"]
      .includes(String(value.kind)),
  );
}

function targetKey(candidate: ImprovementCandidateV1): string {
  return [
    candidate.targetScope,
    candidate.targetClass,
    candidate.targetId,
  ].join(":");
}

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9._-]{1,200}$/u.test(value)) {
    throw new Error("Unsafe improvement artifact identifier.");
  }
  return value;
}
