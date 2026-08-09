import { describe, expect, it } from "bun:test";

import {
  createTerminalTheme,
  resolveTerminalAppearance,
  resolveTerminalColor,
  terminalColorRequested,
  terminalMotionRequested,
  terminalScreenModeRequested,
  terminalThemeRequested,
} from "./terminal-theme";

describe("terminal theme", () => {
  it("maps minimal semantic roles to the Orynt palette", () => {
    const theme = createTerminalTheme(true);

    expect(theme.paint("focus", "›")).toBe(
      "\u001b[38;2;143;182;232m›\u001b[0m",
    );
    expect(theme.paint("heading", "Settings")).toBe(
      "\u001b[1;38;2;198;167;216mSettings\u001b[0m",
    );
    expect(theme.paint("model", "gpt-5.6-sol")).toBe(
      "\u001b[38;2;198;167;216mgpt-5.6-sol\u001b[0m",
    );
    expect(theme.paint("count", "4 files")).toBe(
      "\u001b[38;2;216;181;106m4 files\u001b[0m",
    );
    expect(theme.paint("command", "/status")).not.toContain("[48;");
    expect(theme.paint("agent", "Agent ›")).toBe(
      "\u001b[38;2;198;196;191mAgent ›\u001b[0m",
    );
    expect(theme.paint("success", "✓")).toBe(
      "\u001b[38;2;120;201;155m✓\u001b[0m",
    );
    expect(theme.paint("attention", "!")).toBe(
      "\u001b[38;2;212;169;79m!\u001b[0m",
    );
    expect(theme.paint("danger", "✕")).toBe(
      "\u001b[38;2;223;114;114m✕\u001b[0m",
    );
    expect(theme.paint("contextHealthy", "ctx")).toContain("120;201;155");
    expect(theme.paint("contextWarning", "ctx")).toContain("212;169;79");
    expect(theme.paint("contextCompact", "ctx")).toContain("224;143;77");
    expect(theme.paint("contextCritical", "ctx")).toContain("223;114;114");
    expect(theme.paint("muted", "metadata")).toBe(
      "\u001b[2mmetadata\u001b[0m",
    );
    expect(theme.paint("metadata", "artifact")).toBe(
      "\u001b[2;3martifact\u001b[0m",
    );
    expect(theme.paint("diffHunk", "@@ -1 +1 @@")).toBe(
      "\u001b[2;3;38;2;143;182;232m@@ -1 +1 @@\u001b[0m",
    );
    expect(theme.paintRow("diffAdded", "+added")).toBe(
      "\u001b[7;38;2;120;201;155m+added\u001b[K\u001b[0m",
    );
    expect(theme.paintRow("diffRemoved", "-removed")).toBe(
      "\u001b[7;38;2;223;114;114m-removed\u001b[K\u001b[0m",
    );
    expect(theme.paintRow("helpHeading", " Commands")).toBe(
      "\u001b[1;38;2;28;31;38;48;2;198;167;216m Commands\u001b[K\u001b[0m",
    );
    expect(
      theme.paintRenderedRow(
        "userMessage",
        "You › \u001b[1mbold\u001b[0m",
      ),
    ).toBe(
      "\u001b[38;2;52;64;84;48;2;238;241;245mYou › \u001b[1mbold\u001b[0m\u001b[38;2;52;64;84;48;2;238;241;245m\u001b[K\u001b[0m",
    );
    expect(theme.strong("ORYNT")).toBe("\u001b[1mORYNT\u001b[0m");
  });

  it("ships a terminal-native monochrome theme while retaining semantic state color", () => {
    const theme = createTerminalTheme(true, "monochrome");

    expect(theme.paint("user", "You ›")).toBe(
      "\u001b[1mYou ›\u001b[0m",
    );
    expect(theme.paint("path", "packages/cli")).toBe(
      "\u001b[4mpackages/cli\u001b[0m",
    );
    expect(theme.paint("agent", "Agent ›")).toBe("Agent ›");
    expect(theme.paint("success", "✓")).toBe(
      "\u001b[38;2;120;201;155m✓\u001b[0m",
    );
    expect(theme.paintRow("diffAdded", "+added")).toBe(
      "\u001b[7;38;2;120;201;155m+added\u001b[K\u001b[0m",
    );
    expect(theme.paintRow("helpHeading", " Commands")).toBe(
      "\u001b[1;7m Commands\u001b[K\u001b[0m",
    );
    expect(theme.paintRenderedRow("userMessage", "You › hello")).toBe(
      "\u001b[38;5;238;48;5;255mYou › hello\u001b[K\u001b[0m",
    );
  });

  it("is byte-identical when disabled and leaves empty spans empty", () => {
    const theme = createTerminalTheme(false);

    expect(theme.paint("focus", "界")).toBe("界");
    expect(theme.paint("success", "")).toBe("");
    expect(theme.paintRow("diffAdded", "+界")).toBe("+界");
    expect(theme.paintRow("diffRemoved", "")).toBe("");
    expect(theme.paintRow("helpHeading", " Commands")).toBe(" Commands");
    expect(theme.paintRenderedRow("userMessage", "You › plain")).toBe(
      "You › plain",
    );
    expect(theme.strong("ORYNT")).toBe("ORYNT");
  });

  it("rejects nested or injected ANSI spans", () => {
    const theme = createTerminalTheme(true);

    expect(() => theme.paint("focus", "\u001b[2Junsafe")).toThrow(
      "must not contain terminal controls",
    );
    expect(() => theme.paint("focus", "\u009b2Junsafe")).toThrow(
      "must not contain terminal controls",
    );
    expect(() => theme.paintRow("diffAdded", "\u001b[2Junsafe")).toThrow(
      "must not contain terminal controls",
    );
    expect(() =>
      theme.paintRenderedRow("userMessage", "\u001b[2Junsafe")
    ).toThrow("only SGR styling controls");
  });

  it("respects TTY, explicit plain output, and any present NO_COLOR value", () => {
    expect(resolveTerminalColor({ isTTY: true, env: {} })).toBe(true);
    expect(
      resolveTerminalColor({ isTTY: true, requested: false, env: {} }),
    ).toBe(false);
    expect(resolveTerminalColor({ isTTY: false, env: {} })).toBe(false);
    expect(
      resolveTerminalColor({ isTTY: true, env: { NO_COLOR: "" } }),
    ).toBe(false);
    expect(
      resolveTerminalColor({ isTTY: true, env: { NO_COLOR: "1" } }),
    ).toBe(false);
  });

  it("resolves saved appearance below terminal and launch overrides", () => {
    expect(
      resolveTerminalAppearance({
        isTTY: true,
        saved: { color: false, motion: true, richText: true },
        argv: [],
        env: {},
      }),
    ).toEqual({
      color: false,
      motion: true,
      richText: true,
      themeId: "quiet-studio",
      screenMode: "fullscreen",
      screenOverride: "auto",
    });
    expect(
      resolveTerminalAppearance({
        isTTY: true,
        saved: { color: true, motion: true, richText: true },
        argv: ["--plain"],
        env: {},
      }),
    ).toEqual({
      color: false,
      motion: false,
      richText: false,
      themeId: "quiet-studio",
      screenMode: "inline",
      colorOverride: "--plain",
      motionOverride: "--plain",
      richTextOverride: "--plain",
      screenOverride: "--plain",
    });
    expect(
      resolveTerminalAppearance({
        isTTY: true,
        saved: { color: true, motion: true, richText: true },
        argv: [],
        env: { NO_COLOR: "" },
      }),
    ).toEqual({
      color: false,
      motion: true,
      richText: true,
      themeId: "quiet-studio",
      screenMode: "fullscreen",
      screenOverride: "auto",
      colorOverride: "NO_COLOR",
    });
  });

  it("resolves and validates one-launch theme overrides before the option terminator", () => {
    expect(
      resolveTerminalAppearance({
        isTTY: true,
        saved: {
          color: true,
          motion: true,
          richText: true,
          themeId: "quiet-studio",
        },
        argv: ["--theme", "monochrome"],
        env: {},
      }),
    ).toMatchObject({
      themeId: "monochrome",
      themeOverride: "--theme",
    });
    expect(terminalThemeRequested(["--", "--theme", "monochrome"]))
      .toBeUndefined();
    expect(() => terminalThemeRequested(["--theme", "unknown"]))
      .toThrow("Valid themes: quiet-studio, monochrome");
    expect(() => terminalThemeRequested(["--theme"]))
      .toThrow("--theme requires a value");
  });

  it("stops interpreting color flags after the option terminator", () => {
    expect(terminalColorRequested(["--plain", "prompt"])).toBe(false);
    expect(terminalColorRequested(["--no-color", "prompt"])).toBe(false);
    expect(terminalColorRequested(["--", "--plain"])).toBe(true);
    expect(terminalColorRequested(["message", "--", "--no-color"])).toBe(true);
  });

  it("keeps motion for no-color and disables terminal control animation only for plain output", () => {
    expect(terminalMotionRequested(["--no-color"])).toBe(true);
    expect(terminalMotionRequested(["--plain"])).toBe(false);
    expect(terminalMotionRequested(["--", "--plain"])).toBe(true);
  });

  it("resolves screen modes with explicit compatibility fallbacks", () => {
    expect(terminalScreenModeRequested(["--screen", "inline"])).toBe("inline");
    expect(terminalScreenModeRequested(["--", "--screen", "inline"]))
      .toBeUndefined();
    expect(() => terminalScreenModeRequested(["--screen", "bad"]))
      .toThrow("Valid modes: auto, fullscreen, inline");
    expect(() =>
      resolveTerminalAppearance({
        isTTY: true,
        saved: {
          color: true,
          motion: true,
          richText: true,
          screenMode: "auto",
        },
        argv: ["--plain", "--screen", "fullscreen"],
        env: {},
      })
    ).toThrow("--plain cannot be combined");
    expect(
      resolveTerminalAppearance({
        isTTY: true,
        saved: {
          color: true,
          motion: true,
          richText: true,
          screenMode: "fullscreen",
        },
        argv: [],
        env: { TERM: "dumb" },
      }),
    ).toMatchObject({
      screenMode: "inline",
      screenOverride: "TERM=dumb",
    });
    expect(
      resolveTerminalAppearance({
        isTTY: true,
        saved: {
          color: true,
          motion: true,
          richText: true,
          screenMode: "auto",
        },
        argv: [],
        env: { TERM_PROGRAM: "Orca" },
      }),
    ).toMatchObject({
      screenMode: "inline",
      screenOverride: "TERM_PROGRAM=Orca",
    });
    expect(
      resolveTerminalAppearance({
        isTTY: true,
        saved: {
          color: true,
          motion: true,
          richText: true,
          screenMode: "fullscreen",
        },
        argv: [],
        env: { TERM_PROGRAM: "orca" },
      }),
    ).toMatchObject({
      screenMode: "fullscreen",
    });
    expect(
      resolveTerminalAppearance({
        isTTY: true,
        saved: {
          color: true,
          motion: true,
          richText: true,
          screenMode: "auto",
        },
        argv: ["--screen", "fullscreen"],
        env: { TERM_PROGRAM: "Orca" },
      }),
    ).toMatchObject({
      screenMode: "fullscreen",
      screenOverride: "--screen",
    });
  });
});
