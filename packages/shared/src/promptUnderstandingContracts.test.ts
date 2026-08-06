import { describe, expect, it } from "bun:test";

import {
  bindPromptUnderstandingCandidate,
  canonicalPromptUnderstandingBasis,
  canonicalPromptUnderstandingContext,
  hashPromptUnderstandingBasis,
  hashPromptUnderstandingInput,
  parsePromptUnderstandingV1,
  promptRequirementsFromUnderstanding,
  type PromptUnderstandingBasisV1,
  type PromptUnderstandingContextV1,
} from "./promptUnderstandingContracts";

const basis: PromptUnderstandingBasisV1 = {
  rawPrompt: " Add a prompt gate ",
  activeGoal: "Keep execution supervised",
  acceptanceCriteria: ["Ask only when materially unclear"],
  clarificationAnswers: [{
    questionId: "scope",
    answer: "CLI and desktop",
    selectedOptionId: "both",
    note: "Use the same contract",
  }],
  confirmedAssumptions: [{
    assumptionId: "persist",
    text: "Persist the draft per thread",
  }],
};

const context: PromptUnderstandingContextV1 = {
  conversationSummary: "The operator is hardening supervised planning.",
  recentTurns: [
    { role: "user", content: "Keep the desktop and CLI behavior aligned." },
    { role: "agent", content: "The prompt gate will remain read-only." },
  ],
};

describe("prompt understanding contracts", () => {
  it("canonicalizes and hashes a basis deterministically", () => {
    expect(canonicalPromptUnderstandingBasis(basis)).toContain('"rawPrompt":"Add a prompt gate"');
    expect(hashPromptUnderstandingBasis(basis)).toMatch(/^[a-f0-9]{64}$/u);
    expect(hashPromptUnderstandingBasis(structuredClone(basis))).toBe(
      hashPromptUnderstandingBasis(basis),
    );
  });

  it("binds image metadata to the prompt basis without persisting local paths", () => {
    const withImage: PromptUnderstandingBasisV1 = {
      ...basis,
      attachments: [{
        kind: "image",
        sha256: "a".repeat(64),
        mimeType: "image/png",
        byteLength: 123,
      }],
    };
    const canonical = canonicalPromptUnderstandingBasis(withImage);
    expect(canonical).toContain('"sha256"');
    expect(canonical).not.toContain("/tmp/");
    expect(hashPromptUnderstandingBasis(withImage)).not.toBe(
      hashPromptUnderstandingBasis(basis),
    );
    expect(() =>
      canonicalPromptUnderstandingBasis({
        ...withImage,
        attachments: [...withImage.attachments!, ...withImage.attachments!],
      })
    ).toThrow(/digests must be unique/u);
  });

  it("binds advisory context without converting it into authority", () => {
    expect(canonicalPromptUnderstandingContext(context)).toContain(
      '"conversationSummary":"The operator is hardening supervised planning."',
    );
    expect(hashPromptUnderstandingInput(basis, context)).toMatch(/^[a-f0-9]{64}$/u);
    const result = bindPromptUnderstandingCandidate({
      outcome: "repository_action",
      readiness: "ready",
      reply: "The explicit request is ready for planning.",
      conversationSummary: "The prompt gate remains supervised.",
      refinedBrief: {
        goal: "Harden the prompt gate.",
        deliverables: [],
        constraints: [],
        acceptanceCriteria: [],
        nonGoals: [],
      },
      questions: [],
      assumptions: [],
    }, basis, context);
    expect(result).toMatchObject({
      promptId: hashPromptUnderstandingBasis(basis),
      inputId: hashPromptUnderstandingInput(basis, context),
    });
    expect(promptRequirementsFromUnderstanding(basis).map((item) => item.text)).not.toContain(
      context.conversationSummary,
    );
  });

  it("rejects stale context and repeated question identities", () => {
    const repeated = {
      outcome: "repository_action" as const,
      readiness: "clarification_required" as const,
      reply: "Need another answer.",
      conversationSummary: "The prior scope answer was retained.",
      refinedBrief: null,
      questions: [{
        id: "scope",
        prompt: "Repeat scope?",
        rationale: "Invalid repeated identity.",
        kind: "constraint" as const,
        options: [],
      }],
      assumptions: [],
    };
    expect(() => bindPromptUnderstandingCandidate(repeated, basis, context)).toThrow(
      /reused an answered question id/u,
    );
  });

  it("parses a bounded clarification result", () => {
    expect(parsePromptUnderstandingV1({
      schemaVersion: 1,
      promptId: hashPromptUnderstandingBasis(basis),
      outcome: "repository_action",
      readiness: "clarification_required",
      reply: "I need one scope decision.",
      refinedBrief: null,
      questions: [{
        id: "scope",
        prompt: "Which surfaces should change?",
        rationale: "The implementation boundary is material.",
        kind: "constraint",
        options: [
          {
            id: "cli",
            label: "CLI",
            description: "Change only the terminal workflow.",
            recommended: false,
          },
          {
            id: "both",
            label: "CLI and desktop",
            description: "Keep both surfaces consistent.",
            recommended: true,
          },
        ],
      }],
      assumptions: [],
    }).questions).toHaveLength(1);
  });

  it("rejects invalid lifecycle combinations and oversized batches", () => {
    const readyWithQuestion = {
      schemaVersion: 1,
      promptId: "prompt",
      outcome: "repository_action",
      readiness: "ready",
      reply: "Ready.",
      refinedBrief: {
        goal: "Implement the gate",
        deliverables: [],
        constraints: [],
        acceptanceCriteria: [],
        nonGoals: [],
      },
      questions: [{
        id: "scope",
        prompt: "Scope?",
        rationale: "Material.",
        kind: "constraint",
        options: [],
      }],
      assumptions: [],
    };
    expect(() => parsePromptUnderstandingV1(readyWithQuestion)).toThrow(
      /cannot retain blocking questions/u,
    );
    expect(() => parsePromptUnderstandingV1({
      ...readyWithQuestion,
      readiness: "clarification_required",
      refinedBrief: null,
      questions: Array.from({ length: 4 }, (_, index) => ({
        ...readyWithQuestion.questions[0],
        id: `scope-${index}`,
      })),
    })).toThrow(/bounded array/u);
    expect(() => parsePromptUnderstandingV1({
      ...readyWithQuestion,
      questions: [],
      assumptions: [{ id: "scope", text: "CLI only", affectsScope: true }],
    })).toThrow(/unconfirmed scope assumptions/u);
  });

  it("derives authoritative requirements only from explicit basis inputs", () => {
    expect(promptRequirementsFromUnderstanding(basis).map((item) => item.source)).toEqual([
      "user_prompt",
      "active_goal",
      "acceptance_criterion",
      "clarification_answer",
      "confirmed_assumption",
    ]);
  });
});
