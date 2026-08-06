import { describe, expect, it } from "bun:test";

import {
  canonicalRepositoryTaskPlan,
  validateRepositoryTaskPlan,
  type RepositoryTaskPlanV1,
} from "./taskPlanContracts";

function plan(): RepositoryTaskPlanV1 {
  return {
    schemaVersion: 1,
    id: "plan-1",
    requestId: "request-1",
    revision: 0,
    goal: "Add the requested feature without changing the public API.",
    summary: "Implement and validate one bounded feature.",
    sourcePromptHash: "a".repeat(64),
    requirements: [
      {
        id: "requirement-outcome",
        text: "Add the requested feature.",
        source: "user_prompt",
        kind: "outcome",
        required: true,
      },
      {
        id: "requirement-constraint",
        text: "Do not change the public API.",
        source: "user_prompt",
        kind: "constraint",
        required: true,
      },
    ],
    tasks: [
      {
        id: "change-feature",
        title: "Implement the feature",
        instruction: "Implement the bounded feature in src/feature.ts.",
        kind: "change",
        dependencies: [],
        requirementIds: ["requirement-outcome", "requirement-constraint"],
        authority: "single_writer",
        operations: ["write"],
        expectedPaths: ["src/feature.ts"],
        doneWhen: ["The feature is implemented without a public API change."],
        evidence: [
          {
            id: "feature-diff",
            requirementIds: [
              "requirement-outcome",
              "requirement-constraint",
            ],
            kind: "diff",
            description: "Inspect the bounded implementation diff.",
            path: "src/feature.ts",
          },
        ],
      },
    ],
    pathEnvelope: ["src/feature.ts"],
    allowedOperations: ["read", "write"],
    budget: {
      maxTasks: 8,
      maxModelTokens: 30_000,
      maxWallTimeMs: 20 * 60_000,
    },
    recovery: { maxAttemptsPerTask: 1 },
    createdAt: "2026-08-02T00:00:00.000Z",
    digest: "b".repeat(64),
  };
}

describe("repository task plan contracts", () => {
  it("accepts a requirement-covered single-writer plan", () => {
    expect(() => validateRepositoryTaskPlan(plan())).not.toThrow();
  });

  it("canonicalizes approval material without the digest", () => {
    const value = canonicalRepositoryTaskPlan(plan());
    expect(value).not.toContain(`"digest"`);
    expect(value).toContain(`"requirement-outcome"`);
  });

  it("rejects required prompt requirements without task evidence", () => {
    const candidate = plan();
    candidate.tasks[0]!.evidence[0]!.requirementIds = [
      "requirement-outcome",
    ];
    expect(() => validateRepositoryTaskPlan(candidate)).toThrow(
      "leaves a required prompt requirement uncovered",
    );
  });

  it("rejects multiple writer ownership for one path", () => {
    const candidate = plan();
    candidate.tasks.push({
      ...structuredClone(candidate.tasks[0]!),
      id: "change-again",
      dependencies: ["change-feature"],
    });
    expect(() => validateRepositoryTaskPlan(candidate)).toThrow(
      "assigns one path to multiple writers",
    );
  });

  it("rejects dependency cycles", () => {
    const candidate = plan();
    candidate.tasks[0]!.dependencies = ["validate-feature"];
    candidate.tasks.push({
      id: "validate-feature",
      title: "Validate the feature",
      instruction: "Validate the bounded feature.",
      kind: "validation",
      dependencies: ["change-feature"],
      requirementIds: ["requirement-outcome"],
      authority: "read_only",
      operations: ["read"],
      expectedPaths: [],
      doneWhen: ["Validation evidence is recorded."],
      evidence: [
        {
          id: "validation",
          requirementIds: ["requirement-outcome"],
          kind: "semantic_review",
          description: "Review the implemented behavior.",
        },
      ],
    });
    expect(() => validateRepositoryTaskPlan(candidate)).toThrow(
      "dependency cycle",
    );
  });

  it("rejects mutating operations on read-only validation tasks", () => {
    const candidate = plan();
    candidate.tasks[0] = {
      ...candidate.tasks[0]!,
      kind: "validation",
      authority: "read_only",
      operations: ["delete"],
      expectedPaths: [],
    };
    candidate.pathEnvelope = [];
    candidate.allowedOperations.push("delete");

    expect(() => validateRepositoryTaskPlan(candidate)).toThrow(
      "read-only tasks cannot declare paths or mutating operations",
    );
  });
});
