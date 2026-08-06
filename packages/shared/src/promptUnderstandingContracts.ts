import type { PromptRequirementV1, RepositoryRequirementKind } from "./taskPlanContracts.js";

export type PromptUnderstandingOutcomeV1 =
  | "answer"
  | "repository_action"
  | "takeover_required";

export type PromptUnderstandingReadinessV1 =
  | "ready"
  | "clarification_required"
  | "assumption_confirmation_required";

export type PromptUnderstandingQuestionOptionV1 = {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
};

export type PromptUnderstandingQuestionV1 = {
  id: string;
  prompt: string;
  rationale: string;
  kind: Extract<RepositoryRequirementKind, "outcome" | "constraint" | "validation">;
  options: PromptUnderstandingQuestionOptionV1[];
};

export type PromptUnderstandingAssumptionV1 = {
  id: string;
  text: string;
  affectsScope: boolean;
};

export type PromptUnderstandingRefinedBriefV1 = {
  goal: string;
  deliverables: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  nonGoals: string[];
};

export type PromptUnderstandingAnswerV1 = {
  questionId: string;
  answer: string;
  selectedOptionId?: string;
  note?: string;
};

export type PromptUnderstandingConfirmedAssumptionV1 = {
  assumptionId: string;
  text: string;
};

export type PromptUnderstandingAttachmentV1 = {
  kind: "image";
  sha256: string;
  mimeType: string;
  byteLength: number;
};

export type PromptUnderstandingBasisV1 = {
  rawPrompt: string;
  activeGoal?: string;
  acceptanceCriteria: string[];
  clarificationAnswers: PromptUnderstandingAnswerV1[];
  confirmedAssumptions: PromptUnderstandingConfirmedAssumptionV1[];
  attachments?: PromptUnderstandingAttachmentV1[];
};

export type PromptUnderstandingConversationTurnV1 = {
  role: "user" | "agent";
  content: string;
};

/**
 * Bounded conversational evidence used only to resolve references in the
 * current prompt. It is never converted into executable requirements.
 */
export type PromptUnderstandingContextV1 = {
  conversationSummary?: string;
  recentTurns: PromptUnderstandingConversationTurnV1[];
};

export type PromptUnderstandingCandidateV1 = {
  outcome: PromptUnderstandingOutcomeV1;
  readiness: PromptUnderstandingReadinessV1;
  reply: string;
  conversationSummary: string;
  refinedBrief: PromptUnderstandingRefinedBriefV1 | null;
  questions: PromptUnderstandingQuestionV1[];
  assumptions: PromptUnderstandingAssumptionV1[];
};

export type PromptUnderstandingV1 = {
  schemaVersion: 1;
  promptId: string;
  /** Present on new results; omitted only by pre-hardening persisted drafts. */
  inputId?: string;
  outcome: PromptUnderstandingOutcomeV1;
  readiness: PromptUnderstandingReadinessV1;
  reply: string;
  /** Present on new results; omitted only by pre-hardening persisted drafts. */
  conversationSummary?: string;
  refinedBrief: PromptUnderstandingRefinedBriefV1 | null;
  questions: PromptUnderstandingQuestionV1[];
  assumptions: PromptUnderstandingAssumptionV1[];
};

export type PromptUnderstandingDraftV1 = {
  schemaVersion: 1;
  id: string;
  round: number;
  basis: PromptUnderstandingBasisV1;
  context?: PromptUnderstandingContextV1;
  result: PromptUnderstandingV1;
  pendingQuestionId?: string;
  requiresReconfirmation: boolean;
  updatedAt: string;
};

export const EMPTY_PROMPT_UNDERSTANDING_CONTEXT: PromptUnderstandingContextV1 = {
  recentTurns: [],
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const OUTCOMES = new Set<PromptUnderstandingOutcomeV1>([
  "answer",
  "repository_action",
  "takeover_required",
]);
const READINESS = new Set<PromptUnderstandingReadinessV1>([
  "ready",
  "clarification_required",
  "assumption_confirmation_required",
]);
const KINDS = new Set(["outcome", "constraint", "validation"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 8_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${label} must be a non-empty bounded string.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, max = 4_000): string | undefined {
  if (value === undefined) return undefined;
  return text(value, label, max);
}

function uniqueStrings(value: unknown, label: string, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`${label} must be a bounded array.`);
  }
  const result = value.map((item, index) => text(item, `${label}[${index}]`, 4_000));
  if (new Set(result).size !== result.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
  return result;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error(`${label} contains an unsupported field.`);
  }
}

