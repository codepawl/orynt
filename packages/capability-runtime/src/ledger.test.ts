import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import type {
  CapabilityOutcomeV1,
  ImprovementCandidateV1,
} from "@codepawl/shared";

import { LocalCapabilityLedger } from "./ledger";

const timestamp = "2026-08-02T00:00:00.000Z";

function outcome(): CapabilityOutcomeV1 {
  return {
    schemaVersion: 1,
    id: "outcome-1",
    runId: "run-1",
    taskId: "task-1",
    capabilityId: "repo",
    capabilityVersion: "1",
    capabilityDigest: "digest",
    taskTemplateId: "repo-inspect",
    repositoryDomain: "typescript",
    modelTier: "light",
    verifierPassed: true,
    policyPassed: true,
    unsafeActionCount: 0,
    latencyMs: 100,
    retryCount: 0,
    artifactRefs: ["orynt-artifact://run-1/verdict.json"],
    recordedAt: timestamp,
  };
}

function candidate(): ImprovementCandidateV1 {
  return {
    schemaVersion: 1,
    id: "candidate-1",
    targetId: "skill-1",
    targetClass: "learned_skill",
    targetScope: "workspace",
    baseDigest: "base",
    proposedDigest: "next",
    hypothesis: "Improve recurring verified tasks.",
    patchArtifactRef: "artifact:patch-1",
    sourceEpisodeIds: ["1", "2", "3", "4", "5"],
    sourceTaskTemplateIds: ["a", "b", "c"],
    evaluation: {
      pairedCaseCount: 30,
      baselineCorrectness: 0.7,
      candidateCorrectness: 0.8,
      correctnessDelta: 0.1,
      bootstrapLowerBound95: 0.01,
      baselineP95LatencyMs: 100,
      candidateP95LatencyMs: 100,
      policyPassRate: 1,
      unsafeActionCount: 0,
      criticalRegressionCount: 0,
      canaryEligibleRunCount: 10,
      canaryVerifierFailureCount: 0,
      repositoryDomainCount: 1,
      modelTierCount: 1,
    },
    status: "shadow",
    createdAt: timestamp,
  };
}

describe("local capability ledger", () => {
  it("persists versioned outcomes, candidates, and reversible decisions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-capability-ledger-"));
    const ledger = new LocalCapabilityLedger(root);

    const withOutcome = await ledger.appendOutcome(outcome(), 0);
    const withCandidate = await ledger.upsertCandidate(
      candidate(),
      withOutcome.revision,
    );
    const promoted = await ledger.recordDecision(
      {
        candidateId: "candidate-1",
        decision: "promote",
        reasonCodes: ["all_promotion_gates_passed"],
      },
      timestamp,
      withCandidate.revision,
    );

    expect(promoted.revision).toBe(3);
    expect(promoted.schemaVersion).toBe(2);
    expect(promoted.outcomes).toHaveLength(1);
    expect(promoted.candidates[0]?.status).toBe("active");
    expect(promoted.audit.map((entry) => entry.operation)).toEqual([
      "outcome.appended",
      "candidate.upserted",
      "candidate.decided",
    ]);
    await expect(ledger.load()).resolves.toEqual(promoted);
  });

  it("rejects secret-bearing references and stale revisions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-capability-ledger-"));
    const ledger = new LocalCapabilityLedger(root);
    await expect(
      ledger.appendOutcome({
        ...outcome(),
        artifactRefs: ["https://example.test/result?token=secret"],
      }),
    ).rejects.toThrow("unsafe artifact reference");
    await ledger.appendOutcome(outcome(), 0);
    await expect(
      ledger.upsertCandidate(candidate(), 0),
    ).rejects.toMatchObject({ code: "revision_conflict" });
  });
});
