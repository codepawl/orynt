import type {
  AgentFunctionTool,
  AgentInlineImage,
  AgentRuntimeSessionConfig,
} from "@codepawl/model-runtime";

import type { JsonRecord } from "./sse.js";

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Anthropic exposes `low`–`max`; Orynt's ladder additionally has `minimal` and
 * `none` below `low`. Both collapse to `low`. Orynt never requests `max`.
 */
export function claudeEffort(
  effort: AgentRuntimeSessionConfig["effort"],
): ClaudeEffort {
  switch (effort) {
    case "minimal":
    case "none":
      return "low";
    default:
      return effort;
  }
}

export type ClaudeModelCapabilities = {
  /** `output_config.effort` — errors on Sonnet 4.5, Haiku 4.5 and older. */
  effort: boolean;
  /** `thinking: {type: "adaptive"}` — only on Opus 4.6+ / Sonnet 4.6+ / 5.x. */
  adaptiveThinking: boolean;
  /** `strict` tools and `output_config.format`. */
  structuredOutputs: boolean;
};

const ADAPTIVE_THINKING_MODELS =
  /^claude-(opus|sonnet|fable|mythos)-(5|[6-9]|\d{2,})\b|^claude-opus-4-[678]\b|^claude-sonnet-4-6\b/;
const STRUCTURED_OUTPUT_MODELS =
  /^claude-(opus|sonnet|haiku|fable|mythos)-(4-[5-9]|5|[6-9]|\d{2,})\b/;

/**
 * Conservative static capability table, used until the live model catalog is
 * wired in. Every field defaults to `false` for an unrecognized model because
 * omitting `effort`, `thinking`, and `strict` is valid on every Claude model,
 * while sending an unsupported one is a 400.
 */
export function defaultClaudeModelCapabilities(
  model: string,
): ClaudeModelCapabilities {
  const adaptiveThinking = ADAPTIVE_THINKING_MODELS.test(model);
  return {
    effort: adaptiveThinking,
    adaptiveThinking,
    structuredOutputs: STRUCTURED_OUTPUT_MODELS.test(model),
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Anthropic accepts `strict: true` only when every object node in the schema
 * pins `additionalProperties: false` and lists `required`. A schema that misses
 * either is rejected with a 400 at request time, so the caller downgrades to a
 * non-strict tool instead of failing the turn.
 */
export function schemaSupportsStrict(schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  const stack: unknown[] = [schema];
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    if (!isRecord(node)) continue;
    if (node.type === "object") {
      if (node.additionalProperties !== false) return false;
      if (!Array.isArray(node.required)) return false;
    }
    for (const value of Object.values(node)) {
      if (isRecord(value) || Array.isArray(value)) stack.push(value);
    }
  }
  return true;
}

export type ClaudeToolWarning = {
  toolName: string;
  reason: "schema_not_strict" | "model_lacks_structured_outputs";
};

/**
 * Translates one Orynt function tool into Anthropic's shape: drop the
 * OpenAI-only `type` discriminator and rename `parameters` to `input_schema`.
 */
export function claudeTool(
  tool: AgentFunctionTool,
  options: {
    structuredOutputs?: boolean;
    onWarning?: (warning: ClaudeToolWarning) => void;
  } = {},
): JsonRecord {
  const translated: JsonRecord = {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
  if (options.structuredOutputs === false) {
    options.onWarning?.({
      toolName: tool.name,
      reason: "model_lacks_structured_outputs",
    });
    return translated;
  }
  if (!schemaSupportsStrict(tool.parameters)) {
    options.onWarning?.({ toolName: tool.name, reason: "schema_not_strict" });
    return translated;
  }
  return { ...translated, strict: true };
}

/**
 * Tools render at the very front of the prompt prefix, so their order is part
 * of the prompt-cache key. `CompositeAgentToolExecutor` returns Map-insertion
 * order, which is stable within a process but not across builds — sorting by
 * name keeps the cached prefix reusable.
 */
export function claudeTools(
  tools: readonly AgentFunctionTool[] | undefined,
  options: {
    structuredOutputs?: boolean;
    onWarning?: (warning: ClaudeToolWarning) => void;
  } = {},
): JsonRecord[] {
  if (!tools || tools.length === 0) return [];
  return [...tools]
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    .map((tool) => claudeTool(tool, options));
}

export type ClaudeImageSource = {
  type: "base64";
  media_type: string;
  data: string;
};

const DATA_URL = /^data:([^;,]+);base64,(.*)$/s;

export function claudeImageSource(dataUrl: string): ClaudeImageSource {
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw new Error("Anthropic images require a base64 data URL");
  return { type: "base64", media_type: match[1]!, data: match[2]! };
}

export function claudeImageBlock(dataUrl: string): JsonRecord {
  return { type: "image", source: claudeImageSource(dataUrl) };
}

export type ClaudeToolResultInput = {
  callId: string;
  output: string;
  isError?: boolean;
  images?: readonly AgentInlineImage[];
};

/**
 * Builds the single user message that carries every tool result from one
 * assistant turn. Splitting results across several messages is accepted by the
 * API but silently trains the model out of parallel tool use, so all results
 * from a turn must land in one message.
 */
export function toolResultMessage(
  results: readonly ClaudeToolResultInput[],
): JsonRecord {
  return {
    role: "user",
    content: results.map((result) => {
      const content: JsonRecord[] = [{ type: "text", text: result.output }];
      for (const image of result.images ?? []) {
        content.push(claudeImageBlock(image.dataUrl));
      }
      return {
        type: "tool_result",
        tool_use_id: result.callId,
        content,
        ...(result.isError ? { is_error: true } : {}),
      };
    }),
  };
}
