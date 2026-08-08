import { describe, expect, it } from "bun:test";

import { validateContextTokenBreakdownV1 } from "@codepawl/shared";

import { mergeClaudeUsage, parseClaudeTokenUsage } from "./usage";

describe("claude usage normalization", () => {
  it("folds cache reads and writes into the prompt total", () => {
    const usage = parseClaudeTokenUsage({
      input_tokens: 100,
      cache_read_input_tokens: 50_000,
      cache_creation_input_tokens: 2_000,
      output_tokens: 300,
    });
    // Anthropic reports `input_tokens` as the uncached remainder. Passing it
    // through would make a well-cached session look empty to ContextController
    // and compaction would never fire.
    expect(usage).toEqual({
      inputTokens: 52_100,
      cachedInputTokens: 50_000,
      outputTokens: 300,
      reasoningOutputTokens: 0,
      totalTokens: 52_400,
    });
  });

  it("does not double-count the cached prompt in totalTokens", () => {
    const usage = parseClaudeTokenUsage({
      input_tokens: 10,
      cache_read_input_tokens: 90,
      output_tokens: 5,
    })!;
    expect(usage.totalTokens).toBe(usage.inputTokens + usage.outputTokens);
    expect(usage.totalTokens).toBe(105);
  });

  it("treats missing cache fields as zero", () => {
    expect(parseClaudeTokenUsage({ input_tokens: 7, output_tokens: 3 })).toEqual(
      {
        inputTokens: 7,
        cachedInputTokens: 0,
        outputTokens: 3,
        reasoningOutputTokens: 0,
        totalTokens: 10,
      },
    );
  });

  it("returns undefined for an empty usage object", () => {
    expect(parseClaudeTokenUsage({})).toBeUndefined();
    expect(parseClaudeTokenUsage(undefined)).toBeUndefined();
  });

  it("reports zero reasoning tokens because Anthropic bills them as output", () => {
    expect(
      parseClaudeTokenUsage({ input_tokens: 1, output_tokens: 900 })!
        .reasoningOutputTokens,
    ).toBe(0);
  });

  it("produces a breakdown the shared context contract accepts", () => {
    const usage = parseClaudeTokenUsage({
      input_tokens: 12,
      cache_read_input_tokens: 34,
      cache_creation_input_tokens: 5,
      output_tokens: 6,
    })!;
    expect(() => validateContextTokenBreakdownV1(usage)).not.toThrow();
  });

  it("merges message_start and message_delta usage fragments", () => {
    expect(
      mergeClaudeUsage(
        { input_tokens: 10, output_tokens: 0 },
        { output_tokens: 42 },
      ),
    ).toEqual({ input_tokens: 10, output_tokens: 42 });
  });
});
