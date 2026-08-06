import { describe, expect, it } from "bun:test";

import {
  IncrementalRichTextRenderer,
  renderRichText,
} from "./rich-text";
import { createTerminalTheme } from "./terminal-theme";

const quietTheme = createTerminalTheme(true, "quiet-studio");
const plainTheme = createTerminalTheme(false, "quiet-studio");

const stripAnsi = (value: string) =>
  value.replace(/\u001b\[[0-9;]*m/gu, "");

describe("rich terminal text", () => {
  it("renders emphasis without markers and keeps marker-preserving compose text", () => {
    const agent = renderRichText("Use **bold** and *italic* with `code`.", {
      enabled: true,
      theme: quietTheme,
    });
    expect(stripAnsi(agent)).toBe("Use bold and italic with code.");
    expect(agent).toContain("\u001b[1mbold\u001b[0m");
    expect(agent).toContain("\u001b[3mitalic\u001b[0m");

    const compose = renderRichText("Use **bold** and *italic*.", {
      enabled: true,
      theme: plainTheme,
      preserveMarkers: true,
    });
    expect(stripAnsi(compose)).toBe("Use **bold** and *italic*.");
    expect(compose).toContain("\u001b[2m**\u001b[0m");
  });

  it("underlines repository paths but does not style web URLs", () => {
    const rendered = renderRichText(
      "Open packages/cli/src/session.ts:42 and https://example.com/a.",
      { enabled: true, theme: quietTheme },
    );
    expect(rendered).toContain(
      "\u001b[4;38;2;143;182;232mpackages/cli/src/session.ts:42\u001b[0m",
    );
    expect(rendered).toContain("https://example.com/a.");
  });

  it("indents continuation lines beneath an agent message prefix", () => {
    const rendered = renderRichText("First\n\nSecond", {
      enabled: true,
      theme: plainTheme,
      continuationIndent: "        ",
    });
    expect(rendered).toBe("First\n        \n        Second");
  });

  it("highlights declared fenced code and safely falls back for unknown or unclosed fences", () => {
    const typescript = renderRichText(
      "```ts\nconst answer: number = 42;\n```",
      { enabled: true, theme: quietTheme },
    );
    expect(stripAnsi(typescript)).toBe("const answer: number = 42;");
    expect(typescript).toContain("\u001b[");

    expect(
      stripAnsi(
        renderRichText("```made-up\nhello()\n```", {
          enabled: true,
          theme: quietTheme,
        }),
      ),
    ).toBe("hello()");
    expect(
      stripAnsi(
        renderRichText("```ts\nconst unfinished = true;", {
          enabled: true,
          theme: quietTheme,
        }),
      ),
    ).toBe("const unfinished = true;");
  });

  it("uses dedicated Studio Spectrum syntax tokens and monochrome styles", () => {
    const source = "```js\nconst label = \"orynt\"; const count = 42;\n```";
    const studio = renderRichText(source, {
      enabled: true,
      theme: quietTheme,
    });
    expect(studio).toContain(
      "\u001b[38;2;143;182;232mconst\u001b[0m",
    );
    expect(studio).toContain(
      "\u001b[38;2;198;167;216m\"orynt\"\u001b[0m",
    );
    expect(studio).toContain(
      "\u001b[38;2;216;181;106m42\u001b[0m",
    );

    const monochrome = renderRichText(source, {
      enabled: true,
      theme: createTerminalTheme(true, "monochrome"),
    });
    expect(monochrome).toContain("\u001b[1mconst\u001b[0m");
    expect(monochrome).not.toContain("\u001b[38;2;");
  });

  it("preserves streaming output across every chunk boundary", () => {
    const source =
      "Start **bold** `code` packages/cli/src/main.ts.\n```json\n{\"ok\":true}\n```\nDone";
    const expected = renderRichText(source, {
      enabled: true,
      theme: quietTheme,
    });

    for (let split = 0; split <= source.length; split += 1) {
      const renderer = new IncrementalRichTextRenderer({
        enabled: true,
        theme: quietTheme,
      });
      let output = renderer.update(source.slice(0, split)).output;
      output += renderer.update(source).output;
      output += renderer.finish();
      expect(output, `split ${split}`).toBe(expected);
    }
  });

  it("returns raw Markdown when rich text is disabled", () => {
    const source = "**bold** `code` packages/cli/src/main.ts";
    expect(
      renderRichText(source, {
        enabled: false,
        theme: plainTheme,
      }),
    ).toBe(source);
  });

  it("renders practical GFM blocks without exposing executable HTML", () => {
    const source = [
      "# Heading",
      "",
      "> quoted **value**",
      "",
      "- [x] done",
      "- [ ] pending",
      "",
      "1. first",
      "2. second",
      "",
      "Use ~~old~~ [docs](https://example.test) and ![plot](https://example.test/a.png).",
      "",
      "---",
      "",
      "<script>alert(1)</script>",
    ].join("\n");
    const rendered = stripAnsi(renderRichText(source, {
      enabled: true,
      theme: quietTheme,
      width: 60,
    }));

    expect(rendered).toContain("Heading");
    expect(rendered).toContain("│ quoted value");
    expect(rendered).toContain("☑ done");
    expect(rendered).toContain("☐ pending");
    expect(rendered).toContain("1. first");
    expect(rendered).toContain("docs (https://example.test)");
    expect(rendered).toContain(
      "Image: plot (https://example.test/a.png)",
    );
    expect(rendered).toContain("<script>alert(1)</script>");
    expect(rendered).not.toContain("\u001b]8;");
  });

  it("renders wide GFM tables and stacks them without data loss when narrow", () => {
    const source = [
      "| Name | Count | Note |",
      "|:---|---:|:---:|",
      "| Alpha | 12 | Wide value |",
      "| Emoji | 3 | 👩🏽‍💻 |",
    ].join("\n");
    const wide = stripAnsi(renderRichText(source, {
      enabled: true,
      theme: quietTheme,
      width: 72,
    }));
    expect(wide).toContain("┌");
    expect(wide).toContain("│ Name");
    expect(wide).toContain("12");
    expect(wide).toContain("👩🏽‍💻");

    const narrow = stripAnsi(renderRichText(source, {
      enabled: true,
      theme: quietTheme,
      width: 20,
    }));
    expect(narrow).not.toContain("┌");
    expect(narrow).toContain("Row 1");
    expect(narrow).toContain("Name: Alpha");
    expect(narrow).toContain("Count: 12");
    expect(narrow).toContain("Note: Wide value");
  });
});
