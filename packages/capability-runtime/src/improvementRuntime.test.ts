import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import type {
  ImprovementTargetArtifactV1,
  ImprovementTargetClass,
} from "@codepawl/shared";

import { LocalImprovementRuntime } from "./improvementRuntime";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("local improvement runtime v2", () => {
  it("evaluates, promotes, loads, and preserves all four mutable classes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-improvement-v2-"));
    roots.push(root);
    const runtime = new LocalImprovementRuntime(root);
    const artifacts: ImprovementTargetArtifactV1[] = [
      {
        kind: "learned_skill",
        instruction: "Prefer focused verifier-backed changes.",
        applicableTaskTokens: ["focused"],
        validationCommands: [],
        allowedPaths: [],
        protectedPaths: [],
      },
      {
        kind: "user_overlay",
        instruction: "Report validation evidence concisely.",
        applicableTaskTokens: ["validation"],
        validationCommands: [],
        allowedPaths: [],
        protectedPaths: [],
      },
      {
        kind: "memory_profile",
        topK: 3,
        tokenBudget: 1_200,
        recencyWeight: 0.45,
        confidenceWeight: 0.55,
      },
      {
        kind: "router_weights",
        lexical: 0.14,
        input: 0.14,
        output: 0.14,
        verified: 0.36,
        latency: 0.09,
        ownedTrust: 0.13,
      },
    ];

    const candidateIds: string[] = [];
    for (const artifact of artifacts) {
      const candidate = await runtime.createCandidate({
        targetId: `${artifact.kind}-fixture`,
        targetClass: artifact.kind as Extract<
          ImprovementTargetClass,
          "learned_skill" | "user_overlay" | "memory_profile" | "router_weights"
        >,
        targetScope: "workspace",
        artifact,
        hypothesis: `Fixture hypothesis for ${artifact.kind}.`,
        sourceEpisodeIds: Array.from({ length: 5 }, (_, index) =>
          `${artifact.kind}-episode-${index}`
        ),
        sourceTaskTemplateIds: ["template-a", "template-b", "template-c"],
      });
      candidateIds.push(candidate.id);
      for (let index = 0; index < 30; index += 1) {
        await runtime.recordEvaluationCase({
          id: `${candidate.id}-case-${index}`,
          candidateId: candidate.id,
          runId: `${artifact.kind}-run-${index}`,
          taskTemplateId: `template-${index % 3}`,
          repositoryDomain: "fixture",
          modelTier: "medium",
          phase: "canary",
          baselineCorrect: false,
          candidateCorrect: true,
          baselineLatencyMs: 100,
          candidateLatencyMs: 100,
          policyPassed: true,
          unsafeActionCount: 0,
          criticalRegression: false,
          tokenBudget: 100,
          tokenUsed: 10,
          artifactRefs: [],
          recordedAt: new Date(1_700_000_000_000 + index).toISOString(),
        });
      }
    }

    for (const candidateId of candidateIds) {
      const snapshot = await runtime.ledger.load();
      await runtime.promote(candidateId, snapshot.revision);
    }
    const active = await runtime.loadActiveArtifacts();
    expect(active.map(({ artifact }) => artifact.kind).sort()).toEqual(
      ["learned_skill", "memory_profile", "router_weights", "user_overlay"],
    );
    expect((await runtime.hygiene(true)).issues).toEqual([]);
  });

  it("refuses immutable target classes at the typed creation boundary", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-improvement-v2-"));
    roots.push(root);
    const runtime = new LocalImprovementRuntime(root);
    await expect(runtime.createCandidate({
      targetId: "permission-policy",
      targetClass: "permission_policy" as never,
      targetScope: "workspace",
      artifact: {
        kind: "learned_skill",
        instruction: "unsafe",
        applicableTaskTokens: [],
        validationCommands: [],
        allowedPaths: [],
        protectedPaths: [],
      },
      hypothesis: "Must be rejected.",
      sourceEpisodeIds: ["1", "2", "3", "4", "5"],
      sourceTaskTemplateIds: ["a", "b", "c"],
    })).rejects.toThrow(/kind does not match/i);
  });
});
