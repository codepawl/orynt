import { describe, expect, it } from "bun:test";

import {
  createDefaultCapabilityRuntimeSettings,
  type CapabilityDescriptorV1,
  type ImprovementCandidateV1,
} from "@codepawl/shared";

import {
  evaluateCapabilityBenchmark,
  evaluateImprovementCandidate,
  selectCapabilities,
  shouldRollbackImprovement,
} from "./index";

function capability(
  id: string,
  overrides: Partial<CapabilityDescriptorV1> = {},
): CapabilityDescriptorV1 {
  return {
    schemaVersion: 1,
    id,
    version: "1",
    digest: `digest-${id}`,
    kind: "tool_namespace",
    namespace: id,
    title: id,
    summary: `${id} repository inspection`,
    tags: ["repository", id],
    inputKinds: ["repository"],
    outputKinds: ["evidence"],
    environment: ["local"],
    trust: "builtin",
    risk: "read_only",
    health: "healthy",
    auth: "not_required",
    source: { id: "orynt", uri: "orynt://runtime", immutable: true },
    provenanceRefs: [],
    repositoryScopes: [],
    toolNames: ["inspect"],
    ...overrides,
  };
}

function candidate(
  overrides: Partial<ImprovementCandidateV1> = {},
): ImprovementCandidateV1 {
  return {
    schemaVersion: 1,
    id: "candidate-1",
    targetId: "skill-1",
    targetClass: "learned_skill",
    targetScope: "workspace",
    baseDigest: "base",
    proposedDigest: "proposed",
    hypothesis: "Improve verified repository task performance.",
    patchArtifactRef: "artifact:patch",
    sourceEpisodeIds: ["1", "2", "3", "4", "5"],
    sourceTaskTemplateIds: ["a", "b", "c"],
    evaluation: {
      pairedCaseCount: 30,
      baselineCorrectness: 0.7,
      candidateCorrectness: 0.8,
      correctnessDelta: 0.1,
      bootstrapLowerBound95: 0.02,
      baselineP95LatencyMs: 1_000,
      candidateP95LatencyMs: 1_050,
      policyPassRate: 1,
      unsafeActionCount: 0,
      criticalRegressionCount: 0,
      canaryEligibleRunCount: 10,
      canaryVerifierFailureCount: 0,
      repositoryDomainCount: 1,
      modelTierCount: 1,
    },
    status: "shadow",
    createdAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("capability router", () => {
  it("auto-attaches only healthy read-only capabilities and bundles side effects", () => {
    const result = selectCapabilities({
      descriptors: [
        capability("repo"),
        capability("send", {
          risk: "side_effect",
          kind: "app_connector",
          auth: "connected",
        }),
        capability("missing", { auth: "missing" }),
      ],
      request: {
        schemaVersion: 1,
        runId: "run-1",
        taskId: "task-1",
        intent: "inspect repository and send evidence",
        environment: ["local"],
        connectedCapabilityIds: ["send"],
      },
      settings: createDefaultCapabilityRuntimeSettings(),
      now: () => "2026-08-02T00:00:00.000Z",
    });

    expect(result.selected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "repo",
          disposition: "auto_attached",
        }),
        expect.objectContaining({
          capabilityId: "send",
          disposition: "approval_required",
        }),
      ]),
    );
    expect(result.approvalCapabilityIds).toEqual(["send"]);
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "missing",
          reasonCodes: ["auth_missing"],
        }),
      ]),
    );
    expect(result.contextDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("enforces namespace and deferred tool budgets deterministically", () => {
    const settings = {
      ...createDefaultCapabilityRuntimeSettings(),
      maxNamespaces: 1,
      maxToolsPerNamespace: 1,
    };
    const result = selectCapabilities({
      descriptors: [
        capability("a", { toolNames: ["one", "two"] }),
        capability("b"),
      ],
      request: {
        schemaVersion: 1,
        runId: "run",
        taskId: "task",
        intent: "repository",
        environment: ["local"],
      },
      settings,
    });
    expect(result.namespacesLoaded).toHaveLength(1);
    expect(result.toolNamesLoaded).toHaveLength(1);
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reasonCodes: ["namespace_budget_exceeded"],
        }),
      ]),
    );
  });
});

describe("auto improvement gates", () => {
  it("promotes a bounded workspace candidate only after every gate passes", () => {
    expect(evaluateImprovementCandidate(candidate())).toEqual({
      candidateId: "candidate-1",
      decision: "promote",
      reasonCodes: ["all_promotion_gates_passed"],
    });
  });

  it("never auto-promotes authority, credential, or package mutations", () => {
    expect(
      evaluateImprovementCandidate(
        candidate({ targetClass: "permission_policy" }),
      ),
    ).toEqual({
      candidateId: "candidate-1",
      decision: "rollback",
      reasonCodes: ["immutable_target"],
    });
  });

  it("keeps weak candidates in shadow and rolls back live regressions", () => {
    expect(
      evaluateImprovementCandidate(
        candidate({
          evaluation: {
            ...candidate().evaluation,
            pairedCaseCount: 10,
            correctnessDelta: 0.01,
          },
        }),
      ).decision,
    ).toBe("keep_shadow");
    expect(
      shouldRollbackImprovement({
        candidate: candidate({ status: "active" }),
        authorityViolation: false,
        consecutiveVerifierFailures: 2,
        rollingCorrectnessDelta: -0.06,
      }),
    ).toMatchObject({
      decision: "rollback",
      reasonCodes: [
        "repeated_verifier_failure",
        "rolling_correctness_regression",
      ],
    });
  });
});

describe("Hermes release benchmark", () => {
  it("requires matched live trials and passes only the declared speed and correctness advantage", () => {
    const trials = Array.from({ length: 30 }, (_, index) => [
      {
        schemaVersion: 1 as const,
        suite: "live" as const,
        system: "orynt" as const,
        taskId: `task-${index}`,
        repetition: 0,
        correct: true,
        latencyMs: 700,
        disclosedSchemaTokens: 200,
        manualAttachmentCount: 0,
        policyPassed: true,
        unsafeActionCount: 0,
      },
      {
        schemaVersion: 1 as const,
        suite: "live" as const,
        system: "hermes" as const,
        taskId: `task-${index}`,
        repetition: 0,
        correct: index < 24,
        latencyMs: 1_000,
        disclosedSchemaTokens: 1_000,
        manualAttachmentCount: 1,
        policyPassed: true,
        unsafeActionCount: 0,
      },
    ]).flat();

    expect(evaluateCapabilityBenchmark(trials)).toMatchObject({
      suite: "live",
      pairedTrialCount: 30,
      correctnessDelta: 0.2,
      schemaTokenReduction: 0.8,
      oryntMedianManualAttachments: 0,
      safetyGatePassed: true,
      releaseGatePassed: true,
      failedGateReasonCodes: [],
    });
  });

  it("fails closed on unmatched or unsafe evidence", () => {
    expect(() =>
      evaluateCapabilityBenchmark([
        {
          schemaVersion: 1,
          suite: "controlled",
          system: "orynt",
          taskId: "task",
          repetition: 0,
          correct: true,
          latencyMs: 1,
          disclosedSchemaTokens: 1,
          manualAttachmentCount: 0,
          policyPassed: true,
          unsafeActionCount: 0,
        },
      ]),
    ).toThrow("matched Orynt and Hermes trials");
  });
});
