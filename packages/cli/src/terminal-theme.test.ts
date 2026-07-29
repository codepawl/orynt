import { describe, expect, it } from "vitest";

import {
  createTerminalTheme,
  resolveTerminalColor,
  terminalColorRequested,
  terminalMotionRequested,
} from "./terminal-theme";

describe("terminal theme", () => {
  it("maps minimal semantic roles to the Orynt palette", () => {
    const theme = createTerminalTheme(true);

    expect(theme.paint("focus", "›")).toBe(
      "\u001b[38;2;143;182;232m›\u001b[0m",
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
    expect(theme.paint("muted", "metadata")).toBe(
      "\u001b[2mmetadata\u001b[0m",
    );
    expect(theme.strong("ORYNT")).toBe("\u001b[1mORYNT\u001b[0m");
  });

  it("is byte-identical when disabled and leaves empty spans empty", () => {
    const theme = createTerminalTheme(false);

    expect(theme.paint("focus", "界")).toBe("界");
    expect(theme.paint("success", "")).toBe("");
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
});
