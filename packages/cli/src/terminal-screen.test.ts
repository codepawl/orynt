import { PassThrough } from "node:stream";

import { describe, expect, it } from "bun:test";

import {
  centerTerminalText,
  TerminalScreen,
  wrapTerminalText,
} from "./terminal-screen";

function output(columns = 20, rows = 8) {
  const stream = new PassThrough() as PassThrough & {
    columns: number;
    rows: number;
  };
  stream.columns = columns;
  stream.rows = rows;
  const chunks: string[] = [];
  stream.on("data", (chunk) => chunks.push(chunk.toString()));
  return { stream, chunks };
}

describe("TerminalScreen", () => {
  it("enables regional mouse input and restores shell mouse state", () => {
    const harness = output();
    const screen = new TerminalScreen(harness.stream);
    screen.enter();
    const entered = harness.chunks.join("");
    expect(entered).toContain("\u001b[?1049h");
    expect(entered).toContain("\u001b[?1002h");
    expect(entered).toContain("\u001b[?1006h");
    screen.leave();
    expect(harness.chunks.at(-1)).toContain("\u001b[?1006l");
    expect(harness.chunks.at(-1)).toContain("\u001b[?1002l");
    expect(harness.chunks.at(-1)).toContain("\u001b[?1049l");
    expect(harness.chunks.at(-1)).toContain("\u001b[?25h");
  });

  it("yields terminal ownership and repaints after resume", () => {
    const harness = output();
    const screen = new TerminalScreen(harness.stream);
    screen.enter();
    screen.suspend();
    expect(harness.chunks.at(-1)).toContain("\u001b[?1049l");
    screen.resume();
    const resumed = harness.chunks.at(-1)!;
    expect(resumed).toContain("\u001b[?1049h");
    expect(resumed).toContain("\u001b[?1002h");
    expect(resumed).toContain("\u001b[?1006h");
    screen.appendHistory("restored");
    screen.render({
      composer: ["prompt"],
      composerCursorRow: 0,
      composerCursorColumn: 0,
    });
    expect(harness.chunks.at(-1)).toContain("restored");
    screen.leave();
  });

  it("tracks the composer region across frame geometry changes", () => {
    const harness = output(20, 8);
    const screen = new TerminalScreen(harness.stream);
    screen.enter();
    screen.render({
      composer: ["border", "prompt", "status"],
      composerCursorRow: 1,
      composerCursorColumn: 0,
    });
    expect(screen.isComposerRow(5)).toBe(false);
    expect(screen.isComposerRow(6)).toBe(true);
    expect(screen.isComposerRow(8)).toBe(true);

    harness.stream.rows = 5;
    screen.render({
      composer: ["prompt"],
      composerCursorRow: 0,
      composerCursorColumn: 0,
    });
    expect(screen.isComposerRow(4)).toBe(false);
    expect(screen.isComposerRow(5)).toBe(true);
    screen.leave();
  });

  it("force-renders one bounded viewport at each geometry", () => {
    const harness = output(20, 6);
    const screen = new TerminalScreen(harness.stream);
    screen.enter();
    screen.appendHistory("old output\nsecond line\n");
    screen.render({
      composer: ["───────────────────", '❯ Try "explain"', "───────────────────"],
      composerCursorRow: 1,
      composerCursorColumn: 2,
    });
    harness.stream.columns = 12;
    harness.stream.rows = 5;
    screen.render({
      composer: ["───────────", "❯ Try repo", "───────────"],
      composerCursorRow: 1,
      composerCursorColumn: 2,
    });

    const repaint = harness.chunks.at(-1)!;
    expect(repaint).toContain("\u001b[H");
    expect(repaint).toContain("\u001b[J");
    expect(repaint.match(/❯ Try repo/gu)).toHaveLength(1);
    expect(repaint.match(/───────────/gu)).toHaveLength(2);
    expect(repaint).not.toContain('Try "explain"');
  });

  it("keeps a scrolled viewport stable when new output arrives", () => {
    const harness = output(30, 5);
    const screen = new TerminalScreen(harness.stream);
    screen.enter();
    screen.appendHistory("one\ntwo\nthree\nfour\nfive\nsix");
    const frame = {
      composer: ["prompt"],
      composerCursorRow: 0,
      composerCursorColumn: 0,
    };
    screen.render(frame);
    expect(screen.scroll(2)).toBe(true);
    screen.render(frame);
    screen.appendHistory("seven");
    screen.render(frame);
    expect(screen.debugState().scrollOffset).toBe(3);
    expect(harness.chunks.at(-1)).toContain("3 newer lines");
    expect(screen.scrollToTail()).toBe(true);
    screen.render(frame);
    expect(screen.debugState().scrollOffset).toBe(0);
  });

  it("wraps ANSI and wide graphemes without leaking style state", () => {
    expect(wrapTerminalText("\u001b[1m界界界\u001b[0m", 4)).toEqual([
      "\u001b[1m界界\u001b[0m",
      "\u001b[1m界\u001b[0m",
    ]);
  });

  it("decorates semantic history after wrapping and leaves its separator unstyled", () => {
    const harness = output(10, 6);
    const screen = new TerminalScreen(harness.stream);
    screen.enter();
    screen.appendHistory("You › abcdef\n", {
      decorateRow: (rendered) => `<row>${rendered}</row>`,
    });
    const frame = {
      composer: ["prompt"],
      composerCursorRow: 0,
      composerCursorColumn: 0,
    };
    screen.render(frame);
    expect(harness.chunks.at(-1)).toContain("<row>You › abcd</row>");
    expect(harness.chunks.at(-1)).toContain("<row>ef</row>");
    expect(harness.chunks.at(-1)).not.toContain("<row></row>");

    harness.stream.columns = 8;
    screen.render(frame);
    expect(harness.chunks.at(-1)).toContain("<row>You › ab</row>");
    expect(harness.chunks.at(-1)).toContain("<row>cdef</row>");
    expect(screen.beginSelection(3, 1)).toBe(true);
    expect(screen.extendSelection(4, 4)).toBe(true);
    expect(screen.selectedText()).toBe("You › abcdef");
    screen.render(frame);
    expect(harness.chunks.at(-1)).toContain("<row>");
  });

  it("caches bounded history and repaints only dirty rows", () => {
    const harness = output(80, 12);
    const screen = new TerminalScreen(harness.stream);
    screen.enter();
    screen.appendHistory("a".repeat(256 * 1024));
    const frame = {
      composer: ["prompt"],
      composerCursorRow: 0,
      composerCursorColumn: 0,
    };
    screen.render(frame);
    const afterFirst = screen.debugState();
    const writes = harness.chunks.length;
    for (let index = 0; index < 20; index += 1) screen.render(frame);
    const stable = screen.debugState();

    expect(stable.wrapCount).toBe(afterFirst.wrapCount);
    expect(harness.chunks).toHaveLength(writes);
    screen.render({ ...frame, composer: ["changed"] });
    expect(screen.debugState().dirtyRowWriteCount).toBe(1);
    expect(harness.chunks.at(-1)).not.toContain("\u001b[J");
  });

  it("invalidates the width cache exactly once for a new geometry", () => {
    const harness = output(80, 12);
    const screen = new TerminalScreen(harness.stream);
    screen.enter();
    screen.appendHistory("one\n".repeat(100));
    const frame = {
      composer: ["prompt"],
      composerCursorRow: 0,
      composerCursorColumn: 0,
    };
    screen.render(frame);
    const initialWraps = screen.debugState().wrapCount;
    harness.stream.columns = 40;
    screen.render(frame);
    const resizedWraps = screen.debugState().wrapCount;
    screen.render(frame);
    expect(resizedWraps).toBeGreaterThan(initialWraps);
    expect(screen.debugState().wrapCount).toBe(resizedWraps);
  });

  it("re-centers semantic history entries at every rendered width", () => {
    const variants = [
      "─────── ✦ Crafted in 43s ───────",
      "───── ✦ Crafted in 43s ─────",
      "───── ✦ 43s ─────",
      "✦ 43s",
    ];
    expect(centerTerminalText(variants, 60)).toBe(
      "             ─────── ✦ Crafted in 43s ───────",
    );
    expect(centerTerminalText(variants, 32)).toBe(
      " ───── ✦ Crafted in 43s ─────",
    );
    expect(centerTerminalText(variants, 18)).toBe("───── ✦ 43s ─────");
    expect(
      centerTerminalText(["\u001b[2m界\u001b[0m"], 6),
    ).toBe(" \u001b[2m界\u001b[0m");

    const harness = output(60, 4);
    const screen = new TerminalScreen(harness.stream);
    screen.enter();
    screen.appendHistory(variants[0]!, { centeredVariants: variants });
    const frame = {
      composer: ["prompt"],
      composerCursorRow: 0,
      composerCursorColumn: 0,
    };
    screen.render(frame);
    expect(harness.chunks.at(-1)).toContain(
      "             ─────── ✦ Crafted in 43s ───────",
    );

    harness.stream.columns = 32;
    screen.render(frame);
    expect(harness.chunks.at(-1)).toContain(
      " ───── ✦ Crafted in 43s ─────",
    );

    harness.stream.columns = 100;
    screen.render(frame);
    expect(harness.chunks.at(-1)).toContain(
      "                                 ─────── ✦ Crafted in 43s ───────",
    );
    screen.leave();
  });

  it("keeps plain chat selection stable across scroll and reflow", () => {
    const harness = output(20, 5);
    const screen = new TerminalScreen(harness.stream);
    screen.enter();
    screen.appendHistory(
      "\u001b[31mone\ntwo\nthree\nfour\nfive\nsix\u001b[0m",
    );
    const frame = {
      composer: ["prompt"],
      composerCursorRow: 0,
      composerCursorColumn: 0,
    };
    screen.render(frame);

    expect(screen.beginSelection(1, 1)).toBe(true);
    expect(screen.extendSelection(2, 4)).toBe(true);
    expect(screen.selectedText()).toBe("three\nfour");
    screen.render(frame);
    expect(harness.chunks.at(-1)).toContain("\u001b[7m");

    expect(screen.scroll(1)).toBe(true);
    screen.render(frame);
    expect(screen.selectedText()).toBe("three\nfour");

    harness.stream.columns = 10;
    screen.render(frame);
    expect(screen.selectedText()).toBe("three\nfour");
    expect(screen.clearSelection()).toBe(true);
    expect(screen.selectedText()).toBeUndefined();
    screen.leave();
  });
});
