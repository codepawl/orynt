import { describe, expect, it } from "bun:test";

import { LineIndex } from "./lineIndex.js";

describe("LineIndex", () => {
  it.each(["utf-8", "utf-16", "utf-32"] as const)(
    "round trips valid byte offsets with %s coordinates",
    (encoding) => {
      const content = "alpha\r\nXin chào 👋 e\u0301\n𐐷omega\n";
      const index = new LineIndex(content);
      const offsets: number[] = [0];
      let bytes = 0;
      for (const scalar of content) {
        bytes += Buffer.byteLength(scalar, "utf8");
        if (scalar !== "\r") offsets.push(bytes);
      }
      for (const offset of offsets) {
        const position = index.positionAt(offset, encoding);
        expect(index.byteOffsetAt(position, encoding)).toBe(offset);
      }
    },
  );

  it("rejects byte offsets and positions inside encoded scalars", () => {
    const index = new LineIndex("a👋b");
    expect(() => index.positionAt(2, "utf-8")).toThrow("UTF-8 boundary");
    expect(() =>
      index.byteOffsetAt({ line: 0, character: 2 }, "utf-8"),
    ).toThrow("encoding boundary");
    expect(() =>
      index.byteOffsetAt({ line: 0, character: 2 }, "utf-16"),
    ).toThrow("encoding boundary");
  });
});
