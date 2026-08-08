import { describe, expect, it } from "bun:test";

import { DEFAULT_CLI_ORCHESTRATION_PROFILE } from "./runtime";
import type { CliShortcutPreferences } from "./shortcuts";
import {
  RunPresenter,
  SLASH_COMMANDS,
  filterSlashCommands,
  parseInteractiveInput,
  renderCommandHelp,
  renderGettingStartedHelp,
  renderInteractiveHelp,
  renderRepositoryDiff,
  renderUnknownCommand,
  renderRunCompletion,
  renderShortcutHelp,
  renderTreeRows,
  renderWelcome,
  slashInputAssist,
  suggestSlashCommands,
  terminalSafeMultilineText,
  terminalSafeText,
  type InteractiveCommand,
} from "./ui";
import { terminalTextWidth } from "./terminal-presentation";

function expectCommand(input: string, expected: InteractiveCommand) {
  expect(parseInteractiveInput(input)).toEqual(expected);
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "");
}

function stripTreeStructure(value: string): string {
  return value.replace(/[│├└]─?/gu, "");
}

describe("Orynt terminal UI", () => {
  it("renders stable tree connectors for structured sibling rows", () => {
    expect(renderTreeRows(["coordinator sol", "implementer terra", "budgets advisory"]))
      .toEqual([
        "  ├─ coordinator sol",
        "  ├─ implementer terra",
        "  └─ budgets advisory",
      ]);
  });

  it("treats natural-language input as a conversational prompt and parses operator commands", () => {
    expectCommand("fix the failing tests", { kind: "prompt", value: "fix the failing tests" });
    expectCommand("  ", { kind: "empty" });
    expectCommand("/repo ./packages/shared", { kind: "repo", value: "./packages/shared" });
    expectCommand("/model", { kind: "model", value: "" });
    expectCommand("/model gpt-5.5", { kind: "model", value: "gpt-5.5" });
    expectCommand("/tier", { kind: "tier", value: "" });
    expectCommand("/tier heavy", { kind: "tier", value: "heavy" });
    expectCommand("/effort high", { kind: "effort", value: "high" });
    expectCommand("/goal audit repository safety", { kind: "goal", value: "audit repository safety" });
    expectCommand("/goal", { kind: "goal", value: "" });
    expectCommand("/goal --clear", { kind: "goal", value: "--clear" });
    expectCommand("/criteria tests pass; no secrets persisted", {
      kind: "criteria",
      value: "tests pass; no secrets persisted",
    });
    expectCommand("/plan", { kind: "plan" });
    expectCommand("/state", { kind: "state" });
    expectCommand("/evidence", { kind: "evidence" });
    expectCommand("/diff", { kind: "diff", value: "" });
    expectCommand("/diff packages/value.txt", {
      kind: "diff",
      value: "packages/value.txt",
    });
    expectCommand("/verify", { kind: "verify" });
    expectCommand("/cost", { kind: "cost" });
    expectCommand("/usage", { kind: "usage", verbose: false });
    expectCommand("/usage verbose", { kind: "usage", verbose: true });
    expectCommand("/doctor", { kind: "doctor", verbose: false });
    expectCommand("/doctor verbose", { kind: "doctor", verbose: true });
    expectCommand("/setup", { kind: "setup" });
    expectCommand("/resume latest", { kind: "resume", value: "latest" });
    expectCommand("/next update the docs", {
      kind: "next",
      value: "update the docs",
    });
    expectCommand("/stop", { kind: "stop" });
    expectCommand("/pending", { kind: "pending", value: "" });
    expectCommand("/pending drop 2", {
      kind: "pending",
      value: "drop 2",
    });
    expectCommand("/status", { kind: "status" });
    expectCommand("/context", { kind: "context", value: "" });
    expectCommand("/context history 50", {
      kind: "context",
      value: "history 50",
    });
    expectCommand("/context compact", {
      kind: "context",
      value: "compact",
    });
    expectCommand("/copy", { kind: "copy", value: "" });
    expectCommand("/copy previous", {
      kind: "copy",
      value: "previous",
    });
    expectCommand("/help", { kind: "help", topic: "commands" });
    expectCommand("/help commands", { kind: "help", topic: "commands" });
    expectCommand("/help shortcuts", { kind: "help", topic: "shortcuts" });
    expectCommand("/help getting-started", {
      kind: "help",
      topic: "getting-started",
    });
    expectCommand("/help unknown", { kind: "help", topic: "unknown" });
    expectCommand("/clear", { kind: "clear" });
    expectCommand("/exit", { kind: "exit" });
    expectCommand("/quit", { kind: "exit" });
    expectCommand("/unknown", { kind: "unknown", value: "/unknown" });
  });

  it("keeps slash parsing, help, aliases, and palette filtering in one registry", () => {
    const help = renderCommandHelp();
    const compactHelp = stripTreeStructure(help).replace(/\s+/gu, "");
    for (const definition of SLASH_COMMANDS) {
      if (definition.hidden) {
        expect(help).not.toContain(definition.usage);
      } else {
        expect(compactHelp).toContain(definition.usage.replace(/\s+/gu, ""));
        expect(compactHelp).toContain(
          definition.description.replace(/\s+/gu, ""),
        );
      }
    }
    expect(help).toContain("Customize");
    expect(help).toContain("Workspace");
    expect(help).toContain("Inspect");
    expect(help).toContain("Session");
    expect(help).toContain(
      "drag to select a range, double-click a word",
    );
    expect(help).toContain("Auto uses native inline scrollback in Orca");
    expect(filterSlashCommands("/do").map(({ command }) => command)).toEqual(["/doctor"]);
    expect(filterSlashCommands("/seittings").map(({ command }) => command)).toEqual([
      "/settings",
    ]);
    expect(filterSlashCommands("/mode")).toEqual([]);
    expect(filterSlashCommands("/q").map(({ command }) => command)).toEqual(["/exit"]);
    expect(filterSlashCommands("/repo ")).toEqual([]);
    expect(filterSlashCommands("goal /repo")).toEqual([]);
  });

  it("renders responsive command help without overflowing the viewport", () => {
    for (const width of [20, 40, 60, 80, 120]) {
      const help = renderCommandHelp({ width });
      const compact = stripTreeStructure(help).replace(/\s+/gu, "");
      expect(
        help.split("\n").every((line) => terminalTextWidth(line) <= width),
      ).toBe(true);
      expect(help.split("\n").every((line) => !/\s+$/u.test(line))).toBe(true);
      for (const definition of SLASH_COMMANDS.filter(
        ({ hidden }) => !hidden,
      )) {
        expect(compact).toContain(
          definition.usage.replace(/\s+/gu, ""),
        );
        expect(compact).toContain(
          definition.description.replace(/\s+/gu, ""),
        );
      }
    }

    const wide = renderCommandHelp({ width: 120 });
    expect(wide).toContain("/help [commands|shortcuts|getting-started]");
    expect(wide).toContain("Show command, shortcut, or getting-started help");
    const narrow = renderCommandHelp({ width: 40 });
    expect(narrow).toContain("├─ /help");
    expect(narrow).toContain("Show command, shortcut, or");

    const colored = renderCommandHelp({
      width: 60,
      color: true,
      themeId: "quiet-studio",
    });
    const usingOryntSection = colored.slice(colored.indexOf("Using Orynt"));
    expect(colored.split("\n")[0]).toContain(
      "\u001b[1;38;2;28;31;38;48;2;198;167;216m",
    );
    expect(colored.split("\n")[0]).toContain("\u001b[K");
    expect(usingOryntSection).not.toContain("\u001b[48;");
    expect(usingOryntSection).not.toContain("\u001b[K");
    expect(usingOryntSection).toContain(
      "\u001b[38;2;180;178;202mSettings",
    );
    expect(usingOryntSection).toContain(
      "\u001b[38;2;143;182;232m/settings",
    );
    expect(stripAnsi(colored).split("\n")[0]).toBe(
      `${" ".repeat(26)}Commands`,
    );
    expect(stripAnsi(colored)).toContain("Customize 🛠️");
    expect(stripAnsi(colored)).toContain("Using Orynt 🧭");
    expect(stripAnsi(colored)).toBe(renderCommandHelp({ width: 60 }));
  });

  it("renders responsive topic help with effective shortcut bindings", () => {
    const shortcuts: CliShortcutPreferences = {
      clear: ["alt+c"],
      undo: ["alt+u"],
      redo: ["alt+r"],
    };
    for (const width of [20, 40, 60, 80, 120]) {
      const pages = [
        renderShortcutHelp({ width, shortcuts }),
        renderGettingStartedHelp({ width }),
      ];
      for (const page of pages) {
        expect(
          page.split("\n").every((line) => terminalTextWidth(line) <= width),
        ).toBe(true);
        expect(
          page.split("\n").every((line) => !/\s+$/u.test(line)),
        ).toBe(true);
      }
    }

    const shortcutHelp = renderShortcutHelp({ shortcuts });
    expect(shortcutHelp).toContain("Write and edit ✍️");
    expect(shortcutHelp).toContain("Control active work 🎛️");
    expect(shortcutHelp).toContain("Alt+C clears a selection or draft");
    expect(shortcutHelp).toContain("Alt+U undoes the latest edit");
    expect(shortcutHelp).toContain("Alt+R reapplies an undone edit");
    expect(shortcutHelp).toContain("Ctrl+Shift+C copies");
    expect(shortcutHelp).toContain("Ctrl+C twice after the warning");
    expect(shortcutHelp).toContain("Ctrl+Up recalls the newest pending message");

    const gettingStarted = renderGettingStartedHelp();
    expect(gettingStarted).toContain("Start a conversation 💬");
    expect(gettingStarted).toContain("Check the result ✅");
    expect(gettingStarted).toContain("Type plain text to ask");
    expect(gettingStarted).toContain("/diff or /diff <path>");
    expect(gettingStarted).toContain("Run orynt --help outside the session");

    const colored = renderInteractiveHelp("shortcuts", {
      width: 60,
      color: true,
      themeId: "quiet-studio",
      shortcuts,
    });
    expect(colored.split("\n")[0]).toContain(
      "\u001b[1;38;2;28;31;38;48;2;198;167;216m",
    );
    expect(stripAnsi(colored).split("\n")[0]).toBe(
      `${" ".repeat(25)}Shortcuts`,
    );
    expect(stripAnsi(colored)).toBe(
      renderInteractiveHelp("shortcuts", { width: 60, shortcuts }),
    );
    expect(renderInteractiveHelp("")).toBe(renderCommandHelp());
    expect(renderInteractiveHelp("commands")).toBe(renderCommandHelp());
    expect(renderInteractiveHelp("unknown")).toBe(
      "Usage: /help [commands|shortcuts|getting-started]",
    );
  });

  it("suggests close visible commands without exposing hidden compatibility commands", () => {
    expect(suggestSlashCommands("/seittings").map(({ command }) => command)).toEqual([
      "/settings",
    ]);
    expect(suggestSlashCommands("/statsu").map(({ command }) => command)[0]).toBe(
      "/status",
    );
    expect(suggestSlashCommands("/quti").map(({ command }) => command)).toEqual([
      "/exit",
    ]);
    expect(suggestSlashCommands("/mode")).toEqual([]);
    expect(suggestSlashCommands("/totally-unrelated")).toEqual([]);
  });

  it("assists finite slash arguments without taking over free-form values", () => {
    const values = (input: string, cursor = input.length) =>
      slashInputAssist(input, cursor).suggestions.map(
        ({ completion }) => completion,
      );

    expect(values("/ti")).toEqual(["/tier"]);
    expect(values("/tier ")).toEqual(["auto", "light", "medium", "heavy"]);
    expect(slashInputAssist("/tier ").canSubmit).toBe(true);
    expect(values("/tier h")).toEqual(["heavy"]);
    expect(slashInputAssist("/tier h").canSubmit).toBe(false);
    expect(slashInputAssist("/tier heavy").canSubmit).toBe(true);
    expect(values("/help ")).toEqual([
      "commands",
      "shortcuts",
      "getting-started",
    ]);
    expect(values("/help sh")).toEqual(["shortcuts"]);
    expect(slashInputAssist("/help").canSubmit).toBe(true);
    expect(slashInputAssist("/help shortcuts").canSubmit).toBe(true);
    expect(values("/usage ")).toEqual(["verbose"]);
    expect(values("/usage v")).toEqual(["verbose"]);
    expect(slashInputAssist("/usage verbose").canSubmit).toBe(true);
    expect(values("/copy ")).toEqual([
      "latest",
      "previous",
      "all",
    ]);
    expect(slashInputAssist("/copy 3").canSubmit).toBe(true);

    expect(values("/settings agent ")).toEqual([
      "profile",
      "role",
      "effort",
      "review",
      "helpers",
      "depth",
      "recovery",
    ]);
    expect(values("/settings appearance ")).toEqual([
      "screen",
      "theme",
      "color",
      "motion",
      "rich-text",
    ]);
    expect(values("/settings appearance theme ")).toEqual([
      "quiet-studio",
      "monochrome",
    ]);
    expect(values("/settings appearance screen ")).toEqual([
      "auto",
      "fullscreen",
      "inline",
    ]);
    expect(values("/settings clipboard ")).toEqual([
      "show",
      "reset",
      "copy-on-select",
    ]);
    expect(values("/settings clipboard copy-on-select ")).toEqual([
      "on",
      "off",
    ]);
    expect(values("/settings statusline ")).toEqual([
      "show",
      "reset",
      "set",
      "context-format",
    ]);
    expect(values("/settings statusline set model ")).toEqual([
      "on",
      "off",
    ]);
    expect(values("/settings statusline set context ")).toEqual([
      "on",
      "off",
    ]);
    expect(values("/settings statusline set quota ")).toEqual([
      "on",
      "off",
    ]);
    expect(values("/settings statusline context-format ")).toEqual([
      "tokens",
      "percent",
    ]);
    expect(
      values("/settings agent role coordinator gpt-5.6-sol "),
    ).toEqual(["minimal", "none", "low", "medium", "high", "xhigh"]);
    expect(
      slashInputAssist(
        "/settings agent role coordinator gpt-5.6-sol ",
      ).canSubmit,
    ).toBe(true);
    expect(
      values("/settings intelligence subagents concurrency "),
    ).toEqual(["1", "2", "3", "4"]);

    expect(values("/skills ")).toEqual([
      "list",
      "auto",
      "use",
      "remove",
      "clear",
    ]);
    expect(values("/goal --c")).toEqual(["--clear"]);
    expect(slashInputAssist("/goal --c").canSubmit).toBe(false);
    expect(values("/goal audit repository safety")).toEqual([]);
    expect(slashInputAssist("/goal audit repository safety").canSubmit).toBe(
      true,
    );
    expect(values("/resume lat")).toEqual(["latest"]);
    expect(values("/model ")).toEqual([]);
    expect(values("/effort ")).toEqual([]);
    expect(
      values("/settings intelligence memory token-budget "),
    ).toEqual([]);
  });

  it("returns cursor-aware replacement spans for argument completion", () => {
    const input = "/settings appearance co off";
    const cursor = input.indexOf("co") + 2;
    const suggestion = slashInputAssist(input, cursor).suggestions[0];

    expect(suggestion).toMatchObject({
      completion: "color",
      replaceStart: input.indexOf("co"),
      replaceEnd: input.indexOf("co") + 2,
      appendSpace: true,
    });
    expect(
      `${input.slice(0, suggestion?.replaceStart)}${suggestion?.completion}${input.slice(suggestion?.replaceEnd)}`,
    ).toBe("/settings appearance color off");
  });

  it("renders typo suggestions and exact usage failures safely", () => {
    expect(renderUnknownCommand("/seittings")).toBe(
      "Unknown command: /seittings. Did you mean /settings?",
    );
    expect(renderUnknownCommand("/repo")).toBe("Usage: /repo <path>");
    expect(renderUnknownCommand("/unknown")).toBe(
      "Unknown command: /unknown. Use /help.",
    );
    expect(renderUnknownCommand("/bad\u001b[2J")).toContain("\\u001b[2J");
  });

  it("renders a guided, safety-explicit welcome without requiring color", () => {
    const welcome = renderWelcome(
      {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
      },
      { color: false, width: 100 },
    );

    expect(welcome).toContain("ORYNT");
    expect(welcome).toContain("/work/orynt");
    expect(welcome).toContain("An agent that just works.");
    expect(welcome).toContain("✓ Codex ready");
    expect(welcome).toContain("› Fixed model");
    expect(welcome).toContain("Chat is read-only · risky changes ask first");
    expect(welcome).toContain(
      "Try: explain this repo · fix a test · check readiness",
    );
    expect(welcome).toContain("/help commands · /status details");
    expect(welcome).not.toContain("\u001b[");
  });

  it("adds rich semantic styling without changing welcome text", () => {
    const state = {
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high" as const,
      providerReady: true,
    };
    const plain = renderWelcome(state, { color: false, width: 100 });
    const colored = renderWelcome(state, { color: true, width: 100 });

    expect(stripAnsi(colored)).toBe(plain);
    expect(colored).toContain("\u001b[1;38;2;198;167;216mORYNT\u001b[0m");
    expect(colored).toContain("\u001b[38;2;143;182;232m›\u001b[0m");
    expect(colored).toContain(
      "\u001b[4;38;2;143;182;232m/work/orynt\u001b[0m",
    );
    expect(colored).toContain(
      "\u001b[38;2;198;167;216mFixed model\u001b[0m",
    );
    expect(colored).toContain("\u001b[2mAn agent that just works.\u001b[0m");
  });

  it("adapts repository, safety, examples, and shortcuts to narrow terminals", () => {
    const welcome = renderWelcome(
      {
        repositoryPath: "/work/projects/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        orchestrationProfile: {
          ...DEFAULT_CLI_ORCHESTRATION_PROFILE,
          preset: "auto",
        },
        providerReady: false,
      },
      { color: false, width: 36 },
    );

    expect(welcome).toContain("ORYNT › orynt");
    expect(welcome).toContain("! Codex needs setup · /setup");
    expect(welcome).toContain("› Auto picks the model");
    expect(welcome).toContain("◇ Chat is read-only\n  Risky changes ask first");
    expect(welcome).toContain("Try: explain this repo");
    expect(welcome).not.toContain("fix a test");
    expect(welcome).toContain("/help commands\n/status details");
  });

  it("escapes terminal controls and bidi overrides in dynamic UI values", () => {
    expect(terminalSafeText("safe\u001b[2J\r\n\u061c\u200e\u200f\u202eunsafe")).toBe(
      "safe\\u001b[2J\\r\\n\\u061c\\u200e\\u200f\\u202eunsafe",
    );
    const welcome = renderWelcome(
      {
        repositoryPath: "/work\u001b[2J/orynt",
        modelId: "gpt\nspoof",
        thinkingEffort: "high",
        providerReady: true,
      },
      { color: false },
    );
    expect(welcome).not.toContain("\u001b");
    expect(welcome).toContain("\\u001b");

    const colored = renderWelcome(
      {
        repositoryPath: "/work\u001b]52;c;owned\u0007/orynt",
        modelId: "gpt\u001b[0mspoof",
        thinkingEffort: "high",
        providerReady: true,
      },
      { color: true },
    );
    const stripped = stripAnsi(colored);
    expect(stripped).not.toContain("\u001b");
    expect(stripped).not.toContain("\u0007");
    expect(stripped).toContain("\\u001b]52;c;owned\\u0007");
  });

  it("turns an oscillating runtime trace into monotonic milestones and one final report", () => {
    const presenter = new RunPresenter({
      color: false,
      activityDetails: "full",
    });
    const events = [
      { type: "run_started", payload: { summary: "started" } },
      { type: "sandbox_create_allowed", payload: { summary: "allowed" } },
      { type: "verification_planned", payload: { summary: "planned early" } },
      { type: "codex_execution_approval_required", payload: { summary: "audit approval" } },
      { type: "codex_execution_started", payload: { summary: "running" } },
      {
        type: "codex_reasoning_summary",
        payload: {
          itemId: "reason-1",
          status: "completed",
          text: "Inspecting the repository",
        },
      },
      {
        type: "codex_tool_activity",
        payload: {
          itemId: "tool-1",
          status: "completed",
          toolKind: "command",
          detail: "bun test",
        },
      },
      {
        type: "codex_agent_message",
        payload: { message: "Interim update", streamEventType: "item.updated" },
      },
      {
        type: "codex_execution_finished",
        payload: {
          summary: "finished",
          lastMessagePreview: "Updated the CLI.\n\nValidation passed.",
        },
      },
      { type: "codex_result_import_requested", payload: { summary: "import" } },
      {
        type: "codex_sandbox_diff_inspected",
        payload: {
          changedFiles: [
            "packages/cli/src/ui.ts",
            ".codex/orynt-beta-verify.mjs",
            ".codex\\orynt-beta-verify.mjs",
          ],
        },
      },
      { type: "verification_started", payload: { summary: "verify" } },
      { type: "approval_required", payload: { summary: "internal audit" } },
      { type: "verification_passed", payload: { summary: "All checks passed" } },
      { type: "memory_extraction_started", payload: { summary: "memory" } },
    ] as const;

    const progress = events.flatMap((event) => presenter.present(event));

    expect(progress).toEqual([
      "  ◇ Prepare   Creating isolated worktree and contract",
      "  ◇ Run       Codex working inside repository sandbox",
      "  ◇ Think     Inspecting the repository",
      "  ▶ Run       bun test",
      "  ◇ Verify    Running policy and verifier checks",
    ]);
    expect(progress.join("\n")).not.toContain("Approval");
    expect(progress.join("\n")).not.toContain("Interim update");

    const completion = renderRunCompletion(
      {
        runId: "run-1",
        status: "pass",
        summary: "All checks passed",
        verification: "passed",
        evidenceCount: 4,
        artifactManifestPath: "/artifacts/manifest.json",
        repositoryDiff: {
          available: true,
          totals: {
            files: 2,
            additions: 4,
            deletions: 1,
            binaryFiles: 0,
          },
          truncated: false,
        },
        interactive: true,
      },
      presenter.snapshot(),
      { color: false },
    );

    expect(completion).toContain("✓ Done");
    expect(completion).toContain("Agent report");
    expect(completion).toContain("  Updated the CLI.\n  \n  Validation passed.");
    expect(completion).toContain("Changes · 2 files · +4/-1");
    expect(completion).toContain("Use /diff");
    expect(completion).toContain("packages/cli/src/ui.ts");
    expect(completion).not.toContain(".codex/orynt-beta-verify.mjs");
    expect(completion).toContain(".codex\\\\orynt-beta-verify.mjs");
    expect(completion).toContain("Passed · All checks passed");
    expect(completion).toContain("4 artifacts · /artifacts/manifest.json");
  });

  it("filters human activity without changing the captured run summary", () => {
    const events = [
      { type: "run_started", payload: {} },
      { type: "codex_execution_started", payload: {} },
      {
        type: "codex_reasoning_summary",
        payload: {
          itemId: "reason-1",
          status: "completed",
          text: "Inspecting repository state",
        },
      },
      { type: "verification_started", payload: {} },
      {
        type: "verification_passed",
        payload: { summary: "All checks passed" },
      },
    ] as const;
    const render = (activityDetails: "off" | "important" | "full") => {
      const presenter = new RunPresenter({
        color: false,
        activityDetails,
      });
      return {
        output: events.flatMap((event) => presenter.present(event)),
        snapshot: presenter.snapshot(),
      };
    };

    expect(render("off").output).toEqual([]);
    expect(render("important").output).toEqual([
      "  ◇ Prepare   Creating isolated worktree and contract",
      "  ◇ Run       Codex working inside repository sandbox",
      "  ◇ Verify    Running policy and verifier checks",
    ]);
    expect(render("full").output).toContain(
      "  ◇ Think     Inspecting repository state",
    );
    expect(render("off").snapshot.verifierSummary).toBe("All checks passed");
  });

  it("renders semantic tool glyphs and deduplicates completed activity", () => {
    const presenter = new RunPresenter({
      color: false,
      activityDetails: "full",
    });
    const events = [
      {
        type: "codex_tool_activity",
        payload: {
          itemId: "read-1",
          status: "completed",
          toolKind: "other",
          toolName: "repo_read",
          detail: "README.md",
        },
      },
      {
        type: "codex_tool_activity",
        payload: {
          itemId: "read-1",
          status: "completed",
          toolKind: "other",
          toolName: "repo_read",
          detail: "README.md",
        },
      },
      {
        type: "codex_tool_activity",
        payload: {
          itemId: "edit-1",
          status: "completed",
          toolKind: "file_change",
          toolName: "file_change",
          detail: "packages/cli/src/ui.ts",
        },
      },
      {
        type: "codex_tool_activity",
        payload: {
          itemId: "web-1",
          status: "completed",
          toolKind: "web_search",
          toolName: "web_search",
          detail: "Orynt terminal activity",
        },
      },
      {
        type: "codex_tool_activity",
        payload: {
          itemId: "mcp-1",
          status: "failed",
          toolKind: "mcp",
          toolName: "github.search",
          detail: "github.search",
        },
      },
    ] as const;

    expect(events.flatMap((event) => presenter.present(event))).toEqual([
      "  ▤ Read      README.md",
      "  ✎ Edit      packages/cli/src/ui.ts",
      "  ◎ Web       Orynt terminal activity",
      "  ✕ MCP       github.search · failed",
    ]);
    expect(presenter.snapshot()).toMatchObject({
      toolCallCount: 4,
      failedToolCallCount: 1,
    });
  });

  it("preserves multiline report layout and printable punctuation while escaping controls", () => {
    expect(terminalSafeMultilineText('quote "x" and path C:\\tmp\r\nnext')).toBe(
      'quote "x" and path C:\\tmp\nnext',
    );
    const presenter = new RunPresenter({ color: false });
    presenter.present({
      type: "codex_execution_finished",
      payload: {
        lastMessagePreview:
          "agent\u001b]52;c;owned\u0007\r\n\u061c\u200e\u200f\u202espoof",
      },
    });
    presenter.present({
      type: "verification_failed",
      payload: { summary: "failed\u001b[H\nverify" },
    });

    const rendered = renderRunCompletion(
      {
        status: "fail",
        verification: "failed",
        interactive: true,
      },
      presenter.snapshot(),
      { color: false },
    );

    expect(rendered).not.toContain("\u001b");
    expect(rendered).not.toContain("\r");
    expect(rendered).not.toContain("\u061c");
    expect(rendered).not.toContain("\u200e");
    expect(rendered).not.toContain("\u200f");
    expect(rendered).not.toContain("\u202e");
    expect(rendered).toContain("agent\\u001b]52;c;owned\\u0007");
    expect(rendered).toContain("\\u061c\\u200e\\u200f\\u202espoof");
    expect(rendered).toContain("Agent report · unverified");
    expect(rendered).toContain("Use /verify and /evidence");
  });

  it("renders a bounded redacted repository diff and warns for unverified runs", () => {
    const rendered = renderRepositoryDiff(
      {
        schemaVersion: 1,
        runId: "run-diff",
        taskId: "task-diff",
        baseRef: "HEAD",
        redacted: true,
        redactionCount: 1,
        truncated: false,
        maxBytes: 2 * 1024 * 1024,
        totals: { files: 1, additions: 1, deletions: 1, binaryFiles: 0 },
        files: [{
          path: "packages/value.txt",
          status: "modified",
          additions: 1,
          deletions: 1,
          binary: false,
          patch: "@@ -1 +1 @@\n-old\u001b[2J\n+[REDACTED]",
          truncated: false,
        }],
        generatedAt: "2026-08-03T00:00:00.000Z",
      },
      {
        color: false,
        verification: "failed",
        artifactPath: "/artifacts/repository-diff.json",
        filePath: "packages/value.txt",
      },
    );

    expect(rendered).toContain("Diff · Unverified · 1 file · +1/-1");
    expect(rendered).toContain("Warning · this patch did not receive");
    expect(rendered).toContain("-old\\u001b[2J");
    expect(rendered).toContain("+[REDACTED]");
    expect(rendered).not.toContain("\u001b");
  });

  it("renders repository diff hierarchy and full-row semantic change backgrounds", () => {
    const rendered = renderRepositoryDiff(
      {
        schemaVersion: 1,
        runId: "run-colored-diff",
        taskId: "task-colored-diff",
        baseRef: "HEAD",
        redacted: true,
        redactionCount: 0,
        truncated: false,
        maxBytes: 2 * 1024 * 1024,
        totals: { files: 1, additions: 1, deletions: 1, binaryFiles: 0 },
        files: [{
          path: "packages/cli/src/value.ts",
          status: "modified",
          additions: 1,
          deletions: 1,
          binary: false,
          patch: [
            "diff --git a/packages/cli/src/value.ts b/packages/cli/src/value.ts",
            "index 1111111..2222222 100644",
            "--- a/packages/cli/src/value.ts",
            "+++ b/packages/cli/src/value.ts",
            "@@ -1,2 +1,2 @@",
            "-const value = 1;",
            "+const value = 2;",
            " export { value };",
          ].join("\n"),
          truncated: false,
        }],
        generatedAt: "2026-08-04T00:00:00.000Z",
      },
      {
        color: true,
        verification: "passed",
        artifactPath: "/artifacts/repository-diff.json",
      },
    );

    expect(rendered).toContain(
      "\u001b[1mDiff · Verified · 1 file · +1/-1\u001b[0m",
    );
    expect(rendered).toContain(
      "\u001b[2;3mArtifact · /artifacts/repository-diff.json · redacted\u001b[0m",
    );
    expect(rendered).toContain(
      "\u001b[1mM packages/cli/src/value.ts · +1/-1\u001b[0m",
    );
    expect(rendered).toContain(
      "\u001b[2;3;38;2;143;182;232m@@ -1,2 +1,2 @@\u001b[0m",
    );
    expect(rendered).toContain(
      "\u001b[7;38;2;223;114;114m-const value = 1;\u001b[K\u001b[0m",
    );
    expect(rendered).toContain(
      "\u001b[7;38;2;120;201;155m+const value = 2;\u001b[K\u001b[0m",
    );
    expect(rendered).toContain(
      "\u001b[2;3m+++ b/packages/cli/src/value.ts\u001b[0m",
    );
    expect(rendered.endsWith("\n export { value };")).toBe(true);
  });

  it("truncates repository diff previews without hiding the artifact path", () => {
    const patch = Array.from(
      { length: 310 },
      (_, index) => `+line ${index + 1}`,
    ).join("\n");
    const rendered = renderRepositoryDiff(
      {
        schemaVersion: 1,
        runId: "run-large",
        taskId: "task-large",
        baseRef: "HEAD",
        redacted: true,
        redactionCount: 0,
        truncated: false,
        maxBytes: 2 * 1024 * 1024,
        totals: { files: 1, additions: 310, deletions: 0, binaryFiles: 0 },
        files: [{
          path: "large.txt",
          status: "modified",
          additions: 310,
          deletions: 0,
          binary: false,
          patch,
          truncated: false,
        }],
        generatedAt: "2026-08-03T00:00:00.000Z",
      },
      {
        color: false,
        verification: "passed",
        artifactPath: "/artifacts/repository-diff.json",
      },
    );

    expect(rendered).toContain("Preview truncated");
    expect(rendered).toContain("/artifacts/repository-diff.json");
    expect(rendered).not.toContain("+line 310");
  });

  it("does not repeat an agent report that was already streamed", () => {
    const presenter = new RunPresenter({ color: false });
    presenter.present({
      type: "codex_execution_finished",
      payload: { lastMessagePreview: "Already streamed." },
    });
    presenter.markAgentResponseStreamed();

    const completion = renderRunCompletion(
      {
        runId: "run-streamed",
        status: "pass",
        verification: "passed",
        interactive: true,
      },
      presenter.snapshot(),
      { color: false },
    );

    expect(completion).not.toContain("Agent report");
    expect(completion).not.toContain("Already streamed.");
  });

  it("never renders a success state when review or a failure event is present", () => {
    const reviewPresenter = new RunPresenter({ color: false });
    reviewPresenter.present({
      type: "manual_review_required",
      payload: { summary: "Changed paths require operator review" },
    });
    const reviewCompletion = renderRunCompletion(
      {
        status: "pass",
        verification: "passed",
        interactive: true,
      },
      reviewPresenter.snapshot(),
      { color: false },
    );

    expect(reviewCompletion).toContain("! Done");
    expect(reviewCompletion).not.toContain("✓ Done");
    expect(reviewCompletion).toContain("Changed paths require operator review");

    const failedPresenter = new RunPresenter({ color: false });
    failedPresenter.present({
      type: "policy_violation",
      payload: { summary: "Managed verifier integrity check failed" },
    });
    const failedCompletion = renderRunCompletion(
      {
        status: "pass",
        verification: "passed",
        interactive: false,
      },
      failedPresenter.snapshot(),
      { color: false },
    );

    expect(failedCompletion).toContain("✕ Done");
    expect(failedCompletion).not.toContain("✓ Done");
    expect(failedCompletion).toContain("Managed verifier integrity check failed");
  });

  it("clears a verifier-only failure after a bounded recovery passes", () => {
    const presenter = new RunPresenter({ color: false });
    presenter.present({
      type: "verification_failed",
      payload: { summary: "Initial verifier failed" },
    });
    presenter.present({
      type: "verification_passed",
      payload: { summary: "Recovery verifier passed" },
    });

    const rendered = renderRunCompletion(
      {
        runId: "run-recovered",
        status: "pass",
        verification: "passed",
        interactive: true,
      },
      presenter.snapshot(),
      { color: false },
    );

    expect(rendered).toContain("✓ Done");
    expect(rendered).toContain("Recovery verifier passed");
    expect(rendered).not.toContain("Initial verifier failed");
  });

  it("renders verification failure before an earlier manual-review warning", () => {
    const presenter = new RunPresenter({ color: false });
    presenter.present({
      type: "manual_review_required",
      payload: { summary: "Changed paths require operator review" },
    });
    presenter.present({
      type: "verification_failed",
      payload: { summary: "Verification command failed" },
    });

    const completion = renderRunCompletion(
      {
        status: "fail",
        verification: "failed",
        interactive: true,
      },
      presenter.snapshot(),
      { color: false },
    );

    expect(completion).toContain("✕ Done");
    expect(completion).toContain("Verification command failed");
    expect(completion).not.toContain("! Done");
  });

  it("colors only the completion icon while preserving exact plain output", () => {
    const cases = [
      {
        completion: {
          status: "pass",
          verification: "passed",
          interactive: true,
        },
        presentation: {},
        sequence: "\u001b[38;2;120;201;155m✓\u001b[0m Done",
      },
      {
        completion: {
          status: "manual_review_required",
          verification: "passed",
          interactive: true,
        },
        presentation: { manualReviewSummary: "Review required" },
        sequence: "\u001b[38;2;212;169;79m!\u001b[0m Done",
      },
      {
        completion: {
          status: "fail",
          verification: "failed",
          interactive: true,
        },
        presentation: { failureSummary: "Verification failed" },
        sequence: "\u001b[38;2;223;114;114m✕\u001b[0m Done",
      },
    ] as const;

    for (const testCase of cases) {
      const plain = renderRunCompletion(
        testCase.completion,
        testCase.presentation,
        { color: false },
      );
      const colored = renderRunCompletion(
        testCase.completion,
        testCase.presentation,
        { color: true },
      );

      expect(stripAnsi(colored)).toBe(plain);
      expect(colored).toContain(testCase.sequence);
    }
  });
});
