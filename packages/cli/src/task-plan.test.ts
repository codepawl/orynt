import { describe, expect, it } from "vitest";

import type { ProposedRepositoryAction } from "./agent";
import {
  buildBoundRepositoryTaskPlan,
  verifyApprovedRepositoryTaskPlan,
} from "./task-plan";

function action(): ProposedRepositoryAction {
  return {
    instruction: "Implement the requested behavior.",
    rationale: "The change is repository-local.",
    operations: ["write"],
    estimatedPaths: ["src/feature.ts"],
    estimatedChangedFiles: 1,
    helperTasks: [],
    taskPlan: {
      summary: "Implement and validate the feature.",
      requirements: [{
        id: "feature",
        text: "Implement the feature.",
        source: "user_prompt",
        kind: "outcome",
        required: true,
      }],
      tasks: [{
        id: "implement-feature",
        title: "Implement feature",
        instruction: "Implement the feature in src/feature.ts.",
        kind: "change",
        dependencies: [],
        requirementIds: ["feature"],
        authority: "single_writer",
        operations: ["write"],
        expectedPaths: ["src/feature.ts"],
        doneWhen: ["The feature is implemented."],
        evidence: [{
          id: "feature-diff",
          requirementIds: ["feature"],
          kind: "diff",
          description: "Inspect the feature diff.",
          path: "src/feature.ts",
        }],
      }],
      allowedOperations: ["read", "write"],
    },
  };
}

describe("CLI task-plan approval binding", () => {
  it("injects the raw prompt, active goal, and criteria as required traceability", () => {
    const plan = buildBoundRepositoryTaskPlan({
      action: action(),
      prompt: "Ship the feature without changing its public API.",
      activeGoal: "Complete the repository milestone.",
      acceptanceCriteria: ["The focused test passes."],
      maxModelTokens: 10_000,
      maxWallTimeMs: 60_000,
    });

    expect(plan.requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "user_prompt",
        text: "Ship the feature without changing its public API.",
        required: true,
      }),
      expect.objectContaining({
        source: "active_goal",
        text: "Complete the repository milestone.",
        required: true,
      }),
      expect.objectContaining({
        source: "acceptance_criterion",
        text: "The focused test passes.",
        required: true,
      }),
    ]));
  });

  it("rejects action and graph path mismatches before authorization", () => {
    const candidate = action();
    candidate.estimatedPaths = ["src/other.ts"];
    expect(() =>
      buildBoundRepositoryTaskPlan({
        action: candidate,
        prompt: "Implement the feature.",
        acceptanceCriteria: [],
        maxModelTokens: 10_000,
        maxWallTimeMs: 60_000,
      }),
    ).toThrow("writer paths do not match");
  });

  it("rejects mutation after approval", () => {
    const plan = buildBoundRepositoryTaskPlan({
      action: action(),
      prompt: "Implement the feature.",
      acceptanceCriteria: [],
      maxModelTokens: 10_000,
      maxWallTimeMs: 60_000,
    });
    const approvedDigest = plan.digest;
    plan.tasks[0]!.instruction = "Do something else.";

    expect(() =>
      verifyApprovedRepositoryTaskPlan(plan, approvedDigest),
    ).toThrow("digest does not match");
  });
});
