import { describe, expect, it } from "bun:test";

import {
  listClaudeModels,
  parseClaudeModelCatalog,
  claudeCapabilitiesFromEntry,
} from "./modelCatalog";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "claude-opus-5",
    display_name: "Claude Opus 5",
    max_input_tokens: 1_000_000,
    max_tokens: 128_000,
    capabilities: {
      image_input: { supported: true },
      structured_outputs: { supported: true },
      thinking: { types: { adaptive: { supported: true } } },
      effort: {
        low: { supported: true },
        medium: { supported: true },
        high: { supported: true },
        xhigh: { supported: true },
        max: { supported: true },
      },
    },
    ...overrides,
  };
}

function body(data: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({ data, has_more: false, ...extra });
}

describe("claude model catalog parsing", () => {
  it("maps the Anthropic shape onto the picker option", () => {
    const [option] = parseClaudeModelCatalog(body([entry()]));
    expect(option).toEqual({
      id: "claude-opus-5",
      label: "Claude Opus 5",
      supportedThinkingEfforts: ["low", "medium", "high", "xhigh"],
      defaultThinkingEffort: "high",
      contextWindowTokens: 1_000_000,
      effectiveContextWindowTokens: 900_000,
      providerAutoCompactAtTokens: 900_000,
      maxOutputTokens: 128_000,
      capabilities: {
        effort: true,
        adaptiveThinking: true,
        structuredOutputs: true,
      },
    });
  });

  it("never surfaces max, which Orynt's effort ladder does not have", () => {
    const [option] = parseClaudeModelCatalog(body([entry()]));
    expect(option!.supportedThinkingEfforts).not.toContain("max");
  });

  it("gates efforts on the capability tree", () => {
    const [option] = parseClaudeModelCatalog(
      body([
        entry({
          id: "claude-haiku-4-5",
          capabilities: { structured_outputs: { supported: true } },
        }),
      ]),
    );
    expect(option!.supportedThinkingEfforts).toEqual([]);
    expect(option!.defaultThinkingEffort).toBeUndefined();
    expect(option!.capabilities).toEqual({
      effort: false,
      adaptiveThinking: false,
      structuredOutputs: true,
    });
  });

  it("drops malformed ids and duplicates", () => {
    const options = parseClaudeModelCatalog(
      body([
        entry(),
        entry(),
        entry({ id: "" }),
        entry({ id: "has space" }),
        entry({ id: "claude-sonnet-5" }),
      ]),
    );
    expect(options.map((option) => option.id)).toEqual([
      "claude-opus-5",
      "claude-sonnet-5",
    ]);
  });

  it("returns an empty catalog rather than throwing on a bad body", () => {
    expect(parseClaudeModelCatalog("{not json}")).toEqual([]);
    expect(parseClaudeModelCatalog("{}")).toEqual([]);
  });

  it("omits window fields when the provider omits the context size", () => {
    const [option] = parseClaudeModelCatalog(
      body([entry({ max_input_tokens: 0 })]),
    );
    expect(option).not.toHaveProperty("contextWindowTokens");
    expect(option).not.toHaveProperty("providerAutoCompactAtTokens");
  });

  it("reads capabilities straight off one entry", () => {
    expect(claudeCapabilitiesFromEntry(entry())).toEqual({
      effort: true,
      adaptiveThinking: true,
      structuredOutputs: true,
    });
  });
});

describe("claude model catalog fetching", () => {
  it("follows has_more pagination and merges pages", async () => {
    const pages = [
      body([entry({ id: "claude-opus-5" })], {
        has_more: true,
        last_id: "claude-opus-5",
      }),
      body([entry({ id: "claude-sonnet-5" })]),
    ];
    const urls: string[] = [];
    let index = 0;
    const options = await listClaudeModels({
      apiKey: "k",
      fetchImpl: (async (url: string) => {
        urls.push(url);
        return new Response(pages[index++]!, { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(options.map((option) => option.id)).toEqual([
      "claude-opus-5",
      "claude-sonnet-5",
    ]);
    expect(urls[1]).toContain("after_id=claude-opus-5");
  });

  it("returns nothing when no credential is configured", async () => {
    const options = await listClaudeModels({
      apiKey: "",
      authToken: "",
      fetchImpl: (async () => {
        throw new Error("must not be called without a credential");
      }) as unknown as typeof fetch,
    });
    expect(options).toEqual([]);
  });

  it("degrades to an empty catalog on an API failure", async () => {
    const options = await listClaudeModels({
      apiKey: "k",
      fetchImpl: (async () =>
        new Response("{}", { status: 401 })) as unknown as typeof fetch,
    });
    expect(options).toEqual([]);
  });

  it("sends the OAuth beta header when using a bearer token", async () => {
    let seen: Record<string, string> = {};
    await listClaudeModels({
      authToken: "oat-1",
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen = { ...(init.headers as Record<string, string>) };
        return new Response(body([]), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(seen.authorization).toBe("Bearer oat-1");
    expect(seen["anthropic-beta"]).toBe("oauth-2025-04-20");
    expect(seen).not.toHaveProperty("x-api-key");
  });
});

describe("Anthropic-compatible gateway catalogs", () => {
  // Shape returned by an OpenAI-style gateway that also serves /v1/messages:
  // no display_name, no max_input_tokens, and no capability object at all.
  const gatewayBody = JSON.stringify({
    object: "list",
    data: [
      { id: "glm-5.2", object: "model", created: 1786208296, owned_by: "opencode" },
      { id: "gpt-5.6-luna", object: "model", created: 1786208296, owned_by: "opencode" },
    ],
  });

  it("keeps ids that carry dots and falls back to the id as the label", () => {
    const options = parseClaudeModelCatalog(gatewayBody);
    expect(options.map(({ id }) => id)).toEqual(["glm-5.2", "gpt-5.6-luna"]);
    expect(options[0]!.label).toBe("glm-5.2");
  });

  it("treats an absent capability object as unknown rather than unsupported", () => {
    // An empty effort list makes every effort look unavailable, and a tier
    // configuration always resolves as the `custom` preset, which throws on an
    // unavailable effort instead of falling back. That would make every
    // gateway model unbindable.
    expect(parseClaudeModelCatalog(gatewayBody)[0]!.supportedThinkingEfforts)
      .toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("still honours an explicit capability object that withholds efforts", () => {
    const declared = JSON.stringify({
      data: [{ id: "restricted-model", capabilities: { effort: { low: { supported: true } } } }],
    });
    expect(parseClaudeModelCatalog(declared)[0]!.supportedThinkingEfforts)
      .toEqual(["low"]);
  });
});
