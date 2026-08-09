import { describe, expect, it } from "bun:test";

import { ORYNT_ENGLISH_OUTPUT_INSTRUCTION } from "./languagePolicy";

describe("Orynt language policy", () => {
  it("requires English authored prose while preserving external source text", () => {
    expect(ORYNT_ENGLISH_OUTPUT_INSTRUCTION).toContain(
      "Write every Orynt-authored user-facing field in clear English.",
    );
    expect(ORYNT_ENGLISH_OUTPUT_INSTRUCTION).toContain(
      "Accept source material in any language",
    );
    expect(ORYNT_ENGLISH_OUTPUT_INSTRUCTION).toContain(
      "Preserve user-provided, repository, tool, proper-name, or third-party text",
    );
  });
});
