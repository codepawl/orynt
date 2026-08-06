import { describe, expect, it, vi } from "bun:test";

import {
  hashPromptUnderstandingBasis,
  ORYNT_ENGLISH_OUTPUT_INSTRUCTION,
  type PromptUnderstandingBasisV1,
} from "@codepawl/shared";

import {
  DesktopPromptUnderstandingError,
  desktopPromptUnderstandingSchema,
  understandDesktopPrompt,
} from "./promptUnderstanding";

const connection = {
  providerId: "codex-cli",
  providerLabel: "Codex CLI",
  modelId: "gpt-test",
  modelLabel: "GPT Test",
  authMethod: "codexCliSession",
} as const;

const basis: PromptUnderstandingBasisV1 = {
  rawPrompt: "Add a focused prompt understanding gate.",
  activeGoal: "Keep all repository work supervised.",
  acceptanceCriteria: ["Ask only material clarification questions."],
  clarificationAnswers: [
    {
      questionId: "scope",
      answer: "Apply this to the desktop repository flow.",
      selectedOptionId: "desktop",
    },
  ],
  confirmedAssumptions: [
    {
      assumptionId: "approval",
      text: "Keep the existing approval checkpoint.",
    },
  ],
};

function readyRepositoryAction(): string {
  return JSON.stringify({
    outcome: "repository_action",
    readiness: "ready",
    reply: "I understand the bounded desktop repository request.",
    conversationSummary: "The operator requested a bounded desktop prompt gate.",
    refinedBrief: {
      goal: "Add a focused prompt understanding gate.",
      deliverables: ["A read-only prompt understanding stage."],
      constraints: ["Keep execution supervised."],
      acceptanceCriteria: ["Ask only material clarification questions."],
      nonGoals: ["Do not create an execution plan yet."],
    },
    questions: [],
    assumptions: [],
  });
}

