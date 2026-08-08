import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "bun:test";
import type { ProviderUsageSnapshotV1 } from "@codepawl/model-runtime";
import type { ContextLifecycleSnapshotV1 } from "@codepawl/shared";

import {
  CLEAR_PENDING_INPUT,
  COMPOSER_PROMPT,
  EDIT_PENDING_INPUT,
  INTERRUPTED_INPUT,
  NAVIGATE_BACK_INPUT,
  TtyComposer,
  contextMeterText,
  displayWidth,
  formatActivityElapsed,
  providerQuotaText,
} from "./composer";
import type {
  CliClipboardPreferences,
  CliClipboardReader,
} from "./clipboard";

function stripColor(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/gu, "");
}

const waitForInlineResize = () =>
  new Promise((resolve) => setTimeout(resolve, 100));

function terminalScreen(transcript: string): string {
  const lines = [""];
  let row = 0;
  let column = 0;
  const ensureRow = () => {
    while (lines.length <= row) lines.push("");
  };
  for (let index = 0; index < transcript.length;) {
    if (transcript[index] === "\u001b") {
      if (transcript[index + 1] === "c") {
        lines.splice(0, lines.length, "");
        row = 0;
        column = 0;
        index += 2;
        continue;
      }
      const match = transcript.slice(index).match(/^\u001b\[([0-9;?]*)([A-Za-z])/);
      if (match) {
        const amount = Number.parseInt(match[1]?.split(";")[0] || "1", 10);
        if (match[2] === "A") row = Math.max(0, row - amount);
        if (match[2] === "B") {
          row += amount;
          ensureRow();
        }
        if (match[2] === "C") column += amount;
        if (match[2] === "K" && match[1] === "2") {
          ensureRow();
          lines[row] = "";
        }
        if (match[2] === "K" && !match[1]) {
          ensureRow();
          lines[row] = (lines[row] ?? "").slice(0, column);
        }
        if (match[2] === "J" && (!match[1] || match[1] === "0")) {
          ensureRow();
          lines[row] = (lines[row] ?? "").slice(0, column);
          lines.splice(row + 1);
        }
        index += match[0].length;
        continue;
      }
    }
    const character = String.fromCodePoint(transcript.codePointAt(index) ?? 0);
    index += character.length;
    if (character === "\r") {
      column = 0;
      continue;
    }
    if (character === "\n") {
      row += 1;
      ensureRow();
      continue;
    }
    ensureRow();
    const current = lines[row] ?? "";
    lines[row] = `${current.slice(0, column).padEnd(column)}${character}${current.slice(column + 1)}`;
    column += 1;
  }
  return lines.map((line) => line.trimEnd()).join("\n");
}

function createHarness(
  columns = 100,
  rows = 24,
  color = false,
  motion = true,
  fullscreen = false,
  clipboard?: CliClipboardReader,
  clipboardPreferences?: CliClipboardPreferences,
) {
  const input = new PassThrough() as PassThrough & {
    isRaw: boolean;
    setRawMode: (enabled: boolean) => void;
  };
  input.isRaw = false;
  input.setRawMode = vi.fn((enabled: boolean) => {
    input.isRaw = enabled;
  });
  const output = new PassThrough() as PassThrough & { columns: number; rows: number };
  output.columns = columns;
  output.rows = rows;
  let rendered = "";
  const chunks: string[] = [];
  output.on("data", (chunk) => {
    const value = chunk.toString();
    rendered += value;
    chunks.push(value);
  });
  const onInterrupt = vi.fn();
  const composer = new TtyComposer({
    input,
    output,
    color,
    motion,
    viewportMode: fullscreen ? "fullscreen" : "inline",
    onInterrupt,
    clipboard,
    clipboardPreferences,
  });
  return {
    composer,
    input,
    output,
    onInterrupt,
    rendered: () => rendered,
    screen: () => terminalScreen(rendered),
    chunks: () => [...chunks],
  };
}

function contextSnapshot(
  usedPercent: number,
  remainingTokens = 76_000,
  usedTokens = 124_000,
): ContextLifecycleSnapshotV1 {
  return {
    schemaVersion: 1,
    state: "healthy",
    capacity: {
      schemaVersion: 1,
      modelId: "gpt-test",
      source: "model_catalog",
      contextWindowTokens: 200_000,
      effectiveWindowTokens: 200_000,
    },
    usage: {
      schemaVersion: 1,
      current: {
        inputTokens: usedTokens,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: usedTokens,
      },
      precision: "provider",
      usedTokens,
      usedPercent,
      remainingTokens,
      observedAt: "2026-08-05T00:00:00.000Z",
    },
    thresholds: {
      warnPercent: 75,
      compactPercent: 85,
      hardPercent: 95,
    },
    providerThreadGeneration: 0,
    compactionCount: 0,
    recoveryCount: 0,
    overflowRetryCount: 0,
  };
}

describe("TTY command composer", () => {
  it("formats bounded context meters across policy thresholds", () => {
    expect(contextMeterText(undefined)).toBe("▱▱▱▱▱ unknown");
    expect(contextMeterText(contextSnapshot(0, 200_000, 0))).toBe(
      "▱▱▱▱▱ 0k/200k",
    );
    expect(contextMeterText(contextSnapshot(62))).toBe(
      "▰▰▰▱▱ 124k/200k",
    );
    expect(contextMeterText(contextSnapshot(100, 0, 200_000))).toBe(
      "▰▰▰▰▰ 200k/200k",
    );
    expect(contextMeterText(contextSnapshot(62), "percent")).toBe(
      "▰▰▰▱▱ 62%",
    );
    const effective = contextSnapshot(0, 100_000, 100_000);
    effective.capacity.contextWindowTokens = 272_000;
    effective.capacity.effectiveWindowTokens = 200_000;
    delete effective.usage.usedPercent;
    expect(contextMeterText(effective, "percent")).toBe(
      "▰▰▰▱▱ 50%",
    );
  });

  it("formats and renders at most two primary provider quota windows", async () => {
    const snapshot: ProviderUsageSnapshotV1 = {
      schemaVersion: 1,
      kind: "orynt_provider_usage",
      generatedAt: "2026-08-06T00:00:00.000Z",
      status: "ready",
      provider: {
        id: "codex",
        label: "Codex",
        transport: "app_server",
      },
      account: null,
      meters: [{
        id: "codex",
        label: "Codex",
        primary: true,
        windows: [
          {
            id: "5h",
            label: "5h",
            usedPercent: 18,
            remainingPercent: 82,
          },
          {
            id: "7d",
            label: "7d",
            usedPercent: 40,
            remainingPercent: 60,
          },
          {
            id: "30d",
            label: "30d",
            usedPercent: 50,
            remainingPercent: 50,
          },
        ],
      }],
      issues: [],
    };
    expect(providerQuotaText(snapshot)).toBe(
      "Codex · 5h 82% left · 7d 60% left",
    );
    expect(providerQuotaText(snapshot, "one-window")).toBe(
      "Codex · 5h 82% left",
    );
    const harness = createHarness(100, 8, false, false);
    harness.composer.setProviderUsage(snapshot);
    const result = harness.composer.compose(COMPOSER_PROMPT, "", {
      mode: "next",
      context: contextSnapshot(62),
    });
    expect(harness.screen()).toContain(
      "Codex · 5h 82% left · 7d 60% left",
    );
    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
  });

  it("formats live activity time from seconds through hours", () => {
    expect(formatActivityElapsed(0)).toBe("0s");
    expect(formatActivityElapsed(59_999)).toBe("59s");
    expect(formatActivityElapsed(60_000)).toBe("1m 0s");
    expect(formatActivityElapsed(3_661_000)).toBe("1h 1m 1s");
  });

  it("leaves selection, mouse wheel, and scrollback under terminal control in inline mode", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);

    expect(harness.rendered()).not.toContain("\u001b[?1049h");
    expect(harness.rendered()).not.toContain("\u001b[?1002h");
    expect(harness.rendered()).not.toContain("\u001b[?1006h");

    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
    expect(harness.rendered()).not.toContain("\u001b[?1049l");
    expect(harness.rendered()).not.toContain("\u001b[?1002l");
    expect(harness.rendered()).not.toContain("\u001b[?1006l");
  });

  it("repaints one full-screen composer frame across repeated resizes", async () => {
    const harness = createHarness(100, 12, false, false, true);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    expect(harness.chunks()[0]).toContain("\u001b[?1049h");
    expect(harness.rendered()).toContain("\u001b[?1002h");
    expect(harness.rendered()).toContain("\u001b[?1006h");

    for (const [columns, rows] of [[60, 10], [20, 5], [100, 12]]) {
      const before = harness.chunks().length;
      harness.output.columns = columns;
      harness.output.rows = rows;
      harness.output.emit("resize");
      await Promise.resolve();
      const writes = harness.chunks().slice(before);
      expect(writes).toHaveLength(1);
      expect(writes[0].match(/Try "explain this repo"/gu)).toHaveLength(1);
      expect(writes[0]).toContain("\u001b[H");
      expect(writes[0]).toContain("\u001b[J");
    }

    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
    expect(harness.chunks().at(-1)).toContain("\u001b[?1049l");
  });

  it("routes fullscreen wheel input by composer and timeline region", async () => {
    const harness = createHarness(40, 12, false, false, true);
    harness.composer.remember("older prompt");
    harness.composer.remember("newest prompt");
    const result = harness.composer.compose(
      COMPOSER_PROMPT,
      "working draft",
    );
    harness.composer.write(
      Array.from({ length: 20 }, (_, index) => `history ${index}`).join("\n"),
    );

    harness.input.write("\u001b[<64;4;12M");
    expect(harness.screen()).toContain("❯ newest prompt");
    harness.input.write("\u001b[<64;4;12M");
    expect(harness.screen()).toContain("❯ older prompt");
    harness.input.write("\u001b[<65;4;12M");
    harness.input.write("\u001b[<65;4;12M");
    expect(harness.screen()).toContain("❯ working draft");

    harness.input.write("\u001b[<64;4;1M");
    expect(harness.chunks().at(-1)).toMatch(
      /3 newer lines · Ctrl\+End to follow/u,
    );
    harness.input.write("\u001b[<65;4;1M");
    expect(harness.chunks().at(-1)).not.toMatch(
      /newer lines · Ctrl\+End to follow/u,
    );

    harness.input.write("\r");
    await expect(result).resolves.toBe("working draft");
    harness.composer.close();
  });

  it("selects chat without Shift, preserves it while scrolling, and copies explicitly or on release", async () => {
    const clipboard: CliClipboardReader = {
      read: vi.fn(async () => ({ kind: "text", text: "" })),
      writeText: vi.fn(async () => undefined),
      resolveDroppedPaths: vi.fn(async () => undefined),
    };
    const harness = createHarness(
      40,
      8,
      false,
      false,
      true,
      clipboard,
      { copyOnSelect: false },
    );
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.composer.write("alpha beta\ngamma delta\nthird line");

    harness.input.write("\u001b[<0;1;1M");
    harness.input.write("\u001b[<32;6;2M");
    harness.input.write("\u001b[<0;6;2m");
    expect(clipboard.writeText).not.toHaveBeenCalled();

    harness.input.emit("keypress", "", {
      name: "c",
      ctrl: true,
      shift: true,
      sequence: "\u001b[99;6u",
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(clipboard.writeText).toHaveBeenCalledWith(
      "alpha beta\ngamma ",
    );
    expect(harness.screen()).toContain("✓ Copied · 17 characters");

    harness.composer.setClipboardPreferences({ copyOnSelect: true });
    harness.input.write("\u001b[<0;1;3M");
    harness.input.write("\u001b[<32;5;3M");
    harness.input.write("\u001b[<0;5;3m");
    await new Promise((resolve) => setImmediate(resolve));
    expect(clipboard.writeText).toHaveBeenLastCalledWith("third");

    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
  });

  it("requires drag or repeated clicks before activating chat selection", async () => {
    const clipboard: CliClipboardReader = {
      read: vi.fn(async () => ({ kind: "text", text: "" })),
      writeText: vi.fn(async () => undefined),
      resolveDroppedPaths: vi.fn(async () => undefined),
    };
    const harness = createHarness(
      40,
      8,
      false,
      false,
      true,
      clipboard,
      { copyOnSelect: true },
    );
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.composer.write("alpha beta\ngamma delta\nthird line");
    const click = (row: number, column: number) => {
      harness.input.write(`\u001b[<0;${column};${row}M`);
      harness.input.write(`\u001b[<0;${column};${row}m`);
    };

    click(1, 2);
    await new Promise((resolve) => setImmediate(resolve));
    expect(clipboard.writeText).not.toHaveBeenCalled();

    click(1, 2);
    await new Promise((resolve) => setImmediate(resolve));
    expect(clipboard.writeText).toHaveBeenLastCalledWith("alpha");

    click(1, 2);
    await new Promise((resolve) => setImmediate(resolve));
    expect(clipboard.writeText).toHaveBeenLastCalledWith("alpha beta");

    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
  });

  it("resets repeated-click selection after time or position changes", async () => {
    const clipboard: CliClipboardReader = {
      read: vi.fn(async () => ({ kind: "text", text: "" })),
      writeText: vi.fn(async () => undefined),
      resolveDroppedPaths: vi.fn(async () => undefined),
    };
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const harness = createHarness(
      40,
      8,
      false,
      false,
      true,
      clipboard,
      { copyOnSelect: true },
    );
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.composer.write("alpha beta");
    const click = (column: number) => {
      harness.input.write(`\u001b[<0;${column};1M`);
      harness.input.write(`\u001b[<0;${column};1m`);
    };

    click(2);
    now.mockReturnValue(1_401);
    click(2);
    now.mockReturnValue(1_402);
    click(5);
    await new Promise((resolve) => setImmediate(resolve));
    expect(clipboard.writeText).not.toHaveBeenCalled();

    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
    now.mockRestore();
  });

  it("ignores composer-region wheel history while a modal answer is active", async () => {
    const harness = createHarness(40, 8, false, false, true);
    harness.composer.remember("history prompt");
    const result = harness.composer.ask("Approve? ");
    harness.input.write("\u001b[<64;2;8M");
    harness.input.write("yes\r");

    await expect(result).resolves.toBe("yes");
    harness.composer.close();
  });

  it("scrolls full-screen history with keyboard and preserves position on output", async () => {
    const harness = createHarness(40, 6, false, false, true);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.composer.write(
      Array.from({ length: 12 }, (_, index) => `history ${index}`).join("\n"),
    );
    harness.input.emit("keypress", "", {
      name: "pageup",
      sequence: "\u001b[5~",
    });
    harness.composer.write("new output");
    expect(harness.chunks().at(-1)).toMatch(/newer lines · Ctrl\+End to follow/u);
    harness.input.emit("keypress", "", {
      name: "end",
      ctrl: true,
      sequence: "\u001b[1;5F",
    });
    expect(harness.chunks().at(-1)).not.toMatch(/newer lines · Ctrl\+End to follow/u);

    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
  });

  it("coalesces a synchronous resize burst at the final geometry", async () => {
    const harness = createHarness(100, 12, false, false, true);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    const before = harness.chunks().length;
    for (let index = 0; index < 100; index += 1) {
      harness.output.columns = 20 + index;
      harness.output.rows = 8 + index % 4;
      harness.output.emit("resize");
    }
    await Promise.resolve();
    const writes = harness.chunks().slice(before);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("\u001b[H");
    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
  });

  it("keeps centered timeline output responsive in fullscreen and live in inline mode", async () => {
    const variants = [
      "─────── ✦ Crafted in 43s ───────",
      "───── ✦ Crafted in 43s ─────",
      "───── ✦ 43s ─────",
      "✦ 43s",
    ];
    const fullscreen = createHarness(60, 6, false, false, true);
    fullscreen.composer.writeCentered(variants);
    expect(fullscreen.screen()).toContain(
      "             ─────── ✦ Crafted in 43s ───────",
    );

    fullscreen.output.columns = 32;
    fullscreen.output.emit("resize");
    await Promise.resolve();
    expect(fullscreen.screen()).toContain(
      " ───── ✦ Crafted in 43s ─────",
    );
    fullscreen.composer.close();

    const inline = createHarness(18, 6);
    inline.composer.writeCentered(variants);
    expect(inline.rendered()).toContain("───── ✦ 43s ─────\n");
    inline.composer.close();
  });

  it("restores the shell with one concise session summary", () => {
    const harness = createHarness(40, 6, false, false, true);
    harness.composer.write(
      "Session ended. No background run remains attached.",
    );
    harness.composer.close();
    expect(harness.chunks().at(-2)).toContain("\u001b[?1049l");
    expect(harness.chunks().at(-1)).toBe(
      "Session ended. No background run remains attached.\n",
    );
  });

  it("clears a fullscreen activity immediately without an active prompt", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(40, 6, false, true, true);
      harness.composer.beginActivity("Waiting for provider");
      vi.advanceTimersByTime(120);
      expect(harness.chunks().at(-1)).toContain("Waiting for provider");

      harness.composer.beginMessageStream("Agent");
      expect(harness.chunks().at(-1)).not.toContain("Waiting for provider");
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("yields terminal ownership and restores raw input exactly once", () => {
    const harness = createHarness();
    const initialKeypressListeners = harness.input.listenerCount("keypress");
    const initialResizeListeners = harness.output.listenerCount("resize");
    const restore = harness.composer.suspend();

    expect(harness.input.isRaw).toBe(false);
    expect(harness.input.listenerCount("keypress")).toBe(
      initialKeypressListeners - 1,
    );
    expect(harness.output.listenerCount("resize")).toBe(
      initialResizeListeners - 1,
    );

    restore();
    restore();
    expect(harness.input.isRaw).toBe(true);
    expect(harness.input.listenerCount("keypress")).toBe(
      initialKeypressListeners,
    );
    expect(harness.output.listenerCount("resize")).toBe(
      initialResizeListeners,
    );
    harness.composer.close();
    expect(harness.input.isRaw).toBe(false);
  });

  it("animates one inline activity row and atomically preserves permanent output", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const activity = harness.composer.beginActivity(
        "Coordinate gpt-5.6-sol · high",
      );

      vi.advanceTimersByTime(119);
      expect(harness.rendered()).not.toContain("♚");
      vi.advanceTimersByTime(1);
      expect(harness.screen()).toContain(
        "♚ Coordinate gpt-5.6-sol · high",
      );
      vi.advanceTimersByTime(100);
      expect(harness.screen()).toContain(
        "♛ Coordinate gpt-5.6-sol · high",
      );
      vi.advanceTimersByTime(500);
      expect(harness.screen()).toContain(
        "♠ Coordinate gpt-5.6-sol · high",
      );
      vi.advanceTimersByTime(400);
      expect(harness.screen()).toContain(
        "♚ Coordinate gpt-5.6-sol · high · 1s",
      );

      activity.update("Review verifier evidence");
      expect(harness.screen()).toContain("Review verifier evidence · 1s");
      harness.composer.write("Verifier failed");
      expect(harness.screen()).toContain("Verifier failed");
      expect(harness.screen()).toContain("Review verifier evidence");

      activity.settle("Review complete");
      expect(harness.screen()).toContain("✓ Review complete");
      expect(harness.screen()).not.toMatch(/[♚♛♜♝♞♟♠♣♥♦]/u);

      const colored = createHarness(100, 24, true);
      colored.composer.beginActivity("Saving").settle("Saved");
      expect(colored.rendered()).toContain(
        "\u001b[38;2;120;201;155m✓\u001b[0m Saved",
      );
      colored.composer.close();

      const nextActivity = harness.composer.beginActivity("Wait again");
      vi.advanceTimersByTime(120);
      expect(harness.screen()).toContain("Wait again · 0s");
      nextActivity.stop();
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders explicit tool activity immediately while retaining live timing", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const activity = harness.composer.beginActivity("Read package.json", {
        immediate: true,
      });

      expect(harness.screen()).toContain("♚ Read package.json · 0s");
      vi.advanceTimersByTime(1_000);
      expect(harness.screen()).toContain("Read package.json · 1s");

      activity.stop();
      expect(harness.screen()).not.toContain("Read package.json");
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs shimmer beyond the chess cycle and resets only on label updates", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(100, 24, true, true);
      const activity = harness.composer.beginActivity(
        "Coordinate gpt-5.6-sol · high",
      );

      vi.advanceTimersByTime(120);
      vi.advanceTimersByTime(1_100);
      expect(harness.chunks().at(-1)).toContain(
        "\u001b[38;2;143;182;232mgpt",
      );

      activity.update("Review verifier evidence");
      const updated = harness.chunks().at(-1)!;
      expect(updated).toContain("♜");
      expect(updated).toContain(
        "\u001b[38;2;143;182;232mRev",
      );
      expect(harness.screen()).toContain(
        "Review verifier evidence · 1s",
      );

      activity.stop();
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a static marker and a one-second timer when terminal motion is disabled", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(100, 24, false, false);
      const activity = harness.composer.beginActivity("Loading models");

      vi.advanceTimersByTime(120);
      expect(harness.screen()).toContain("♚ Loading models · 0s");
      vi.advanceTimersByTime(1_000);
      expect(harness.screen()).toContain("♚ Loading models · 1s");
      activity.stop();

      expect(harness.rendered()).not.toMatch(/[♛♜♝♞♟♠♣♥♦]/u);
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps elapsed time visible on narrow terminals and removes it at first response", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(7, 4);
      harness.composer.beginActivity("Coordinate a very long model name");
      vi.advanceTimersByTime(120);

      expect(harness.screen()).toContain("♚ 0s");

      const stream = harness.composer.beginMessageStream("Agent");
      stream.update("Ready");
      expect(harness.screen()).not.toContain("♚ 0s");
      stream.finish();
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a two-line startup splash after the threshold and clears it atomically", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(32);
      const activity =
        harness.composer.beginStartupActivity("Loading workspace");

      vi.advanceTimersByTime(119);
      expect(harness.rendered()).toBe("");
      vi.advanceTimersByTime(1);
      expect(harness.screen()).toContain("ORYNT › starting");
      expect(harness.screen()).toContain("♚ Loading workspace");

      activity.update("Checking Codex");
      expect(harness.screen()).toMatch(/[♚♛♜♝♞♟♠♣♥♦] Checking Codex/u);
      expect(harness.screen()).not.toContain("Loading workspace");

      harness.output.columns = 20;
      harness.output.emit("resize");
      expect(harness.screen()).toContain("ORYNT › starting");
      expect(harness.screen()).toContain("Checking Codex");

      activity.stop();
      expect(harness.screen()).not.toContain("ORYNT");
      expect(harness.screen()).not.toContain("Checking Codex");
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a static startup marker when terminal motion is disabled", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(100, 24, false, false);
      const activity =
        harness.composer.beginStartupActivity("Loading workspace");

      vi.advanceTimersByTime(120);
      expect(harness.screen()).toContain("ORYNT › starting");
      expect(harness.screen()).toContain("♚ Loading workspace");
      expect(harness.screen()).not.toMatch(/[♛♜♝♞♟♠♣♥♦]/u);

      activity.stop();
      expect(harness.screen()).not.toContain("Loading workspace");
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("appends cumulative agent text once and finalizes before permanent output", () => {
    const harness = createHarness(100, 24, false, false);
    const stream = harness.composer.beginMessageStream("Agent");

    stream.update("Hello");
    stream.update("Hello from Orynt.");
    harness.composer.write("  ◇ Tool shell");
    stream.finish("ignored stale update");

    expect(harness.rendered()).toBe(
      "\nAgent › Hello from Orynt.\n  ◇ Tool shell\n",
    );
    harness.composer.close();
  });

  it("colors only the agent prefix while streaming a response", () => {
    const harness = createHarness(100, 24, true, false);
    const stream = harness.composer.beginMessageStream("Agent");

    stream.update("Hello from Orynt.");
    stream.finish();

    expect(harness.rendered()).toBe(
      "\n\u001b[38;2;198;196;191mAgent ›\u001b[0m Hello from Orynt.\n",
    );
    expect(harness.rendered()).not.toContain(
      "\u001b[38;2;198;196;191mHello from Orynt.",
    );
    harness.composer.close();
  });

  it("renders split Markdown in a streaming agent response without exposing markers", () => {
    const harness = createHarness(100, 24, false, false);
    const stream = harness.composer.beginMessageStream("Agent");

    stream.update("Use **bo");
    stream.update("Use **bold** in packages/cli/src/main.ts");
    stream.finish();

    expect(stripColor(harness.rendered())).toBe(
      "\nAgent › Use bold in packages/cli/src/main.ts\n",
    );
    expect(harness.rendered()).toContain("\u001b[1mbold\u001b[0m");
    expect(harness.rendered()).toContain(
      "\u001b[4mpackages/cli/src/main.ts\u001b[0m",
    );
    harness.composer.close();
  });

  it("keeps dim Markdown markers visible in the compose draft and echo", async () => {
    const harness = createHarness(100, 24, false, false);
    const result = harness.composer.compose(COMPOSER_PROMPT);

    harness.input.write("Use **bold**");
    expect(harness.rendered()).toContain("\u001b[2m**\u001b[0m");
    expect(harness.rendered()).toContain("\u001b[1mbold\u001b[0m");

    harness.input.write("\r");
    await expect(result).resolves.toBe("Use **bold**");
    expect(stripColor(harness.rendered())).toContain("You › Use **bold**");
    harness.composer.close();
  });

  it("adds a full-row background only after a multiline user message is submitted", async () => {
    const harness = createHarness(24, 8, true, false);
    const result = harness.composer.compose(
      COMPOSER_PROMPT,
      "First line\nSecond line",
    );

    expect(harness.rendered()).not.toContain("\u001b[48;2;238;241;245m");
    harness.input.write("\r");
    await expect(result).resolves.toBe("First line\nSecond line");

    const rendered = harness.rendered();
    expect(rendered).toContain(
      "\u001b[38;2;52;64;84;48;2;238;241;245m",
    );
    expect(stripColor(rendered)).toContain("You › First line");
    expect(stripColor(rendered)).toContain("      Second line");
    expect(rendered.match(/\u001b\[K/gu)).toHaveLength(2);
    harness.composer.close();
  });

  it("reflows a submitted user background with fullscreen history", async () => {
    const harness = createHarness(18, 7, true, false, true);
    const result = harness.composer.compose(
      COMPOSER_PROMPT,
      "A user message that wraps",
    );
    harness.input.write("\r");
    await expect(result).resolves.toBe("A user message that wraps");
    expect(stripColor(harness.chunks().at(-1)!)).toContain("You › A user");
    expect(harness.chunks().at(-1)).toContain(
      "\u001b[38;2;52;64;84;48;2;238;241;245m",
    );

    harness.output.columns = 12;
    harness.output.emit("resize");
    await Promise.resolve();
    const resized = harness.chunks().at(-1)!;
    expect(stripColor(resized)).toContain("You › A");
    expect(resized.match(/\u001b\[K/gu)?.length).toBeGreaterThanOrEqual(3);
    harness.composer.close();
  });

  it("frames an idle composer with a placeholder and runtime status", async () => {
    const harness = createHarness(100, 24, false, false);
    const result = harness.composer.compose(COMPOSER_PROMPT, "", {
      mode: "next",
      preset: "balanced",
      modelId: "gpt-5.6-terra",
      thinkingEffort: "high",
    });

    const lines = harness.screen().split("\n");
    const topBorder = lines.findIndex((line) => /^─+$/u.test(line));
    const prompt = lines.findIndex((line) =>
      line.includes('❯ Try "explain this repo"')
    );
    const bottomBorder = lines.findIndex(
      (line, index) => index > topBorder && /^─+$/u.test(line),
    );
    const footer = lines.findIndex((line) =>
      line.includes("⏵ balanced · next") &&
      line.endsWith("▱▱▱▱▱ unknown · gpt-5.6-terra/high")
    );
    expect(topBorder).toBeGreaterThanOrEqual(0);
    expect(prompt).toBeGreaterThan(topBorder);
    expect(bottomBorder).toBeGreaterThan(prompt);
    expect(footer).toBeGreaterThan(bottomBorder);

    harness.input.write("hello");
    expect(harness.screen()).toContain("❯ hello");
    expect(harness.screen()).not.toContain('Try "explain this repo"');
    harness.input.write("\r");
    await expect(result).resolves.toBe("hello");
    expect(stripColor(harness.rendered())).toContain("You › hello");
    harness.composer.close();
  });

  it("opens and filters the slash palette, then completes with Tab without executing", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);

    harness.input.write("/do");
    expect(harness.rendered()).toContain("/doctor");
    expect(harness.rendered()).toContain("Diagnose runtime");

    harness.input.write("\t");
    expect(harness.rendered()).toContain("❯ /doctor");
    harness.input.write("\r");

    await expect(result).resolves.toBe("/doctor ");
    harness.composer.close();
  });

  it("uses Enter once for safe completion and a second time for submission", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);

    harness.input.write("/do\r");
    expect(harness.rendered()).toContain("❯ /doctor");
    harness.input.write("\r");

    await expect(result).resolves.toBe("/doctor ");
    harness.composer.close();
  });

  it("submits an exact no-argument or optional command with one Enter", async () => {
    const harness = createHarness();
    const model = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/model\r");
    await expect(model).resolves.toBe("/model");

    const tier = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/tier\r");
    await expect(tier).resolves.toBe("/tier");

    const exit = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/exit\r");
    await expect(exit).resolves.toBe("/exit");
    harness.composer.close();
  });

  it("keeps an exact required-argument command open for its value", async () => {
    const harness = createHarness();
    const repository = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/repo\r");
    expect(harness.rendered()).toContain("❯ /repo ");
    harness.input.write("./project\r");

    await expect(repository).resolves.toBe("/repo ./project");
    harness.composer.close();
  });

  it("completes a finite slash argument with Tab without executing", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);

    harness.input.write("/tier h");
    expect(harness.screen()).toContain("heavy");
    expect(harness.screen()).toContain("strongest review tier");
    harness.input.write("\t");
    expect(harness.screen()).toContain("❯ /tier heavy");
    harness.input.write("\r");

    await expect(result).resolves.toBe("/tier heavy");
    harness.composer.close();
  });

  it("uses Enter once for safe argument completion and again for submission", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);

    harness.input.write("/tier h\r");
    expect(harness.screen()).toContain("❯ /tier heavy");
    harness.input.write("\r");

    await expect(result).resolves.toBe("/tier heavy");
    harness.composer.close();
  });

  it("continues argument assist through nested settings choices", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);

    harness.input.write("/settings intelligence subagents mo");
    expect(harness.screen()).toContain("mode");
    harness.input.write("\t");
    expect(harness.screen()).toContain("adaptive");
    harness.input.write("ad\t\r");

    await expect(result).resolves.toBe(
      "/settings intelligence subagents mode adaptive",
    );
    harness.composer.close();
  });

  it("completes only the token at the cursor and preserves the suffix", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);

    harness.input.write("/tier h tail");
    for (let index = 0; index < 5; index += 1) {
      harness.input.write("\u001b[D");
    }
    harness.input.write("\t\r");

    await expect(result).resolves.toBe("/tier heavy tail");
    harness.composer.close();
  });

  it("leaves free-form slash arguments outside the suggestion palette", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);

    harness.input.write("/goal audit repository safety");
    expect(harness.screen()).not.toContain("--clear");
    harness.input.write("\r");

    await expect(result).resolves.toBe("/goal audit repository safety");
    harness.composer.close();
  });

  it("navigates slash suggestions with arrow keys", async () => {
    const harness = createHarness();
    const selected = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/");
    harness.input.write("\u001b[B");
    harness.input.write("\t");
    harness.input.write("\r");
    await expect(selected).resolves.toBe("/status");
    harness.composer.close();
  });

  it("repaints only changed slash rows in one write when selection moves", async () => {
    const harness = createHarness();
    const selected = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/");
    const before = harness.chunks().length;

    harness.input.write("\u001b[B");

    const updates = harness.chunks().slice(before);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.match(/\u001b\[2K/g)).toHaveLength(2);
    expect(updates[0]).toContain("/help");
    expect(updates[0]).toContain("/status");
    expect(updates[0]).not.toContain("/repo");
    expect(harness.screen()).toContain("› /status");
    harness.input.write("\t\r");
    await expect(selected).resolves.toBe("/status");
    harness.composer.close();
  });

  it("shows a muted shortcut hint for the slash palette", async () => {
    const harness = createHarness(100, 12, true);
    const selected = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/");

    expect(harness.rendered()).toContain(
      "\u001b[2m  ↑↓ select · Tab complete · Esc/Ctrl+C clear\u001b[0m",
    );
    harness.input.emit("keypress", "", {
      name: "escape",
      sequence: "\u001b",
    });
    harness.input.write("\r");
    await expect(selected).resolves.toBe("");
    harness.composer.close();
  });

  it("completes a fuzzy slash-command suggestion after a typo", async () => {
    const harness = createHarness(100, 12);
    const selected = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/seittings");

    expect(harness.screen()).toContain("/settings");
    harness.input.write("\t\r");
    await expect(selected).resolves.toBe("/settings ");
    harness.composer.close();
  });

  it("moves the input cursor without erasing or repainting content", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("smooth");
    const before = harness.chunks().length;

    harness.input.write("\u001b[D");

    const updates = harness.chunks().slice(before);
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toContain("\u001b[2K");
    expect(updates[0]).not.toContain("smooth");
    expect(harness.screen()).toContain("❯ smooth");
    harness.input.write("\r");
    await expect(result).resolves.toBe("smooth");
    harness.composer.close();
  });

  it("moves across a joined emoji as one grapheme", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("A👩🏽‍💻B");
    harness.input.write("\u001b[D\u001b[Dx\r");

    await expect(result).resolves.toBe("Ax👩🏽‍💻B");
    expect(displayWidth("👩🏽‍💻")).toBe(2);
    expect(displayWidth("🇻🇳")).toBe(2);
    expect(displayWidth("e\u0301")).toBe(1);
    harness.composer.close();
  });

  it("inserts explicit newlines with Alt+Enter and submits them with Enter", async () => {
    const harness = createHarness(32, 12);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("first line");
    harness.input.emit("keypress", "", {
      name: "return",
      meta: true,
      sequence: "\u001b\r",
    });
    harness.input.write("second line");

    expect(harness.screen()).toContain("❯ first line");
    expect(harness.screen()).toContain("│ second line");
    harness.input.write("\r");
    await expect(result).resolves.toBe("first line\nsecond line");
    harness.composer.close();
  });

  it("selects a word with Ctrl+Shift+Arrow before replacing it", async () => {
    const harness = createHarness(40, 12, true);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("alpha beta");
    harness.input.emit("keypress", "", {
      name: "left",
      ctrl: true,
      shift: true,
      sequence: "\u001b[1;6D",
    });

    expect(harness.rendered()).toContain("\u001b[7m");
    harness.input.write("gamma\r");
    await expect(result).resolves.toBe("alpha gamma");
    harness.composer.close();
  });

  it("moves by whole words with Ctrl+Arrow and terminal Alt+B/F aliases", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("alpha beta gamma");
    harness.input.write("\u001b[1;5D");
    harness.input.write("X");
    harness.input.write("\u001bb");
    harness.input.write("Y");
    harness.input.write("\u001bf");
    harness.input.write("Z\r");

    await expect(result).resolves.toBe("alpha beta YXgammaZ");
    harness.composer.close();
  });

  it("selects the entire multiline draft with Ctrl+A", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("first");
    harness.input.emit("keypress", "", {
      name: "return",
      meta: true,
      sequence: "\u001b\r",
    });
    harness.input.write("second\u0001replacement\r");

    await expect(result).resolves.toBe("replacement");
    harness.composer.close();
  });

  it("copies, cuts, and pastes composer selections with portable fallbacks", async () => {
    const clipboard: CliClipboardReader = {
      read: vi.fn(async () => ({ kind: "text", text: "gamma" })),
      writeText: vi.fn(async () => undefined),
      resolveDroppedPaths: vi.fn(async () => undefined),
    };
    const harness = createHarness(100, 24, false, true, false, clipboard);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("alpha beta");
    harness.input.emit("keypress", "", {
      name: "left",
      ctrl: true,
      shift: true,
      sequence: "\u001b[1;6D",
    });
    harness.input.emit("keypress", "", {
      name: "c",
      ctrl: true,
      shift: true,
      sequence: "\u001b[99;6u",
    });
    await Promise.resolve();
    expect(clipboard.writeText).toHaveBeenCalledWith("beta");

    harness.input.write("\u0018");
    await Promise.resolve();
    expect(harness.screen()).toContain("❯ alpha");

    harness.input.write("\u0001");
    harness.input.write("\u001bc");
    await Promise.resolve();
    expect(clipboard.writeText).toHaveBeenLastCalledWith("alpha ");

    harness.input.write("\u001bv");
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.screen()).toContain("✓ Pasted · 5 characters");
    harness.input.write("\r");
    await expect(result).resolves.toBe("gamma");
    harness.composer.close();
  });

  it("keeps a selection when clipboard cut fails", async () => {
    const clipboard: CliClipboardReader = {
      read: vi.fn(async () => ({ kind: "text", text: "unused" })),
      writeText: vi.fn(async () => {
        throw new Error("writer unavailable");
      }),
      resolveDroppedPaths: vi.fn(async () => undefined),
    };
    const harness = createHarness(100, 24, false, true, false, clipboard);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("alpha\u0001\u0018");
    await new Promise((resolve) => setImmediate(resolve));

    expect(harness.rendered()).toContain(
      "Copy failed · writer unavailable",
    );
    harness.input.write("\r");
    await expect(result).resolves.toBe("alpha");
    harness.composer.close();
  });

  it("does not treat Ctrl+Shift+C as live cancellation", async () => {
    const clipboard: CliClipboardReader = {
      read: vi.fn(async () => ({ kind: "text", text: "unused" })),
      writeText: vi.fn(async () => undefined),
      resolveDroppedPaths: vi.fn(async () => undefined),
    };
    const harness = createHarness(100, 24, false, true, false, clipboard);
    const submissions = vi.fn();
    harness.composer.beginLiveInput(
      {
        phase: "executing",
        pendingCount: 0,
        paused: false,
      },
      submissions,
    );
    harness.input.write("alpha\u0001");
    harness.input.emit("keypress", "", {
      name: "c",
      ctrl: true,
      shift: true,
      sequence: "\u001b[99;6u",
    });
    await Promise.resolve();

    expect(clipboard.writeText).toHaveBeenCalledWith("alpha");
    expect(submissions).not.toHaveBeenCalled();
    expect(harness.screen()).not.toContain("Press Ctrl+C again");
    harness.composer.close();
  });

  it("copies an active live selection when Ctrl+Shift+C arrives as raw Ctrl+C", async () => {
    const clipboard: CliClipboardReader = {
      read: vi.fn(async () => ({ kind: "text", text: "unused" })),
      writeText: vi.fn(async () => undefined),
      resolveDroppedPaths: vi.fn(async () => undefined),
    };
    const harness = createHarness(100, 24, false, true, false, clipboard);
    const submissions = vi.fn();
    harness.composer.beginLiveInput(
      {
        phase: "executing",
        pendingCount: 0,
        paused: false,
      },
      submissions,
    );
    harness.input.write("alpha\u0001\u0003");
    await Promise.resolve();

    expect(clipboard.writeText).toHaveBeenCalledWith("alpha");
    expect(submissions).not.toHaveBeenCalled();
    expect(harness.screen()).not.toContain("Press Ctrl+C again");
    harness.composer.close();
  });

  it("selects a joined emoji as one grapheme with Shift+Arrow", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("A👩🏽‍💻B");
    harness.input.write("\u001b[D\u001b[1;2D");
    harness.input.write("X\r");

    await expect(result).resolves.toBe("AXB");
    harness.composer.close();
  });

  it("extends selection vertically across explicit multiline rows", async () => {
    const harness = createHarness(24, 12);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("abc");
    harness.input.emit("keypress", "", {
      name: "return",
      meta: true,
      sequence: "\u001b\r",
    });
    harness.input.write("def");
    harness.input.emit("keypress", "", {
      name: "up",
      shift: true,
      sequence: "\u001b[1;2A",
    });
    harness.input.write("X\r");

    await expect(result).resolves.toBe("abcX");
    harness.composer.close();
  });

  it("uses Escape to collapse selection before clearing the draft", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("alpha");
    harness.input.write("\u001b[1;2D");
    harness.input.emit("keypress", "", {
      name: "escape",
      sequence: "\u001b",
    });
    expect(harness.screen()).toContain("❯ alpha");
    harness.input.emit("keypress", "", {
      name: "escape",
      sequence: "\u001b",
    });
    expect(harness.screen()).toContain('Try "explain this repo"');
    harness.input.write("\r");

    await expect(result).resolves.toBe("");
    harness.composer.close();
  });

  it("deletes whole words with Alt+Backspace and Ctrl+Delete", async () => {
    const backward = createHarness();
    const backwardResult = backward.composer.compose(COMPOSER_PROMPT);
    backward.input.write("alpha beta");
    backward.input.emit("keypress", "", {
      name: "backspace",
      meta: true,
      sequence: "\u001b\u007f",
    });
    backward.input.write("\r");
    await expect(backwardResult).resolves.toBe("alpha ");
    backward.composer.close();

    const forward = createHarness();
    const forwardResult = forward.composer.compose(COMPOSER_PROMPT);
    forward.input.write("alpha beta");
    forward.input.emit("keypress", "", {
      name: "home",
      sequence: "\u001b[H",
    });
    forward.input.emit("keypress", "", {
      name: "delete",
      ctrl: true,
      sequence: "\u001b[3;5~",
    });
    forward.input.write("\r");
    await expect(forwardResult).resolves.toBe("beta");
    forward.composer.close();
  });

  it("does not write anything when a render leaves content and cursor unchanged", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);
    const before = harness.chunks().length;

    harness.input.write("\u0001");

    expect(harness.chunks().slice(before)).toHaveLength(0);
    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
  });

  it("completes a slash command with one differential frame", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/do");
    const before = harness.chunks().length;

    harness.input.write("\t");

    expect(harness.chunks().slice(before)).toHaveLength(1);
    expect(harness.screen()).toContain("❯ /doctor");
    expect(harness.screen()).not.toContain("Diagnose runtime");
    harness.input.write("\r");
    await expect(result).resolves.toBe("/doctor ");
    expect(harness.rendered()).not.toContain("\u001b[?1049");
    harness.composer.close();
  });

  it("inserts argument spacing when completing a command", async () => {
    const harness = createHarness();
    const argumentCommand = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/re");
    harness.input.write("\t");
    expect(harness.rendered()).toContain("❯ /repo ");
    harness.input.write("./project");
    harness.input.write("\r");
    await expect(argumentCommand).resolves.toBe("/repo ./project");
    harness.composer.close();
  });

  it("clears a slash draft with Escape and restores it with Undo", async () => {
    const harness = createHarness();
    const dismissed = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/do");
    harness.input.emit("keypress", "", { name: "escape", sequence: "\u001b" });
    expect(harness.screen()).not.toContain("/do");
    harness.input.write("\u001a");
    expect(harness.screen()).toContain("❯ /do");
    harness.input.write("\r");
    harness.input.write("\r");
    await expect(dismissed).resolves.toBe("/doctor ");
    harness.composer.close();
  });

  it("groups draft edits for Undo, supports Redo, and invalidates Redo after a new edit", async () => {
    const harness = createHarness();
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("hello");
    harness.input.write("\u001a");
    expect(harness.screen()).not.toContain("hello");
    harness.input.write("\u0019");
    expect(harness.screen()).toContain("❯ hello");
    harness.input.write("\u001a");
    harness.input.write("new");
    harness.input.write("\u0019");
    harness.input.write("\r");

    await expect(result).resolves.toBe("new");
    harness.composer.close();
  });

  it("applies remapped portable shortcuts without changing select navigation", async () => {
    const harness = createHarness();
    harness.composer.setShortcuts({
      clear: ["alt+c"],
      undo: ["alt+u"],
      redo: ["alt+r"],
    });
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("draft");
    harness.input.emit("keypress", "", {
      name: "c",
      meta: true,
      sequence: "\u001bc",
    });
    expect(harness.screen()).not.toContain("draft");
    harness.input.emit("keypress", "", {
      name: "u",
      meta: true,
      sequence: "\u001bu",
    });
    harness.input.write("\r");
    await expect(result).resolves.toBe("draft");
    harness.composer.close();
  });

  it("keeps deduplicated command history outside approval answers", async () => {
    const harness = createHarness();
    const first = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("inspect repository\r");
    await expect(first).resolves.toBe("inspect repository");
    harness.composer.remember("inspect repository");

    const approval = harness.composer.ask("Approve? ");
    harness.input.write("yes\r");
    await expect(approval).resolves.toBe("yes");

    const recalled = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("\u001b[A\r");
    await expect(recalled).resolves.toBe("inspect repository");
    harness.composer.close();
  });

  it("recalls and edits a logical multiline history value without corrupting the renderer", async () => {
    const harness = createHarness(54, 10);
    harness.composer.remember("fix the contract\nwithout changing the API");
    const recalled = harness.composer.compose(COMPOSER_PROMPT);

    harness.input.write("\u001b[A");
    expect(harness.screen()).toContain("❯ fix the contract");
    expect(harness.screen()).toContain("│ without changing the API");
    harness.input.write(" safely\r");

    await expect(recalled).resolves.toBe(
      "fix the contract\nwithout changing the API safely",
    );
    expect(harness.rendered()).toContain("API safely");
    harness.composer.close();
  });

  it("shows a three-second exit countdown on Ctrl+C, then restores a usable prompt", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const result = harness.composer.compose(COMPOSER_PROMPT);
      harness.input.write("\u0003");
      expect(harness.rendered()).toContain("Press Ctrl+C again to exit Orynt · 3s");
      expect(harness.rendered()).not.toContain("^C");
      expect(harness.onInterrupt).not.toHaveBeenCalled();

      let offset = harness.rendered().length;
      vi.advanceTimersByTime(1_000); await Promise.resolve();
      expect(harness.rendered().slice(offset)).toContain(
        "Press Ctrl+C again to exit Orynt · 2s",
      );

      offset = harness.rendered().length;
      vi.advanceTimersByTime(1_000); await Promise.resolve();
      expect(harness.rendered().slice(offset)).toContain(
        "Press Ctrl+C again to exit Orynt · 1s",
      );

      offset = harness.rendered().length;
      vi.advanceTimersByTime(1_000); await Promise.resolve();
      expect(harness.screen()).toContain('❯ Try "explain this repo"');
      expect(harness.screen()).not.toContain("Press Ctrl+C again");

      harness.input.write("keep me\r");
      await expect(result).resolves.toBe("keep me");
      expect(vi.getTimerCount()).toBe(0);
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits gracefully when Ctrl+C is pressed twice during the countdown", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const result = harness.composer.compose(COMPOSER_PROMPT);
      harness.input.write("\u0003");
      vi.advanceTimersByTime(1_250); await Promise.resolve();
      harness.input.write("\u0003");

      await expect(result).resolves.toBe("/exit");
      expect(harness.rendered()).toContain("Press Ctrl+C again to exit Orynt · 2s");
      expect(harness.rendered()).not.toContain("^C");
      expect(harness.onInterrupt).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disarms the exit countdown when the operator resumes typing", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const result = harness.composer.compose(COMPOSER_PROMPT);
      harness.input.write("\u0003k");
      vi.advanceTimersByTime(3_000); await Promise.resolve();
      harness.input.write("eep working\r");

      await expect(result).resolves.toBe("keep working");
      expect(vi.getTimerCount()).toBe(0);
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a new countdown instead of exiting on a stale deadline", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const result = harness.composer.compose(COMPOSER_PROMPT);
      harness.input.write("\u0003");
      vi.advanceTimersByTime(3_000); await Promise.resolve();
      const offset = harness.rendered().length;
      harness.input.write("\u0003");

      expect(harness.rendered().slice(offset)).toContain(
        "Press Ctrl+C again to exit Orynt · 3s",
      );
      harness.input.write("continue\r");
      await expect(result).resolves.toBe("continue");
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the exit timer when the composer closes", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const result = harness.composer.compose(COMPOSER_PROMPT);
      harness.input.write("\u0003");
      harness.composer.close();
      const renderedAtClose = harness.rendered();

      await expect(result).resolves.toBe("/exit");
      vi.advanceTimersByTime(3_000); await Promise.resolve();
      expect(harness.rendered()).toBe(renderedAtClose);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes Ctrl+C without an active prompt to the run interrupt handler", () => {
    const harness = createHarness();
    harness.input.write("\u0003");
    expect(harness.onInterrupt).toHaveBeenCalledOnce();
    harness.composer.close();
  });

  it("keeps live input active across contextual and forced-next submissions", () => {
    const harness = createHarness();
    const submissions: unknown[] = [];
    const live = harness.composer.beginLiveInput(
      {
        phase: "coordinating",
        pendingCount: 0,
        paused: false,
      },
      (submission) => submissions.push(submission),
    );

    harness.input.write("use bun\r");
    harness.input.write("also update docs");
    harness.input.write("\t");

    expect(submissions).toEqual([
      {
        kind: "message",
        value: "use bun",
        delivery: "contextual",
        draft: {
          value: "use bun",
          cursor: 7,
          blocks: [],
          images: [],
        },
      },
      {
        kind: "message",
        value: "also update docs",
        delivery: "next",
        draft: {
          value: "also update docs",
          cursor: 16,
          blocks: [],
          images: [],
        },
      },
    ]);
    expect(harness.screen()).toContain("Enter Update");
    expect(harness.screen()).toContain("Tab Next");
    expect(live.close()).toEqual({
      value: "",
      cursor: 0,
      blocks: [],
      images: [],
    });
    harness.composer.close();
  });

  it("consumes an empty Tab instead of inserting a visible tab token", () => {
    const harness = createHarness();
    const submissions: unknown[] = [];
    const live = harness.composer.beginLiveInput(
      {
        phase: "coordinating",
        pendingCount: 0,
        paused: false,
      },
      (submission) => submissions.push(submission),
    );

    harness.input.write("\t");
    harness.input.emit("keypress", "\t", {
      name: "tab",
      shift: true,
      sequence: "\u001b[Z",
    });

    expect(submissions).toEqual([]);
    expect(harness.screen()).not.toContain("\\t");
    expect(live.close()).toEqual({
      value: "",
      cursor: 0,
      blocks: [],
      images: [],
    });
    harness.composer.close();
  });

  it("recalls the newest pending draft with Ctrl+Up", () => {
    const harness = createHarness();
    const pendingDraft = {
      value: "fix the queued typo",
      cursor: 7,
      blocks: [],
      images: [],
    };
    const submissions: unknown[] = [];
    const live = harness.composer.beginLiveInput(
      {
        phase: "executing",
        pendingCount: 2,
        paused: false,
      },
      (submission) => {
        submissions.push(submission);
        return submission.kind === "edit_pending"
          ? { draft: pendingDraft }
          : undefined;
      },
    );

    harness.input.emit("keypress", "", {
      name: "up",
      ctrl: true,
      sequence: "\u001b[1;5A",
    });

    expect(submissions).toEqual([{ kind: "edit_pending" }]);
    expect(harness.screen()).toContain("❯ fix the queued typo");
    expect(live.close()).toEqual(pendingDraft);
    harness.composer.close();
  });

  it("uses shell-order history in live input after multiline navigation", () => {
    const harness = createHarness();
    harness.composer.remember("older prompt");
    harness.composer.remember("newest prompt");
    const live = harness.composer.beginLiveInput(
      {
        phase: "coordinating",
        pendingCount: 0,
        paused: false,
      },
      vi.fn(),
      "working draft",
    );

    harness.input.write("\u001b[A");
    expect(harness.screen()).toContain("❯ newest prompt");
    harness.input.write("\u001b[A");
    expect(harness.screen()).toContain("❯ older prompt");
    harness.input.write("\u001b[B");
    expect(harness.screen()).toContain("❯ newest prompt");
    harness.input.write("\u001b[B");
    expect(harness.screen()).toContain("❯ working draft");

    live.close();
    harness.composer.close();
  });

  it("requires two Esc presses to clear every pending message", () => {
    const harness = createHarness();
    const submissions: unknown[] = [];
    const live = harness.composer.beginLiveInput(
      {
        phase: "executing",
        pendingCount: 2,
        paused: true,
      },
      (submission) => submissions.push(submission),
    );

    harness.input.emit("keypress", "", {
      name: "escape",
      sequence: "\u001b",
    });
    expect(submissions).toEqual([]);
    expect(harness.screen()).toContain(
      "Warning · Press Esc again to dismiss all 2 pending messages",
    );
    harness.input.emit("keypress", "", {
      name: "escape",
      sequence: "\u001b",
    });

    expect(submissions).toEqual([{ kind: "clear_pending" }]);
    live.close();
    harness.composer.close();
  });

  it("exposes pending shortcuts from the paused idle composer", async () => {
    const editHarness = createHarness();
    const edit = editHarness.composer.compose(
      COMPOSER_PROMPT,
      "",
      {
        mode: "next",
        pendingCount: 2,
        pendingPaused: true,
      },
    );
    editHarness.input.emit("keypress", "", {
      name: "up",
      ctrl: true,
      sequence: "\u001b[1;5A",
    });
    await expect(edit).resolves.toBe(EDIT_PENDING_INPUT);
    editHarness.composer.close();

    const clearHarness = createHarness();
    const clear = clearHarness.composer.compose(
      COMPOSER_PROMPT,
      "",
      {
        mode: "next",
        pendingCount: 2,
        pendingPaused: true,
      },
    );
    clearHarness.input.emit("keypress", "", {
      name: "escape",
      sequence: "\u001b",
    });
    clearHarness.input.emit("keypress", "", {
      name: "escape",
      sequence: "\u001b",
    });
    await expect(clear).resolves.toBe(CLEAR_PENDING_INPUT);
    clearHarness.composer.close();
  });

  it("pauses for a modal prompt and restores the exact live draft cursor", async () => {
    const harness = createHarness();
    const live = harness.composer.beginLiveInput(
      {
        phase: "executing",
        pendingCount: 0,
        paused: false,
        status: {
          mode: "active",
          preset: "auto",
          role: "implementer",
          modelId: "gpt-5.6-terra",
          thinkingEffort: "medium",
        },
      },
      vi.fn(),
    );
    harness.input.write("draft");
    harness.input.write("\u001b[D\u001b[D");

    const restore = live.pauseForModal();
    const approval = harness.composer.ask("Approve? ");
    harness.input.write("y\r");
    await expect(approval).resolves.toBe("y");
    restore();
    harness.input.write("X");

    expect(harness.screen()).toContain("❯ draXft");
    expect(live.close()).toEqual({
      value: "draXft",
      cursor: 4,
      blocks: [],
      images: [],
    });
    harness.composer.close();
  });

  it("applies statusline fields immediately and uses resolved live model facts", () => {
    const harness = createHarness(140, 24, false, false);
    const live = harness.composer.beginLiveInput(
      {
        phase: "coordinating",
        pendingCount: 0,
        paused: false,
        status: {
          mode: "active",
          preset: "auto",
          role: "coordinator",
          modelId: "gpt-5.6-terra",
          thinkingEffort: "medium",
          context: contextSnapshot(62),
        },
      },
      vi.fn(),
    );

    expect(harness.screen()).toContain(
      "⏵ auto · coordinator",
    );
    expect(harness.screen()).toContain(
      "▰▰▰▱▱ 124k/200k · gpt-5.6-terra/medium",
    );
    const statusline = harness.screen().split("\n").find((line) =>
      line.includes("⏵ auto · coordinator")
    );
    expect(statusline).toBeDefined();
    expect(statusline).toEndWith(
      "▰▰▰▱▱ 124k/200k · gpt-5.6-terra/medium",
    );
    expect(statusline!.indexOf("coordinator")).toBeLessThan(
      statusline!.indexOf("▰▰▰▱▱"),
    );
    harness.composer.setStatusline({
      enabled: true,
      profile: false,
      role: true,
      model: true,
      effort: false,
      context: false,
      shortcuts: false,
    });
    expect(harness.screen()).toContain("⏵ coordinator");
    expect(harness.screen()).toContain("gpt-5.6-terra");
    expect(harness.screen()).not.toContain("auto · coordinator");
    expect(harness.screen()).not.toContain("/medium");
    expect(harness.screen()).not.toContain("▰▰▰▱▱");

    live.close();
    harness.composer.close();
  });

  it("degrades the context meter before hiding it on narrow terminals", async () => {
    const status = {
      mode: "next" as const,
      context: contextSnapshot(62),
    };
    for (const [width, expected] of [
      [40, "▰▰▰▱▱ 124k/200k"],
      [15, "124k/200k"],
    ] as const) {
      const harness = createHarness(width, 8, false, false);
      harness.composer.setStatusline({
        enabled: true,
        profile: false,
        role: false,
        model: false,
        effort: false,
        context: true,
        shortcuts: false,
      });
      const result = harness.composer.compose(COMPOSER_PROMPT, "", status);
      expect(harness.screen()).toContain(expected);
      harness.input.write("\r");
      await expect(result).resolves.toBe("");
      harness.composer.close();
    }
  });

  it("colors context meters from the lifecycle thresholds", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(100, 8, true, false);
      const live = harness.composer.beginLiveInput(
        {
          phase: "coordinating",
          pendingCount: 0,
          paused: false,
          status: {
            mode: "active",
            context: contextSnapshot(74),
          },
        },
        vi.fn(),
      );
      expect(harness.rendered()).toContain("\u001b[38;2;211;169;80m");
      for (const [percent, color] of [
        [0, "120;201;155"],
        [50, "181;180;104"],
        [75, "212;169;79"],
        [85, "224;143;77"],
        [95, "223;114;114"],
      ] as const) {
        live.setContext({
          phase: "coordinating",
          pendingCount: 0,
          paused: false,
          status: {
            mode: "active",
            context: contextSnapshot(percent),
          },
        });
        expect(harness.chunks().at(-1)).toContain(`\u001b[38;2;${color}m`);
      }
      live.close();
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("embeds the existing activity in live input without losing the draft", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const live = harness.composer.beginLiveInput(
        {
          phase: "coordinating",
          pendingCount: 0,
          paused: false,
        },
        vi.fn(),
      );
      harness.input.write("second message");
      const activity = harness.composer.beginActivity(
        "Coordinate gpt-5.6-sol · high",
      );

      vi.advanceTimersByTime(119);
      expect(harness.screen()).not.toContain(
        "Coordinate gpt-5.6-sol · high",
      );
      vi.advanceTimersByTime(1);
      expect(harness.screen()).toContain(
        "♚ Coordinate gpt-5.6-sol · high",
      );
      expect(harness.screen()).toContain("❯ second message");
      expect(harness.screen()).toContain("Enter Update");
      const liveLines = harness.screen().split("\n");
      const activityRow = liveLines.findIndex((line) =>
        line.includes("Coordinate gpt-5.6-sol · high")
      );
      const frameRow = liveLines.findIndex((line) => /^─+$/u.test(line));
      const promptRow = liveLines.findIndex((line) =>
        line.includes("❯ second message")
      );
      expect(frameRow).toBeGreaterThan(activityRow);
      expect(promptRow).toBeGreaterThan(frameRow);
      expect(
        harness.screen().indexOf("Coordinate gpt-5.6-sol · high"),
      ).toBeLessThan(harness.screen().indexOf("❯ second message"));

      vi.advanceTimersByTime(100);
      expect(harness.screen()).toContain(
        "♛ Coordinate gpt-5.6-sol · high",
      );
      activity.update("Waiting for model");
      harness.composer.write("Timeline output");
      expect(harness.screen()).toContain("Timeline output");
      expect(harness.screen()).toContain("Waiting for model");
      expect(harness.screen()).toContain("❯ second message");

      activity.stop();
      expect(harness.screen()).not.toContain("Waiting for model");
      expect(live.close()).toEqual({
        value: "second message",
        cursor: 14,
        blocks: [],
        images: [],
      });
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a static live activity and prioritizes it on a two-row terminal", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(100, 2, false, false);
      const live = harness.composer.beginLiveInput(
        {
          phase: "coordinating",
          pendingCount: 0,
          paused: false,
        },
        vi.fn(),
      );
      const activity = harness.composer.beginActivity("Waiting for model");

      vi.advanceTimersByTime(120);
      expect(harness.screen()).toContain("♚ Waiting for model · 0s");
      expect(harness.screen()).toContain("You ›");
      expect(harness.screen().indexOf("Waiting for model")).toBeLessThan(
        harness.screen().indexOf("You ›"),
      );
      expect(harness.screen()).not.toContain("Enter Update current");

      activity.stop();
      expect(live.close()).toEqual({
        value: "",
        cursor: 0,
        blocks: [],
        images: [],
      });
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves a live draft while Ctrl+C confirms and requests cancellation", () => {
    const harness = createHarness();
    const submissions: unknown[] = [];
    const live = harness.composer.beginLiveInput(
      {
        phase: "executing",
        pendingCount: 2,
        paused: false,
      },
      (submission) => submissions.push(submission),
    );
    harness.input.write("keep this draft");
    harness.input.write("\u0003");
    expect(submissions).toEqual([]);
    expect(harness.screen()).toContain(
      "Warning · Press Ctrl+C again to cancel",
    );
    harness.input.write("\u0003");

    expect(submissions).toEqual([
      {
        kind: "stop",
        draft: "keep this draft",
      },
    ]);
    expect(live.close()).toEqual({
      value: "keep this draft",
      cursor: 15,
      blocks: [],
      images: [],
    });
    harness.composer.close();
  });

  it("colors cancellation warnings and expires stale confirmations", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(100, 24, true);
      const submissions: unknown[] = [];
      const live = harness.composer.beginLiveInput(
        {
          phase: "executing",
          pendingCount: 1,
          paused: false,
        },
        (submission) => submissions.push(submission),
      );

      harness.input.write("\u0003");
      expect(harness.rendered()).toContain(
        "\u001b[38;2;212;169;79mWarning\u001b[0m",
      );
      expect(harness.rendered()).toContain(
        "\u001b[38;2;223;114;114mcancel\u001b[0m",
      );
      vi.advanceTimersByTime(3_000);
      expect(harness.screen()).not.toContain("Press Ctrl+C again");

      harness.input.write("\u0003");
      expect(submissions).toEqual([]);
      expect(harness.screen()).toContain("Press Ctrl+C again");
      harness.input.write("\u0003");
      expect(submissions).toEqual([
        { kind: "stop", draft: "" },
      ]);

      live.close();
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("redraws a live draft after timeline output", () => {
    const harness = createHarness();
    const live = harness.composer.beginLiveInput(
      {
        phase: "executing",
        pendingCount: 0,
        paused: false,
      },
      vi.fn(),
    );
    harness.input.write("draft");
    harness.composer.write("Verifier started");

    expect(harness.screen()).toContain("Verifier started");
    expect(harness.screen()).toContain("❯ draft");
    expect(live.close()).toEqual({
      value: "draft",
      cursor: 5,
      blocks: [],
      images: [],
    });
    harness.composer.close();
  });

  it("handles EOF, narrow redraws, Unicode width, and restores raw mode", async () => {
    const harness = createHarness(40, 8);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/");
    harness.output.emit("resize");
    expect(harness.rendered()).toContain("/help");
    expect(harness.rendered()).not.toContain("Show command help");
    harness.input.write("\u0015");
    harness.input.write("\u0004");
    await expect(result).resolves.toBe("/exit");

    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("界")).toBe(2);
    expect(displayWidth("🧭")).toBe(2);
    expect(harness.input.setRawMode).toHaveBeenCalledWith(true);
    harness.composer.close();
    expect(harness.input.setRawMode).toHaveBeenLastCalledWith(false);
  });

  it("keeps a one-row terminal to one inline row without rendering suggestions", async () => {
    const harness = createHarness(12, 1);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/");

    expect(harness.screen()).toContain("You › /");
    expect(harness.screen()).not.toContain("/help");
    expect(
      harness.screen().split("\n").every((line) => displayWidth(line) <= 11),
    ).toBe(true);
    harness.input.emit("keypress", "", { name: "escape", sequence: "\u001b" });
    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
  });

  it("re-anchors a resized inline frame atomically before further navigation", async () => {
    const harness = createHarness(100, 12);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/");
    const beforeResize = harness.chunks().length;

    harness.output.columns = 18;
    harness.output.rows = 3;
    harness.output.emit("resize");
    await waitForInlineResize();

    const resizeWrites = harness.chunks().slice(beforeResize);
    expect(resizeWrites).toHaveLength(1);
    expect(resizeWrites[0]).toContain("\u001b[0J");
    expect(resizeWrites[0]).not.toContain("\u001bc");
    expect(resizeWrites[0]).not.toContain("\u001b[?1049");
    expect(harness.screen()).toContain("You › /");

    const beforeMove = harness.chunks().length;
    harness.input.write("\u001b[B");
    expect(harness.chunks().slice(beforeMove)).toHaveLength(1);
    expect(harness.screen()).toContain("› /status");

    harness.input.write("\t\r");
    await expect(result).resolves.toBe("/status");
    harness.composer.close();
  });

  it("coalesces inline resize bursts and preserves the active draft across reflow", async () => {
    const harness = createHarness(72, 10);
    const result = harness.composer.compose(
      COMPOSER_PROMPT,
      "a deliberately long draft that must survive narrow terminal reflow",
    );
    const beforeResize = harness.chunks().length;

    for (const [columns, rows] of [[46, 8], [28, 5], [20, 4]]) {
      harness.output.columns = columns;
      harness.output.rows = rows;
      harness.output.emit("resize");
    }
    await waitForInlineResize();

    const resizeWrites = harness.chunks().slice(beforeResize);
    expect(resizeWrites).toHaveLength(1);
    expect(resizeWrites[0]).toContain("\u001b[0J");
    expect(resizeWrites[0]).not.toContain("\u001bc");
    expect(resizeWrites[0]).not.toContain("\u001b[?1049");
    expect(harness.screen()).toContain("terminal reflow");

    const afterReflow = harness.chunks().length;
    harness.output.emit("resize");
    await waitForInlineResize();
    expect(harness.chunks()).toHaveLength(afterReflow);

    harness.input.write("\r");
    await expect(result).resolves.toBe(
      "a deliberately long draft that must survive narrow terminal reflow",
    );
    harness.composer.close();
  });

  it("waits for a sustained inline resize drag to settle before repainting", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(72, 10);
      const result = harness.composer.compose(COMPOSER_PROMPT, "stable draft");
      const beforeResize = harness.chunks().length;

      for (const columns of [64, 56, 48, 40]) {
        harness.output.columns = columns;
        harness.output.emit("resize");
        vi.advanceTimersByTime(40);
        expect(harness.chunks()).toHaveLength(beforeResize);
      }

      vi.advanceTimersByTime(80);
      const resizeWrites = harness.chunks().slice(beforeResize);
      expect(resizeWrites).toHaveLength(1);
      expect(resizeWrites[0]).toContain("\u001b[0J");
      expect(harness.screen()).toContain("stable draft");

      harness.input.write("\r");
      await expect(result).resolves.toBe("stable draft");
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses an exact inline anchor when widening without leaving stale separators", async () => {
    const harness = createHarness(28, 8);
    const result = harness.composer.compose(COMPOSER_PROMPT, "stable");

    harness.output.columns = 72;
    harness.output.rows = 10;
    harness.output.emit("resize");
    await waitForInlineResize();

    const separatorRows = harness.screen()
      .split("\n")
      .filter((line) => /^─+$/u.test(line));
    expect(separatorRows).toHaveLength(2);
    expect(separatorRows.every((line) => displayWidth(line) === 71)).toBe(true);
    expect(harness.screen()).toContain("❯ stable");

    harness.input.write("\r");
    await expect(result).resolves.toBe("stable");
    harness.composer.close();
  });

  it("flushes pending inline geometry before writing live output", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(72, 10);
      const live = harness.composer.beginLiveInput(
        {
          phase: "executing",
          pendingCount: 0,
          paused: false,
        },
        vi.fn(),
        "stable draft",
      );
      harness.output.columns = 40;
      harness.output.emit("resize");

      harness.composer.write("Verifier finished");
      const afterOutput = harness.chunks().length;
      expect(harness.screen()).toContain("Verifier finished");
      expect(harness.screen()).toContain("stable draft");

      vi.advanceTimersByTime(100);
      expect(harness.chunks()).toHaveLength(afterOutput);
      expect(live.close()).toMatchObject({ value: "stable draft" });
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps colorized selection changes in one differential write", async () => {
    const harness = createHarness(100, 12, true);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/");
    const before = harness.chunks().length;

    harness.input.write("\u001b[B");

    const updates = harness.chunks().slice(before);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain(
      "\u001b[38;2;143;182;232m›\u001b[0m",
    );
    expect(updates[0]).toContain(
      "\u001b[38;2;143;182;232m/status\u001b[0m",
    );
    expect(updates[0]).not.toContain(
      "\u001b[38;2;143;182;232mCheck provider",
    );
    expect(updates[0]?.match(/\u001b\[2K/g)).toHaveLength(2);
    harness.input.write("\t\r");
    await expect(result).resolves.toBe("/status");
    harness.composer.close();
  });

  it("keeps colored and plain composer screens text-equivalent", async () => {
    const plain = createHarness(100, 12, false);
    const colored = createHarness(100, 12, true);
    const plainResult = plain.composer.compose(COMPOSER_PROMPT);
    const coloredResult = colored.composer.compose(COMPOSER_PROMPT);

    for (const harness of [plain, colored]) {
      harness.input.write("/");
      harness.input.write("\u001b[B");
      harness.input.write("\t\r");
    }

    await expect(plainResult).resolves.toBe("/status");
    await expect(coloredResult).resolves.toBe("/status");
    expect(colored.screen()).toBe(plain.screen());
    plain.composer.close();
    colored.composer.close();
  });

  it("colors the prompt label without coloring the draft as focus text", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(100, 12, true);
      const result = harness.composer.compose(COMPOSER_PROMPT);
      harness.input.write("draft");

      expect(harness.rendered()).toContain(
        "\u001b[38;2;143;182;232m❯\u001b[0m draft",
      );
      expect(harness.rendered()).not.toContain(
        "\u001b[38;2;143;182;232mdraft",
      );

      harness.input.write("\u0003");
      expect(harness.screen()).not.toContain("draft");
      expect(harness.rendered()).not.toContain(
        "Press \u001b[38;2;212;169;79mCtrl+C\u001b[0m again",
      );
      harness.input.write("\u0003");
      expect(harness.rendered()).toContain(
        "Press \u001b[38;2;212;169;79mCtrl+C\u001b[0m again",
      );
      harness.input.write("\u0003");
      await expect(result).resolves.toBe("/exit");
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconfigures prompt color immediately without changing the draft", async () => {
    const harness = createHarness(100, 12, false, false);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("draft");

    harness.composer.setPresentation({
      color: true,
      motion: false,
      richText: true,
    });

    expect(harness.screen()).toContain("❯ draft");
    expect(harness.rendered()).toContain(
      "\u001b[38;2;143;182;232m❯\u001b[0m draft",
    );
    harness.input.write("\r");
    await expect(result).resolves.toBe("draft");
    harness.composer.close();
  });

  it("preserves Ctrl+C as a distinct approval interruption", async () => {
    const harness = createHarness();
    const result = harness.composer.ask("Approve? ");
    harness.input.write("\u0003");
    await expect(result).resolves.toBe("\u0003");
    harness.composer.close();
  });

  it("preserves Ctrl+C as model-picker cancellation", async () => {
    const harness = createHarness();
    const selected = harness.composer.select(
      "Model › ",
      [{ value: "gpt-5.6-sol", label: "GPT-5.6-Sol" }],
      "gpt-5.6-sol",
    );
    harness.input.write("\u0003");

    await expect(selected).resolves.toBe(INTERRUPTED_INPUT);
    expect(harness.rendered()).not.toContain("^C");
    expect(harness.rendered()).not.toContain("Press Ctrl+C again");
    harness.composer.close();
  });

  it("moves long approval prompts onto a separate line in narrow terminals", async () => {
    const harness = createHarness(32, 10);
    const result = harness.composer.ask("Continue in this repository? [y/N] ");
    expect(harness.rendered()).toContain("Continue in this repository? [y/N]");
    expect(harness.rendered()).toContain("› ");
    harness.input.write("yes\r");
    await expect(result).resolves.toBe("yes");
    harness.composer.close();
  });

  it("preserves a long approval prompt when a terminal becomes narrow", async () => {
    const harness = createHarness(100, 10);
    const question = "Continue in this repository? [y/N] ";
    const result = harness.composer.ask(question);
    harness.input.write("y");

    harness.output.columns = 32;
    harness.output.emit("resize");
    await waitForInlineResize();

    expect(harness.rendered()).not.toContain("\u001bc");
    expect(harness.rendered().split(question.trim()).length - 1).toBeGreaterThanOrEqual(2);
    expect(harness.rendered()).toContain("› y");
    harness.input.write("es\r");
    await expect(result).resolves.toBe("yes");
    harness.composer.close();
  });

  it("opens a filtered model picker, marks the current model, and selects a match", async () => {
    const harness = createHarness(100, 12);
    const selected = harness.composer.select(
      "Model › ",
      [
        {
          value: "gpt-5.6-sol",
          label: "GPT-5.6-Sol",
          description: "Frontier coding model",
        },
        {
          value: "gpt-5.6-terra",
          label: "GPT-5.6-Terra",
          description: "Balanced coding model",
        },
        {
          value: "gpt-5.5",
          label: "GPT-5.5",
          description: "Previous model",
        },
      ],
      "gpt-5.5",
    );

    expect(harness.rendered()).toContain("● GPT-5.5");
    expect(harness.rendered()).not.toContain("gpt-5.6-terra");
    expect(harness.rendered()).not.toContain("gpt-5.5");
    harness.input.write("terra");
    const filteredRender = harness.screen();
    expect(filteredRender).toContain("GPT-5.6-Terra");
    expect(filteredRender).not.toContain("GPT-5.6-Sol");
    harness.input.write("\r");

    await expect(selected).resolves.toBe("gpt-5.6-terra");
    harness.composer.close();
  });

  it("uses the left arrow to navigate back without a Back choice", async () => {
    const harness = createHarness(48, 8);
    const selected = harness.composer.select(
      "Setting › ",
      [
        {
          value: "appearance",
          label: "Appearance",
          description: "Color and motion",
        },
      ],
    );

    expect(harness.screen()).not.toContain("Back");
    expect(harness.screen()).not.toContain("__orynt_back__");
    harness.input.write("\u001b[D");
    await expect(selected).resolves.toBe(NAVIGATE_BACK_INPUT);
    harness.composer.close();
  });

  it("renders choice descriptions as muted supporting text", async () => {
    const harness = createHarness(100, 8, true);
    const selected = harness.composer.select(
      "Intelligence › ",
      [
        {
          value: "improve",
          label: "Improvement · shadow review",
          description:
            "Shadow candidates require explicit review before promotion.",
        },
      ],
    );

    expect(harness.rendered()).toContain(
      "\u001b[2mShadow candidates require explicit review before promotion.\u001b[0m",
    );
    expect(harness.rendered()).toContain(
      "\u001b[38;2;143;182;232mImprovement · shadow review\u001b[0m",
    );
    expect(harness.rendered()).toContain(
      "\u001b[2m  ↑↓ select · Enter confirm · ←/Esc back\u001b[0m",
    );
    harness.input.write("\r");
    await expect(selected).resolves.toBe("improve");
    harness.composer.close();
  });

  it("updates muted choice details with selection and clears them on confirm", async () => {
    const harness = createHarness(72, 10, true);
    const selected = harness.composer.select(
      "Agent › ",
      [
        {
          value: "balanced",
          label: "Balanced",
          details: [
            "Impact · default cost and verification balance",
            "Models · coordinator sol/high",
          ],
        },
        {
          value: "quality",
          label: "Quality",
          details: [
            "Impact · strongest review profile",
            "Models · coordinator sol/xhigh",
          ],
        },
      ],
    );

    expect(harness.screen()).toContain("Impact · default cost and verification balance");
    expect(harness.rendered()).toContain("\u001b[2m");
    harness.input.write("\u001b[B");
    expect(harness.screen()).toContain("Impact · strongest review profile");
    expect(harness.screen()).not.toContain("default cost and verification balance");
    expect(harness.screen()).not.toContain("\u001b[48;");

    harness.output.columns = 34;
    harness.output.emit("resize");
    await waitForInlineResize();
    expect(harness.screen()).toContain("Impact · strongest review");
    expect(harness.screen()).not.toContain("\u001bc");

    harness.input.write("\r");
    await expect(selected).resolves.toBe("quality");
    expect(harness.screen()).not.toContain("strongest review profile");
    harness.composer.close();
  });

  it("does not render choice details when the terminal is too short", async () => {
    const harness = createHarness(72, 5, true);
    const selected = harness.composer.select(
      "Agent › ",
      [
        {
          value: "quality",
          label: "Quality",
          details: ["Impact · strongest review profile"],
        },
      ],
    );

    expect(harness.screen()).toContain("Quality");
    expect(harness.screen()).not.toContain("strongest review profile");
    harness.input.write("\r");
    await expect(selected).resolves.toBe("quality");
    harness.composer.close();
  });

  it("uses semantic focus text without interactive backgrounds", async () => {
    const harness = createHarness(60, 8, true);
    const selected = harness.composer.select(
      "Settings › ",
      [
        {
          value: "appearance",
          label: "Appearance",
          description: "Color and motion",
        },
        {
          value: "diagnostics",
          label: "Diagnostics",
          description: "Provider details",
        },
      ],
    );

    expect(harness.rendered()).not.toContain("\u001b[48;");
    expect(harness.rendered()).toContain(
      "\u001b[38;2;143;182;232m›\u001b[0m",
    );
    expect(harness.rendered()).toContain(
      "\u001b[38;2;143;182;232mAppearance\u001b[0m",
    );
    const beforeMove = harness.chunks().length;
    harness.input.write("\u001b[B");
    const move = harness.chunks().slice(beforeMove);
    expect(move).toHaveLength(1);
    expect(move[0]?.match(/\u001b\[2K/gu)).toHaveLength(2);
    expect(move[0]).toContain(
      "\u001b[38;2;143;182;232mDiagnostics\u001b[0m",
    );
    expect(move[0]).not.toContain("\u001b[48;");
    harness.input.write("\r");
    await expect(selected).resolves.toBe("diagnostics");
    harness.composer.close();
  });

  it("does not add backgrounds to plain output or approval prompts", async () => {
    const plain = createHarness(60, 8, false);
    const selection = plain.composer.select(
      "Settings › ",
      [{ value: "appearance", label: "Appearance" }],
    );
    expect(plain.rendered()).not.toContain("\u001b[48;");
    plain.input.write("\r");
    await expect(selection).resolves.toBe("appearance");
    plain.composer.close();

    const approval = createHarness(60, 8, true);
    const answer = approval.composer.ask("Approve? ");
    expect(approval.rendered()).not.toContain("\u001b[48;");
    approval.input.write("yes\r");
    await expect(answer).resolves.toBe("yes");
    expect(approval.rendered()).not.toContain("\u001b[48;");
    approval.composer.close();
  });

  it("adds a filtering hint only when a picker exceeds its visible rows", async () => {
    const harness = createHarness(100, 5, true);
    const selected = harness.composer.select(
      "Model › ",
      Array.from({ length: 5 }, (_, index) => ({
        value: `model-${index}`,
        label: `Model ${index}`,
      })),
    );

    expect(harness.rendered()).toContain(
      "\u001b[2m  ↑↓ select · Enter confirm · ←/Esc back · Type to filter\u001b[0m",
    );
    harness.input.write("\u001b[D");
    await expect(selected).resolves.toBe(NAVIGATE_BACK_INPUT);
    harness.composer.close();
  });

  it("keeps shortcut hints off two-row terminals to preserve the choice row", async () => {
    const harness = createHarness(80, 2, true);
    const selected = harness.composer.select(
      "Setting › ",
      [{ value: "appearance", label: "Appearance" }],
    );

    expect(harness.screen()).toContain("Appearance");
    expect(harness.screen()).not.toContain("Enter confirm");
    harness.input.write("\r");
    await expect(selected).resolves.toBe("appearance");
    harness.composer.close();
  });

  it("cancels the model picker with Escape without returning a model", async () => {
    const harness = createHarness();
    const selected = harness.composer.select(
      "Model › ",
      [{ value: "gpt-5.6-sol", label: "GPT-5.6-Sol" }],
      "gpt-5.6-sol",
    );
    harness.input.emit("keypress", "", { name: "escape", sequence: "\u001b" });

    await expect(selected).resolves.toBe(NAVIGATE_BACK_INPUT);
    harness.composer.close();
  });

  it("navigates model choices with arrow keys", async () => {
    const harness = createHarness();
    const selected = harness.composer.select(
      "Model › ",
      [
        { value: "gpt-5.6-sol", label: "GPT-5.6-Sol" },
        { value: "gpt-5.6-terra", label: "GPT-5.6-Terra" },
      ],
      "gpt-5.6-sol",
    );
    const before = harness.chunks().length;
    harness.input.write("\u001b[B");
    const updates = harness.chunks().slice(before);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.match(/\u001b\[2K/g)).toHaveLength(2);
    harness.input.write("\r");

    await expect(selected).resolves.toBe("gpt-5.6-terra");
    harness.composer.close();
  });

  it("navigates clarification questions, records multi-select notes, and confirms a summary", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(100, 24);
      const resultPromise = harness.composer.clarify({
        title: "Task clarification · round 1/3",
        timeoutMs: 120_000,
        questions: [{
          id: "scope",
          prompt: "Which scope?",
          rationale: "It changes the work.",
          group: "Outcome",
          selectionMode: "single",
          options: [{
            id: "repo",
            label: "Repository",
            description: "Review the whole repository.",
            recommended: true,
            recommendationReason: "Best default.",
          }, {
            id: "package",
            label: "Package",
            description: "Review one package.",
            recommended: false,
          }],
        }, {
          id: "checks",
          prompt: "Which checks?",
          rationale: "They define completion.",
          group: "Validation",
          selectionMode: "multiple",
          options: [{
            id: "tests",
            label: "Tests",
            description: "Run focused tests.",
            recommended: true,
            recommendationReason: "Fast signal.",
            conflictsWith: ["manual"],
          }, {
            id: "types",
            label: "Types",
            description: "Run the build.",
            recommended: true,
            recommendationReason: "Catches contract drift.",
          }, {
            id: "manual",
            label: "Manual only",
            description: "Skip automation.",
            recommended: false,
            conflictsWith: ["tests"],
          }],
        }],
      });

      expect(harness.screen()).toContain("Question 1/2 · Outcome");
      harness.input.emit("keypress", "\r", {
        name: "return",
        sequence: "\r",
      });
      harness.input.emit("keypress", "", {
        name: "right",
        sequence: "\u001b[C",
      });
      harness.input.emit("keypress", "\r", {
        name: "return",
        sequence: "\r",
      });
      harness.input.emit("keypress", "", {
        name: "down",
        sequence: "\u001b[B",
      });
      harness.input.emit("keypress", "\r", {
        name: "return",
        sequence: "\r",
      });
      harness.input.emit("keypress", "\t", {
        name: "tab",
        sequence: "\t",
      });
      for (const character of "keep strict") {
        harness.input.emit("keypress", character, {
          name: character,
          sequence: character,
        });
      }
      harness.input.emit("keypress", "\r", {
        name: "return",
        sequence: "\r",
      });
      harness.input.emit("keypress", "", {
        name: "right",
        sequence: "\u001b[C",
      });
      expect(harness.screen()).toContain("Summary");
      harness.input.emit("keypress", "\r", {
        name: "return",
        sequence: "\r",
      });

      await expect(resultPromise).resolves.toEqual({
        status: "submitted",
        answers: [{
          questionId: "scope",
          selectedOptionIds: ["repo"],
          autoFilled: false,
        }, {
          questionId: "checks",
          selectedOptionIds: ["tests", "types"],
          optionNotes: [{ optionId: "types", note: "keep strict" }],
          autoFilled: false,
        }],
      });
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves clarification selection and note state across inline resize", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(80, 14);
      const resultPromise = harness.composer.clarify({
        title: "Task clarification",
        timeoutMs: 120_000,
        questions: [{
          id: "checks",
          prompt: "Which validation should run?",
          rationale: "The answer defines completion.",
          group: "Validation",
          selectionMode: "multiple",
          options: [{
            id: "tests",
            label: "Focused tests",
            description: "Run the relevant package tests.",
            recommended: true,
          }, {
            id: "build",
            label: "Build",
            description: "Compile the CLI executable.",
            recommended: true,
          }],
        }],
      });

      harness.input.write("\r");
      harness.input.write("\t");
      harness.input.write("keep this note");
      const beforeResize = harness.chunks().length;
      harness.output.columns = 26;
      harness.output.rows = 8;
      harness.output.emit("resize");
      vi.advanceTimersByTime(100);

      const resizeWrites = harness.chunks().slice(beforeResize);
      expect(resizeWrites).toHaveLength(1);
      expect(resizeWrites[0]).toContain("\u001b[0J");
      expect(harness.screen()).toContain("keep this note");

      harness.input.write("\r");
      harness.input.write("\u001b[C");
      expect(harness.screen()).toContain("Summary");
      harness.input.write("\r");

      await expect(resultPromise).resolves.toEqual({
        status: "submitted",
        answers: [{
          questionId: "checks",
          selectedOptionIds: ["tests"],
          optionNotes: [{ optionId: "tests", note: "keep this note" }],
          autoFilled: false,
        }],
      });
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps partial clarification choices and auto-fills unanswered recommendations at 120s", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(90, 20);
      const resultPromise = harness.composer.clarify({
        title: "Task clarification",
        timeoutMs: 120_000,
        questions: [{
          id: "scope",
          prompt: "Scope?",
          rationale: "Material.",
          group: "Outcome",
          selectionMode: "single",
          options: [{
            id: "repo",
            label: "Repository",
            description: "Whole repository.",
            recommended: true,
          }, {
            id: "package",
            label: "Package",
            description: "One package.",
            recommended: false,
          }],
        }, {
          id: "validation",
          prompt: "Validation?",
          rationale: "Material.",
          group: "Validation",
          selectionMode: "multiple",
          options: [{
            id: "tests",
            label: "Tests",
            description: "Run tests.",
            recommended: true,
          }, {
            id: "build",
            label: "Build",
            description: "Run build.",
            recommended: true,
          }],
        }],
      });

      harness.input.write("\r");
      vi.advanceTimersByTime(120_000);

      await expect(resultPromise).resolves.toEqual({
        status: "auto_submitted",
        answers: [{
          questionId: "scope",
          selectedOptionIds: ["repo"],
          autoFilled: false,
        }, {
          questionId: "validation",
          selectedOptionIds: ["tests", "build"],
          autoFilled: true,
        }],
      });
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("expands ordinary bracketed multiline paste into logical composer rows", async () => {
    const clipboard: CliClipboardReader = {
      read: vi.fn(async () => ({ kind: "text", text: "unused" })),
      writeText: vi.fn(async () => undefined),
      resolveDroppedPaths: vi.fn(async () => undefined),
    };
    const harness = createHarness(100, 24, false, false, false, clipboard);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.emit("keypress", "", {
      name: "paste-start",
      sequence: "\u001b[200~",
    });
    for (const line of ["alpha\n", "beta\n", "gamma\n", "delta"]) {
      harness.input.emit("keypress", line, { sequence: line });
    }
    harness.input.emit("keypress", "", {
      name: "paste-end",
      sequence: "\u001b[201~",
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(harness.screen()).toContain("❯ alpha");
    expect(harness.screen()).toContain("│ beta");
    expect(harness.screen()).toContain("│ delta");
    harness.input.write("\r");
    await expect(result).resolves.toBe("alpha\nbeta\ngamma\ndelta");
    harness.composer.close();
  });

  it("attaches a clipboard image through /paste image", async () => {
    const image = {
      kind: "local_file" as const,
      path: "/tmp/orynt-image.png",
      mimeType: "image/png",
      sha256: "a".repeat(64),
      byteLength: 123,
      detail: "high" as const,
      source: "user_attachment" as const,
    };
    const clipboard: CliClipboardReader = {
      read: vi.fn(async () => ({
        kind: "image",
        image,
        label: "clipboard.png",
        width: 320,
        height: 200,
      })),
      writeText: vi.fn(async () => undefined),
      resolveDroppedPaths: vi.fn(async () => undefined),
    };
    const harness = createHarness(100, 24, false, false, false, clipboard);
    const result = harness.composer.compose(COMPOSER_PROMPT);
    harness.input.write("/paste image\r");
    await new Promise((resolve) => setImmediate(resolve));

    expect(clipboard.read).toHaveBeenCalledWith("image");
    expect(harness.screen()).toContain("[Image #1 · clipboard.png · 320×200]");
    harness.input.write("\r");
    await expect(result).resolves.toContain("Attached image 1");
    expect(harness.composer.takeSubmittedImages()).toEqual([image]);
    harness.composer.close();
  });
});
