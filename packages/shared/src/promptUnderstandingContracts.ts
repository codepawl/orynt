import { promptHasPositiveHighRiskIntent } from "./modelTierContracts.js";
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
  /** Explicit compatibility graph for multiple-choice questions. */
  conflictsWith?: string[];
  /** Required for newly generated recommended options; absent on legacy drafts. */
  recommendationReason?: string | null;
};

export type PromptUnderstandingQuestionV1 = {
  id: string;
  prompt: string;
  rationale: string;
  kind: Extract<RepositoryRequirementKind, "outcome" | "constraint" | "validation">;
  /** Legacy questions without this field are normalized as single selection. */
  selectionMode?: "single" | "multiple";
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
  selectedOptionIds?: string[];
  note?: string;
  optionNotes?: Array<{
    optionId: string;
    note: string;
  }>;
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
      [
        "questionId",
        "answer",
        "selectedOptionId",
        "selectedOptionIds",
        "note",
        "optionNotes",
      ],
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
    if (answer.selectedOptionIds !== undefined) {
      if (
        !Array.isArray(answer.selectedOptionIds) ||
        answer.selectedOptionIds.length < 1 ||
        answer.selectedOptionIds.length > 4
      ) {
        throw new Error(
          "Prompt understanding selected option ids must be bounded.",
        );
      }
      const selectedIds = new Set<string>();
      for (const candidateId of answer.selectedOptionIds) {
        const selectedId = text(
          candidateId,
          "Prompt understanding selected option id",
          100,
        );
        if (!ID.test(selectedId) || selectedIds.has(selectedId)) {
          throw new Error(
            "Prompt understanding selected option ids must be unique and valid.",
          );
        }
        selectedIds.add(selectedId);
      }
      if (optionId && !selectedIds.has(optionId)) {
        throw new Error(
          "Prompt understanding singular option id must match its selected option ids.",
        );
      }
    }
    optionalText(answer.note, "Prompt understanding answer note", 2_000);
    if (answer.optionNotes !== undefined) {
      if (
        !Array.isArray(answer.optionNotes) ||
        answer.optionNotes.length > 4
      ) {
        throw new Error("Prompt understanding option notes must be bounded.");
      }
      const noteOptionIds = new Set<string>();
      for (const candidateNote of answer.optionNotes) {
        const optionNote = record(
          candidateNote,
          "Prompt understanding option note",
        );
        exactKeys(
          optionNote,
          ["optionId", "note"],
          "Prompt understanding option note",
        );
        const noteOptionId = text(
          optionNote.optionId,
          "Prompt understanding option note id",
          100,
        );
        if (!ID.test(noteOptionId) || noteOptionIds.has(noteOptionId)) {
          throw new Error(
            "Prompt understanding option note ids must be unique and valid.",
          );
        }
        noteOptionIds.add(noteOptionId);
        text(optionNote.note, "Prompt understanding option note text", 2_000);
      }
    }
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
      selectedOptionIds: answer.selectedOptionIds ?? null,
      note: answer.note?.trim() ?? null,
      optionNotes:
        answer.optionNotes?.map((optionNote) => ({
          optionId: optionNote.optionId,
          note: optionNote.note.trim(),
        })) ?? null,
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
    exactKeys(
      question,
      ["id", "prompt", "rationale", "kind", "selectionMode", "options"],
      "Prompt understanding question",
    );
    const id = text(question.id, "Prompt understanding question id", 100);
    if (!ID.test(id) || questionIds.has(id)) throw new Error("Prompt question ids must be unique and valid.");
    questionIds.add(id);
    text(question.prompt, "Prompt understanding question prompt", 2_000);
    text(question.rationale, "Prompt understanding question rationale", 1_000);
    if (!KINDS.has(question.kind as string)) throw new Error("Prompt question kind is invalid.");
    if (
      question.selectionMode !== undefined &&
      question.selectionMode !== "single" &&
      question.selectionMode !== "multiple"
    ) {
      throw new Error("Prompt question selection mode is invalid.");
    }
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
      exactKeys(
        option,
        [
          "id",
          "label",
          "description",
          "recommended",
          "conflictsWith",
          "recommendationReason",
        ],
        "Prompt question option",
      );
      const optionId = text(option.id, "Prompt question option id", 100);
      if (!ID.test(optionId) || optionIds.has(optionId)) throw new Error("Prompt option ids must be unique and valid.");
      optionIds.add(optionId);
      text(option.label, "Prompt question option label", 200);
      text(option.description, "Prompt question option description", 500);
      if (typeof option.recommended !== "boolean") throw new Error("Prompt option recommendation must be boolean.");
      if (option.recommended) recommended += 1;
      if (option.conflictsWith !== undefined) {
        uniqueStrings(
          option.conflictsWith,
          "Prompt option conflicts",
          4,
        );
      }
      if (option.recommendationReason !== undefined) {
        if (
          option.recommendationReason !== null &&
          typeof option.recommendationReason !== "string"
        ) {
          throw new Error("Prompt option recommendation reason is invalid.");
        }
        if (
          option.recommended &&
          !option.recommendationReason?.trim()
        ) {
          throw new Error(
            "Recommended prompt options need a recommendation reason.",
          );
        }
        if (!option.recommended && option.recommendationReason !== null) {
          throw new Error(
            "Non-recommended prompt options cannot have a recommendation reason.",
          );
        }
      }
    }
    const selectionMode = question.selectionMode ?? "single";
    if (
      selectionMode === "single" &&
      recommended > 1
    ) {
      throw new Error("Single prompt question may recommend only one option.");
    }
    if (question.selectionMode !== undefined && recommended < 1) {
      throw new Error("Interactive prompt questions need a recommended option.");
    }
    const options = question.options.map((candidate) =>
      record(candidate, "Prompt question option")
    );
    for (const option of options) {
      const optionId = String(option.id);
      const conflicts = new Set(
        Array.isArray(option.conflictsWith)
          ? option.conflictsWith.map(String)
          : [],
      );
      if (conflicts.has(optionId)) {
        throw new Error("Prompt options cannot conflict with themselves.");
      }
      for (const conflictId of conflicts) {
        const conflict = options.find(
          (candidate) => candidate.id === conflictId,
        );
        if (!conflict) {
          throw new Error("Prompt option conflict id is unknown.");
        }
        if (
          !Array.isArray(conflict.conflictsWith) ||
          !conflict.conflictsWith.includes(optionId)
        ) {
          throw new Error("Prompt option conflicts must be symmetric.");
        }
        if (option.recommended && conflict.recommended) {
          throw new Error("Recommended prompt options cannot conflict.");
        }
      }
    }
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

