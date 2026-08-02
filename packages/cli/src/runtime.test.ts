import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatDoctorReport,
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
          "--debug",
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
      debug: true,
      explicitConfig: {
        repository: true,
        model: false,
        thinkingEffort: false,
        orchestration: true,
      },
      initialPrompt: "fix the tests",
    });
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
    expect(parseCliArgs(["run", "--jsonl", "--approve-once", "audit", "the", "repo"], "/work/orynt")).toMatchObject({
      command: "run",
      jsonl: true,
      approveOnce: true,
      initialPrompt: "audit the repo",
    });
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

  it("parses doctor and interactive resume without treating them as goals", () => {
    expect(parseCliArgs(["doctor"], "/work/orynt")).toMatchObject({ command: "doctor" });
    expect(parseCliArgs(["--resume", "latest"], "/work/orynt")).toMatchObject({ resumeSessionId: "latest" });
  });

  it("formats actionable terminal, repository, and provider diagnostics", () => {
    expect(
      formatDoctorReport({
        isTTY: false,
        color: false,
        term: "xterm-256color",
        repositoryPath: "/work/orynt",
        repositoryReady: true,
        gitReady: true,
        provider: { ready: false, detail: "login required" },
      }),
    ).toEqual([
      "Orynt doctor",
      "  TTY: non-interactive · plain output",
      "  TERM: xterm-256color",
      "  Repository: ready · /work/orynt",
      "  Git: ready",
      "  Codex CLI: not ready · login required",
      "  Recovery: run codex login, then orynt doctor",
    ]);
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
      },
      {
        id: "gpt-5.6-terra",
        label: "GPT-5.6-Terra",
        description: "Balanced agentic coding model.",
        supportedThinkingEfforts: ["low", "medium"],
        defaultThinkingEffort: "medium",
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
