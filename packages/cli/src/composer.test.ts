import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { INTERRUPTED_INPUT, TtyComposer, displayWidth } from "./composer";

function stripColor(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/gu, "");
}

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
        if (match[2] === "K" && (match[1] === "2" || !match[1])) {
          ensureRow();
          lines[row] = "";
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
    onInterrupt,
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

describe("TTY command composer", () => {
  it("animates one inline activity row and atomically preserves permanent output", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const activity = harness.composer.beginActivity(
        "Coordinate gpt-5.6-sol · high",
      );

      vi.advanceTimersByTime(119);
      expect(harness.rendered()).not.toContain("◜");
      vi.advanceTimersByTime(1);
      expect(harness.screen()).toContain(
        "◜ Coordinate gpt-5.6-sol · high",
      );
      vi.advanceTimersByTime(100);
      expect(harness.screen()).toContain(
        "◝ Coordinate gpt-5.6-sol · high",
      );

      activity.update("Review verifier evidence");
      harness.composer.write("Verifier failed");
      expect(harness.screen()).toContain("Verifier failed");
      expect(harness.screen()).toContain("Review verifier evidence");

      activity.settle("Review complete");
      expect(harness.screen()).toContain("◇ Review complete");
      expect(harness.screen()).not.toMatch(/[◜◝◞◟]/u);
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not emit cursor controls or spinner frames when terminal motion is disabled", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(100, 24, false, false);
      const activity = harness.composer.beginActivity("Loading models");
      vi.advanceTimersByTime(1_000);
      activity.stop();

      expect(harness.rendered()).toBe("");
      harness.composer.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens and filters the slash palette, then completes with Tab without executing", async () => {
    const harness = createHarness();
    const result = harness.composer.compose("❯ ");

    harness.input.write("/do");
    expect(harness.rendered()).toContain("/doctor");
    expect(harness.rendered()).toContain("Diagnose terminal");

    harness.input.write("\t");
    expect(harness.rendered()).toContain("❯ /doctor");
    harness.input.write("\r");

    await expect(result).resolves.toBe("/doctor");
    harness.composer.close();
  });

  it("uses Enter once for safe completion and a second time for submission", async () => {
    const harness = createHarness();
    const result = harness.composer.compose("❯ ");

    harness.input.write("/do\r");
    expect(harness.rendered()).toContain("❯ /doctor");
    harness.input.write("\r");

    await expect(result).resolves.toBe("/doctor");
    harness.composer.close();
  });

  it("submits an exact no-argument or optional command with one Enter", async () => {
    const harness = createHarness();
    const model = harness.composer.compose("❯ ");
    harness.input.write("/model\r");
    await expect(model).resolves.toBe("/model");

    const exit = harness.composer.compose("❯ ");
    harness.input.write("/exit\r");
    await expect(exit).resolves.toBe("/exit");
    harness.composer.close();
  });

  it("keeps an exact required-argument command open for its value", async () => {
    const harness = createHarness();
    const repository = harness.composer.compose("❯ ");
    harness.input.write("/repo\r");
    expect(harness.rendered()).toContain("❯ /repo ");
    harness.input.write("./project\r");

    await expect(repository).resolves.toBe("/repo ./project");
    harness.composer.close();
  });

  it("navigates slash suggestions with arrow keys", async () => {
    const harness = createHarness();
    const selected = harness.composer.compose("❯ ");
    harness.input.write("/");
    harness.input.write("\u001b[B");
    harness.input.write("\t");
    harness.input.write("\r");
    await expect(selected).resolves.toBe("/status");
    harness.composer.close();
  });

  it("repaints only changed slash rows in one write when selection moves", async () => {
    const harness = createHarness();
    const selected = harness.composer.compose("❯ ");
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

  it("moves the input cursor without erasing or repainting content", async () => {
    const harness = createHarness();
    const result = harness.composer.compose("❯ ");
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
    const result = harness.composer.compose("❯ ");
    harness.input.write("A👩🏽‍💻B");
    harness.input.write("\u001b[D\u001b[Dx\r");

    await expect(result).resolves.toBe("Ax👩🏽‍💻B");
    expect(displayWidth("👩🏽‍💻")).toBe(2);
    expect(displayWidth("🇻🇳")).toBe(2);
    expect(displayWidth("e\u0301")).toBe(1);
    harness.composer.close();
  });

  it("does not write anything when a render leaves content and cursor unchanged", async () => {
    const harness = createHarness();
    const result = harness.composer.compose("❯ ");
    const before = harness.chunks().length;

    harness.input.write("\u0001");

    expect(harness.chunks().slice(before)).toHaveLength(0);
    harness.input.write("\r");
    await expect(result).resolves.toBe("");
    harness.composer.close();
  });

  it("completes a slash command with one differential frame", async () => {
    const harness = createHarness();
    const result = harness.composer.compose("❯ ");
    harness.input.write("/do");
    const before = harness.chunks().length;

    harness.input.write("\t");

    expect(harness.chunks().slice(before)).toHaveLength(1);
    expect(harness.screen()).toContain("❯ /doctor");
    expect(harness.screen()).not.toContain("Diagnose terminal");
    harness.input.write("\r");
    await expect(result).resolves.toBe("/doctor");
    expect(harness.rendered()).not.toContain("\u001b[?1049");
    harness.composer.close();
  });

  it("inserts argument spacing when completing a command", async () => {
    const harness = createHarness();
    const argumentCommand = harness.composer.compose("❯ ");
    harness.input.write("/re");
    harness.input.write("\t");
    expect(harness.rendered()).toContain("❯ /repo ");
    harness.input.write("./project");
    harness.input.write("\r");
    await expect(argumentCommand).resolves.toBe("/repo ./project");
    harness.composer.close();
  });

  it("dismisses suggestions with Escape without clearing the draft", async () => {
    const harness = createHarness();
    const dismissed = harness.composer.compose("❯ ");
    harness.input.write("/do");
    harness.input.emit("keypress", "", { name: "escape", sequence: "\u001b" });
    harness.input.write("\r");
    await expect(dismissed).resolves.toBe("/do");
    harness.composer.close();
  });

  it("keeps deduplicated command history outside approval answers", async () => {
    const harness = createHarness();
    const first = harness.composer.compose("❯ ");
    harness.input.write("inspect repository\r");
    await expect(first).resolves.toBe("inspect repository");
    harness.composer.remember("inspect repository");

    const approval = harness.composer.ask("Approve? ");
    harness.input.write("yes\r");
    await expect(approval).resolves.toBe("yes");

    const recalled = harness.composer.compose("❯ ");
    harness.input.write("\u001b[A\r");
    await expect(recalled).resolves.toBe("inspect repository");
    harness.composer.close();
  });

  it("recalls and edits a logical multiline history value without corrupting the renderer", async () => {
    const harness = createHarness(48, 10);
    harness.composer.remember("fix the contract\nwithout changing the API");
    const recalled = harness.composer.compose("❯ ");

    harness.input.write("\u001b[A");
    expect(harness.rendered()).toContain("fix the contract\\nwithout changing the API");
    expect(harness.rendered()).not.toContain("fix the contract\nwithout changing the API");
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
      const result = harness.composer.compose("❯ ");
      harness.input.write("discard me\u0003");
      expect(harness.rendered()).toContain("Press Ctrl+C again to exit Orynt · 3s");
      expect(harness.rendered()).not.toContain("^C");
      expect(harness.onInterrupt).not.toHaveBeenCalled();

      let offset = harness.rendered().length;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(harness.rendered().slice(offset)).toContain(
        "Press Ctrl+C again to exit Orynt · 2s",
      );

      offset = harness.rendered().length;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(harness.rendered().slice(offset)).toContain(
        "Press Ctrl+C again to exit Orynt · 1s",
      );

      offset = harness.rendered().length;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(harness.screen()).toContain("❯");
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
      const result = harness.composer.compose("❯ ");
      harness.input.write("discard me\u0003");
      await vi.advanceTimersByTimeAsync(1_250);
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
      const result = harness.composer.compose("❯ ");
      harness.input.write("\u0003k");
      await vi.advanceTimersByTimeAsync(3_000);
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
      const result = harness.composer.compose("❯ ");
      harness.input.write("\u0003");
      await vi.advanceTimersByTimeAsync(3_000);
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
      const result = harness.composer.compose("❯ ");
      harness.input.write("\u0003");
      harness.composer.close();
      const renderedAtClose = harness.rendered();

      await expect(result).resolves.toBe("/exit");
      await vi.advanceTimersByTimeAsync(3_000);
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

  it("handles EOF, narrow redraws, Unicode width, and restores raw mode", async () => {
    const harness = createHarness(40, 8);
    const result = harness.composer.compose("❯ ");
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
    const result = harness.composer.compose("❯ ");
    harness.input.write("/");

    expect(harness.screen()).toContain("❯ /");
    expect(harness.screen()).not.toContain("/help");
    expect(
      harness.screen().split("\n").every((line) => displayWidth(line) <= 11),
    ).toBe(true);
    harness.input.emit("keypress", "", { name: "escape", sequence: "\u001b" });
    harness.input.write("\r");
    await expect(result).resolves.toBe("/");
    harness.composer.close();
  });

  it("re-anchors a resized inline frame atomically before further navigation", async () => {
    const harness = createHarness(100, 12);
    const result = harness.composer.compose("❯ ");
    harness.input.write("/");
    const beforeResize = harness.chunks().length;

    harness.output.columns = 18;
    harness.output.rows = 3;
    harness.output.emit("resize");

    const resizeWrites = harness.chunks().slice(beforeResize);
    expect(resizeWrites).toHaveLength(1);
    expect(resizeWrites[0]).toContain("\u001b[0J");
    expect(resizeWrites[0]).not.toContain("\u001bc");
    expect(resizeWrites[0]).not.toContain("\u001b[?1049");
    expect(harness.screen()).toContain("❯ /");

    const beforeMove = harness.chunks().length;
    harness.input.write("\u001b[B");
    expect(harness.chunks().slice(beforeMove)).toHaveLength(1);
    expect(harness.screen()).toContain("› /status");

    harness.input.write("\t\r");
    await expect(result).resolves.toBe("/status");
    harness.composer.close();
  });

  it("keeps colorized selection changes in one differential write", async () => {
    const harness = createHarness(100, 12, true);
    const result = harness.composer.compose("❯ ");
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

  it("keeps colored and plain composer transcripts text-equivalent", async () => {
    const plain = createHarness(100, 12, false);
    const colored = createHarness(100, 12, true);
    const plainResult = plain.composer.compose("❯ ");
    const coloredResult = colored.composer.compose("❯ ");

    for (const harness of [plain, colored]) {
      harness.input.write("/");
      harness.input.write("\u001b[B");
      harness.input.write("\t\r");
    }

    await expect(plainResult).resolves.toBe("/status");
    await expect(coloredResult).resolves.toBe("/status");
    expect(stripColor(colored.rendered())).toBe(plain.rendered());
    plain.composer.close();
    colored.composer.close();
  });

  it("colors only the prompt marker and exit key in the active frame", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness(100, 12, true);
      const result = harness.composer.compose("❯ ");
      harness.input.write("draft");

      expect(harness.rendered()).toContain(
        "\u001b[38;2;143;182;232m❯\u001b[0m draft",
      );
      expect(harness.rendered()).not.toContain(
        "\u001b[38;2;143;182;232mdraft",
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
    const result = harness.composer.ask("Acknowledge this supervised repository boundary? [y/N] ");
    expect(harness.rendered()).toContain("Acknowledge this supervised repository boundary? [y/N]");
    expect(harness.rendered()).toContain("› ");
    harness.input.write("yes\r");
    await expect(result).resolves.toBe("yes");
    harness.composer.close();
  });

  it("preserves a long approval prompt when a terminal becomes narrow", async () => {
    const harness = createHarness(100, 10);
    const question = "Acknowledge this supervised repository boundary? [y/N] ";
    const result = harness.composer.ask(question);
    harness.input.write("y");

    harness.output.columns = 32;
    harness.output.emit("resize");

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
    harness.input.write("terra");
    const filteredRender = harness.screen();
    expect(filteredRender).toContain("GPT-5.6-Terra");
    expect(filteredRender).not.toContain("GPT-5.6-Sol");
    harness.input.write("\r");

    await expect(selected).resolves.toBe("gpt-5.6-terra");
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

    await expect(selected).resolves.toBe("");
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
});
