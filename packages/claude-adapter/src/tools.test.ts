import { describe, expect, it } from "bun:test";

import type { AgentFunctionTool } from "@codepawl/model-runtime";

import {
  claudeEffort,
  claudeImageSource,
  claudeTool,
  claudeTools,
  defaultClaudeModelCapabilities,
  schemaSupportsStrict,
  toolResultMessage,
  type ClaudeToolWarning,
} from "./tools";

function tool(
  name: string,
  parameters: Record<string, unknown> = {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
): AgentFunctionTool {
  return {
    type: "function",
    name,
    description: `does ${name}`,
    strict: true,
    parameters,
  };
}

describe("claude tool translation", () => {
  it("renames parameters to input_schema and drops the OpenAI discriminator", () => {
    const translated = claudeTool(tool("read_file"), {
      structuredOutputs: true,
    });
    expect(translated).toEqual({
      name: "read_file",
      description: "does read_file",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
      strict: true,
    });
    expect(translated).not.toHaveProperty("type");
    expect(translated).not.toHaveProperty("parameters");
  });

  it("downgrades to a non-strict tool when the schema cannot satisfy strict", () => {
    const warnings: ClaudeToolWarning[] = [];
    const translated = claudeTool(
      tool("loose", {
        type: "object",
        properties: { q: { type: "string" } },
        required: ["q"],
      }),
      { structuredOutputs: true, onWarning: (w) => warnings.push(w) },
    );
    expect(translated).not.toHaveProperty("strict");
    expect(warnings).toEqual([
      { toolName: "loose", reason: "schema_not_strict" },
    ]);
  });

  it("downgrades every tool when the model lacks structured outputs", () => {
    const warnings: ClaudeToolWarning[] = [];
    const translated = claudeTool(tool("read_file"), {
      structuredOutputs: false,
      onWarning: (w) => warnings.push(w),
    });
    expect(translated).not.toHaveProperty("strict");
    expect(warnings).toEqual([
      { toolName: "read_file", reason: "model_lacks_structured_outputs" },
    ]);
  });

  it("rejects a nested object that omits additionalProperties", () => {
    expect(
      schemaSupportsStrict({
        type: "object",
        properties: {
          nested: { type: "object", properties: {}, required: [] },
        },
        required: ["nested"],
        additionalProperties: false,
      }),
    ).toBe(false);
  });

  it("sorts tools by name so the cached prompt prefix stays stable", () => {
    expect(
      claudeTools([tool("zeta"), tool("alpha"), tool("mid")], {
        structuredOutputs: true,
      }).map((entry) => entry.name),
    ).toEqual(["alpha", "mid", "zeta"]);
  });
});

describe("claude effort mapping", () => {
  it("collapses the sub-low rungs Anthropic does not expose", () => {
    expect(claudeEffort("minimal")).toBe("low");
    expect(claudeEffort("none")).toBe("low");
  });

  it("passes the shared rungs through unchanged", () => {
    expect(claudeEffort("low")).toBe("low");
    expect(claudeEffort("medium")).toBe("medium");
    expect(claudeEffort("high")).toBe("high");
    expect(claudeEffort("xhigh")).toBe("xhigh");
  });
});

describe("claude model capabilities", () => {
  it("enables effort and adaptive thinking on current models", () => {
    for (const model of [
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-fable-5",
    ]) {
      expect(defaultClaudeModelCapabilities(model)).toMatchObject({
        effort: true,
        adaptiveThinking: true,
      });
    }
  });

  it("withholds effort and thinking where they return 400", () => {
    // Sending output_config.effort or adaptive thinking to these models is a
    // hard error, so the conservative default is to omit both.
    for (const model of ["claude-haiku-4-5", "claude-sonnet-4-5"]) {
      expect(defaultClaudeModelCapabilities(model)).toMatchObject({
        effort: false,
        adaptiveThinking: false,
      });
    }
  });

  it("defaults an unknown model to the always-valid subset", () => {
    expect(defaultClaudeModelCapabilities("claude-future-9000")).toEqual({
      effort: false,
      adaptiveThinking: false,
      structuredOutputs: false,
    });
  });
});

describe("claude tool results", () => {
  it("packs every result from one turn into a single user message", () => {
    const message = toolResultMessage([
      { callId: "toolu_1", output: "a" },
      { callId: "toolu_2", output: "b" },
      { callId: "toolu_3", output: "c" },
    ]);
    expect(message.role).toBe("user");
    const content = message.content as Record<string, unknown>[];
    expect(content).toHaveLength(3);
    expect(content.map((block) => block.tool_use_id)).toEqual([
      "toolu_1",
      "toolu_2",
      "toolu_3",
    ]);
  });

  it("marks failures with is_error and omits the flag otherwise", () => {
    const content = toolResultMessage([
      { callId: "toolu_1", output: "boom", isError: true },
      { callId: "toolu_2", output: "ok" },
    ]).content as Record<string, unknown>[];
    expect(content[0]!.is_error).toBe(true);
    expect(content[1]).not.toHaveProperty("is_error");
  });

  it("appends browser crops as image blocks inside the tool result", () => {
    const content = toolResultMessage([
      {
        callId: "toolu_1",
        output: "captured",
        images: [
          {
            dataUrl: "data:image/png;base64,AAAB",
            detail: "high",
            source: "browser_crop",
          },
        ],
      },
    ]).content as Record<string, unknown>[];
    const blocks = content[0]!.content as Record<string, unknown>[];
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAAB" },
    });
  });

  it("rejects an image that is not a base64 data URL", () => {
    expect(() => claudeImageSource("https://example.com/a.png")).toThrow(
      "base64 data URL",
    );
  });
});