export function validatePromptUnderstandingContext(
  input: unknown,
): asserts input is PromptUnderstandingContextV1 {
  const value = record(input, "Prompt understanding context");
  exactKeys(value, ["conversationSummary", "recentTurns"], "Prompt understanding context");
  optionalText(
    value.conversationSummary,
    "Prompt understanding conversation summary",
    4_000,
  );
  if (!Array.isArray(value.recentTurns) || value.recentTurns.length > 6) {
    throw new Error("Prompt understanding recent turns must be a bounded array.");
  }
  for (const candidate of value.recentTurns) {
    const turn = record(candidate, "Prompt understanding conversation turn");
    exactKeys(turn, ["role", "content"], "Prompt understanding conversation turn");
    if (turn.role !== "user" && turn.role !== "agent") {
      throw new Error("Prompt understanding conversation turn role is invalid.");
    }
    text(turn.content, "Prompt understanding conversation turn content", 2_000);
  }
}

export function validatePromptUnderstandingBasis(
  input: unknown,
): asserts input is PromptUnderstandingBasisV1 {
  const value = record(input, "Prompt understanding basis");
  exactKeys(
    value,
    [
      "rawPrompt",
      "activeGoal",
      "acceptanceCriteria",
      "clarificationAnswers",
      "confirmedAssumptions",
      "attachments",
    ],
    "Prompt understanding basis",
  );
  text(value.rawPrompt, "Prompt understanding raw prompt");
  optionalText(value.activeGoal, "Prompt understanding active goal");
  uniqueStrings(value.acceptanceCriteria, "Prompt understanding acceptance criteria", 24);
  if (value.attachments !== undefined) {
    if (!Array.isArray(value.attachments) || value.attachments.length > 4) {
      throw new Error("Prompt understanding attachments must be a bounded array.");
    }
    const attachmentHashes = new Set<string>();
    for (const candidate of value.attachments) {
      const attachment = record(candidate, "Prompt understanding attachment");
      exactKeys(
        attachment,
        ["kind", "sha256", "mimeType", "byteLength"],
        "Prompt understanding attachment",
      );
      if (attachment.kind !== "image") {
        throw new Error("Prompt understanding attachment kind is invalid.");
      }
      const sha256 = text(
        attachment.sha256,
        "Prompt understanding attachment digest",
        64,
      );
      if (!HASH.test(sha256) || attachmentHashes.has(sha256)) {
        throw new Error(
          "Prompt understanding attachment digests must be unique and valid.",
        );
      }
      attachmentHashes.add(sha256);
      text(attachment.mimeType, "Prompt understanding attachment media type", 100);
      if (
        !Number.isSafeInteger(attachment.byteLength) ||
        Number(attachment.byteLength) <= 0 ||
        Number(attachment.byteLength) > 20 * 1024 * 1024
      ) {
        throw new Error("Prompt understanding attachment size is invalid.");
      }
    }
  }
  if (!Array.isArray(value.clarificationAnswers) || value.clarificationAnswers.length > 9) {
    throw new Error("Prompt understanding answers must be a bounded array.");
  }
  const questionIds = new Set<string>();
  for (const candidate of value.clarificationAnswers) {
    const answer = record(candidate, "Prompt understanding answer");
    exactKeys(
      answer,
      ["questionId", "answer", "selectedOptionId", "note"],
      "Prompt understanding answer",
    );
    const questionId = text(answer.questionId, "Prompt understanding question id", 100);
    if (!ID.test(questionId) || questionIds.has(questionId)) {
      throw new Error("Prompt understanding answer question ids must be unique and valid.");
    }
    questionIds.add(questionId);
    text(answer.answer, "Prompt understanding answer text", 4_000);
    const optionId = optionalText(
      answer.selectedOptionId,
      "Prompt understanding selected option id",
      100,
    );
    if (optionId && !ID.test(optionId)) {
      throw new Error("Prompt understanding selected option id is invalid.");
    }
    optionalText(answer.note, "Prompt understanding answer note", 2_000);
  }
  if (!Array.isArray(value.confirmedAssumptions) || value.confirmedAssumptions.length > 12) {
    throw new Error("Prompt understanding confirmed assumptions must be bounded.");
  }
  const assumptionIds = new Set<string>();
  for (const candidate of value.confirmedAssumptions) {
    const assumption = record(candidate, "Confirmed prompt assumption");
    exactKeys(assumption, ["assumptionId", "text"], "Confirmed prompt assumption");
    const id = text(assumption.assumptionId, "Confirmed prompt assumption id", 100);
    if (!ID.test(id) || assumptionIds.has(id)) {
      throw new Error("Confirmed prompt assumption ids must be unique and valid.");
    }
    assumptionIds.add(id);
    text(assumption.text, "Confirmed prompt assumption text", 4_000);
  }
}

