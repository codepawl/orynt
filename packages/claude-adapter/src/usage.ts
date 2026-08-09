import type { AgentContextTokenBreakdown } from "@codepawl/model-runtime";

import type { JsonRecord } from "./sse.js";

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function tokenInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

/**
 * Normalizes an Anthropic `usage` object into the provider-neutral breakdown.
 *
 * Anthropic reports `input_tokens` as the *uncached remainder* of the prompt,
 * while the shared contract — and `ContextController`, which derives context
 * pressure from it — expects `inputTokens` to be the whole prompt, the way the
 * OpenAI Responses API reports it. Passing the remainder through unchanged
 * would make a well-cached long session look nearly empty and compaction would
 * never fire, so cache reads and cache writes are folded back in here.
 *
 * `totalTokens` is deliberately `inputTokens + outputTokens` rather than the
 * sum of all four raw fields, which would count the cached prompt twice.
 */
export function parseClaudeTokenUsage(
  value: unknown,
): AgentContextTokenBreakdown | undefined {
  const usage = record(value);
  if (Object.keys(usage).length === 0) return undefined;
  const uncachedInputTokens = tokenInteger(
    usage.input_tokens ?? usage.inputTokens,
  );
  const cachedInputTokens = tokenInteger(
    usage.cache_read_input_tokens ?? usage.cacheReadInputTokens,
  );
  const cacheCreationInputTokens = tokenInteger(
    usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens,
  );
  const inputTokens =
    uncachedInputTokens + cachedInputTokens + cacheCreationInputTokens;
  const outputTokens = tokenInteger(usage.output_tokens ?? usage.outputTokens);
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    // Anthropic bills thinking inside `output_tokens` and exposes no separate
    // reasoning counter. Reporting zero is honest; an estimate would corrupt
    // downstream cost accounting.
    reasoningOutputTokens: 0,
    totalTokens: inputTokens + outputTokens,
  };
}

/**
 * Merges the usage fragments carried by `message_start` (prompt counts) and
 * `message_delta` (completion counts) into one object. Later fragments win.
 */
export function mergeClaudeUsage(
  base: JsonRecord,
  update: JsonRecord,
): JsonRecord {
  return { ...base, ...update };
}
