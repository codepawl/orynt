import { describe, expect, it } from "bun:test";

import {
  cliCodexAppServerRuntime,
  cliNativeRuntime,
  readCliProviderUsage,
  shutdownCliProviderRuntime,
} from "./provider";

describe("cli provider usage routing", () => {
  it("routes anthropic-api to the Anthropic reader", async () => {
    // No turn has run in this process, so the reader has no observation yet.
    const snapshot = await readCliProviderUsage("quota", "anthropic-api");
    expect(snapshot.provider).toEqual({
      id: "anthropic-api",
      label: "Anthropic API",
      transport: "anthropic-messages",
    });
    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.account).toBeNull();
    expect(snapshot.issues[0]!.code).toBe("CLAUDE_USAGE_LIMITED");
  });

  it("reports the OpenAI key path as unavailable without inventing quota", async () => {
    const snapshot = await readCliProviderUsage("quota", "openai-api");
    expect(snapshot.provider.id).toBe("openai-api");
    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.meters).toEqual([]);
  });
});

describe("OpenCode provider wiring", () => {
  it("labels OpenCode as itself instead of falling through to OpenAI", async () => {
    const snapshot = await readCliProviderUsage("quota", "opencode-api");
    expect(snapshot.provider).toEqual({
      id: "opencode-api",
      label: "OpenCode",
      transport: "anthropic-messages",
    });
    expect(snapshot.issues[0]?.code).toBe("OPENCODE_USAGE_LIMITED");
  });

  it("binds the OpenCode runtime to its own endpoint and credential", () => {
    const previous = {
      opencode: process.env.OPENCODE_API_KEY,
      anthropicToken: process.env.ANTHROPIC_AUTH_TOKEN,
      anthropicBase: process.env.ANTHROPIC_BASE_URL,
    };
    // Holding an Anthropic OAuth token at the same time must not trip the
    // runtime's "only one credential" guard: they belong to different
    // providers. An Anthropic gateway override must not redirect OpenCode.
    process.env.OPENCODE_API_KEY = "test-opencode-key";
    process.env.ANTHROPIC_AUTH_TOKEN = "test-anthropic-token";
    process.env.ANTHROPIC_BASE_URL = "https://gateway.invalid";
    try {
      expect(() => cliNativeRuntime("opencode-api")).not.toThrow();
    } finally {
      for (const [key, value] of [
        ["OPENCODE_API_KEY", previous.opencode],
        ["ANTHROPIC_AUTH_TOKEN", previous.anthropicToken],
        ["ANTHROPIC_BASE_URL", previous.anthropicBase],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

// Kept last: it latches the process-wide shutdown flag for this module.
describe("provider work after shutdown", () => {
  it("refuses to start a Codex app-server once the process has torn down", async () => {
    await shutdownCliProviderRuntime();

    // A background usage refresh can outlive the interactive session. Before
    // this guard it lazily started an app-server after shutdown had already
    // found nothing to stop, and the orphaned child's pipes kept the event
    // loop alive so the CLI never exited.
    expect(() => cliCodexAppServerRuntime()).toThrow(
      "The Codex provider runtime is shut down for this process.",
    );
    await expect(readCliProviderUsage("quota", "codex-cli")).rejects.toThrow(
      "shut down for this process",
    );
  });
});
