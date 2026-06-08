import * as fs from "fs/promises";
import { AgentMessage } from "../state/schema";

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
  generateCompletion(
    messages: ReadonlyArray<AgentMessage>,
    options?: LlmCompletionOptions
  ): Promise<LlmCompletionResult>;
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
