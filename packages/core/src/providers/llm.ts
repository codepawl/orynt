import * as fs from "fs/promises";
import { AgentMessage } from "../state/schema";

export type OpenpawlProviderName = "mock" | "openai-compatible";

export interface LlmCompletionOptions {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly responseFormat?: { type: "json_object" | "text" };
  readonly systemPrompt?: string;
}

export interface LlmCompletionResult {
  readonly content: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

export interface LlmProvider {
  readonly providerName: OpenpawlProviderName;
  readonly modelName: string;
  generateCompletion(
    messages: ReadonlyArray<AgentMessage>,
    options?: LlmCompletionOptions
  ): Promise<LlmCompletionResult>;
}

export interface ProviderConfigInput {
  readonly provider?: string;
  readonly model?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export interface ResolvedProviderConfig {
  readonly provider: OpenpawlProviderName;
  readonly model?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export interface OpenAiCompatibleProviderOptions {
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface MockCompletionRule {
  readonly matchQuery?: string;
  readonly matchLastMessage?: string;
  readonly response: {
    readonly content: string;
    readonly usage?: {
      readonly inputTokens: number;
      readonly outputTokens: number;
    };
  };
}

export class MockLlmProvider implements LlmProvider {
  public readonly providerName = "mock" as const;
  public readonly modelName = "deterministic-mock";
  private readonly fixturePath: string;
  private rules: ReadonlyArray<MockCompletionRule> = [];
  private isLoaded: boolean = false;

  constructor(fixturePath: string) {
    this.fixturePath = fixturePath;
  }

  private async loadRules(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const data = await fs.readFile(this.fixturePath, "utf-8");
      this.rules = JSON.parse(data) as ReadonlyArray<MockCompletionRule>;
      this.isLoaded = true;
    } catch (err: any) {
      throw new Error(`Failed to load LLM Mock Fixture from ${this.fixturePath}: ${err.message}`);
    }
  }

  public async generateCompletion(
    messages: ReadonlyArray<AgentMessage>,
    options?: LlmCompletionOptions
  ): Promise<LlmCompletionResult> {
    await this.loadRules();

    const lastMessage = messages[messages.length - 1]?.content ?? "";
    const firstMessage = messages.find(m => m.role === "user")?.content ?? "";

    for (const rule of this.rules) {
      if (rule.matchQuery) {
        const pattern = rule.matchQuery;
        let isMatch = false;
        try {
          const regex = new RegExp(pattern);
          if (regex.test(firstMessage)) {
            isMatch = true;
          }
        } catch (e) {
          // Ignore regex parsing error
        }
        if (firstMessage.includes(pattern)) {
          isMatch = true;
        }

        if (isMatch) {
          return rule.response;
        }
      }

      if (rule.matchLastMessage) {
        const pattern = rule.matchLastMessage;
        let isMatch = false;
        try {
          const regex = new RegExp(pattern);
          if (regex.test(lastMessage)) {
            isMatch = true;
          }
        } catch (e) {
          // Ignore regex parsing error
        }
        if (lastMessage.includes(pattern)) {
          isMatch = true;
        }

        if (isMatch) {
          return rule.response;
        }
      }
    }

    throw new Error(
      `MockLlmProvider: No mock completion rule matched the prompt history.\n` +
      `Last Message: "${lastMessage}"\n` +
      `First Message: "${firstMessage}"`
    );
  }
}

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

export class ProviderResponseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderResponseValidationError";
  }
}

export function resolveProviderConfig(
  input: ProviderConfigInput = {},
  env: Record<string, string | undefined> = process.env
): ResolvedProviderConfig {
  const providerRaw = input.provider ?? env["OPENPAWL_PROVIDER"] ?? "mock";
  const provider = providerRaw.trim().toLowerCase();

  if (provider !== "mock" && provider !== "openai-compatible") {
    throw new ProviderConfigurationError(
      `Unsupported OPENPAWL_PROVIDER "${providerRaw}". Expected "mock" or "openai-compatible".`
    );
  }

  if (provider === "mock") {
    return {
      provider: "mock",
      model: input.model ?? env["OPENPAWL_MODEL"] ?? "deterministic-mock",
    };
  }

  const model = input.model ?? env["OPENPAWL_MODEL"];
  const apiKey = input.apiKey ?? env["OPENPAWL_API_KEY"];
  const baseUrl = input.baseUrl ?? env["OPENPAWL_BASE_URL"] ?? "https://api.openai.com/v1";
  const missing: string[] = [];
  if (!model) missing.push("OPENPAWL_MODEL");
  if (!apiKey) missing.push("OPENPAWL_API_KEY");

  if (missing.length > 0) {
    throw new ProviderConfigurationError(
      `OPENPAWL_PROVIDER=openai-compatible requires ${missing.join(" and ")}.`
    );
  }

  return {
    provider: "openai-compatible",
    model,
    apiKey,
    baseUrl,
  };
}

export class OpenAiCompatibleProvider implements LlmProvider {
  public readonly providerName = "openai-compatible" as const;
  public readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.modelName = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async generateCompletion(
    messages: ReadonlyArray<AgentMessage>,
    options?: LlmCompletionOptions
  ): Promise<LlmCompletionResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: messages.map((message) => ({
          role: message.role === "tool" ? "user" : message.role,
          content: message.content,
        })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        response_format: options?.responseFormat?.type === "json_object"
          ? { type: "json_object" }
          : undefined,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI-compatible provider request failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new ProviderResponseValidationError(
        "OpenAI-compatible provider response did not include choices[0].message.content."
      );
    }

    return {
      content,
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens ?? 0,
            outputTokens: data.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }
}

export function createLlmProvider(
  config: ResolvedProviderConfig,
  mockFixturePath: string
): LlmProvider {
  if (config.provider === "mock") {
    return new MockLlmProvider(mockFixturePath);
  }

  return new OpenAiCompatibleProvider({
    model: config.model!,
    apiKey: config.apiKey!,
    baseUrl: config.baseUrl,
  });
}