export function canonicalPromptUnderstandingBasis(
  basis: PromptUnderstandingBasisV1,
): string {
  validatePromptUnderstandingBasis(basis);
  return JSON.stringify({
    rawPrompt: basis.rawPrompt.trim(),
    activeGoal: basis.activeGoal?.trim() ?? null,
    acceptanceCriteria: [...basis.acceptanceCriteria],
    clarificationAnswers: basis.clarificationAnswers.map((answer) => ({
      questionId: answer.questionId,
      answer: answer.answer.trim(),
      selectedOptionId: answer.selectedOptionId ?? null,
      note: answer.note?.trim() ?? null,
    })),
    confirmedAssumptions: basis.confirmedAssumptions.map((assumption) => ({
      assumptionId: assumption.assumptionId,
      text: assumption.text.trim(),
    })),
    attachments: (basis.attachments ?? []).map((attachment) => ({
      kind: attachment.kind,
      sha256: attachment.sha256,
      mimeType: attachment.mimeType,
      byteLength: attachment.byteLength,
    })),
  });
}

export function canonicalPromptUnderstandingContext(
  context: PromptUnderstandingContextV1,
): string {
  validatePromptUnderstandingContext(context);
  return JSON.stringify({
    conversationSummary: context.conversationSummary?.trim() ?? null,
    recentTurns: context.recentTurns.map((turn) => ({
      role: turn.role,
      content: turn.content.trim(),
    })),
  });
}

function stablePromptUnderstandingHash(input: string): string {
  const lanes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    for (let lane = 0; lane < lanes.length; lane += 1) {
      lanes[lane] ^= code + lane * 131;
      lanes[lane] = Math.imul(lanes[lane], 0x01000193 + lane * 2) >>> 0;
    }
  }
  const block = lanes.map((lane) => lane.toString(16).padStart(8, "0")).join("");
  return `${block}${block}`;
}

// This identifier detects accidental/stale draft changes. Execution authority
// remains bound by the repository task-plan SHA-256 digest.
export function hashPromptUnderstandingBasis(
  basis: PromptUnderstandingBasisV1,
): string {
  return stablePromptUnderstandingHash(canonicalPromptUnderstandingBasis(basis));
}

export function hashPromptUnderstandingInput(
  basis: PromptUnderstandingBasisV1,
  context: PromptUnderstandingContextV1,
): string {
  return stablePromptUnderstandingHash(JSON.stringify({
    basis: JSON.parse(canonicalPromptUnderstandingBasis(basis)) as unknown,
    context: JSON.parse(canonicalPromptUnderstandingContext(context)) as unknown,
  }));
}

