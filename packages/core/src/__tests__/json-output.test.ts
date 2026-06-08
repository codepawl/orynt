import { describe, expect, it } from "vitest";
import {
  ProviderJsonOutputError,
  parsePatchPlanResponse,
  parseScopeAnalysisResponse,
} from "../providers/json-output";

const context = {
  provider: "openai-compatible",
  model: "test-model",
  purpose: "scope_analysis",
};

const cleanScope = {
  rationale: "Scope rationale",
  affectedModules: ["packages/core"],
  proposedFilesToModify: ["packages/core/src/ledger/trace.ts"],
  proposedFilesToCreate: [],
};

const patchContext = {
  provider: "openai-compatible",
  model: "test-model",
  purpose: "patch_plan",
};

const validPatchPlan = {
  rationale: "Add trace ledger tests.",
  chunks: [
    {
      type: "create",
      file: "packages/core/src/__tests__/trace-ledger.test.ts",
      description: "Create trace ledger tests.",
    },
  ],
};

describe("provider JSON output parsing", () => {
  it("parses clean JSON content", () => {
    expect(parseScopeAnalysisResponse(JSON.stringify(cleanScope), context)).toEqual(cleanScope);
  });

  it("parses JSON with leading and trailing whitespace", () => {
    expect(parseScopeAnalysisResponse(`\n\n  ${JSON.stringify(cleanScope)}  \n`, context)).toEqual(cleanScope);
  });

  it("parses fenced JSON content", () => {
    expect(parseScopeAnalysisResponse(`Here is the JSON:\n\`\`\`json\n${JSON.stringify(cleanScope)}\n\`\`\``, context))
      .toEqual(cleanScope);
  });

  it("parses extra text around one extractable JSON object", () => {
    const content = `I will return the structured object now.\n${JSON.stringify(cleanScope)}\nThat is the final answer.`;

    expect(parseScopeAnalysisResponse(content, context)).toEqual(cleanScope);
  });

  it("fails clearly for invalid JSON content", () => {
    expect(() => parseScopeAnalysisResponse("```json\n{ not valid json }\n```", context))
      .toThrow(ProviderJsonOutputError);

    try {
      parseScopeAnalysisResponse("```json\n{ not valid json }\n```", context);
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderJsonOutputError);
      expect((err as ProviderJsonOutputError).category).toBe("malformed_json");
      expect(String(err)).toContain("provider=openai-compatible");
      expect(String(err)).toContain("model=test-model");
      expect(String(err)).toContain("purpose=scope_analysis");
      expect(String(err)).toContain("preview=");
    }
  });

  it("keeps finish_reason stop malformed JSON categorized as malformed_json", () => {
    expect.assertions(2);
    try {
      parseScopeAnalysisResponse("{\"rationale\": Missing quoted string}", {
        ...context,
        finishReason: "stop",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderJsonOutputError);
      expect((err as ProviderJsonOutputError).category).toBe("malformed_json");
    }
  });

  it("fails clearly for valid JSON with invalid schema", () => {
    expect(() => parseScopeAnalysisResponse(JSON.stringify({ rationale: "missing arrays" }), context))
      .toThrow(ProviderJsonOutputError);

    try {
      parseScopeAnalysisResponse(JSON.stringify({ rationale: "missing arrays" }), context);
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderJsonOutputError);
      expect((err as ProviderJsonOutputError).category).toBe("schema_validation");
    }
  });

  it("parses a valid patch_plan", () => {
    expect(parsePatchPlanResponse(JSON.stringify(validPatchPlan), patchContext)).toEqual({
      patchPlan: validPatchPlan,
      repairs: [],
    });
  });

  it("uses a metadata-only patch_plan schema", () => {
    const content = JSON.stringify({
      rationale: "Code content is not accepted.",
      chunks: [{ type: "create", file: "src/example.ts", description: "Create example.", content: "" }],
    });

    expect(() => parsePatchPlanResponse(content, patchContext)).toThrow("chunks[0]");
  });

  it("fails patch_plan when description is missing and shows chunks[0].description", () => {
    const content = JSON.stringify({
      rationale: "Missing description.",
      chunks: [{ type: "create", file: "src/example.ts" }],
    });

    expect(() => parsePatchPlanResponse(content, patchContext)).toThrow("chunks[0].description");
  });

  it("repairs safe patch_plan aliases for path and summary", () => {
    const content = JSON.stringify({
      rationale: "Alias repair.",
      chunks: [
        {
          type: "create",
          path: "src/example.ts",
          summary: "Create example file.",
        },
      ],
    });

    expect(parsePatchPlanResponse(content, patchContext)).toEqual({
      patchPlan: {
        rationale: "Alias repair.",
        chunks: [
          {
            type: "create",
            file: "src/example.ts",
            description: "Create example file.",
          },
        ],
      },
      repairs: [
        { chunkIndex: 0, field: "file", alias: "path" },
        { chunkIndex: 0, field: "description", alias: "summary" },
      ],
    });
  });

  it("repairs reason and details aliases into description", () => {
    const reason = parsePatchPlanResponse(JSON.stringify({
      rationale: "Reason alias.",
      chunks: [{ type: "delete", file: "src/old.ts", reason: "Remove obsolete file." }],
    }), patchContext);
    const details = parsePatchPlanResponse(JSON.stringify({
      rationale: "Details alias.",
      chunks: [{ type: "delete", file: "src/old.ts", details: "Remove obsolete file." }],
    }), patchContext);

    expect(reason.patchPlan.chunks[0]?.description).toBe("Remove obsolete file.");
    expect(reason.repairs).toEqual([{ chunkIndex: 0, field: "description", alias: "reason" }]);
    expect(details.patchPlan.chunks[0]?.description).toBe("Remove obsolete file.");
    expect(details.repairs).toEqual([{ chunkIndex: 0, field: "description", alias: "details" }]);
  });

  it("fails patch_plan when description is not a string", () => {
    const content = JSON.stringify({
      rationale: "Bad description.",
      chunks: [{ type: "create", file: "src/example.ts", description: 123 }],
    });

    expect(() => parsePatchPlanResponse(content, patchContext)).toThrow("chunks[0].description");
  });

  it("does not repair non-string aliases", () => {
    const content = JSON.stringify({
      rationale: "Bad alias.",
      chunks: [{ type: "create", file: "src/example.ts", summary: 123 }],
    });

    expect(() => parsePatchPlanResponse(content, patchContext)).toThrow("chunks[0].description");
  });

  it("rejects patch_plan with more than five chunks", () => {
    const content = JSON.stringify({
      rationale: "Too many chunks.",
      chunks: Array.from({ length: 6 }, (_, index) => ({
        type: "modify",
        file: `src/file-${index}.ts`,
        description: "Modify file.",
      })),
    });

    expect(() => parsePatchPlanResponse(content, patchContext)).toThrow("patch_plan accepts at most 5 chunks");
  });

  it("classifies length finish_reason as truncated_output", () => {
    expect.assertions(3);
    try {
      parsePatchPlanResponse(JSON.stringify(validPatchPlan), {
        ...patchContext,
        finishReason: "length",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderJsonOutputError);
      expect((err as ProviderJsonOutputError).category).toBe("truncated_output");
      expect(String(err)).toContain("finish_reason=length");
    }
  });

  it("classifies unbalanced truncated JSON as truncated_output without repair", () => {
    expect.assertions(2);
    try {
      parsePatchPlanResponse("{\"rationale\":\"cut\",\"chunks\":[{\"type\":\"modify\",\"file\":\"packages/cor", patchContext);
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderJsonOutputError);
      expect((err as ProviderJsonOutputError).category).toBe("truncated_output");
    }
  });
});
