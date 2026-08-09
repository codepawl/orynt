import path from "node:path";

import { describe, expect, it } from "bun:test";

import {
  parseCliArgs,
  parseCodexModelCatalog,
} from "./runtime";

describe("Orynt CLI arguments", () => {
  it("uses the current repository and safe interactive defaults", () => {
    expect(parseCliArgs([], "/work/orynt")).toEqual({
      repositoryPath: path.resolve("/work/orynt"),
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      roleModels: {},
      roleEfforts: {},
      color: true,
      explicitConfig: {
        repository: false,
        model: false,
        thinkingEffort: false,
        orchestration: false,
      },
    });
  });

  it("accepts workspace, profile, role overrides, plain output, and a positional startup prompt", () => {
    expect(
      parseCliArgs(
        [
          "--repo",
          "../project",
          "--profile",
          "quality",
          "--role-model",
          "implementer=gpt-5.6-luna",
          "--role-effort",
          "implementer=medium",
          "--plain",
          "--activity-details",
          "full",
          "fix",
          "the",
          "tests",
        ],
        "/work/orynt",
      ),
    ).toEqual({
      repositoryPath: path.resolve("/work/project"),
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      profile: "quality",
      roleModels: { implementer: "gpt-5.6-luna" },
      roleEfforts: { implementer: "medium" },
      color: false,
      activityDetails: "full",
      explicitConfig: {
        repository: true,
        model: false,
        thinkingEffort: false,
        orchestration: true,
      },
      initialPrompt: "fix the tests",
    });
  });

  it("replaces the old debug flag with explicit activity detail levels", () => {
    expect(() => parseCliArgs(["--debug"], "/work/orynt")).toThrow(
      "--debug was replaced by --activity-details <off|important|full>",
    );
    expect(() =>
      parseCliArgs(["--activity-details", "noisy"], "/work/orynt"),
    ).toThrow("--activity-details must be off, important, or full");
  });

  it("accepts a validated one-launch terminal theme before the option terminator", () => {
    expect(
      parseCliArgs(
        ["--theme", "monochrome", "explain", "this"],
        "/work/orynt",
      ),
    ).toMatchObject({
      themeId: "monochrome",
      initialPrompt: "explain this",
    });
    expect(() =>
      parseCliArgs(["--theme", "unknown"], "/work/orynt"),
    ).toThrow("Valid themes: quiet-studio, monochrome");
    expect(() =>
      parseCliArgs(["--theme"], "/work/orynt"),
    ).toThrow("--theme requires a value");
    const literal = parseCliArgs(
      ["--", "--theme", "monochrome"],
      "/work/orynt",
    );
    expect(literal.initialPrompt).toBe("--theme monochrome");
    expect(literal.themeId).toBeUndefined();
  });

  it("accepts and validates a one-launch screen mode", () => {
    expect(
      parseCliArgs(["--screen", "fullscreen", "explain"], "/work/orynt"),
    ).toMatchObject({ initialPrompt: "explain" });
    expect(() =>
      parseCliArgs(["--screen", "unknown"], "/work/orynt"),
    ).toThrow("Valid modes: auto, fullscreen, inline");
    expect(() => parseCliArgs(["--screen"], "/work/orynt"))
      .toThrow("--screen requires a value");
  });

  it("treats the option terminator and every following token as literal prompt text", () => {
    expect(parseCliArgs(["--", "--help"], "/work/orynt")).toMatchObject({ initialPrompt: "--help" });
    expect(parseCliArgs(["--", "doctor"], "/work/orynt")).toMatchObject({ initialPrompt: "doctor" });
    const literalPrompt = parseCliArgs(["--", "run", "--approve-once", "audit"], "/work/orynt");
    expect(literalPrompt.initialPrompt).toBe("run --approve-once audit");
    expect(literalPrompt.command).toBeUndefined();
    expect(literalPrompt.approveOnce).toBeUndefined();
    expect(() => parseCliArgs(["run", "--", "--approve-once", "audit"], "/work/orynt")).toThrow(
      "orynt run requires --approve-once",
    );
  });

  it("parses explicit headless JSONL execution with one-run approval", () => {
    expect(parseCliArgs(["run", "--jsonl", "--approve-once", "--minimum-tier", "heavy", "audit", "the", "repo"], "/work/orynt")).toMatchObject({
      command: "run",
      jsonl: true,
      approveOnce: true,
      minimumTier: "heavy",
      initialPrompt: "audit the repo",
    });
  });

  it("rejects an unknown minimum model tier", () => {
    expect(() =>
      parseCliArgs(["--minimum-tier", "tiny", "inspect"], "/work/orynt"),
    ).toThrow("Unsupported minimum model tier");
  });

  it("tracks config flag provenance without treating literal prompt flags as overrides", () => {
    expect(
      parseCliArgs(
        [
          "-C",
          "../repo",
          "--profile",
          "economy",
          "--role-effort",
          "helper=low",
        ],
        "/work/orynt",
      ).explicitConfig,
    ).toEqual({
      repository: true,
      model: false,
      thinkingEffort: false,
      orchestration: true,
    });
    expect(
      parseCliArgs(["--", "--model", "literal"], "/work/orynt").explicitConfig,
    ).toEqual({
      repository: false,
      model: false,
      thinkingEffort: false,
      orchestration: false,
    });
  });

  it("parses doctor, usage, and interactive resume without treating them as goals", () => {
    expect(parseCliArgs(["doctor"], "/work/orynt")).toMatchObject({ command: "doctor" });
    expect(parseCliArgs(["setup"], "/work/orynt")).toMatchObject({ command: "setup" });
    expect(parseCliArgs(["setup", "--check", "--json"], "/work/orynt")).toMatchObject({
      command: "setup",
      check: true,
      json: true,
    });
    expect(parseCliArgs(
      ["doctor", "--json", "--verbose"],
      "/work/orynt",
    )).toMatchObject({
      command: "doctor",
      json: true,
      verbose: true,
    });
    expect(parseCliArgs(
      ["usage", "--json", "--verbose"],
      "/work/orynt",
    )).toMatchObject({
      command: "usage",
      json: true,
      verbose: true,
    });
    expect(parseCliArgs(["--resume", "latest"], "/work/orynt")).toMatchObject({ resumeSessionId: "latest" });
  });

  it("keeps setup check flags out of unrelated and interactive commands", () => {
    expect(() => parseCliArgs(["--check"], "/work/orynt")).toThrow(/setup/);
    expect(() => parseCliArgs(["setup", "--json"], "/work/orynt")).toThrow(/--check/);
    expect(() => parseCliArgs(["--verbose"], "/work/orynt")).toThrow(/doctor/);
    expect(() => parseCliArgs(["setup", "goal"], "/work/orynt")).toThrow(/does not accept a goal/);
    expect(() => parseCliArgs(["usage", "goal"], "/work/orynt")).toThrow(/does not accept a goal/);
  });

  it("requires explicit quota confirmation for live doctor probes", () => {
    expect(() => parseCliArgs(["doctor", "--live"], "/work/orynt"))
      .toThrow(/requires --confirm-live/);
    expect(parseCliArgs(
      ["doctor", "--live", "--confirm-live"],
      "/work/orynt",
    )).toMatchObject({
      command: "doctor",
      live: true,
      confirmLive: true,
    });
  });

  it("rejects unknown and migrated single-model options", () => {
    expect(() => parseCliArgs(["--dangerously-skip-approvals"], "/work/orynt")).toThrow("Unknown option");
    expect(() => parseCliArgs(["--effort", "extreme"], "/work/orynt")).toThrow("--role-effort");
    expect(() => parseCliArgs(["--model", "gpt-5.6"], "/work/orynt")).toThrow("--role-model");
    expect(() =>
      parseCliArgs(["--role-effort", "helper=extreme"], "/work/orynt"),
    ).toThrow("Unsupported thinking effort");
    expect(() => parseCliArgs(["run", "--jsonl", "audit"], "/work/orynt")).toThrow("--approve-once");
  });

  it("parses, sorts, deduplicates, and bounds the live Codex model catalog", () => {
    const models = parseCodexModelCatalog(
      JSON.stringify({
        models: [
          {
            slug: "hidden-model",
            display_name: "Hidden",
            visibility: "hide",
            priority: 0,
          },
          {
            slug: "gpt-5.6-terra",
            display_name: "GPT-5.6-Terra",
            description: "Balanced agentic coding model.",
            visibility: "list",
            priority: 2,
            default_reasoning_level: "medium",
            supported_reasoning_levels: [
              { effort: "low" },
              { effort: "medium" },
              { effort: "ultra" },
            ],
            context_window: 200000,
            effective_context_window_percent: 90,
            auto_compact_token_limit: 170000,
          },
          {
            slug: "gpt-5.6-sol",
            display_name: "GPT-5.6-Sol",
            visibility: "list",
            priority: 1,
            default_reasoning_level: "low",
            supported_reasoning_levels: [
              { effort: "low" },
              { effort: "high" },
            ],
            context_window: 272000,
            effective_context_window_percent: 95,
          },
          {
            slug: "gpt-5.6-sol",
            display_name: "Duplicate",
            visibility: "list",
            priority: 3,
          },
          {
            slug: "bad model\nid",
            visibility: "list",
            priority: 0,
          },
        ],
      }),
    );

    expect(models).toEqual([
      {
        id: "gpt-5.6-sol",
        label: "GPT-5.6-Sol",
        supportedThinkingEfforts: ["low", "high"],
        defaultThinkingEffort: "low",
        contextWindowTokens: 272000,
        effectiveContextWindowTokens: 258400,
        providerAutoCompactAtTokens: 244800,
      },
      {
        id: "gpt-5.6-terra",
        label: "GPT-5.6-Terra",
        description: "Balanced agentic coding model.",
        supportedThinkingEfforts: ["low", "medium"],
        defaultThinkingEffort: "medium",
        contextWindowTokens: 200000,
        effectiveContextWindowTokens: 180000,
        providerAutoCompactAtTokens: 170000,
      },
    ]);
  });

  it("rejects malformed model catalog JSON", () => {
    expect(() => parseCodexModelCatalog("{")).toThrow();
  });

  it("caps the selectable catalog to keep interactive filtering bounded", () => {
    const models = parseCodexModelCatalog(
      JSON.stringify({
        models: Array.from({ length: 550 }, (_, index) => ({
          slug: `model-${index}`,
          display_name: `Model ${index}`,
          visibility: "list",
          priority: index,
        })),
      }),
    );

    expect(models).toHaveLength(500);
    expect(models.at(-1)?.id).toBe("model-499");
  });
});
