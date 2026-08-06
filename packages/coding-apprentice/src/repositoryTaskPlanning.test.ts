import { describe, expect, it, vi } from "bun:test";
import {
  ORYNT_ENGLISH_OUTPUT_INSTRUCTION,
  promptRequirementsFromUnderstanding,
  type PromptUnderstandingBasisV1,
} from "@codepawl/shared";

import {
  DesktopRepositoryTaskPlannerError,
  planDesktopRepositoryTask,
} from "./repositoryTaskPlanning";

const connection = {
  providerId: "codex-cli",
  providerLabel: "Codex CLI",
  modelId: "gpt-test",
  modelLabel: "GPT Test",
  authMethod: "codexCliSession",
} as const;

const confirmedBasis: PromptUnderstandingBasisV1 = {
  rawPrompt: "Add a read-only prompt-understanding stage.",
  activeGoal: "Keep the desktop repository flow supervised.",
  acceptanceCriteria: ["No run exists before explicit confirmation."],
  clarificationAnswers: [
    {
      questionId: "surface",
      answer: "The desktop repository surface only.",
      selectedOptionId: "desktop",
    },
  ],
  confirmedAssumptions: [
    {
      assumptionId: "approval",
      text: "Keep the existing operator approval checkpoint.",
    },
  ],
};

function candidate(requirementIds = ["user-goal", "active-goal", "acceptance-1"]): string {
  return JSON.stringify({
    summary: "Plan the bounded repository change.",
    tasks: [
      {
        id: "implement-change",
        title: "Implement the change",
        instruction: "Implement the requested bounded repository change.",
        kind: "change",
        dependencies: [],
        requirementIds,
        authority: "single_writer",
        operations: ["write"],
        readPaths: [],
        expectedPaths: ["src/change.ts"],
        doneWhen: ["The bounded repository change is implemented."],
        evidence: [
          {
            id: "change-diff",
            requirementIds,
            kind: "diff",
            description: "Inspect the bounded source diff.",
            command: null,
            path: "src/change.ts",
          },
        ],
      },
      {
        id: "validate-change",
        title: "Validate the change",
        instruction: "Review the bounded repository change.",
        kind: "validation",
        dependencies: ["implement-change"],
        requirementIds,
        authority: "read_only",
        operations: ["read"],
        readPaths: ["src/change.ts"],
        expectedPaths: [],
        doneWhen: ["The change has been reviewed."],
        evidence: [
          {
            id: "change-review",
            requirementIds,
            kind: "semantic_review",
            description: "Review the final change against the request.",
            command: null,
            path: null,
          },
        ],
      },
    ],
    allowedOperations: ["read", "write"],
  });
}