export function validatePromptUnderstandingV1(
  input: unknown,
): asserts input is PromptUnderstandingV1 {
  const value = record(input, "Prompt understanding result");
  exactKeys(
    value,
    [
      "schemaVersion",
      "promptId",
      "inputId",
      "outcome",
      "readiness",
      "reply",
      "conversationSummary",
      "refinedBrief",
      "questions",
      "assumptions",
    ],
    "Prompt understanding result",
  );
  if (value.schemaVersion !== 1) throw new Error("Prompt understanding schema version is invalid.");
  const promptId = text(value.promptId, "Prompt understanding prompt id", 100);
  if (!HASH.test(promptId) && !ID.test(promptId)) {
    throw new Error("Prompt understanding prompt id is invalid.");
  }
  if (value.inputId !== undefined) {
    const inputId = text(value.inputId, "Prompt understanding input id", 100);
    if (!HASH.test(inputId)) {
      throw new Error("Prompt understanding input id is invalid.");
    }
  }
  if (!OUTCOMES.has(value.outcome as PromptUnderstandingOutcomeV1)) {
    throw new Error("Prompt understanding outcome is invalid.");
  }
  if (!READINESS.has(value.readiness as PromptUnderstandingReadinessV1)) {
    throw new Error("Prompt understanding readiness is invalid.");
  }
  text(value.reply, "Prompt understanding reply");
  optionalText(
    value.conversationSummary,
    "Prompt understanding conversation summary",
    4_000,
  );

  if (value.refinedBrief !== null) {
    const brief = record(value.refinedBrief, "Prompt refined brief");
    exactKeys(
      brief,
      ["goal", "deliverables", "constraints", "acceptanceCriteria", "nonGoals"],
      "Prompt refined brief",
    );
    text(brief.goal, "Prompt refined goal");
    uniqueStrings(brief.deliverables, "Prompt refined deliverables", 24);
    uniqueStrings(brief.constraints, "Prompt refined constraints", 24);
    uniqueStrings(brief.acceptanceCriteria, "Prompt refined acceptance criteria", 24);
    uniqueStrings(brief.nonGoals, "Prompt refined non-goals", 24);
  }

  if (!Array.isArray(value.questions) || value.questions.length > 3) {
    throw new Error("Prompt understanding questions must be a bounded array.");
  }
  const questionIds = new Set<string>();
  for (const candidate of value.questions) {
    const question = record(candidate, "Prompt understanding question");
    exactKeys(question, ["id", "prompt", "rationale", "kind", "options"], "Prompt understanding question");
    const id = text(question.id, "Prompt understanding question id", 100);
    if (!ID.test(id) || questionIds.has(id)) throw new Error("Prompt question ids must be unique and valid.");
    questionIds.add(id);
    text(question.prompt, "Prompt understanding question prompt", 2_000);
    text(question.rationale, "Prompt understanding question rationale", 1_000);
    if (!KINDS.has(question.kind as string)) throw new Error("Prompt question kind is invalid.");
    if (
      !Array.isArray(question.options) ||
      (question.options.length !== 0 &&
        (question.options.length < 2 || question.options.length > 4))
    ) {
      throw new Error("Prompt question options must be empty or contain two to four choices.");
    }
    const optionIds = new Set<string>();
    let recommended = 0;
    for (const optionCandidate of question.options) {
      const option = record(optionCandidate, "Prompt question option");
      exactKeys(option, ["id", "label", "description", "recommended"], "Prompt question option");
      const optionId = text(option.id, "Prompt question option id", 100);
      if (!ID.test(optionId) || optionIds.has(optionId)) throw new Error("Prompt option ids must be unique and valid.");
      optionIds.add(optionId);
      text(option.label, "Prompt question option label", 200);
      text(option.description, "Prompt question option description", 500);
      if (typeof option.recommended !== "boolean") throw new Error("Prompt option recommendation must be boolean.");
      if (option.recommended) recommended += 1;
    }
    if (recommended > 1) throw new Error("Prompt question may recommend at most one option.");
  }

  if (!Array.isArray(value.assumptions) || value.assumptions.length > 12) {
    throw new Error("Prompt assumptions must be bounded.");
  }
  const assumptionIds = new Set<string>();
  for (const candidate of value.assumptions) {
    const assumption = record(candidate, "Prompt assumption");
    exactKeys(assumption, ["id", "text", "affectsScope"], "Prompt assumption");
    const id = text(assumption.id, "Prompt assumption id", 100);
    if (!ID.test(id) || assumptionIds.has(id)) throw new Error("Prompt assumption ids must be unique and valid.");
    assumptionIds.add(id);
    text(assumption.text, "Prompt assumption text", 4_000);
    if (typeof assumption.affectsScope !== "boolean") throw new Error("Prompt assumption scope flag must be boolean.");
  }

  const readiness = value.readiness as PromptUnderstandingReadinessV1;
  const outcome = value.outcome as PromptUnderstandingOutcomeV1;
  if (readiness === "clarification_required" && value.questions.length === 0) {
    throw new Error("Clarification-required prompt understanding needs questions.");
  }
  if (readiness !== "clarification_required" && value.questions.length > 0) {
    throw new Error("Ready prompt understanding cannot retain blocking questions.");
  }
  if (
    readiness === "assumption_confirmation_required" &&
    !value.assumptions.some((assumption) => record(assumption, "Prompt assumption").affectsScope === true)
  ) {
    throw new Error("Assumption confirmation requires a scope-affecting assumption.");
  }
  if (readiness === "ready" && value.assumptions.some((assumption) => record(assumption, "Prompt assumption").affectsScope === true)) {
    throw new Error("Ready prompt understanding cannot retain unconfirmed scope assumptions.");
  }
  if (outcome !== "repository_action" && readiness !== "ready") {
    throw new Error("Only repository actions may request clarification or assumption confirmation.");
  }
  if (outcome === "repository_action" && readiness !== "clarification_required" && value.refinedBrief === null) {
    throw new Error("Ready repository action requires a refined brief.");
  }
}

