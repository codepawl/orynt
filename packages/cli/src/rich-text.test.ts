import { describe, expect, it } from "vitest";

import {
  IncrementalRichTextRenderer,
  renderRichText,
} from "./rich-text";

const stripAnsi = (value: string) =>
  value.replace(/\u001b\[[0-9;]*m/gu, "");

describe("rich terminal text", () => {
  it("renders emphasis without markers and keeps marker-preserving compose text", () => {
    const agent = renderRichText("Use **bold** and *italic* with `code`.", {
      enabled: true,
      color: true,
    });
    expect(stripAnsi(agent)).toBe("Use bold and italic with code.");
    expect(agent).toContain("\u001b[1mbold\u001b[0m");
    expect(agent).toContain("\u001b[3mitalic\u001b[0m");

    const compose = renderRichText("Use **bold** and *italic*.", {
      enabled: true,
      color: false,
      preserveMarkers: true,
    });
    expect(stripAnsi(compose)).toBe("Use **bold** and *italic*.");
    expect(compose).toContain("\u001b[2m**\u001b[0m");
  });

  it("underlines repository paths but does not style web URLs", () => {
    const rendered = renderRichText(
      "Open packages/cli/src/session.ts:42 and https://example.com/a.",
      { enabled: true, color: true },
    );
    expect(rendered).toContain(
      "\u001b[4;38;2;143;182;232mpackages/cli/src/session.ts:42\u001b[0m",
    );
    expect(rendered).toContain("https://example.com/a.");
  });

  it("highlights declared fenced code and safely falls back for unknown or unclosed fences", () => {
    const typescript = renderRichText(
      "```ts\nconst answer: number = 42;\n```",
      { enabled: true, color: true },
    );
    expect(stripAnsi(typescript)).toBe("const answer: number = 42;");
    expect(typescript).toContain("\u001b[");

    expect(
      stripAnsi(
        renderRichText("```made-up\nhello()\n```", {
          enabled: true,
          color: true,
        }),
      ),
    ).toBe("hello()");
    expect(
      stripAnsi(
        renderRichText("```ts\nconst unfinished = true;", {
          enabled: true,
          color: true,
        }),
      ),
    ).toBe("const unfinished = true;");
  });

  it("preserves streaming output across every chunk boundary", () => {
    const source =
      "Start **bold** `code` packages/cli/src/main.ts.\n```json\n{\"ok\":true}\n```\nDone";
    const expected = renderRichText(source, {
      enabled: true,
      color: true,
    });

    for (let split = 0; split <= source.length; split += 1) {
      const renderer = new IncrementalRichTextRenderer({
        enabled: true,
        color: true,
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
        color: false,
      }),
    ).toBe(source);
  });
});