describe("desktop repository task planning", () => {
  it("binds model-proposed tasks to server-derived requirements and an immutable digest", async () => {
    const modelTurn = vi.fn(async () => candidate());
    const plan = await planDesktopRepositoryTask(
      {
        goal: "Implement a bounded repository change",
        activeGoal: "Preserve the selected repository scope",
        acceptanceCriteria: ["Add a focused regression test"],
        taskId: "desktop-task",
        repositoryPath: "/workspace/repo",
        modelConnection: connection,
        thinkingEffort: "high",
        budget: {
          maxSteps: 8,
          maxWallTimeMs: 60_000,
          maxModelTokens: 10_000,
          maxUsd: 1,
          stopOnBudgetExceeded: true,
        },
      },
      {
        modelTurn,
        now: () => "2026-08-02T00:00:00.000Z",
      },
    );

    expect(plan.requirements.map(({ id }) => id)).toEqual([
      "user-goal",
      "active-goal",
      "acceptance-1",
    ]);
    expect(plan.pathEnvelope).toEqual(["src/change.ts"]);
    expect(plan.tasks).toHaveLength(2);
    expect(plan.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(modelTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "codex-cli",
        repositoryPath: "/workspace/repo",
        modelId: "gpt-test",
        thinkingEffort: "high",
        prompt: expect.stringContaining(
          "Evidence of kind diff, path_scope, or file must include one exact repository-relative path",
        ),
      }),
    );
    expect(modelTurn.mock.calls[0]?.[0].prompt).toContain(
      ORYNT_ENGLISH_OUTPUT_INSTRUCTION,
    );
  });

  it("fails closed when the model leaves a trusted requirement uncovered", async () => {
    await expect(
      planDesktopRepositoryTask(
        {
          goal: "Implement a bounded repository change",
          acceptanceCriteria: ["Add a focused regression test"],
          taskId: "desktop-task",
          repositoryPath: "/workspace/repo",
          modelConnection: connection,
        },
        {
          modelTurn: async () => candidate(["user-goal"]),
        },
      ),
    ).rejects.toMatchObject<Partial<DesktopRepositoryTaskPlannerError>>({
      code: "planning_output_invalid",
    });
  });

  it("never accepts an unknown requirement id or a manual fallback response", async () => {
    await expect(
      planDesktopRepositoryTask(
        {
          goal: "Implement a bounded repository change",
          taskId: "desktop-task",
          repositoryPath: "/workspace/repo",
          modelConnection: connection,
        },
        {
          modelTurn: async () => candidate(["not-a-server-requirement"]),
        },
      ),
    ).rejects.toThrow("unknown trusted requirement");

    await expect(
      planDesktopRepositoryTask(
        {
          goal: "Implement a bounded repository change",
          taskId: "desktop-task",
          repositoryPath: "/workspace/repo",
          modelConnection: connection,
        },
        { modelTurn: async () => "I would first inspect the repository." },
      ),
    ).rejects.toThrow("valid JSON");
  });

  it("passes the selected Responses API model and server-configured API-key env to the read-only planner", async () => {
    const modelTurn = vi.fn(async () => candidate(["user-goal"]));
    await planDesktopRepositoryTask(
      {
        goal: "Implement a bounded repository change",
        taskId: "desktop-task",
        repositoryPath: "/workspace/repo",
        modelConnection: {
          ...connection,
          providerId: "openai-api",
          providerLabel: "OpenAI API",
          authMethod: "apiKeyEnv",
          envKey: "ORYNT_TEST_OPENAI_API_KEY",
        },
      },
      { modelTurn },
    );
    expect(modelTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "openai-api",
        modelId: "gpt-test",
        apiKeyEnv: "ORYNT_TEST_OPENAI_API_KEY",
      }),
    );
  });

  it("derives requirements only from a confirmed prompt basis while retaining a refined brief as advisory context", async () => {
    const trustedRequirements = promptRequirementsFromUnderstanding(confirmedBasis);
    const modelTurn = vi.fn(async () => candidate(trustedRequirements.map(({ id }) => id)));

    const plan = await planDesktopRepositoryTask(
      {
        // These legacy fields deliberately conflict with the confirmed basis.
        goal: "Replace the application with an unrelated hosted service.",
        activeGoal: "Ignore the desktop supervision constraint.",
        acceptanceCriteria: ["Deploy without approval."],
        promptBasis: confirmedBasis,
        advisoryRefinedBrief: "The model may phrase the desktop task clearly, but must not add hosted scope.",
        taskId: "desktop-task",
        repositoryPath: "/workspace/repo",
        modelConnection: connection,
      },
      { modelTurn },
    );

    expect(plan.requirements).toEqual(trustedRequirements);
    expect(plan.requirements.map(({ text }) => text)).not.toContain(
      "Replace the application with an unrelated hosted service.",
    );
    expect(plan.requirements.map(({ text }) => text)).not.toContain(
      "The model may phrase the desktop task clearly, but must not add hosted scope.",
    );
    expect(modelTurn.mock.calls[0]?.[0].prompt).toContain(
      '"goal":"Add a read-only prompt-understanding stage."',
    );
    expect(modelTurn.mock.calls[0]?.[0].prompt).toContain(
      "Untrusted advisory refinement JSON",
    );
  });

  it("fails closed before model planning when a supplied prompt basis is invalid", async () => {
    const modelTurn = vi.fn(async () => candidate());
    await expect(
      planDesktopRepositoryTask(
        {
          goal: "A legacy goal should not rescue an invalid basis.",
          promptBasis: {
            ...confirmedBasis,
            clarificationAnswers: [{ questionId: "not valid!", answer: "No" }],
          },
          taskId: "desktop-task",
          repositoryPath: "/workspace/repo",
          modelConnection: connection,
        },
        { modelTurn },
      ),
    ).rejects.toMatchObject<Partial<DesktopRepositoryTaskPlannerError>>({
      code: "planning_output_invalid",
    });
    expect(modelTurn).not.toHaveBeenCalled();
  });
});