describe("desktop prompt understanding", () => {
  it("binds the result to the supplied basis and applies the bounded runtime contract", async () => {
    const modelTurn = vi.fn(async () => readyRepositoryAction());

    const result = await understandDesktopPrompt(
      {
        promptBasis: basis,
        repositoryPath: "/workspace/repository",
        modelConnection: connection,
        thinkingEffort: "high",
        timeoutMs: 999_999,
      },
      { modelTurn },
    );

    expect(result).toMatchObject({
      schemaVersion: 1,
      promptId: hashPromptUnderstandingBasis(basis),
      outcome: "repository_action",
      readiness: "ready",
    });
    expect(modelTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "codex-cli",
        repositoryPath: "/workspace/repository",
        modelId: "gpt-test",
        thinkingEffort: "high",
        timeoutMs: 120_000,
        maxOutputTokens: 4_096,
        maxToolCalls: 12,
      }),
    );
    expect(modelTurn.mock.calls[0]?.[0].prompt).toContain(
      '"rawPrompt":"Add a focused prompt understanding gate."',
    );
    expect(modelTurn.mock.calls[0]?.[0].prompt).toContain(
      ORYNT_ENGLISH_OUTPUT_INSTRUCTION,
    );
  });

  it("preserves a non-English user prompt as source data while requesting English authored output", async () => {
    const modelTurn = vi.fn(async () => readyRepositoryAction());
    const multilingualBasis: PromptUnderstandingBasisV1 = {
      ...basis,
      rawPrompt: "Đọc README.md và giải thích cấu trúc repository.",
    };

    await understandDesktopPrompt(
      {
        promptBasis: multilingualBasis,
        repositoryPath: "/workspace/repository",
        modelConnection: connection,
      },
      { modelTurn },
    );

    expect(modelTurn.mock.calls[0]?.[0].prompt).toContain(
      '"rawPrompt":"Đọc README.md và giải thích cấu trúc repository."',
    );
    expect(modelTurn.mock.calls[0]?.[0].prompt).toContain(
      ORYNT_ENGLISH_OUTPUT_INSTRUCTION,
    );
  });

  it("rejects malformed question choices before an understanding result can be returned", async () => {
    await expect(
      understandDesktopPrompt(
        {
          promptBasis: basis,
          repositoryPath: "/workspace/repository",
          modelConnection: connection,
        },
        {
          modelTurn: async () => JSON.stringify({
            outcome: "repository_action",
            readiness: "clarification_required",
            reply: "One answer is needed.",
            conversationSummary: "The desktop scope still needs clarification.",
            refinedBrief: null,
            questions: [
              {
                id: "scope",
                prompt: "Which scope should this cover?",
                rationale: "The affected surface changes the plan.",
                kind: "constraint",
                options: [
                  {
                    id: "desktop",
                    label: "Desktop",
                    description: "Only the desktop surface.",
                    recommended: true,
                  },
                ],
              },
            ],
            assumptions: [],
          }),
        },
      ),
    ).rejects.toMatchObject<Partial<DesktopPromptUnderstandingError>>({
      code: "understanding_output_invalid",
    });
  });

  it("fails closed if a ready result retains a scope-affecting assumption", async () => {
    await expect(
      understandDesktopPrompt(
        {
          promptBasis: basis,
          repositoryPath: "/workspace/repository",
          modelConnection: connection,
        },
        {
          modelTurn: async () => JSON.stringify({
            outcome: "repository_action",
            readiness: "ready",
            reply: "I can proceed.",
            conversationSummary: "The request is ready but retained an invalid assumption.",
            refinedBrief: {
              goal: "Add the gate.",
              deliverables: [],
              constraints: [],
              acceptanceCriteria: [],
              nonGoals: [],
            },
            questions: [],
            assumptions: [
              { id: "storage", text: "Persist the raw prompt forever.", affectsScope: true },
            ],
          }),
        },
      ),
    ).rejects.toMatchObject<Partial<DesktopPromptUnderstandingError>>({
      code: "understanding_output_invalid",
    });
  });

  it("caps the final model output for transports without a native output-token setting", async () => {
    await expect(
      understandDesktopPrompt(
        {
          promptBasis: basis,
          repositoryPath: "/workspace/repository",
          modelConnection: connection,
        },
        {
          modelTurn: async () => JSON.stringify({
            outcome: "answer",
            readiness: "ready",
            reply: "x".repeat(5_000),
            conversationSummary: "Oversized reply fixture.",
            refinedBrief: null,
            questions: [],
            assumptions: [],
          }),
        },
      ),
    ).rejects.toMatchObject<Partial<DesktopPromptUnderstandingError>>({
      code: "understanding_output_invalid",
    });
  });

  it("fails before model invocation when the basis or connection is invalid", async () => {
    const modelTurn = vi.fn(async () => readyRepositoryAction());
    await expect(
      understandDesktopPrompt(
        {
          promptBasis: { ...basis, clarificationAnswers: [{ questionId: "bad id!", answer: "No" }] },
          repositoryPath: "/workspace/repository",
          modelConnection: connection,
        },
        { modelTurn },
      ),
    ).rejects.toMatchObject<Partial<DesktopPromptUnderstandingError>>({
      code: "prompt_basis_invalid",
    });
    expect(modelTurn).not.toHaveBeenCalled();

    await expect(
      understandDesktopPrompt({
        promptBasis: basis,
        repositoryPath: "/workspace/repository",
      }),
    ).rejects.toMatchObject<Partial<DesktopPromptUnderstandingError>>({
      code: "model_connection_missing",
    });
  });

  it("preserves cancellation as a pre-run failure", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      understandDesktopPrompt(
        {
          promptBasis: basis,
          repositoryPath: "/workspace/repository",
          modelConnection: connection,
          signal: controller.signal,
        },
        { modelTurn: async () => readyRepositoryAction() },
      ),
    ).rejects.toMatchObject<Partial<DesktopPromptUnderstandingError>>({
      code: "understanding_cancelled",
    });
  });

  it("publishes a strict schema with the question-choice bounds", () => {
    expect(desktopPromptUnderstandingSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        questions: { maxItems: 3 },
      },
    });
  });
});
