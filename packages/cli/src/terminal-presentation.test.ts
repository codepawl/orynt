import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "bun:test";
import * as ts from "typescript";

import {
  createTerminalDesignSystem,
  renderTerminalDetailRows,
  terminalTextWidth,
  wrapTerminalParagraph,
  type TerminalOutput,
} from "./terminal-presentation";

const stripAnsi = (value: string): string =>
  value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "");

describe("terminal presentation source of truth", () => {
  it("adds rich semantic hierarchy without changing plain text", () => {
    const design = createTerminalDesignSystem(true, "quiet-studio");
    const input = [
      "Settings",
      "  Agent        custom · gpt-5.6-sol",
      "  Status       ready · 4 messages · 23s",
      "  Command      /status",
      "  Path         packages/cli/src/session.ts",
    ].join("\n");
    const output: TerminalOutput = design.renderProductText(input);

    expect(stripAnsi(output)).toBe(input);
    expect(output).toContain("\u001b[1;38;2;198;167;216mSettings");
    expect(output).toContain("\u001b[38;2;180;178;202mAgent");
    expect(output).toContain("\u001b[38;2;198;167;216mgpt-5.6-sol");
    expect(output).toContain("\u001b[38;2;143;182;232m/status");
    expect(output).toContain("\u001b[4;38;2;143;182;232mpackages/cli/src/session.ts");
  });

  it("styles every structured tree title with the Settings hierarchy", () => {
    const design = createTerminalDesignSystem(true, "quiet-studio");
    const input = [
      "Session",
      ...renderTerminalDetailRows([
        { label: "ID", value: "session-current" },
        { label: "Context", value: "13% used" },
      ], { width: 80 }),
    ].join("\n");
    const output = design.renderProductText(input);

    expect(stripAnsi(output)).toBe(input);
    expect(output).toContain("\u001b[1;38;2;198;167;216mSession");
    expect(output).toContain("\u001b[38;2;180;178;202mID");
  });

  it("styles complete numeric quantities without fragmenting identifiers", () => {
    const design = createTerminalDesignSystem(true, "quiet-studio");
    const sessionId = "session-937c9209-9ae9-46a2-b1de-b27abfabd17d";
    const input =
      `Context 13% · 7d · 250ms · 2 MiB · 223,533 tokens · 2 messages · 3 sessions · ${sessionId}`;
    const output = design.renderProductText(input);

    expect(stripAnsi(output)).toBe(input);
    for (const quantity of [
      "13%",
      "7d",
      "250ms",
      "2 MiB",
      "223,533 tokens",
      "2 messages",
      "3 sessions",
    ]) {
      expect(output).toContain(`\u001b[38;2;216;181;106m${quantity}`);
    }
    expect(output).toContain(sessionId);
  });

  it("keeps arbitrary prose neutral while styling known state tokens", () => {
    const design = createTerminalDesignSystem(true);
    const output = design.renderProductText(
      "This sentence remains readable while verification is pending.",
    );
    expect(stripAnsi(output)).toBe(
      "This sentence remains readable while verification is pending.",
    );
    expect(output).toContain("This sentence remains readable while verification is ");
    expect(output).toContain("\u001b[38;2;212;169;79mpending");
  });

  it("is byte-identical when color is disabled and never nests ANSI", () => {
    const plain = createTerminalDesignSystem(false);
    expect(plain.renderProductText("Settings\n  Model  gpt-5.6-sol")).toBe(
      "Settings\n  Model  gpt-5.6-sol",
    );
    const colored = createTerminalDesignSystem(true);
    const preRendered = colored.span("success", "ready");
    expect(colored.renderProductText(preRendered)).toBe(preRendered);
  });

  it("moves a semantic shimmer across an activity label without changing its text", () => {
    const design = createTerminalDesignSystem(true);
    const first = design.activityLabel("Coordinate agent", 0);
    const later = design.activityLabel("Coordinate agent", 4);
    const beyondLoaderCycle = design.activityLabel("Coordinate agent", 12);
    const atEnd = design.activityLabel("Coordinate agent", 13);
    const returning = design.activityLabel("Coordinate agent", 14);

    expect(stripAnsi(first)).toBe("Coordinate agent");
    expect(stripAnsi(later)).toBe("Coordinate agent");
    expect(first).not.toBe(later);
    expect(first).toContain("\u001b[38;2;143;182;232mCoo");
    expect(later).toContain("\u001b[38;2;143;182;232mdi");
    expect(beyondLoaderCycle).toContain(
      "\u001b[38;2;143;182;232mgen",
    );
    expect(atEnd).toContain("\u001b[38;2;143;182;232ment");
    expect(returning).toBe(beyondLoaderCycle);
    expect(createTerminalDesignSystem(false).activityLabel("Coordinate", 3))
      .toBe("Coordinate");
  });

  it("wraps Unicode product text and unbroken tokens within live width", () => {
    const lines = wrapTerminalParagraph(
      "Model 🧠 handles packages/cli/src/a-very-long-command-output-file.ts safely",
      24,
      {
        firstIndent: "  ",
        continuationIndent: "    ",
      },
    );
    expect(lines.every((line) => terminalTextWidth(line) <= 24)).toBe(true);
    expect(lines.join(" ")).toContain("🧠");
    expect(lines.every((line) => !/\s+$/u.test(line))).toBe(true);
  });

  it("renders responsive detail rows with hanging tree indentation", () => {
    const rows = [
      {
        label: "Repository",
        value: "/workspace/a-very-long-repository-name/packages/cli",
      },
      {
        label: "Provider",
        value: "ready with a deliberately detailed provider status",
      },
    ];
    for (const width of [20, 40, 80]) {
      const rendered = renderTerminalDetailRows(rows, { width });
      expect(rendered.every((line) => terminalTextWidth(line) <= width)).toBe(
        true,
      );
      expect(rendered.every((line) => !/\s+$/u.test(line))).toBe(true);
      expect(rendered.join("\n")).toContain("Repository");
      expect(rendered.join("\n")).toContain("Provider");
    }
  });

  it("keeps raw color creation and RGB literals inside the owned registry", async () => {
    const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
    const sourceFiles = (await readdir(sourceRoot))
      .filter((file) =>
        file.endsWith(".ts") &&
        !file.endsWith(".test.ts") &&
        file !== "terminal-theme.ts" &&
        file !== "terminal-presentation.ts"
      );
    for (const file of sourceFiles) {
      const source = await readFile(path.join(sourceRoot, file), "utf8");
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const directThemeCalls: number[] = [];
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "createTerminalTheme"
        ) {
          directThemeCalls.push(
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          );
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
      expect(directThemeCalls).toEqual([]);
      expect(source).not.toMatch(/(?:38|48);2;/u);
    }
  });
});