/**
 * Why a prompt did not qualify for the deterministic gate, or the candidate it
 * produced. `reason` names the first failing condition so a run's evidence can
 * show which check kept the model gate in the loop.
 */
export type DeterministicPromptUnderstandingDecisionV1 =
  | { bypass: false; reason: string }
  | { bypass: true; candidate: PromptUnderstandingCandidateV1 };

/**
 * Openings that can only introduce a request to explain what already exists.
 * This is an allowlist, not a denylist: anything unrecognized keeps the model
 * gate. A denylist of "risky" words would silently admit every phrasing nobody
 * thought to forbid, which is the wrong failure direction for a safety gate.
 */
const READ_ONLY_QUESTION_OPENINGS = new Set([
  "what",
  "why",
  "how",
  "where",
  "which",
  "who",
  "when",
  "is",
  "are",
  "was",
  "were",
  "does",
  "do",
  "did",
  "can",
  "could",
  "should",
  "explain",
  "summarize",
  "summarise",
  "describe",
  "compare",
]);

/**
 * Verbs that ask for work rather than an explanation. A prompt that opens with
 * an allowlisted word but contains one of these later ("Explain the parser and
 * fix the failing test") is a request for work and keeps the model gate.
 */
const ACTION_VERB =
  /\b(add|apply|build|change|check|clean|configure|convert|create|delete|deploy|disable|edit|enable|execute|fix|generate|implement|improve|init|initialize|inspect|install|keep|make|migrate|modify|move|persist|refactor|remove|rename|repair|replace|report|reset|run|set|setup|start|stop|test|update|upgrade|use|validate|verify|write)\b/iu;

