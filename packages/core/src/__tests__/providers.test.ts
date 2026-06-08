import { describe, expect, it } from "vitest";
import {
  MockLlmProvider,
  OpenAiCompatibleProvider,
  ProviderConfigurationError,
  ProviderResponseValidationError,
  resolveProviderConfig,
} from "../providers/llm";

describe("provider config resolution", () => {
  it("defaults to deterministic mock provider", () => {
    const config = resolveProviderConfig({}, {});

    expect(config.provider).toBe("mock");
    expect(config.model).toBe("deterministic-mock");
  });

  it("resolves openai-compatible provider from env", () => {
    const config = resolveProviderConfig({}, {
      OPENPAWL_PROVIDER: "openai-compatible",
      OPENPAWL_MODEL: "test-model",
      OPENPAWL_API_KEY: "secret-key",
      OPENPAWL_BASE_URL: "https://example.test/v1",
      OPENPAWL_MAX_TOKENS: "2000",
    });

    expect(config).toEqual({
      provider: "openai-compatible",
      model: "test-model",
      apiKey: "secret-key",
      baseUrl: "https://example.test/v1",
      maxTokens: 2000,
      scopeAnalysisMaxTokens: 2000,
      patchPlanMaxTokens: 2000,
    });
  });

  it("resolves per-purpose max token overrides", () => {
    const config = resolveProviderConfig({}, {
      OPENPAWL_PROVIDER: "openai-compatible",
      OPENPAWL_MODEL: "test-model",
      OPENPAWL_API_KEY: "secret-key",
      OPENPAWL_MAX_TOKENS: "1800",
      OPENPAWL_SCOPE_ANALYSIS_MAX_TOKENS: "1200",
      OPENPAWL_PATCH_PLAN_MAX_TOKENS: "1600",
    });

    expect(config.scopeAnalysisMaxTokens).toBe(1200);
    expect(config.patchPlanMaxTokens).toBe(1600);
  });

  it("fails clearly when openai-compatible env is incomplete", () => {
    expect(() => resolveProviderConfig({}, {
      OPENPAWL_PROVIDER: "openai-compatible",
      OPENPAWL_MODEL: "test-model",
    })).toThrow(ProviderConfigurationError);

    expect(() => resolveProviderConfig({}, {
      OPENPAWL_PROVIDER: "openai-compatible",
      OPENPAWL_MODEL: "test-model",
    })).toThrow("OPENPAWL_API_KEY");
  });

  it("fails clearly for unknown providers", () => {
    expect(() => resolveProviderConfig({}, {
      OPENPAWL_PROVIDER: "unknown",
    })).toThrow("Unsupported OPENPAWL_PROVIDER");
  });
});

describe("OpenAI-compatible provider", () => {
  it("uses chat completions with JSON response format and token usage", async () => {
    let requestUrl = "";
    let authorization = "";
    let requestBody: unknown = null;
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      requestUrl = request.url;
      authorization = request.headers.get("authorization") ?? "";
      requestBody = await request.json();
      return new Response(JSON.stringify({
        choices: [{ message: { content: "{\"rationale\":\"ok\",\"chunks\":[]}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      }), { status: 200 });
    };

    const provider = new OpenAiCompatibleProvider({
      model: "test-model",
      apiKey: "secret-key",
      baseUrl: "https://example.test/v1",
      fetchImpl,
    });

    const result = await provider.generateCompletion([
      {
        id: "msg-1",
        role: "user",
        content: "Return JSON",
        timestamp: "2026-06-08T00:00:00.000Z",
      },
    ], { responseFormat: { type: "json_object" }, temperature: 0.2, maxTokens: 1600 });

    expect(result.content).toContain("\"rationale\"");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
    expect(requestUrl).toBe("https://example.test/v1/chat/completions");
    expect(authorization).toBe("Bearer secret-key");
    const body = requestBody as { model: string; response_format: { type: string }; max_tokens: number };
    expect(body.model).toBe("test-model");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(1600);
  });

  it("passes max_completion_tokens when requested", async () => {
    let requestBody: unknown = null;
    const provider = new OpenAiCompatibleProvider({
      model: "test-model",
      apiKey: "secret-key",
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const request = new Request(input, init);
        requestBody = await request.json();
        return new Response(JSON.stringify({
          choices: [{ message: { content: "{\"rationale\":\"ok\",\"chunks\":[]}" } }],
        }), { status: 200 });
      },
    });

    await provider.generateCompletion([], { maxCompletionTokens: 1200 });

    expect((requestBody as { max_completion_tokens: number }).max_completion_tokens).toBe(1200);
  });

  it("validates missing message content", async () => {
    const provider = new OpenAiCompatibleProvider({
      model: "test-model",
      apiKey: "secret-key",
      fetchImpl: async () => new Response(JSON.stringify({ choices: [{}] }), { status: 200 }),
    });

    await expect(provider.generateCompletion([])).rejects.toThrow(ProviderResponseValidationError);
  });

  it("does not treat reasoning_content as output content", async () => {
    const provider = new OpenAiCompatibleProvider({
      model: "test-model",
      apiKey: "secret-key",
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { reasoning_content: "{\"rationale\":\"hidden\",\"chunks\":[]}" } }],
      }), { status: 200 }),
    });

    await expect(provider.generateCompletion([])).rejects.toThrow(
      "choices[0].message.content"
    );
  });
});

describe("mock provider metadata", () => {
  it("keeps deterministic mock metadata as the default provider identity", () => {
    const provider = new MockLlmProvider("/tmp/fixture.json");

    expect(provider.providerName).toBe("mock");
    expect(provider.modelName).toBe("deterministic-mock");
  });
});