export function parsePromptUnderstandingV1(input: unknown): PromptUnderstandingV1 {
  const parsed = typeof input === "string" ? (JSON.parse(input) as unknown) : input;
  validatePromptUnderstandingV1(parsed);
  return structuredClone(parsed);
}

export function bindPromptUnderstandingCandidate(
  candidate: PromptUnderstandingCandidateV1,
  basis: PromptUnderstandingBasisV1,
  context: PromptUnderstandingContextV1,
): PromptUnderstandingV1 {
  validatePromptUnderstandingContext(context);
  const result = parsePromptUnderstandingV1({
    schemaVersion: 1,
    promptId: hashPromptUnderstandingBasis(basis),
    inputId: hashPromptUnderstandingInput(basis, context),
    ...candidate,
  });
  validatePromptUnderstandingForInput(result, basis, context);
  return result;
}

export function validatePromptUnderstandingForInput(
  understanding: PromptUnderstandingV1,
  basis: PromptUnderstandingBasisV1,
  context: PromptUnderstandingContextV1,
): void {
  validatePromptUnderstandingV1(understanding);
  if (understanding.promptId !== hashPromptUnderstandingBasis(basis)) {
    throw new Error("Prompt understanding does not match the submitted prompt basis.");
  }
  if (
    understanding.inputId !== undefined &&
    understanding.inputId !== hashPromptUnderstandingInput(basis, context)
  ) {
    throw new Error("Prompt understanding does not match the submitted conversation context.");
  }
  const answeredQuestionIds = new Set(
    basis.clarificationAnswers.map((answer) => answer.questionId),
  );
  if (understanding.questions.some((question) => answeredQuestionIds.has(question.id))) {
    throw new Error("Prompt understanding reused an answered question id.");
  }
  const confirmedAssumptions = new Map(
    basis.confirmedAssumptions.map((assumption) => [
      assumption.assumptionId,
      assumption.text.trim(),
    ]),
  );
  for (const assumption of understanding.assumptions) {
    const confirmedText = confirmedAssumptions.get(assumption.id);
    if (confirmedText !== undefined && confirmedText !== assumption.text.trim()) {
      throw new Error("Prompt understanding changed a confirmed assumption.");
    }
  }
}

function requirementId(prefix: string, textValue: string): string {
  const basis: PromptUnderstandingBasisV1 = {
    rawPrompt: textValue,
    acceptanceCriteria: [],
    clarificationAnswers: [],
    confirmedAssumptions: [],
  };
  return `${prefix}-${hashPromptUnderstandingBasis(basis).slice(0, 16)}`;
}

export function promptRequirementsFromUnderstanding(
  basis: PromptUnderstandingBasisV1,
): PromptRequirementV1[] {
  validatePromptUnderstandingBasis(basis);
  return [
    {
      id: requirementId("prompt", basis.rawPrompt),
      text: basis.rawPrompt.trim(),
      source: "user_prompt",
      kind: "outcome",
      required: true,
    },
    ...(basis.activeGoal
      ? [{
          id: requirementId("goal", basis.activeGoal),
          text: basis.activeGoal.trim(),
          source: "active_goal" as const,
          kind: "constraint" as const,
          required: true,
        }]
      : []),
    ...basis.acceptanceCriteria.map((criterion) => ({
      id: requirementId("criterion", criterion),
      text: criterion.trim(),
      source: "acceptance_criterion" as const,
      kind: "validation" as const,
      required: true,
    })),
    ...basis.clarificationAnswers.map((answer) => ({
      id: requirementId(`answer-${answer.questionId}`, `${answer.answer}\n${answer.note ?? ""}`),
      text: [answer.answer.trim(), answer.note?.trim()].filter(Boolean).join(" — "),
      source: "clarification_answer" as const,
      kind: "constraint" as const,
      required: true,
    })),
    ...basis.confirmedAssumptions.map((assumption) => ({
      id: requirementId(`assumption-${assumption.assumptionId}`, assumption.text),
      text: assumption.text.trim(),
      source: "confirmed_assumption" as const,
      kind: "constraint" as const,
      required: true,
    })),
  ];
}