/** A path, URL, or flag turns an explanatory question into a targeted request. */
const CONCRETE_TARGET = /(?:^|\s)(?:[./~]|--|[a-z]+:\/\/)/iu;

const MAX_DETERMINISTIC_PROMPT_LENGTH = 300;

/**
 * Decides whether a prompt is unambiguous enough to skip the model-backed
 * prompt-understanding gate.
 *
 * The gate exists to catch ambiguity, missing scope, and requests that reach
 * outside the repository boundary. Most prompts carry none of those, and paying
 * a model round trip to discover that is the largest fixed cost on an easy
 * turn. This decides the easy case without a provider call.
 *
 * It may only ever produce a `ready` `answer`: never `takeover_required`, never
 * a repository action, never a question or a scope-affecting assumption. Every
 * condition must hold, and any doubt returns `bypass: false` so the model gate
 * runs exactly as it does today. Skipping a question the model gate would have
 * asked is the failure this design must not permit, so the checks are written
 * to fail toward the gate.
 */
export function classifyDeterministicPromptUnderstanding(
  basis: PromptUnderstandingBasisV1,
  context: PromptUnderstandingContextV1,
): DeterministicPromptUnderstandingDecisionV1 {
  // An amended basis means an earlier round already found something worth
  // asking about. That history belongs to the model gate.
  if (basis.clarificationAnswers.length > 0) {
    return { bypass: false, reason: "basis_carries_clarification_answers" };
  }
  if (basis.confirmedAssumptions.length > 0) {
    return { bypass: false, reason: "basis_carries_confirmed_assumptions" };
  }
  if ((basis.attachments?.length ?? 0) > 0) {
    return { bypass: false, reason: "basis_carries_attachments" };
  }
  if (basis.acceptanceCriteria.length > 0) {
    return { bypass: false, reason: "basis_declares_acceptance_criteria" };
  }
  if (basis.activeGoal?.trim()) {
    return { bypass: false, reason: "session_has_active_goal" };
  }
  // Conversational context is what makes a prompt referential ("do the same
  // for desktop") and is also the surface an injected transcript would use.
  if (context.recentTurns.length > 0) {
    return { bypass: false, reason: "context_carries_recent_turns" };
  }
  if (context.conversationSummary?.trim()) {
    return { bypass: false, reason: "context_carries_conversation_summary" };
  }

  const prompt = basis.rawPrompt.trim();
  if (prompt.length === 0) {
    return { bypass: false, reason: "prompt_is_empty" };
  }
  if (prompt.length > MAX_DETERMINISTIC_PROMPT_LENGTH) {
    return { bypass: false, reason: "prompt_exceeds_bounded_length" };
  }
  const opening = prompt.toLowerCase().match(/^[a-z]+/u)?.[0] ?? "";
  if (!READ_ONLY_QUESTION_OPENINGS.has(opening)) {
    return { bypass: false, reason: "prompt_is_not_an_explanatory_question" };
  }
  if (ACTION_VERB.test(prompt)) {
    return { bypass: false, reason: "prompt_requests_work" };
  }
  if (CONCRETE_TARGET.test(prompt)) {
    return { bypass: false, reason: "prompt_names_a_concrete_target" };
  }
  if (promptHasPositiveHighRiskIntent(prompt)) {
    return { bypass: false, reason: "prompt_asserts_high_risk_domain" };
  }

  return {
    bypass: true,
    candidate: {
      outcome: "answer",
      readiness: "ready",
      reply: "The request is understood.",
      conversationSummary: "A bounded read-only question was understood without clarification.",
      refinedBrief: null,
      questions: [],
      assumptions: [],
    },
  };
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
      id: requirementId(
        `answer-${answer.questionId}`,
        [
          answer.answer,
          answer.note ?? "",
          ...(answer.optionNotes ?? []).map(
            ({ optionId, note }) => `${optionId}: ${note}`,
          ),
        ].join("\n"),
      ),
      text: [
        answer.answer.trim(),
        answer.note?.trim(),
        ...(answer.optionNotes ?? []).map(
          ({ optionId, note }) => `${optionId}: ${note.trim()}`,
        ),
      ].filter(Boolean).join(" — "),
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
